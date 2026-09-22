import { expect, test } from "@playwright/test";

// #770 Policy A (visible-scope selection): narrowing the Bottom Transaction filter prunes hidden selected rows, so a destructive bulk
// action (Delete/Group/Color) can only ever affect what the user currently sees. Filtering itself is view-only.
test("filtering prunes hidden selection before Delete/Group/Color can touch it", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const editor = page.getByTestId("bottom-editor");
  const rows = editor.locator(".transaction-list-row > button[data-selected], .transaction-list-row > .transaction-list-row-editor[data-selected]");
  const totalBefore = await rows.count();
  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");

  // Select 3 rows.
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ["Control"] });
  await rows.nth(2).click({ modifiers: ["Control"] });
  const selectedIdsBefore = await editor.locator(".transaction-list-row[data-transaction-row-id] > [data-selected='true']").evaluateAll((els) => els.map((el) => el.closest("[data-transaction-row-id]")?.getAttribute("data-transaction-row-id")).filter(Boolean));
  expect(selectedIdsBefore.length).toBe(3);

  // Filter down to one visible row that is part of the selection.
  const firstName = await rows.nth(0).evaluate((el) => el.querySelector("b")?.textContent ?? "");
  await editor.getByTestId("transaction-list-search").fill(firstName);
  await expect.poll(() => rows.count()).toBe(1);
  // Filtering is view-only.
  await expect(page.getByTestId("history-status")).toHaveText(history);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
  // The selection is pruned to what remains visible.
  const selectedIdsAfterFilter = await editor.locator(".transaction-list-row[data-transaction-row-id] > [data-selected='true']").evaluateAll((els) => els.map((el) => el.closest("[data-transaction-row-id]")?.getAttribute("data-transaction-row-id")).filter(Boolean));
  expect(selectedIdsAfterFilter).toEqual([selectedIdsBefore[0]]);

  // Delete now affects only the one visible, still-selected row.
  await editor.getByTestId("bottom-transaction-delete").click();
  await editor.getByTestId("transaction-list-search").fill("");
  const totalAfter = await rows.count();
  expect(totalAfter).toBe(totalBefore - 1);
  await expect.poll(() => rows.filter({ hasText: firstName }).count()).toBe(0);
  // The other two originally-selected (now-pruned) Transactions are untouched.
  for (const id of selectedIdsBefore.slice(1)) await expect(page.locator(`[data-transaction-row-id="${id}"]`).first()).toBeAttached();
});

test("Ctrl+A remains scoped to the current visible (filtered) order", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const editor = page.getByTestId("bottom-editor");
  const rows = editor.locator(".transaction-list-row > button[data-selected], .transaction-list-row > .transaction-list-row-editor[data-selected]");
  const firstName = await rows.nth(0).evaluate((el) => el.querySelector("b")?.textContent ?? "");
  await editor.getByTestId("transaction-list-search").fill(firstName);
  await expect.poll(() => rows.count()).toBe(1);
  await rows.nth(0).focus();
  await page.keyboard.press("Control+a");
  expect(await editor.locator(".transaction-list-row[data-transaction-row-id] > [data-selected='true']").count()).toBe(1);
});
