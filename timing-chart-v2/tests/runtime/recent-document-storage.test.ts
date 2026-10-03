import { describe, expect, it } from "vitest";
import { recentRecordMatches, type RecentDocumentRecord } from "../../apps/editor/src/application/recent-document-storage.js";

const text = JSON.stringify({ document: { id: "document-A" }, signals: [], timeline: {} });
const committed: RecentDocumentRecord = {
  id: "recent", filename: "A.tcd", documentId: "document-A", generation: "generation-A",
  savedAt: 1234, size: text.length, text,
};
const metadata = {
  filename: committed.filename, documentId: committed.documentId, generation: committed.generation,
  savedAt: committed.savedAt, size: committed.size, contentKept: true,
};

describe("Open Recent committed-generation matching", () => {
  it("accepts only content whose durable identity matches its metadata", () => {
    expect(recentRecordMatches(committed, metadata)).toBe(true);
    expect(recentRecordMatches({ ...committed, generation: "generation-B" }, metadata)).toBe(false);
    expect(recentRecordMatches({ ...committed, documentId: "document-B" }, metadata)).toBe(false);
    expect(recentRecordMatches({ ...committed, savedAt: 1235 }, metadata)).toBe(false);
    expect(recentRecordMatches({ ...committed, size: text.length + 1 }, metadata)).toBe(false);
  });

  it("recognizes the prior record format only when its content identity and all old metadata agree", () => {
    const previousFormat: RecentDocumentRecord = { id: "recent", filename: "A.tcd", savedAt: 1234, text };
    expect(recentRecordMatches(previousFormat, { ...metadata, generation: undefined })).toBe(true);
    expect(recentRecordMatches(previousFormat, { ...metadata, documentId: "document-B", generation: undefined })).toBe(false);
    expect(recentRecordMatches(previousFormat, { ...metadata, savedAt: 1235, generation: undefined })).toBe(false);
  });

  it("rejects uncommitted or incomplete Recent metadata", () => {
    expect(recentRecordMatches(committed, { ...metadata, contentKept: false })).toBe(false);
    expect(recentRecordMatches(committed, { ...metadata, generation: "generation-B" })).toBe(false);
    expect(recentRecordMatches(committed, { ...metadata, size: undefined })).toBe(false);
  });
});
