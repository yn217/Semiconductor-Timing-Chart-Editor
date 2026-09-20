import { expect, test } from "@playwright/test";

test("Tree and Bottom search scope is explicit, active filters are visible and zero results explain themselves", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const treeSearch = page.getByTestId("transaction-tree-search");
  await expect(treeSearch).toHaveAttribute("placeholder", "Search tree…");
  await expect(page.getByTestId("transaction-list-search")).toHaveAttribute("placeholder", "Search transactions…");

  const mode = page.getByRole("combobox", { name: "Transaction filter mode" });
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
