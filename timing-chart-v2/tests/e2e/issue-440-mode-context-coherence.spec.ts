import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #440: with a primary Signal selected, choosing a Bookmark in the Bottom list
 * converts it to an explicit local target (Fixed, named in status) instead of
 * claiming Follow Selection. The primary Inspector/Status remain on the Signal;
 * mode switches do not expose a hidden-mode destructive Bookmark Inspector.
 */
for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`Bookmark Inspector target does not survive Cycle -> Transaction at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/old/pre-reset-2026-10-02/showcase/24_protocol_transaction_showcase.tcd.json"));
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("ribbon-context")).toHaveCount(0);
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByTestId("cycle-surface").locator("[data-role='left-row'][data-row-id='psel']").click();
    await expect(page.getByTestId("selection-status")).toHaveText("PSEL");
    await expect(page.getByTestId("cancel-inspector-draft")).toHaveText("Revert draft");
    await expect(page.getByTestId("cancel-inspector-draft")).toHaveAccessibleName("Discard unapplied Inspector draft");
    await expect(page.getByTestId("status-context")).not.toContainText("Bottom: Follow");
    await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
    const bookmarkRow = page.getByTestId("bookmark-editor-panel").getByTestId(/bookmark-row-/).first();
    await bookmarkRow.click();
    const inspector = page.getByTestId("inspector");
    await expect(bookmarkRow).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("selection-status")).toHaveText("PSEL");
    await expect(page.getByTestId("status-context")).toContainText("Bottom: Fixed · Target: Bookmark APB write");
    await expect(page.getByTestId("bottom-target-mode")).toHaveText("Fixed target: Bookmark APB write");
    await expect(inspector).toHaveAttribute("data-inspector-context", "signal");
    await page.getByTestId("bottom-settings").click();
    await expect(page.getByTestId("follow-selection")).not.toBeChecked();
    await page.getByTestId("bottom-settings").click();
    await expect(inspector).toHaveAttribute("data-inspector-context", "signal");
    const revision = await surface.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").innerText();
    const dirty = await page.getByTestId("dirty-status").innerText();

    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("ribbon-context")).toHaveCount(0);
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await expect(inspector).not.toHaveAttribute("data-inspector-context", "bookmark");
    await expect(page.getByRole("button", { name: "Delete Bookmark" })).toHaveCount(0);

    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("ribbon-context")).toHaveCount(0);
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await expect(inspector, "Bookmark remains an explicit Bottom-local target; Cycle Inspector follows the preserved primary Signal selection").toHaveAttribute("data-inspector-context", "signal");
    await page.getByTestId("bottom-settings").click();
    await page.getByTestId("follow-selection").check();
    await page.getByTestId("bottom-settings").click();
    await expect(page.getByTestId("selection-status")).toHaveText("PSEL");
    await expect(page.getByTestId("status-context")).not.toContainText("Bottom: Follow");
    await expect(inspector, "resuming Follow Selection releases the local Bookmark target").toHaveAttribute("data-inspector-context", "signal");
    await expect(bookmarkRow).toHaveAttribute("data-selected", "false");
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.getByTestId("ribbon-context")).toHaveCount(0);
    await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Signal");
    await page.getByTestId("transaction-lanes").click({ position: { x: 100, y: 12 } });
    await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
    await expect(page.getByTestId("ribbon-context")).toHaveCount(0);
    await page.locator(".surface-host").click({ position: { x: 100, y: 100 } });
    await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Signal");
    await expect(page.getByTestId("ribbon-context")).toHaveCount(0);
    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    expect(await page.getByTestId("history-status").innerText()).toBe(history);
    expect(await page.getByTestId("dirty-status").innerText()).toBe(dirty);
  });
}

test("Bottom follow is implicit and exceptional pin state is visible in the tab strip", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("bottom-target-mode")).toHaveCount(0);
  await page.getByTestId("bottom-settings").click();
  await expect(page.getByTestId("follow-selection")).toBeChecked();
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("bottom-target-mode")).toHaveCount(0);
});
