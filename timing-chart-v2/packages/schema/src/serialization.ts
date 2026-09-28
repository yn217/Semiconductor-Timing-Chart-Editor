import { migrateThroughRegistry } from "./migration.js";
import { validateCanonicalDocument } from "./validation.js";
import { scanJsonSyntax } from "./json-syntax.js";
import type { CanonicalDocument, DocumentProblem, MigrationWarning, ParseDocumentResult } from "./types.js";
import { validateDocumentInputBytes, validateDocumentInputComplexity, validateDocumentResourceBudget } from "./resource-budget.js";

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

export function migrateDocument(input: unknown): { document: CanonicalDocument; warnings: readonly MigrationWarning[] } | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const migrated = migrateThroughRegistry(input, 2);
  if (!migrated) return undefined;
  const document = cloneUnknown(migrated.value) as CanonicalDocument;
  dropLegacySplitPane(document);
  defaultAdditiveCollections(document);
  return { document, warnings: migrated.warnings };
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

export function normalizeDocument(input: unknown): ParseDocumentResult {
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
  const migrated = migrateDocument(input);
  if (!migrated) return { ok: false, kind: "validation", problems: [{ code: "MIGRATION_FAILED", path: "$", message: "Document migration could not be selected." }] };
  const problems = validateCanonicalDocument(migrated.document);
  if (problems.length > 0) return { ok: false, kind: "validation", sourceFormatVersion: version, problems };
  const budgetProblems = validateDocumentResourceBudget(migrated.document);
  if (budgetProblems.length > 0) return { ok: false, kind: "validation", sourceFormatVersion: version, problems: budgetProblems };
  const result = { ok: true as const, document: migrated.document, warnings: migrated.warnings, validated: true as const };
  trustedParsedDocuments.add(result);
  return result as ParseDocumentResult;
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
  return normalizeDocument(parsed);
}

/**
 * Serialize a document that has already crossed the canonical validation
 * boundary. Callers must not use this for arbitrary input; the public
 * serializeCanonicalDocument() below remains the validating entry point.
 */
export function serializeValidatedCanonicalDocument(document: CanonicalDocument, indent = 2): string {
  return `${JSON.stringify(sortObjectKeys(document), null, indent)}\n`;
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
