import { expect, test } from "@playwright/test";

test("F2 on the active Bottom row starts editing without committing", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  const rows = bottom.locator(".transaction-list-row > button[data-selected]");
  await rows.first().click();
  const history = await page.getByTestId("history-status").innerText();
  await rows.first().focus();
  await page.keyboard.press("F2");
  const active = page.getByLabel("Bottom Transaction name");
  await expect(active).toBeFocused();
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
