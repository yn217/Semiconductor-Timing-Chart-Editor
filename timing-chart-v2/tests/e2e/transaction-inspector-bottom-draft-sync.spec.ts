import { expect, test } from "@playwright/test";

test("Transaction detail edits have one Inspector owner and never create a Bottom draft", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator('[data-transaction-row-id="demo_txn_read"]').click();

  const bottom = page.getByTestId("transaction-editor");
  const inspector = page.getByTestId("inspector");
  await expect(bottom.getByTestId("transaction-list-toolbar")).toBeVisible();
  await expect(bottom.locator(".transaction-list")).toBeVisible();
  await expect(bottom.getByTestId("apply-transaction-properties")).toHaveCount(0);
  await expect(bottom.getByText("Editing:")).toHaveCount(0);
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");

  const beforeHistory = await page.getByTestId("history-status").textContent();
  await inspector.getByLabel("Transaction name").fill("InspectorOwned");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toContainText("InspectorOwned");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText(/History 0 \/ Redo 1/);
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");
});
