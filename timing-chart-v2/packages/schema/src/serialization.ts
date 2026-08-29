import { migrateV1 } from "./migration.js";
import { validateCanonicalDocument } from "./validation.js";
import type { CanonicalDocument, DocumentProblem, MigrationWarning, ParseDocumentResult } from "./types.js";

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
  const match = /position\s+(\d+)/i.exec(message);
  if (!match?.[1]) return { code: "JSON_SYNTAX", path: "$", message };
  const position = Number(match[1]);
  const prefix = source.slice(0, position);
  const line = prefix.split("\n").length;
  const column = position - prefix.lastIndexOf("\n");
  return { code: "JSON_SYNTAX", path: `$@${line}:${column}`, message };
}

export function migrateDocument(input: unknown): { document: CanonicalDocument; warnings: readonly MigrationWarning[] } | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const version = (input as { formatVersion?: unknown }).formatVersion;
  if (version === 1) return migrateV1(input);
  if (version === 2) return { document: cloneUnknown(input) as CanonicalDocument, warnings: [] };
  return undefined;
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
  return { ok: true, document: migrated.document, warnings: migrated.warnings, validated: true };
}

export function parseDocument(input: string | unknown): ParseDocumentResult {
  if (typeof input !== "string") return normalizeDocument(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { ok: false, kind: "syntax", problems: [syntaxProblem(error, input)] };
  }
  return normalizeDocument(parsed);
}

export function serializeCanonicalDocument(document: CanonicalDocument, indent = 2): string {
  const problems = validateCanonicalDocument(document);
  if (problems.length > 0) {
    const error = new Error(`Cannot serialize invalid canonical document (${problems.length} problem(s)).`);
    Object.assign(error, { name: "CanonicalSerializationError", problems });
    throw error;
  }
  return `${JSON.stringify(sortObjectKeys(document), null, indent)}\n`;
}
