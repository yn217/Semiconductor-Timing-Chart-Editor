import { parseDocument, serializeCanonicalDocument, type CanonicalDocument } from "@timing-chart-v2/schema";

/** Pure Open boundary: parsing/migration stays independent of the editor shell. */
export function parseOpenDocument(text: string): ReturnType<typeof parseDocument> {
  return parseDocument(text);
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
