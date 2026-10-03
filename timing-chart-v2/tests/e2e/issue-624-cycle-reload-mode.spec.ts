import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`saved Cycle workspace reloads directly into complete signal and annotation projection at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    const surface = host.locator("[data-role='timing-chart-surface']");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await expect.poll(() => surface.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.filter((owner) => owner.querySelector("svg") === null).length)).toBe(0);
    await expect(surface.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'] svg")).toBeAttached();
    await expect(surface.locator("[data-role='annotation-owner'][data-annotation-id='demo_ann_request']")).toBeAttached();
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect.poll(() => surface.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.filter((owner) => owner.querySelector("svg") === null).length)).toBe(0);
    await expect(surface.locator("[data-role='annotation-owner'][data-annotation-id='demo_ann_request']")).toBeAttached();

    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    // Recent documents are persisted in IndexedDB (recent-document-storage.ts), not localStorage.
    await expect.poll(() => page.evaluate(() => new Promise<number>((resolve) => {
      const open = indexedDB.open("timing-chart-v2");
      open.onerror = () => resolve(0);
      open.onsuccess = () => {
        const database = open.result;
        if (!database.objectStoreNames.contains("recent-documents")) { database.close(); resolve(0); return; }
        const count = database.transaction("recent-documents", "readonly").objectStore("recent-documents").count();
        count.onsuccess = () => { database.close(); resolve(count.result); };
        count.onerror = () => { database.close(); resolve(0); };
      };
    }))).toBeGreaterThan(0);

    await page.reload();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Recent", exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "8");

    await expect.poll(() => surface.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.filter((owner) => owner.querySelector("svg") === null).length)).toBe(0);
    await expect(surface.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'] svg")).toBeAttached();
    await expect(surface.locator("[data-role='annotation-owner'][data-annotation-id='demo_ann_request']")).toBeAttached();
    await expect(host).toHaveAttribute("data-canonical-revision", "0");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  });
}
