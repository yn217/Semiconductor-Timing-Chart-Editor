import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #440: a hidden-mode entity must never remain an implicit Inspector target. Exact fixture 24: select a Bookmark in Cycle, switch to
 * Transaction (Inspector must not keep exposing the Bookmark / Delete Bookmark), and return (selection preserved, not cleared).
 * View-only mode switches leave Canonical / History / Dirty untouched.
 */
for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`Bookmark Inspector target does not survive Cycle -> Transaction at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/showcase/24_protocol_transaction_showcase.tcd.json"));
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
    await page.getByTestId("bookmark-editor-panel").getByTestId(/bookmark-row-/).first().click();
    const inspector = page.getByTestId("inspector");
    await expect(inspector).toHaveAttribute("data-inspector-context", "bookmark");
    const revision = await surface.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").innerText();
    const dirty = await page.getByTestId("dirty-status").innerText();

    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await expect(inspector).not.toHaveAttribute("data-inspector-context", "bookmark");
    await expect(page.getByRole("button", { name: "Delete Bookmark" })).toHaveCount(0);

    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await expect(inspector, "returning to Cycle restores the preserved Bookmark selection").toHaveAttribute("data-inspector-context", "bookmark");
    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    expect(await page.getByTestId("history-status").innerText()).toBe(history);
    expect(await page.getByTestId("dirty-status").innerText()).toBe(dirty);
  });
}
