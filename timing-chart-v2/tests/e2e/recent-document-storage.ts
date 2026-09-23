import { expect, type Page } from "@playwright/test";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

export async function readSavedRecentDocument(page: Page): Promise<CanonicalDocument | null> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("timing-chart-v2.recent"))).not.toBeNull();
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("timing-chart-v2", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("recent-documents")) request.result.createObjectStore("recent-documents", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const record = await new Promise<{ text: string } | undefined>((resolve, reject) => {
        const request = database.transaction("recent-documents", "readonly").objectStore("recent-documents").get("recent");
        request.onsuccess = () => resolve(request.result as { text: string } | undefined);
        request.onerror = () => reject(request.error);
      });
      return record ? JSON.parse(record.text) as CanonicalDocument : null;
    } finally {
      database.close();
    }
  });
}
