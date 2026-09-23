import { expect, test } from "@playwright/test";

test("Bottom draft edit is visibly marked and Escape restores the committed value without deselecting", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  const row = bottom.locator(".transaction-list-row > button[data-selected]").first();
  await row.click();
  const name = page.getByLabel("Bottom Transaction name");
  const original = await name.inputValue();
  const history = await page.getByTestId("history-status").innerText();
  await row.dblclick();
  await expect(name).toBeFocused();

  const committedStyle = await name.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderColor };
  });
  await name.fill("Draft Name");
  const dirtyStyle = await name.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderColor };
  });
  expect(dirtyStyle).not.toEqual(committedStyle);
  await expect(page.getByTestId("transaction-properties-unapplied")).toBeVisible();

  await name.press("Escape");
  await expect(name).toHaveValue(original);
  await expect.poll(() => name.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderColor };
  })).toEqual(committedStyle);
  await expect(page.getByTestId("transaction-properties-unapplied")).toHaveCount(0);
  await expect(row).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
