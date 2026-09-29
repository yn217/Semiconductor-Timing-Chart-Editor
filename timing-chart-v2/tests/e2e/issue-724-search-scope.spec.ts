import { expect, test } from "@playwright/test";

test("Tree and Bottom search scope is explicit, active filters are visible and zero results explain themselves", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const treeSearch = page.getByTestId("transaction-tree-search");
  await expect(treeSearch).toHaveAttribute("placeholder", "Search transactions…");
  const bottomSearch = page.getByTestId("transaction-list-search");
  await expect(bottomSearch).toHaveAttribute("placeholder", "Search transactions…");
  const treeRead = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const treeWrite = page.getByTestId("transaction-left-tree-row-demo_txn_write");
  const tableRows = page.locator(".transaction-list-row[data-transaction-row-id]");

  // The two search controls have independent scopes: a Tree filter must not
  // narrow the Bottom table, and a Bottom query must not replace the Tree filter.
  await treeSearch.fill("Read_0");
  await expect(treeRead).toBeVisible();
  await expect(treeWrite).toHaveCount(0);
  await expect(tableRows).toHaveCount(6);
  await bottomSearch.fill("Write_0");
  await expect(tableRows).toHaveCount(1);
  await expect(tableRows.first()).toHaveAttribute("data-transaction-row-id", "demo_txn_write");
  await expect(treeRead).toBeVisible();
  await expect(treeWrite).toHaveCount(0);
  await bottomSearch.fill("");

  const mode = page.getByRole("combobox", { name: "Filter transactions" });
  await expect(mode).toHaveAttribute("data-filter-active", "false");
  await mode.selectOption("ungrouped");
  await expect(mode).toHaveAttribute("data-filter-active", "true");
  await treeSearch.fill("zzz-no-such-transaction");
  await expect(page.getByTestId("transaction-tree-no-match")).toContainText("zzz-no-such-transaction");
  // Filters are view-only.
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await page.getByRole("button", { name: "Clear transaction tree filter" }).click();
  await mode.selectOption("all");
  await expect(mode).toHaveAttribute("data-filter-active", "false");
  await expect(page.getByTestId("transaction-tree-no-match")).toHaveCount(0);
});
