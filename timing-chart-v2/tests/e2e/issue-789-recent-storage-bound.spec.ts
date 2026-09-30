import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

async function readRecentRecord(page: import("@playwright/test").Page) {
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
      return await new Promise<{ text: string; filename: string } | undefined>((resolve, reject) => {
        const request = database.transaction("recent-documents", "readonly").objectStore("recent-documents").get("recent");
        request.onsuccess = () => resolve(request.result as { text: string; filename: string } | undefined);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
}

async function readSaveMeasures(page: import("@playwright/test").Page) {
  return page.evaluate(() => performance.getEntriesByType("measure")
    .filter((entry) => entry.name.startsWith("timing-chart-v2.save."))
    .map((entry) => ({ name: entry.name, durationMs: entry.duration, detail: (entry as PerformanceMeasure).detail })));
}

/** #789: Save keeps only metadata in localStorage and reopens a large Recent payload asynchronously. */
test("Save and Open Recent round-trip a large document without a localStorage payload", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    let startedAt: number | undefined;
    const isSave = (event: Event) => event.target instanceof Element && event.target.closest("button")?.textContent?.trim() === "Save";
    document.addEventListener("click", (event) => { if (isSave(event)) startedAt = performance.now(); }, true);
    document.addEventListener("click", (event) => {
      if (isSave(event) && startedAt !== undefined) {
        (window as Window & { __issue789SaveHandlerMs?: number }).__issue789SaveHandlerMs = performance.now() - startedAt;
        startedAt = undefined;
      }
    });
  });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 3000, cycleCount: 200 });
  expect(JSON.stringify(document).length).toBeGreaterThan(512 * 1024);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "big789.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await downloaded;
  const withRecentPersistenceMs = await page.evaluate(() => (window as Window & { __issue789SaveHandlerMs?: number }).__issue789SaveHandlerMs ?? null);
  await expect(page.getByTestId("dirty-status")).not.toHaveText("Modified");
  const stored = await page.evaluate(() => ({ recent: localStorage.getItem("timing-chart-v2.recent"), meta: JSON.parse(localStorage.getItem("timing-chart-v2.recent-meta") ?? "null") }));
  expect(stored.recent, "no full-document copy in synchronous localStorage").toBeNull();
  expect(stored.meta).toMatchObject({ filename: expect.stringContaining("tcd"), contentKept: true, storageVersion: 2 });
  expect(stored.meta.size).toBeGreaterThan(512 * 1024);
  await expect.poll(async () => (await readRecentRecord(page))?.text.length ?? 0).toBeGreaterThan(512 * 1024);
  await expect.poll(async () => (await readSaveMeasures(page)).some((entry) => entry.name === "timing-chart-v2.save.recent-write")).toBe(true);
  const measuresWithRecentPersistence = await readSaveMeasures(page);

  await page.evaluate(() => Object.defineProperty(window, "indexedDB", { configurable: true, get: () => undefined }));
  const withoutRecentPersistenceDownload = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await withoutRecentPersistenceDownload;
  const withoutRecentPersistenceMs = await page.evaluate(() => (window as Window & { __issue789SaveHandlerMs?: number }).__issue789SaveHandlerMs ?? null);
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("SAVE_RECENT_FAILED");
  const measuresWithoutRecentPersistence = await readSaveMeasures(page);
  expect(withRecentPersistenceMs).not.toBeNull();
  expect(withoutRecentPersistenceMs).not.toBeNull();
  await test.info().attach("issue-789-large-save-handler-comparison.json", {
    contentType: "application/json",
    body: JSON.stringify({ documentCharacters: stored.meta.size, saveHandlerMsWithAsyncRecent: withRecentPersistenceMs, saveHandlerMsWhenIndexedDbUnavailable: withoutRecentPersistenceMs, measuresWithRecentPersistence, measuresWithoutRecentPersistence, note: "One same-document directional sample per path; not an SLO or statistical speedup claim." }, null, 2),
  });

  await page.reload();
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.getByTestId("bottom-editor").getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(page.getByTestId("json-panel").locator("pre")).toContainText('"id": "perf_3000x200_standard"');
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("IndexedDB failure does not invalidate a successful download or change document history", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { configurable: true, get: () => undefined });
  });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await downloaded;
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("SAVE_RECENT_FAILED");
});

test("Open Recent migrates a legacy localStorage document to IndexedDB", async ({ page }) => {
  const legacy = generatePerformanceDocument({ signalCount: 50, cycleCount: 100 });
  await page.addInitScript(({ text }) => {
    localStorage.setItem("timing-chart-v2.recent", text);
    localStorage.setItem("timing-chart-v2.recent-meta", JSON.stringify({ filename: "legacy.tcd", contentKept: true }));
  }, { text: JSON.stringify(legacy) });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  await page.getByTestId("bottom-editor").getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(page.getByTestId("json-panel").locator("pre")).toContainText('"id": "perf_50x100_standard"');
  await expect.poll(async () => (await readRecentRecord(page))?.filename ?? "").toBe("legacy.tcd");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("timing-chart-v2.recent"))).toBeNull();
});
