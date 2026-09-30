export const RECENT_DOCUMENT_DATABASE = "timing-chart-v2";
export const RECENT_DOCUMENT_STORE = "recent-documents";
export const RECENT_DOCUMENT_ID = "recent" as const;

export type RecentDocumentRecord = Readonly<{
  id: typeof RECENT_DOCUMENT_ID;
  filename: string;
  savedAt: number;
  text: string;
}>;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Asynchronous browser storage is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECENT_DOCUMENT_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECENT_DOCUMENT_STORE)) {
        request.result.createObjectStore(RECENT_DOCUMENT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Recent-document database could not be opened."));
    request.onblocked = () => reject(new Error("Recent-document database upgrade is blocked."));
  });
}

export async function saveRecentDocument(text: string, filename: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(RECENT_DOCUMENT_STORE, "readwrite");
      transaction.objectStore(RECENT_DOCUMENT_STORE).put({ id: RECENT_DOCUMENT_ID, filename, savedAt: Date.now(), text } satisfies RecentDocumentRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Recent-document content could not be stored."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Recent-document storage was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function loadRecentDocument(): Promise<RecentDocumentRecord | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<RecentDocumentRecord | undefined>((resolve, reject) => {
      const transaction = database.transaction(RECENT_DOCUMENT_STORE, "readonly");
      const request = transaction.objectStore(RECENT_DOCUMENT_STORE).get(RECENT_DOCUMENT_ID);
      request.onsuccess = () => resolve(request.result as RecentDocumentRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Recent-document content could not be read."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Recent-document read was aborted."));
    });
  } finally {
    database.close();
  }
}

export function isLegacyRecentDocument(value: unknown): value is { readonly signals: unknown[]; readonly timeline: object } {
  return typeof value === "object" && value !== null && Array.isArray((value as { signals?: unknown }).signals)
    && typeof (value as { timeline?: unknown }).timeline === "object" && (value as { timeline?: unknown }).timeline !== null;
}
