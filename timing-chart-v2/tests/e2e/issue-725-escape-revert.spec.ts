import { expect, test } from "@playwright/test";

test("Escape in the active Bottom row reverts a dirty draft before deselecting", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".transaction-list-row > button[data-selected]").first().click();
  const name = page.getByLabel("Bottom Transaction name");
  const original = await name.inputValue();
  const history = await page.getByTestId("history-status").innerText();
  await name.fill(`${original}_draft`);
  await name.press("Escape");
  await expect(name).toHaveValue(original);
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
