import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("Transaction tree selection opens the selected canonical transaction in Inspector", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const tree = page.getByTestId("transaction-left-tree");
  const readTransaction = tree.locator("[data-transaction-tree-id]").filter({ hasText: "Read_0" }).first();
  const transactionId = await readTransaction.getAttribute("data-transaction-tree-id");
  await readTransaction.click();
  const inspector = page.getByTestId("inspector");
  const targetHeader = inspector.getByTestId("inspector-selection-header");
  await expect(targetHeader.locator(".inspector-selection-title")).toHaveText("Read_0");
  await expect(targetHeader.locator(".inspector-selection-meta")).toContainText(transactionId!);
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue("Read_0");
  await inspector.getByLabel("Transaction name", { exact: true }).fill("Read_0_selected");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("transaction-editor").locator(".transaction-list-row input[aria-label='Bottom Transaction name']").and(page.locator("[value='Read_0_selected']"))).toHaveCount(1);
});
