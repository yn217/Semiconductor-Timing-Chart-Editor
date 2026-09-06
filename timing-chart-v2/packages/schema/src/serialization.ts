import { migrateThroughRegistry } from "./migration.js";
import { validateCanonicalDocument } from "./validation.js";
import { scanJsonSyntax } from "./json-syntax.js";
import type { CanonicalDocument, DocumentProblem, MigrationWarning, ParseDocumentResult } from "./types.js";
import { validateDocumentInputBytes, validateDocumentInputComplexity, validateDocumentResourceBudget } from "./resource-budget.js";

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
  return { document: cloneUnknown(migrated.value) as CanonicalDocument, warnings: migrated.warnings };
}

export function normalizeDocument(input: unknown): ParseDocumentResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, kind: "validation", problems: [{ code: "DOCUMENT_ROOT", path: "$", message: "Document root must be an object." }] };
  }
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
  return { ok: true, document: migrated.document, warnings: migrated.warnings, validated: true };
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
  const complexityProblems = validateDocumentInputComplexity(parsed);
  if (complexityProblems.length > 0) return { ok: false, kind: "validation", problems: complexityProblems };
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
