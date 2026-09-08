import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// #429/#397 Transaction Mode Product Closure P0-2: the Left panel's
// "Transactions | Signals" tabs -- Transaction Mode's own tree used to show
// only Transactions with no way to browse/select a Signal without leaving
// the mode. This is a real, separate Signal browse/select list (not a fork
// of the Cycle Mode tree's rendering), selecting through the exact same
// `selectHierarchySignal` action the real Signal Tree uses -- zero
// Canonical/History delta from switching tabs or selecting a Signal here.

const sampleFile = fileURLToPath(new URL("../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json", import.meta.url));

test("Transaction Mode Left panel's Transactions|Signals tabs swap trees and select through the shared selection owner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(sampleFile);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  const header = page.getByTestId("transaction-tree-header");
  const transactionsTab = header.getByTestId("transaction-tree-tab-transactions");
  const signalsTab = header.getByTestId("transaction-tree-tab-signals");
  await expect(transactionsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".transaction-lanes")).toBeVisible();
  await expect(page.getByTestId("transaction-signal-tree")).toHaveCount(0);

  await signalsTab.click();
  await expect(signalsTab).toHaveAttribute("aria-selected", "true");
  await expect(transactionsTab).toHaveAttribute("aria-selected", "false");
  const signalTree = page.getByTestId("transaction-signal-tree");
  await expect(signalTree).toBeVisible();
  await expect(page.locator(".transaction-lanes")).toHaveCount(0);
  // Zero Canonical/History delta purely from switching tabs.
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  const rows = signalTree.locator(".transaction-signal-tree-row");
  await expect(rows.first()).toBeVisible();
  const firstRow = rows.first();
  await firstRow.click();
  await expect(firstRow).toHaveAttribute("data-selected", "true");
  // Selecting a Signal here is the same canonical selection the real tree
  // uses -- zero History delta, and the Inspector reflects the pick.
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("inspector-shell")).toBeVisible();

  await transactionsTab.click();
  await expect(page.locator(".transaction-lanes")).toBeVisible();
  await expect(signalTree).toHaveCount(0);
});
