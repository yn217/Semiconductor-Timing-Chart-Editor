import { expect, test } from "@playwright/test";

// Transaction Mode GUI Closure: `transactionGroup.create` already existed at
// the command/planner layer (full create/rename/update/delete CRUD) with
// zero GUI entry point -- users could never actually build the Group
// hierarchy the Tree/Lane workspace already knows how to render. This adds
// and verifies the "+ Add Group" entry point in the Transaction Tree header.

test("Add Transaction Group creates a real Group selectable from the Bottom Panel, and the Tree/Lane header shows its name and count", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  // No Group header exists yet -- flat/empty Tree.
  await expect(page.getByTestId("transaction-group-header")).toHaveCount(0);

  await page.getByTestId("add-transaction-group-tree").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  // Creating a Group alone (no Transaction references it yet) doesn't
  // render a header band -- matches #452's "Group headers only appear
  // once real Groups are in use" contract, verified via the Bottom
  // Panel's Group dropdown instead.
  const bottomEditor = page.getByTestId("transaction-editor");
  const groupSelect = bottomEditor.getByLabel("Move selected transaction to group");

  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(groupSelect).toContainText("Group 1");
  await groupSelect.selectOption({ label: "Group 1" });
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  const header = page.getByTestId("transaction-group-header");
  await expect(header).toHaveCount(1);
  // The Group name is an inline-editable input (rename affordance), not
  // plain text -- assert its value, not textContent.
  await expect(header.getByLabel("Rename Group Group 1")).toHaveValue("Group 1");
  await expect(header).toContainText("(1)");

  // A second Add Group creates a distinct, independently selectable Group.
  await page.getByTestId("add-transaction-group-tree").click();
  await expect(groupSelect).toContainText("Group 2");
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");

  // Undo/Redo exact.
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(groupSelect).not.toContainText("Group 2");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(groupSelect).toContainText("Group 2");
});

test("Transaction Group can be renamed inline and deleted (ungrouping its Transactions), both exact-Undo/Redo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  await page.getByTestId("add-transaction-group-tree").click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const bottomEditor = page.getByTestId("transaction-editor");
  const groupSelect = bottomEditor.getByLabel("Move selected transaction to group");
  await groupSelect.selectOption({ label: "Group 1" });
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  const header = page.getByTestId("transaction-group-header");
  const nameInput = header.getByLabel("Rename Group Group 1");
  await nameInput.fill("Memory");
  await nameInput.press("Enter");
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
  await expect(header.getByLabel("Rename Group Memory")).toHaveValue("Memory");
  await expect(groupSelect).toContainText("Memory");

  // Delete (Ungroup): removes the Group, keeps its Transaction (ungrouped),
  // one History entry, exact Undo/Redo.
  const lanes = page.getByTestId("transaction-lanes");
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(1);
  await header.getByRole("button", { name: "Ungroup Memory" }).click();
  await expect(page.getByTestId("transaction-group-header")).toHaveCount(0);
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("transaction-group-header")).toHaveCount(1);
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(1);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("transaction-group-header")).toHaveCount(0);
});
