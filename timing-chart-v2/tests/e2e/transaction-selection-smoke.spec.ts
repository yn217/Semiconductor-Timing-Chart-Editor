import { expect, test } from "@playwright/test";

test("Transaction tree selection opens the selected canonical transaction in Inspector", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const tree = page.getByTestId("transaction-left-tree");
  await tree.locator("[data-transaction-tree-id]").first().click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction name", { exact: true })).toHaveValue("Transaction 1");
  await page.getByTestId("inspector").getByLabel("Transaction name", { exact: true }).fill("Read_0");
  await page.getByTestId("inspector").getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("transaction-editor")).toContainText("Read_0");
});
