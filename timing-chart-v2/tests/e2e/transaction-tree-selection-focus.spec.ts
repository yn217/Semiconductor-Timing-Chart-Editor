import { expect, test, type Page } from "@playwright/test";

// Transaction Tree selection and focus: Delete acts on the whole Ctrl-selection exactly once; Ctrl+A selects only the rows the tree
// shows; collapsing a Group with the mouse or the keyboard does not move focus to a selection elsewhere.
async function openTransactionPreset(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator(".transaction-left-tree-row")).toHaveCount(6);
}

const historyUndoCount = async (page: Page) => {
  const text = await page.getByTestId("history-status").innerText();
  return Number(/History (\d+)/.exec(text)?.[1] ?? "NaN");
};
const selectedRows = (page: Page) => page.locator(".transaction-left-tree-row[data-selected='true']");

test("Delete on a Ctrl-selected Transaction Tree row deletes the whole selection exactly once (single undo step)", async ({ page }) => {
  await openTransactionPreset(page);
  const rows = page.locator(".transaction-left-tree-row");
  const historyBefore = await historyUndoCount(page);
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ["Control"] });
  await rows.nth(2).click({ modifiers: ["Control"] });
  await expect(selectedRows(page)).toHaveCount(3);
  // Focus the middle row (already selected) and press Delete.
  await rows.nth(1).focus();
  await page.keyboard.press("Delete");
  await expect(rows).toHaveCount(3);
  await expect(selectedRows(page)).toHaveCount(0);
  expect(await historyUndoCount(page)).toBe(historyBefore + 1);
  // One undo restores all three deleted rows.
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows).toHaveCount(6);
  await expect(page.getByTestId("history-status")).toHaveText(new RegExp(`History ${historyBefore} /`));
});

test("Delete on a focused Transaction Tree row outside the selection deletes that row, not the previous selection", async ({ page }) => {
  await openTransactionPreset(page);
  const rows = page.locator(".transaction-left-tree-row");
  const historyBefore = await historyUndoCount(page);
  await rows.nth(0).click();
  await rows.nth(2).focus();
  await expect(selectedRows(page)).toHaveCount(1);
  const deletedId = await rows.nth(2).getAttribute("data-transaction-tree-id");
  await page.keyboard.press("Delete");
  await expect(rows).toHaveCount(5);
  await expect(page.locator(`.transaction-left-tree-row[data-transaction-tree-id="${deletedId}"]`)).toHaveCount(0);
  expect(await historyUndoCount(page)).toBe(historyBefore + 1);
});

test("Ctrl+A in the Transaction Tree selects only the rows the tree currently shows", async ({ page }) => {
  await openTransactionPreset(page);
  const rows = page.locator(".transaction-left-tree-row");
  const filter = page.getByLabel("Filter transactions");
  await filter.selectOption("grouped");
  await expect(rows).toHaveCount(5);
  await rows.nth(0).click();
  await rows.nth(0).focus();
  await page.keyboard.press("Control+a");
  // Only the five grouped rows are shown; the hidden ungrouped Transaction must not be selected.
  await expect(selectedRows(page)).toHaveCount(5);
  await expect(rows.filter({ hasText: "Transaction2" })).toHaveCount(0);
  // Delete then removes only the shown, selected rows.
  await page.keyboard.press("Delete");
  await filter.selectOption("all");
  await expect(rows).toHaveCount(1);
  await expect(rows.filter({ hasText: "Transaction2" })).toBeVisible();
});

test("Collapsing a Group with the mouse keeps focus where it was; keyboard collapse keeps focus on the header", async ({ page }) => {
  await openTransactionPreset(page);
  const rows = page.locator(".transaction-left-tree-row");
  // A grouped Group that has rows (the selection will sit inside it and collapse with it).
  const groupId = await page.locator(".transaction-left-tree-group[data-transaction-group-id]:not([data-transaction-group-id='ungrouped']):has(.transaction-left-tree-row)").first().getAttribute("data-transaction-group-id");
  const group = page.locator(`.transaction-left-tree-group[data-transaction-group-id="${groupId}"]`);
  const header = group.locator(".transaction-left-tree-group-header");
  const ungroupedRow = page.locator(".transaction-left-tree-group[data-transaction-group-id='ungrouped'] .transaction-left-tree-row");

  // Selection sits inside the Group; keyboard focus sits on the Ungrouped row (not selected).
  await group.locator(".transaction-left-tree-row").first().click();
  await ungroupedRow.focus();
  // Mouse collapse of that Group must not pull focus to the selected row inside it (or anywhere else).
  await header.getByRole("button", { name: /^Collapse / }).click();
  await expect(header.getByRole("button", { name: /^Expand / })).toHaveAttribute("aria-expanded", "false");
  await expect(ungroupedRow).toBeFocused();

  // Keyboard collapse from the focused Group header keeps focus on that header.
  await header.getByRole("button", { name: /^Expand / }).click();
  await expect(header.getByRole("button", { name: /^Collapse / })).toHaveAttribute("aria-expanded", "true");
  await header.getByRole("button", { name: /^Collapse / }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(header.getByRole("button", { name: /^Expand / })).toBeFocused();
});
