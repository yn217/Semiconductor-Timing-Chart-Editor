import { expect, test } from "@playwright/test";

test("selection, hover and focus use separate design tokens on Bottom rows", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const tokens = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return ["--ds-selection-bg", "--ds-selection-border", "--ds-hover-bg", "--ds-hover-border", "--ds-focus-color"].map((name) => cs.getPropertyValue(name).trim()); });
  expect(new Set(tokens).size).toBe(tokens.length);
  for (const token of tokens) expect(token).not.toBe("");
  const row = page.getByTestId("bottom-editor").locator(".transaction-list-row > button[data-selected]").nth(1);
  await row.hover();
  await expect(row).toHaveCSS("background-color", "rgb(243, 248, 253)");
  await row.click();
  const selected = page.getByTestId("bottom-editor").locator(".transaction-list-row-editor[data-selected='true'], .transaction-list-row > button[data-selected='true']").first();
  await expect(selected).toBeVisible();
});
