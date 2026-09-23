export const RECENT_DOCUMENT_KEY = "recent";
export const RECENT_DOCUMENT_DB = "timing-chart-v2";
export const RECENT_DOCUMENT_STORE = "recent-documents";
export const RECENT_DOCUMENT_METADATA_KEY = "timing-chart-v2.recent";

export type RecentDocumentRecord = Readonly<{
  id: typeof RECENT_DOCUMENT_KEY;
  filename: string;
  savedAt: number;
  text: string;
}>;

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(RECENT_DOCUMENT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECENT_DOCUMENT_STORE)) request.result.createObjectStore(RECENT_DOCUMENT_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Recent-document database could not be opened."));
    request.onblocked = () => reject(new Error("Recent-document database upgrade is blocked."));
  });
}

function browserFactory(): IDBFactory {
  if (typeof indexedDB === "undefined") throw new Error("Asynchronous browser storage is unavailable.");
  return indexedDB;
}

export async function saveRecentDocument(text: string, filename: string, factory = browserFactory()): Promise<void> {
  const database = await openDatabase(factory);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(RECENT_DOCUMENT_STORE, "readwrite");
      transaction.objectStore(RECENT_DOCUMENT_STORE).put({ id: RECENT_DOCUMENT_KEY, filename, savedAt: Date.now(), text } satisfies RecentDocumentRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Recent-document content could not be stored."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Recent-document storage was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function loadRecentDocument(factory = browserFactory()): Promise<RecentDocumentRecord | undefined> {
  const database = await openDatabase(factory);
  try {
    return await new Promise<RecentDocumentRecord | undefined>((resolve, reject) => {
      const transaction = database.transaction(RECENT_DOCUMENT_STORE, "readonly");
      const request = transaction.objectStore(RECENT_DOCUMENT_STORE).get(RECENT_DOCUMENT_KEY);
      request.onsuccess = () => resolve(request.result as RecentDocumentRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Recent-document content could not be read."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Recent-document read was aborted."));
    });
  } finally {
    database.close();
  }
}

export function recentDocumentMetadata(filename: string, text: string, savedAt = Date.now()): string {
  return JSON.stringify({ filename, savedAt, characters: text.length });
}

export function isLegacyRecentDocument(value: unknown): value is { readonly signals: unknown[]; readonly timeline: unknown } {
  return typeof value === "object" && value !== null && Array.isArray((value as { signals?: unknown }).signals) && typeof (value as { timeline?: unknown }).timeline === "object";
}
