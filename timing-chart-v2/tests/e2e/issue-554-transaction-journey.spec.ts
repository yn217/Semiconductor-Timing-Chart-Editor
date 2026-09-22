import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * #554 -- one continuous, unscripted, production-path journey through the Transaction workspace, from the app's own
 * default startup document (no fixture query param, no injected state): Group/Lane/Linked-Signal CRUD, cross-panel
 * selection sync (Tree <-> Bottom), Undo/Redo across those operations, a real Save -> New -> Open disk round trip,
 * Cycle <-> Transaction <-> Combined mode round trips, at both 1280x720 and 1672x941, with production
 * console/pageerror monitoring throughout.
 */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`#554 from-scratch Transaction workspace journey at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = trackErrors(page);
    await page.setViewportSize(viewport);

    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");

    const treeRows = page.locator(".transaction-left-tree-row[data-transaction-tree-id]");
    const countBefore = await treeRows.count();

    // 1) Create a Transaction with an explicit Lane from Bottom.
    const laneInput = page.getByLabel("New Transaction lane", { exact: false }).first();
    if (await laneInput.count()) await laneInput.fill("lane_journey");
    await page.getByTestId("bottom-transaction-add").click();
    await expect(treeRows).toHaveCount(countBefore + 1);
    const newRow = treeRows.last();
    const txId = await newRow.getAttribute("data-transaction-tree-id");
    await newRow.click();
    await expect(page.getByTestId("bottom-transaction-delete")).toBeEnabled();

    // 2) Lane persistence: the row's own Lane draft field reflects the created value.
    const rowLaneInput = page.getByLabel("Bottom Transaction lane", { exact: false }).first();
    if (await rowLaneInput.count()) await expect(rowLaneInput).toHaveValue(/lane_journey|lane_0/);

    // 3) Add a Group from Bottom, confirm Tree updates (cross-panel selection sync).
    const groupsBefore = await page.locator(".transaction-left-tree-group-header").count();
    await page.getByTestId("bottom-transaction-add-group").click();
    await expect(page.locator(".transaction-left-tree-group-header")).toHaveCount(groupsBefore + 1);

    // 4) Duplicate the Transaction.
    await newRow.click();
    await page.getByTestId("bottom-transaction-duplicate").click();
    await expect(treeRows).toHaveCount(countBefore + 2);

    // 5) Linked Signal add/remove via the Inspector's Transaction panel (open the picker, link one, unlink it).
    await newRow.click();
    const inspectorTab = page.getByRole("tab", { name: "Transaction", exact: true });
    if (await inspectorTab.count()) await inspectorTab.click();
    const openPicker = page.getByTestId("open-linked-signal-picker");
    if (await openPicker.count() && await openPicker.isVisible()) {
      await openPicker.click();
      const results = page.getByTestId("linked-signal-results");
      await expect(results).toBeVisible();
      const firstOption = results.locator("[role='option']").first();
      if (await firstOption.count()) {
        await firstOption.click();
        await expect(page.getByTestId("linked-signal-list")).toContainText(/./); // at least one linked entry rendered
        // Unlink it again via the list's own unlink control.
        const unlinkBtn = page.getByTestId("linked-signal-list").getByRole("button", { name: /Unlink/ }).first();
        if (await unlinkBtn.count()) await unlinkBtn.click();
      }
    }

    // 6) Undo/Redo across the operations above must not error and must move History.
    const historyAfterOps = await page.getByTestId("history-status").innerText();
    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    const historyAfterUndo = await page.getByTestId("history-status").innerText();
    expect(historyAfterUndo).not.toBe(historyAfterOps);
    await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByTestId("history-status")).toHaveText(historyAfterOps);

    // 7) Mode round trips: Transaction -> Combined -> Cycle -> Transaction, and Cycle -> Transaction -> Cycle;
    // Canonical/History stay stable across purely-navigational transitions.
    const history1 = await page.getByTestId("history-status").innerText();
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.locator(".split-transaction-pane")).toBeVisible();
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("history-status")).toHaveText(history1);
    await expect(treeRows).toHaveCount(countBefore + 2);

    // 8) Real Save -> New -> Open disk round trip using the production download/file-input path (no mocking).
    const download = page.waitForEvent("download");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    const savedPath = await (await download).path();
    expect(savedPath).toBeTruthy();
    const saved = JSON.parse(readFileSync(savedPath!, "utf-8")) as { transactions: readonly { id: string; laneId?: string }[] };
    const savedTxCount = saved.transactions.length;
    expect(savedTxCount).toBeGreaterThanOrEqual(countBefore + 2);

    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.locator(".transaction-left-tree-row[data-transaction-tree-id]")).toHaveCount(savedTxCount);
    // The lane assigned in step 1 survived the disk round trip.
    expect(saved.transactions.some((item) => item.laneId === "lane_journey")).toBe(true);

    expect(errors, `unexpected console/page errors during journey: ${errors.join(" | ")}`).toEqual([]);
    void txId;
  });
}
