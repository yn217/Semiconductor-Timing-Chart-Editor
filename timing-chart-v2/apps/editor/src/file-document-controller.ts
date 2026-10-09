import { DOCUMENT_RESOURCE_BUDGET, isTrustedParsedCanonicalDocument, parseDocument, parseScenarioDocumentModel, serializeValidatedCanonicalDocument, type CanonicalDocument, type DocumentProblem, type ParsedCanonicalDocument, type ScenarioDocumentModel } from "@timing-chart-v2/schema";

export const MAX_OPEN_FILE_BYTES = DOCUMENT_RESOURCE_BUDGET.openFileBytes;

/** Pure Open boundary: parsing/migration stays independent of the editor shell. */
export function parseOpenDocument(text: string): ReturnType<typeof parseDocument> {
  return parseDocument(text);
}

export type ParsedEditorDocument =
  | Readonly<{ ok: true; kind: "canonical"; document: ParsedCanonicalDocument }>
  | Readonly<{ ok: true; kind: "scenario"; model: ScenarioDocumentModel }>
  | Exclude<ReturnType<typeof parseDocument>, { readonly ok: true }>;

/** Shared production Open boundary for legacy/v2 and Scenario v3 documents. */
export function parseEditorDocument(text: string): ParsedEditorDocument {
  const canonical = parseDocument(text);
  if (canonical.ok) return { ok: true, kind: "canonical", document: canonical };
  if (canonical.kind !== "unsupported-version" || canonical.sourceFormatVersion !== 3) return canonical;
  const scenario = parseScenarioDocumentModel(text);
  return scenario.ok ? { ok: true, kind: "scenario", model: scenario.model } : scenario;
}

/** Decode bytes at the shared Open boundary, independent of how the bytes were obtained. */
export function decodeOpenDocumentBytes(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export function canonicalDocumentOf(input: CanonicalDocument | ParsedCanonicalDocument): CanonicalDocument {
  if (isTrustedParsedCanonicalDocument(input)) return input.document;
  return input as CanonicalDocument;
}

/**
 * Pure Save boundary for a DocumentSession-owned snapshot.
 *
 * Construction, Open, and command commits already establish canonical
 * validity. Re-running the full validator here would duplicate that work;
 * arbitrary callers must use the schema package's validating serializer.
 */
export function serializeSaveDocument(document: Readonly<CanonicalDocument>): string {
  return serializeValidatedCanonicalDocument(document);
}

/** The user-visible policy for File > New. */
export const NEW_DOCUMENT_POLICY_DESCRIPTION = "New starts from the approved product template; Signals, Groups, Timeline, and Layout defaults are retained, while Annotations, Bookmarks, Time Groups, and Transactions are cleared.";

/** Product New boundary: retain product defaults and clear document-scoped content. */
export function createNewDocumentFromProductTemplate(template: CanonicalDocument, documentId: string): CanonicalDocument {
  return {
    ...template,
    document: { ...template.document, id: documentId, title: "Untitled Timing Chart" },
    annotations: [],
    annotationGroups: [],
    bookmarks: [],
    timeGroups: [],
    transactions: [],
  };
}

export function openFileByteBudgetProblem(file: Pick<File, "name" | "size">): DocumentProblem {
  return {
    code: "OPEN_FILE_TOO_LARGE",
    path: "$",
    message: `Open rejected before parsing: ${file.name || "selected file"} is ${file.size.toLocaleString()} bytes; the limit is ${MAX_OPEN_FILE_BYTES.toLocaleString()} bytes.`,
    severity: "error",
    operation: "document.open",
    operationLabel: "Open document",
    source: "open",
    stage: "parse",
    expected: String(MAX_OPEN_FILE_BYTES),
    value: file.size,
    recommendation: "Choose a smaller .json/.tcd file or split the document, then retry Open.",
    detail: `open-failure:byte-budget;actualBytes=${file.size};allowedBytes=${MAX_OPEN_FILE_BYTES}`,
  };
}
