import { describe, expect, it } from "vitest";
import { loadRecentDocument, recentDocumentMetadata, saveRecentDocument, type RecentDocumentRecord } from "../../apps/editor/src/application/recent-document-storage.js";

function fakeIndexedDb() {
  let stored: RecentDocumentRecord | undefined;
  let initialized = false;
  const database = {
    objectStoreNames: { contains: () => initialized },
    createObjectStore: () => { initialized = true; },
    close: () => undefined,
    transaction: () => {
      const transaction = { oncomplete: undefined as ((event: Event) => void) | null | undefined, onerror: undefined as ((event: Event) => void) | null | undefined, onabort: undefined as ((event: Event) => void) | null | undefined, error: null as DOMException | null,
        objectStore: () => ({
          put: (record: RecentDocumentRecord) => { stored = record; queueMicrotask(() => transaction.oncomplete?.(new Event("complete"))); },
          get: () => {
            const request = { result: undefined as RecentDocumentRecord | undefined, onsuccess: undefined as ((event: Event) => void) | null | undefined, onerror: undefined as ((event: Event) => void) | null | undefined, error: null as DOMException | null };
            queueMicrotask(() => { request.result = stored; request.onsuccess?.(new Event("success")); });
            return request;
          },
        }),
      };
      return transaction;
    },
  };
  const factory = { open: () => {
    const request = { result: database, onupgradeneeded: undefined as ((event: IDBVersionChangeEvent) => void) | null | undefined, onsuccess: undefined as ((event: Event) => void) | null | undefined, onerror: undefined as ((event: Event) => void) | null | undefined, onblocked: undefined as ((event: Event) => void) | null | undefined, error: null as DOMException | null };
    queueMicrotask(() => { if (!initialized) request.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent); request.onsuccess?.(new Event("success")); });
    return request;
  } } as unknown as IDBFactory;
  return factory;
}

describe("asynchronous recent-document storage", () => {
  it("stores and reads document text in IndexedDB while keeping metadata payload-free", async () => {
    const factory = fakeIndexedDb();
    const text = JSON.stringify({ signals: Array.from({ length: 100_000 }, (_, index) => ({ id: `sig_${index}` })) });
    await saveRecentDocument(text, "large.tcd", factory);

    await expect(loadRecentDocument(factory)).resolves.toMatchObject({ filename: "large.tcd", text });
    const metadata = JSON.parse(recentDocumentMetadata("large.tcd", text, 123));
    expect(metadata).toEqual({ filename: "large.tcd", savedAt: 123, characters: text.length });
    expect(JSON.stringify(metadata)).not.toContain("sig_0");
  });
});
