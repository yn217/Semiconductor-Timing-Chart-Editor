import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
// Transaction Mode opens with the six-transaction sample (demo_txn_read has three Phases).
async function openTransactionSample(page: import("@playwright/test").Page) {
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toBeVisible();
}

test("Delete with a Transaction Phase selected removes only that Phase as one undoable step", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await openTransactionSample(page);
  const phases = page.locator("[data-transaction-id='demo_txn_read'] .transaction-phases small");
  await expect(phases).toHaveCount(3);
  const phaseTarget = page.locator("button.transaction-phase-hit-target[data-phase-transaction-id='demo_txn_read']").first();
  await phaseTarget.click();
  await expect(phaseTarget).toHaveAttribute("aria-pressed", "true");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Delete", exact: true }).click();
  // Only the selected Phase is gone: the Transaction bar remains and two Phases are left.
  await expect(page.locator("[data-transaction-id='demo_txn_read']")).toHaveCount(1);
  await expect(phases).toHaveCount(2);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  // One undo restores the Phase.
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(phases).toHaveCount(3);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
});

test.describe("Spacer selection", () => {
startInCycleSample(test);

test("Rename is disabled for a selected Spacer and does not rename its parent Group", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Spacer", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const spacerRow = host.locator("[data-role='frozen-row'][data-row-id^='spacer_']");
  await expect(spacerRow).toHaveCount(1);
  await spacerRow.click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  const overflow = page.getByRole("menu", { name: "More Home Commands" });
  await expect(overflow.getByRole("menuitem", { name: "Rename", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
});
