export const RECENT_DOCUMENT_DATABASE = "timing-chart-v2";
export const RECENT_DOCUMENT_STORE = "recent-documents";
export const RECENT_DOCUMENT_ID = "recent" as const;

export type RecentDocumentIdentity = Readonly<{
  filename: string;
  documentId: string;
  generation: string;
  savedAt: number;
  size: number;
}>;

export type RecentDocumentRecord = Readonly<{
  id: typeof RECENT_DOCUMENT_ID;
  filename: string;
  savedAt: number;
  documentId?: string;
  generation?: string;
  size?: number;
  text: string;
}>;

export type RecentDocumentMetadata = Readonly<{
  contentKept?: boolean;
  filename?: string;
  documentId?: string;
  generation?: string;
  savedAt?: number;
  size?: number;
}>;

export function documentIdFromRecentText(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return;
    const document = (value as { document?: unknown }).document;
    if (typeof document !== "object" || document === null) return;
    const id = (document as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  } catch { return; }
}

/** Match content to the exact committed metadata generation before Open Recent. */
export function recentRecordMatches(record: RecentDocumentRecord | undefined, metadata: RecentDocumentMetadata): record is RecentDocumentRecord {
  if (!record || metadata.contentKept !== true || typeof metadata.filename !== "string"
    || typeof metadata.documentId !== "string" || typeof metadata.savedAt !== "number" || typeof metadata.size !== "number") return false;
  const recordDocumentId = record.documentId ?? documentIdFromRecentText(record.text);
  return record.filename === metadata.filename && record.savedAt === metadata.savedAt
    && record.text.length === metadata.size && recordDocumentId === metadata.documentId
    && (metadata.generation === undefined || record.generation === metadata.generation)
    && (record.size === undefined || record.size === record.text.length);
}

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

export async function saveRecentDocument(text: string, identity: RecentDocumentIdentity): Promise<RecentDocumentRecord> {
  const record: RecentDocumentRecord = { id: RECENT_DOCUMENT_ID, ...identity, text };
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(RECENT_DOCUMENT_STORE, "readwrite");
      transaction.objectStore(RECENT_DOCUMENT_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Recent-document content could not be stored."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Recent-document storage was aborted."));
    });
  } finally {
    database.close();
  }
  return record;
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
