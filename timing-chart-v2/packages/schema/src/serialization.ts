import { migrateThroughRegistry } from "./migration.js";
import { validateCanonicalDocument } from "./validation.js";
import { scanJsonSyntax } from "./json-syntax.js";
import type { CanonicalDocument, DocumentProblem, MigrationWarning, ParseDocumentResult, ParseScenarioDocumentResult, ScenarioDocumentModel } from "./types.js";
import { DOCUMENT_RESOURCE_BUDGET, validateDocumentInputBytes, validateDocumentInputComplexity, validateDocumentResourceBudget } from "./resource-budget.js";
import { validateScenarioDocumentModel } from "./scenario-model.js";
import { opaqueDerivedId } from "./stable-id.js";

const trustedParsedDocuments = new WeakSet<object>();

export function isTrustedParsedCanonicalDocument(value: unknown): value is ParseDocumentResult & { readonly ok: true } {
  return value !== null && typeof value === "object" && trustedParsedDocuments.has(value);
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneUnknown);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneUnknown(entry)]));
  }
  return value;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObjectKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function syntaxProblem(error: unknown, source: string): DocumentProblem {
  const message = error instanceof Error ? error.message : "Invalid JSON.";
  const diagnostic = scanJsonSyntax(source);
  if (!diagnostic) return { code: "JSON_SYNTAX", path: "$", message, detail: message };
  return { code: diagnostic.code, path: `$@${diagnostic.line}:${diagnostic.column}`, message: diagnostic.message, detail: message, offset: diagnostic.offset, line: diagnostic.line, column: diagnostic.column };
}

function migrateDocumentOwned(input: unknown, ownsInput: boolean): { document: CanonicalDocument; warnings: readonly MigrationWarning[] } | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const migrated = migrateThroughRegistry(input, 2);
  if (!migrated) return undefined;
  // String Open has just produced this detached object tree with JSON.parse.
  // Re-cloning every nested Signal/value entry adds a second full-document
  // allocation before validation/freezing. Public object normalization still
  // clones so legacy cleanup never mutates caller-owned data.
  const document = (ownsInput ? migrated.value : cloneUnknown(migrated.value)) as CanonicalDocument;
  dropLegacySplitPane(document);
  defaultAdditiveCollections(document);
  const phaseIdentityWarnings = addLegacyNestedIds(document);
  return { document, warnings: [...migrated.warnings, ...phaseIdentityWarnings] };
}

function addLegacyNestedIds(document: CanonicalDocument): readonly MigrationWarning[] {
  const usedIds = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) { for (const item of value) collect(item); return; }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string") usedIds.add(record.id);
    for (const item of Object.values(record)) collect(item);
  };
  collect(document);
  let assigned = 0;
  for (const transaction of document.transactions) {
    for (const [index, phase] of (transaction.phases ?? []).entries()) {
      if (typeof phase.id === "string" && phase.id.length > 0) continue;
      const id = opaqueDerivedId(`transaction-phase:${transaction.id}:${index}`, usedIds) as typeof phase.id;
      usedIds.add(id);
      (phase as unknown as { id: typeof phase.id }).id = id;
      assigned += 1;
    }
  }
  const warnings: MigrationWarning[] = assigned === 0 ? [] : [{ code: "MIGRATED_TRANSACTION_PHASE_IDS", path: "$.transactions", message: `Stable Phase IDs were assigned to ${assigned} legacy Phase${assigned === 1 ? "" : "s"} while opening this document.` }];
  let changesAssigned = 0;
  for (const signal of document.signals) {
    const changes = signal.type === "clock" ? signal.enable ?? [] : "values" in signal ? signal.values : [];
    for (const [index, change] of changes.entries()) {
      if (typeof change.id === "string" && change.id.length > 0) continue;
      const id = opaqueDerivedId(`signal-change:${signal.id}:${index}`, usedIds);
      usedIds.add(id);
      (change as unknown as { id: string }).id = id;
      changesAssigned += 1;
    }
  }
  if (changesAssigned > 0) warnings.push({ code: "MIGRATED_VALUE_CHANGE_IDS", path: "$.signals", message: `Stable IDs were assigned to ${changesAssigned} legacy Signal changes while opening this document.` });
  return warnings;
}

export function migrateDocument(input: unknown): { document: CanonicalDocument; warnings: readonly MigrationWarning[] } | undefined {
  return migrateDocumentOwned(input, false);
}

