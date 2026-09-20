import { expect, test } from "@playwright/test";

// Transaction Mode GUI realignment (reference toolbar: "Add / Duplicate /
// Delete / Group / Ungroup / Color / Search"): the Bottom Panel's toolbar
// already had Duplicate/Group/Color/Search but no way to create a new
// Transaction or clear its Group without going back through the Ribbon or
// re-opening the Group select to "Ungrouped". Both new buttons route
// through the exact same existing commands (createTransactionFromBottom /
// moveToGroup) the rest of this toolbar already uses.
test("Bottom Panel toolbar Add creates a Transaction and Ungroup clears its Group, both as real Semantic Commands", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();

  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const bottomEditor = page.getByTestId("transaction-editor");
  await expect(bottomEditor.getByTestId("bottom-transaction-ungroup")).toBeDisabled();

  await page.getByTestId("transaction-tree-more").click();
  await page.getByTestId("add-transaction-group-tree").click();
  const groupSelect = bottomEditor.getByLabel("Move selected transaction to group");
  await groupSelect.selectOption({ label: "Group 1" });
  const historyAfterGroup = await page.getByTestId("history-status").textContent();
  await expect(bottomEditor.getByTestId("bottom-transaction-ungroup")).toBeEnabled();

  await bottomEditor.getByTestId("bottom-transaction-ungroup").click();
  await expect(page.getByTestId("history-status")).not.toHaveText(historyAfterGroup!);
  await expect(groupSelect).toHaveValue("");
  await expect(bottomEditor.getByTestId("bottom-transaction-ungroup")).toBeDisabled();

  // Add creates a new Transaction and selects it -- one real History entry.
  const historyBeforeAdd = await page.getByTestId("history-status").textContent();
  await bottomEditor.getByTestId("bottom-transaction-add").click();
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBeforeAdd!);
  await expect(page.locator("[data-transaction-id]")).toHaveCount(2);
});
