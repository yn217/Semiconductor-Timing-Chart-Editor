import { expect, test } from "@playwright/test";

test("Combined: selecting a Transaction in the Tree after a Signal switches the Inspector to Transaction", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const inspector = page.getByTestId("inspector");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(inspector.getByLabel("Inspector signal name", { exact: true })).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();
  await page.getByTestId("transaction-left-tree").getByText("Read_0", { exact: true }).click();
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