/**
 * Additive canonical collections introduced after v2 files were already being written (annotationGroups). A v2 file that
 * predates them is still a valid document: open it with the collection empty instead of rejecting it. Save always writes it.
 */
function defaultAdditiveCollections(document: CanonicalDocument): void {
  const record = document as unknown as Record<string, unknown>;
  if (record.annotationGroups === undefined && Array.isArray(record.annotations)) record.annotationGroups = [];
}

/** #570: the per-signal Upper/Lower/Both assignment is legacy; it is read and ignored, never kept or written back. */
function dropLegacySplitPane(document: CanonicalDocument): void {
  const signals: unknown = (document as { signals?: unknown }).signals;
  if (!Array.isArray(signals)) return;
  for (const signal of signals) {
    const display = signal !== null && typeof signal === "object" ? (signal as { display?: unknown }).display : undefined;
    if (display !== null && typeof display === "object" && "splitPane" in display) delete (display as Record<string, unknown>).splitPane;
  }
}

export type JsonInputResult = Readonly<{ ok: true; value: unknown } | { ok: false; problems: readonly DocumentProblem[] }>;

/** Safe JSON boundary for sub-document imports that do not use the full document parser. */
export function parseJsonInput(source: string): JsonInputResult {
  const byteProblems = validateDocumentInputBytes(utf8ByteLength(source));
  if (byteProblems.length > 0) return { ok: false, problems: byteProblems };
  let value: unknown;
  try { value = JSON.parse(source); } catch (error) { return { ok: false, problems: [syntaxProblem(error, source)] }; }
  const complexityProblems = validateDocumentInputComplexity(value);
  return complexityProblems.length > 0 ? { ok: false, problems: complexityProblems } : { ok: true, value };
}

function normalizeOwnedDocument(input: unknown, ownsInput: boolean): ParseDocumentResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, kind: "validation", problems: [{ code: "DOCUMENT_ROOT", path: "$", message: "Document root must be an object." }] };
  }
  const complexityProblems = validateDocumentInputComplexity(input);
  if (complexityProblems.length > 0) return { ok: false, kind: "validation", problems: complexityProblems };
  const version = (input as { formatVersion?: unknown }).formatVersion;
  if (!Number.isInteger(version)) {
    return { ok: false, kind: "validation", problems: [{ code: "FORMAT_VERSION", path: "$.formatVersion", message: "formatVersion must be an integer." }] };
  }
  if (version !== 1 && version !== 2) {
    return { ok: false, kind: "unsupported-version", sourceFormatVersion: version as number, problems: [{ code: "UNSUPPORTED_FORMAT_VERSION", path: "$.formatVersion", message: `Format version ${String(version)} is not supported; the source was preserved without replacement.` }], raw: cloneUnknown(input) };
  }
  const migrated = migrateDocumentOwned(input, ownsInput);
  if (!migrated) return { ok: false, kind: "validation", problems: [{ code: "MIGRATION_FAILED", path: "$", message: "Document migration could not be selected." }] };
  const problems = validateCanonicalDocument(migrated.document);
  if (problems.length > 0) return { ok: false, kind: "validation", sourceFormatVersion: version, problems };
  const budgetProblems = validateDocumentResourceBudget(migrated.document);
  if (budgetProblems.length > 0) return { ok: false, kind: "validation", sourceFormatVersion: version, problems: budgetProblems };
  const result = { ok: true as const, document: migrated.document, warnings: migrated.warnings, validated: true as const };
  trustedParsedDocuments.add(result);
  return result as ParseDocumentResult;
}

export function normalizeDocument(input: unknown): ParseDocumentResult {
  return normalizeOwnedDocument(input, false);
}

export function parseDocument(input: string | unknown): ParseDocumentResult {
  if (typeof input !== "string") return normalizeDocument(input);
  const inputProblems = validateDocumentInputBytes(utf8ByteLength(input));
  if (inputProblems.length > 0) return { ok: false, kind: "validation", problems: inputProblems };
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, kind: "syntax", problems: [syntaxProblem(error, input)] };
  }
  // normalizeDocument owns the post-parse complexity gate. Running it here as
  // well traversed every JSON node twice on the production string-Open path.
  return normalizeOwnedDocument(parsed, true);
}

