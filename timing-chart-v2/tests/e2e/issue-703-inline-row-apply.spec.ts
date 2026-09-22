import { expect, test } from "@playwright/test";

test("editing several Bottom row fields commits as one Apply and one Undo", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".transaction-list-row > button[data-selected]").first().click();
  const history = page.getByTestId("history-status");
  const apply = bottom.getByTestId("apply-transaction-properties");
  await expect(apply).toBeDisabled();
  const end = page.getByLabel("Bottom Transaction end");
  const description = page.getByLabel("Bottom Transaction description");
  const endBefore = await end.inputValue();
  const descriptionBefore = await description.inputValue();
  await end.fill(String(Number(endBefore) + 1));
  await description.fill("edited in table");
  await expect(history).toHaveText("History 0 / Redo 0");
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(history).toHaveText("History 1 / Redo 0");
  await expect(end).toHaveValue(String(Number(endBefore) + 1));
  await expect(description).toHaveValue("edited in table");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(history).toHaveText("History 0 / Redo 1");
  await expect(page.getByLabel("Bottom Transaction end")).toHaveValue(endBefore);
  await expect(page.getByLabel("Bottom Transaction description")).toHaveValue(descriptionBefore);
});

test("a rejected Bottom row Apply explains why and leaves the document untouched", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".transaction-list-row > button[data-selected]").first().click();
  const history = page.getByTestId("history-status");
  const start = page.getByLabel("Bottom Transaction start");
  await start.fill(String(Number(await start.inputValue()) + 1));
  await bottom.getByTestId("apply-transaction-properties").click();
  await expect(bottom.getByTestId("transaction-apply-error")).toBeVisible();
  await expect(history).toHaveText("History 0 / Redo 0");
  await bottom.getByTestId("revert-transaction-properties").click();
  await expect(bottom.getByTestId("transaction-apply-error")).toHaveCount(0);
});
