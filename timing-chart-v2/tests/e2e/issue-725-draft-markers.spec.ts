import { expect, test } from "@playwright/test";

test("edited Bottom row cells show a draft marker and double-click focuses the editor", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  const rows = bottom.locator(".transaction-list-row > button[data-selected]");
  await rows.first().click();
  const name = page.getByLabel("Bottom Transaction name");
  await rows.first().dblclick();
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
  await expect.poll(() => name.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderColor };
  })).not.toEqual(dirtyStyle);
  await expect(page.getByTestId("transaction-properties-unapplied")).toHaveCount(0);
});
