import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("Transaction tree selection opens the selected canonical transaction in Inspector", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const tree = page.getByTestId("transaction-left-tree");
  await tree.locator("[data-transaction-tree-id]").filter({ hasText: "Read_0" }).first().click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue("Read_0");
  await inspector.getByLabel("Transaction name", { exact: true }).fill("Read_0_selected");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("transaction-editor").locator(".transaction-list-row input[aria-label='Bottom Transaction name']").and(page.locator("[value='Read_0_selected']"))).toHaveCount(1);
});
