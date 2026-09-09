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
  await ribbon.locator("[data-major-group='Group']").getByRole("button", { name: "Add Transaction Group", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await ribbon.locator("[data-major-group='Transaction']").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const groupSelect = page.getByTestId("transaction-editor").getByLabel("Move selected transaction to group");
  await expect(groupSelect).toContainText("Group 1");
});
