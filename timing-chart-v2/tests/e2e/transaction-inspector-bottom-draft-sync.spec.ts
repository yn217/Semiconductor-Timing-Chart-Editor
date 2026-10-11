import { expect, test } from "@playwright/test";

test("Inspector updates preserve unrelated Bottom draft and surface same-field conflict", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator('[data-transaction-row-id="demo_txn_read"]').click();
  const bottom = page.getByTestId("transaction-editor");
  const inspector = page.getByTestId("inspector");
  await bottom.getByLabel("Bottom Transaction name", { exact: true }).fill("Bottom draft");
  await inspector.getByLabel("Transaction description", { exact: true }).fill("Inspector description");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(bottom.getByLabel("Bottom Transaction name", { exact: true })).toHaveValue("Bottom draft");
  await expect(bottom.getByLabel("Bottom Transaction description", { exact: true })).toHaveValue("Inspector description");
  await expect(page.getByTestId("history-status")).toHaveText(/History 1 \/ Redo 0/);
  await inspector.getByLabel("Transaction name", { exact: true }).fill("Inspector name");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(bottom.getByTestId("transaction-draft-conflict")).toBeVisible();
  await expect(bottom.getByTestId("apply-transaction-properties")).toBeDisabled();
  await expect(bottom.getByLabel("Bottom Transaction name", { exact: true })).toHaveValue("Bottom draft");
  await bottom.getByRole("button", { name: "Keep my draft", exact: true }).click();
  await bottom.getByTestId("apply-transaction-properties").click();
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue("Bottom draft");
  await expect(inspector.getByLabel("Transaction description", { exact: true })).toHaveValue("Inspector description");
  await expect(page.getByTestId("history-status")).toHaveText(/History 3 \/ Redo 0/);
});

test("Transaction detail edits have one Inspector owner and never create a Bottom draft", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator('[data-transaction-row-id="demo_txn_read"]').click();

  const bottom = page.getByTestId("transaction-editor");
  const inspector = page.getByTestId("inspector");
  await expect(bottom.getByTestId("transaction-list-toolbar")).toBeVisible();
  await expect(bottom.locator(".transaction-list")).toBeVisible();
  // #703: the selected Bottom row is the in-place editing row; its Apply is disabled while the draft is clean.
  await expect(bottom.getByTestId("apply-transaction-properties")).toBeDisabled();
  await expect(bottom.getByText("Editing:")).toHaveCount(0);
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");

  const beforeHistory = await page.getByTestId("history-status").textContent();
  await inspector.getByLabel("Transaction name").fill("InspectorOwned");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"] input[aria-label="Bottom Transaction name"]')).toHaveValue("InspectorOwned");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText(/History 0 \/ Redo 1/);
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");
});