/** Parse the opt-in Scenario v3 storage model without changing the v1/v2 editor Open boundary. */
export function parseScenarioDocumentModel(input: string | unknown): ParseScenarioDocumentResult {
  let value = input;
  if (typeof input === "string") {
    const byteProblems = validateDocumentInputBytes(utf8ByteLength(input));
    if (byteProblems.length > 0) return { ok: false, kind: "validation", problems: byteProblems };
    try { value = JSON.parse(input) as unknown; }
    catch (error) { return { ok: false, kind: "syntax", problems: [syntaxProblem(error, input)] }; }
  }
  const complexityProblems = validateDocumentInputComplexity(value);
  if (complexityProblems.length > 0) return { ok: false, kind: "validation", problems: complexityProblems };
  if (typeof input !== "string") value = cloneUnknown(value);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, kind: "validation", problems: [{ code: "DOCUMENT_ROOT", path: "$", message: "Document root must be an object." }] };
  }
  const version = (value as { formatVersion?: unknown }).formatVersion;
  if (!Number.isInteger(version)) return { ok: false, kind: "validation", problems: [{ code: "FORMAT_VERSION", path: "$.formatVersion", message: "formatVersion must be an integer." }] };
  if (version !== 3) return { ok: false, kind: "unsupported-version", sourceFormatVersion: version as number, problems: [{ code: "UNSUPPORTED_FORMAT_VERSION", path: "$.formatVersion", message: `Scenario document format version ${String(version)} is not supported by the Scenario v3 reader.` }] };
  const problems = validateScenarioDocumentModel(value);
  return problems.length > 0
    ? { ok: false, kind: "validation", sourceFormatVersion: 3, problems }
    : { ok: true, model: value as ScenarioDocumentModel, validated: true };
}

/** Serialize the opt-in Scenario v3 model after the same structural, semantic and budget gates. */
export function serializeScenarioDocumentModel(model: ScenarioDocumentModel, indent = 2): string {
  const problems = validateScenarioDocumentModel(model);
  if (problems.length > 0) {
    const error = new Error(`Cannot serialize invalid Scenario document (${problems.length} problem(s)).`);
    Object.assign(error, { name: "ScenarioDocumentSerializationError", problems });
    throw error;
  }
  return assertSerializableForOpen(`${JSON.stringify(sortObjectKeys(model), null, indent)}\n`, "ScenarioDocumentSerializationError");
}

/**
 * Serialize a document that has already crossed the canonical validation
 * boundary. Callers must not use this for arbitrary input; the public
 * serializeCanonicalDocument() below remains the validating entry point.
 */
export function serializeValidatedCanonicalDocument(document: CanonicalDocument, indent = 2): string {
  return assertSerializableForOpen(`${JSON.stringify(sortObjectKeys(document), null, indent)}\n`, "CanonicalSerializationError");
}

/** Keep saved bytes within the same capacity gates used by the production Open path. */
function assertSerializableForOpen(text: string, errorName: string): string {
  const byteLength = utf8ByteLength(text);
  const problems = byteLength > DOCUMENT_RESOURCE_BUDGET.openFileBytes
    ? [{
        code: "OPEN_FILE_TOO_LARGE",
        path: "$",
        message: `Save rejected: serialized document is ${byteLength.toLocaleString()} bytes; the Open limit is ${DOCUMENT_RESOURCE_BUDGET.openFileBytes.toLocaleString()} bytes.`,
        expected: String(DOCUMENT_RESOURCE_BUDGET.openFileBytes),
        value: byteLength,
        detail: `save-failure:capacity;metric=openFileBytes;current=${byteLength};limit=${DOCUMENT_RESOURCE_BUDGET.openFileBytes}`,
      }]
    : validateDocumentInputComplexity(JSON.parse(text) as unknown);
  if (problems.length > 0) {
    const error = new Error(`Cannot serialize document within the current Open capacity (${problems.length} problem(s)).`);
    Object.assign(error, { name: errorName, problems });
    throw error;
  }
  return text;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function serializeCanonicalDocument(document: CanonicalDocument, indent = 2): string {
  const problems = [...validateCanonicalDocument(document), ...validateDocumentResourceBudget(document)];
  if (problems.length > 0) {
    const error = new Error(`Cannot serialize invalid canonical document (${problems.length} problem(s)).`);
    Object.assign(error, { name: "CanonicalSerializationError", problems });
    throw error;
  }
  return serializeValidatedCanonicalDocument(document, indent);
}
