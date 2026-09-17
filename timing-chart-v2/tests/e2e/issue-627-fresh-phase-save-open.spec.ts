import { expect, test } from "@playwright/test";

test("fresh GUI-authored Phase commits, undoes/redoes, and survives Save/Open with the same Transaction ID", async ({ page }) => {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");

  // Start from a generic New document and author all semantic data through
  // visible production controls; do not load a prepared Transaction fixture.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const tree = page.getByTestId("transaction-left-tree");
  const row = tree.locator("[data-transaction-tree-id]");
  await expect(row).toHaveCount(1);
  const transactionId = await row.getAttribute("data-transaction-tree-id");
  expect(transactionId).toBeTruthy();

  const inspector = page.getByTestId("inspector");
  const phases = inspector.getByTestId("transaction-phase-editor").locator(".transaction-phase-row:not(.transaction-phase-row-header)");
  await expect(phases).toHaveCount(0);
  const initialRevision = Number(await surface.getAttribute("data-canonical-revision"));
  await inspector.getByTestId("add-transaction-phase").click();
  await expect(phases).toHaveCount(1);
  await inspector.getByLabel("Phase 1 name").fill("Authored Setup");
  // Add creates a draft only. Apply is the explicit semantic commit boundary.
  await expect(surface).toHaveAttribute("data-canonical-revision", String(initialRevision));
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(surface).toHaveAttribute("data-canonical-revision", String(initialRevision + 1));
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(phases).toHaveCount(1);
  await expect(inspector.getByLabel("Phase 1 name")).toHaveValue("Authored Setup");
  const phaseStart = Number(await inspector.getByLabel("Phase 1 start").inputValue());
  const phaseEnd = Number(await inspector.getByLabel("Phase 1 end").inputValue());

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await expect(phases).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(phases).toHaveCount(1);
  await expect(inspector.getByLabel("Phase 1 name")).toHaveValue("Authored Setup");

  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const fs = await import("node:fs");
  const saved = JSON.parse(fs.readFileSync(savedPath!, "utf8")) as {
    transactions: readonly { id: string; phases?: readonly { name: string; start: number; end: number }[] }[];
  };
  expect(saved.transactions.find((transaction) => transaction.id === transactionId)?.phases).toEqual([
    { name: "Authored Setup", start: phaseStart, end: phaseEnd },
  ]);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const reopenedRow = tree.locator(`[data-transaction-tree-id="${transactionId}"]`);
  await expect(reopenedRow).toHaveCount(1);
  await reopenedRow.click();
  await expect(phases).toHaveCount(1);
  await expect(inspector.getByLabel("Phase 1 name")).toHaveValue("Authored Setup");
  await expect(inspector.getByLabel("Phase 1 start")).toHaveValue(String(phaseStart));
  await expect(inspector.getByLabel("Phase 1 end")).toHaveValue(String(phaseEnd));
});
