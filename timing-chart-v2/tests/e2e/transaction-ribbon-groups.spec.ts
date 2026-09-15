import { expect, test } from "@playwright/test";

// #429/#397 Transaction Mode Product Closure (Ribbon cleanup): the
// Transaction Ribbon used to mix Transaction/Group/Time Scale commands in
// one "Transaction" caption with no visual distinction. Split into three
// coherently-captioned groups over the exact same already-existing
// commands (no new Transaction/Group model, no rebuilt Ribbon
// architecture): Transaction (Add/Duplicate), Group (Add/Ungroup), Time
// (Time Scale) -- matching the approved reference's own grouping. Also
// adds a Ribbon-level "Add Group" entry point (parity with the Left Tree's
// own "+" button, same `transactionGroup.create` command).

test("Transaction Ribbon splits into Transaction/Group/Time captioned groups, each functional, only in Transaction Mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  const ribbon = page.getByTestId("ribbon");
  const tree = page.getByTestId("transaction-left-tree");
  // Production startup defaults to Transaction mode; make the first
  // contextual-visibility assertion explicit so this test really exercises
  // the Cycle-only side of the contract.
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  // Cycle Mode: only the Transaction group (Create/Duplicate) shows -- no
  // Group/Time groups, and no ribbon overflow either mode.
  await expect(ribbon.locator("[data-major-group='Group']")).toHaveCount(0);
  await expect(ribbon.locator("[data-major-group='Transaction']")).toHaveCount(1);
  let overflow = await ribbon.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  await expect(ribbon.locator("[data-major-group='Transaction']").getByRole("button", { name: "Create Transaction", exact: true })).toBeVisible();
  await expect(ribbon.locator("[data-major-group='Group']").getByRole("button", { name: "Add Transaction Group", exact: true })).toBeVisible();
  await expect(ribbon.locator("[data-major-group='Group']").getByRole("button", { name: "Ungroup selected Transaction", exact: true })).toBeVisible();
  await expect(ribbon.locator("[data-major-group='Transaction Time']").getByTestId("transaction-time-scale-trigger")).toBeVisible();
  overflow = await ribbon.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // The new Ribbon "Add Group" button dispatches the same
  // `transactionGroup.create` command the Left Tree's own button uses --
  // one History entry, and the Group is real (selectable from the Bottom
  // Panel once a Transaction exists).
  const groupSelect = page.getByTestId("transaction-editor").getByLabel("Move selected transaction to group");
  const optionCountBefore = await groupSelect.locator("option").count();
  const groupIdsBefore = await groupSelect.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean));
  await ribbon.locator("[data-major-group='Group']").getByRole("button", { name: "Add Transaction Group", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(groupSelect.locator("option")).toHaveCount(optionCountBefore + 1);
  const groupIdsAfter = await groupSelect.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean));
  const newGroupIds = groupIdsAfter.filter((id) => !groupIdsBefore.includes(id));
  expect(newGroupIds).toHaveLength(1);
  const newGroupId = newGroupIds[0]!;
  await expect(tree.locator(`[data-transaction-group-id="${newGroupId}"]`)).toHaveCount(1);
  await expect(groupSelect.locator("option").evaluateAll((options, id) => options.some((option) => (option as HTMLOptionElement).value === id), newGroupId)).resolves.toBe(true);
  await ribbon.locator("[data-major-group='Transaction']").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const createdRows = tree.locator("[data-transaction-tree-id][data-selected='true']");
  await expect(createdRows).toHaveCount(1);
  const createdTransactionId = await createdRows.getAttribute("data-transaction-tree-id");
  expect(createdTransactionId).toBeTruthy();
  const transactionRow = tree.locator(`[data-transaction-tree-id="${createdTransactionId}"]`);
  const transactionGroupId = () => transactionRow.evaluate((row) => row.closest<HTMLElement>("[data-transaction-group-id]")?.dataset.transactionGroupId);
  await expect(transactionGroupId()).resolves.toBe("ungrouped");
  await expect(groupSelect.locator("option").evaluateAll((options, id) => options.some((option) => (option as HTMLOptionElement).value === id), newGroupId)).resolves.toBe(true);

  await groupSelect.selectOption(newGroupId);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(groupSelect).toHaveValue(newGroupId);
  await expect(transactionGroupId()).resolves.toBe(newGroupId);
  await expect(tree.locator(`[data-transaction-group-id="${newGroupId}"] [data-transaction-tree-id]`)).toHaveCount(1);

  await ribbon.locator("[data-major-group='Group']").getByRole("button", { name: "Ungroup selected Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
  await expect(groupSelect).toHaveValue("");
  await expect(transactionGroupId()).resolves.toBe("ungrouped");
  await expect(tree.locator(`[data-transaction-group-id="${newGroupId}"] [data-transaction-tree-id]`)).toHaveCount(0);
});
