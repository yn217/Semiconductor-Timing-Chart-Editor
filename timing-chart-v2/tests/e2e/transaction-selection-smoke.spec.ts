import { expect, test } from "@playwright/test";

test("Transaction tree selection opens the selected canonical transaction in Inspector", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const tree = page.getByTestId("transaction-left-tree");
  await tree.locator("[data-transaction-tree-id]").first().click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue("Read_0");
  await inspector.getByLabel("Transaction name", { exact: true }).fill("Read_0_selected");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("transaction-editor").locator(".transaction-list-row").filter({ hasText: "Read_0_selected" })).toHaveCount(1);
});
