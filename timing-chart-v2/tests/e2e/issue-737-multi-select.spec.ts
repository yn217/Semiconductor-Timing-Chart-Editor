import { expect, test } from "@playwright/test";

test("Bottom Transaction table uses click/Ctrl/Shift selection without checkboxes or history changes", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  await expect(bottom.locator(".transaction-list input[type='checkbox']")).toHaveCount(0);
  const rows = bottom.locator(".transaction-list-row > button[data-selected], .transaction-list-row > .transaction-list-row-editor[data-selected]");
  const history = await page.getByTestId("history-status").innerText();
  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
  await rows.nth(2).click({ modifiers: ["Control"] });
  await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
  await expect(rows.nth(2)).toHaveAttribute("data-selected", "true");
  await expect(rows.nth(1)).toHaveAttribute("data-selected", "false");
  await rows.nth(0).click();
  await rows.nth(3).click({ modifiers: ["Shift"] });
  for (const index of [0, 1, 2, 3]) await expect(rows.nth(index)).toHaveAttribute("data-selected", "true");
  await expect(bottom.getByTestId("bottom-transaction-duplicate")).toBeDisabled();
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
