import { expect, test } from "@playwright/test";

// #748: the Transaction left-pane header follows Cycle's grammar: title, primary + Add, top-right ⋮ More, search/filter; no Signals tab.
test("Transaction left-pane header has title, + Add, ⋮ More menu, search + filter and no Signals switch", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const header = page.getByTestId("transaction-tree-header");
  await expect(page.getByTestId("transaction-tree-title")).toHaveText("Transactions");
  await expect(header.getByRole("button", { name: "Add transaction", exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Transaction tree actions", exact: true })).toBeVisible();
  await expect(header.getByRole("textbox", { name: "Search transactions" })).toBeVisible();
  await expect(header.getByRole("combobox", { name: "Filter transactions" })).toBeVisible();
  await expect(page.getByTestId("left-workspace-rail").getByRole("tab", { name: "Signals" })).toHaveCount(0);
  await expect(page.getByTestId("left-workspace-rail").getByRole("button", { name: "Signals", exact: true })).toHaveCount(0);

  const menu = page.getByTestId("transaction-tree-more-menu");
  await expect(menu).toHaveCount(0);
  await page.getByTestId("transaction-tree-more").click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Add Group…" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  // The menu is view-only until an item runs.
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await page.getByTestId("transaction-tree-more").click();
  await menu.getByRole("menuitem", { name: "Add Group…" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(menu).toHaveCount(0);
});
