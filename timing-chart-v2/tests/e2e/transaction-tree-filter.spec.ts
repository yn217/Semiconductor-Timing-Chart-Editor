import { expect, test } from "@playwright/test";

test("Transaction Tree filter modes derive grouped and phase data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();

  const filter = page.getByLabel("Filter transactions");
  const rows = page.locator("[data-testid^='transaction-left-tree-row-']");
  await expect(rows).toHaveCount(6);

  await filter.selectOption("grouped");
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: "Transaction2" })).toHaveCount(0);

  await filter.selectOption("phases");
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: "Transaction2" })).toHaveCount(0);

  await filter.selectOption("ungrouped");
  await expect(rows).toHaveCount(1);
  await expect(rows.filter({ hasText: "Transaction2" })).toBeVisible();
});
