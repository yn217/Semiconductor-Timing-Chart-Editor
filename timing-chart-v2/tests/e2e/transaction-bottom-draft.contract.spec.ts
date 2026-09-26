import { expect, test } from "@playwright/test";

test("Bottom draft edit is visibly marked and Escape restores the committed value without deselecting", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  // Bottom selection is a separate bulk-selection model; select the entity
  // through the Tree so the persistent detail editor is the active target.
  await page.getByTestId("transaction-left-tree-row-demo_txn_write").click();
  const row = bottom.locator(".transaction-list-row[data-transaction-row-id='demo_txn_write']");
  const name = page.getByLabel("Bottom Transaction name");
  await expect(name).toBeVisible();
  const original = await name.inputValue();
  const history = await page.getByTestId("history-status").innerText();
  // Double-click a non-editing display cell in the selected row; the list
  // intentionally ignores double-clicks whose target is already an input or
  // select control.
  await row.locator(".transaction-list-row-editor > span").first().dblclick();
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
  await expect(row.locator(".transaction-list-row-editor")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
