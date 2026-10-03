import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

/**
 * #440 scenario C: Bottom is fixed on a Bookmark; selecting a Transaction on the canvas moves the Inspector to the Transaction
 * while Bottom stays on the Bookmark with an explicit Fixed/Pinned label. View-only context changes leave Canonical/History/Dirty untouched.
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`Bookmark-fixed Bottom survives a canvas Transaction selection at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "05.tcd.json", mimeType: "application/json", buffer: await readFile(new URL("../../samples/current/05_combined_protocol.tcd.json", import.meta.url)) });
    await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first()).toBeVisible({ timeout: 60_000 });
    await expect(surface).toHaveAttribute("data-canonical-revision", /^\d+$/);
    const revision = await surface.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").textContent();
    const dirty = await page.getByTestId("dirty-status").textContent();

    await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
    const row = page.getByTestId("bookmark-editor-panel").getByTestId(/bookmark-row-/).first();
    await row.click();
    await expect(row).toHaveAttribute("data-selected", "true");
    const bookmarkLabel = await page.getByTestId("bottom-target-mode").textContent();
    expect(bookmarkLabel).toMatch(/^Fixed target: Bookmark /);

    const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first();
    const transactionId = (await bar.getAttribute("data-transaction-id"))!;
    await bar.click();
    await expect(bar).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("inspector").getByLabel("Transaction name", { exact: true })).toHaveValue("APB-style register read");
    await expect(page.getByTestId("bottom-target-mode")).toHaveText(bookmarkLabel!);
    await expect(row).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("status-context")).toContainText("Bottom: Fixed");
    await expect(page.getByTestId("status-context")).toContainText("Target: Bookmark");
    expect(transactionId).toBeTruthy();

    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    await expect(page.getByTestId("history-status")).toHaveText(history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
  });
}
