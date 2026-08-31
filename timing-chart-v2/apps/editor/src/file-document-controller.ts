import { parseDocument, serializeCanonicalDocument, type CanonicalDocument, type DocumentProblem, type ParsedCanonicalDocument } from "@timing-chart-v2/schema";

export const MAX_OPEN_FILE_BYTES = 32 * 1024 * 1024;

/** Pure Open boundary: parsing/migration stays independent of the editor shell. */
export function parseOpenDocument(text: string): ReturnType<typeof parseDocument> {
  return parseDocument(text);
}

export function canonicalDocumentOf(input: CanonicalDocument | ParsedCanonicalDocument): CanonicalDocument {
  if ("ok" in input && input.ok === true && input.validated === true) return (input as ParsedCanonicalDocument).document;
  return input as CanonicalDocument;
}

/** Pure Save boundary: serialization stays independent of the editor shell. */
export function serializeSaveDocument(document: CanonicalDocument): string {
  return serializeCanonicalDocument(document);
}

/** Pure New boundary: retain the base signal/group layout and clear document-scoped content. */
export function createNewDocument(base: CanonicalDocument, documentId: string): CanonicalDocument {
  return {
    ...base,
    document: { ...base.document, id: documentId, title: "Untitled Timing Chart" },
    annotations: [],
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
