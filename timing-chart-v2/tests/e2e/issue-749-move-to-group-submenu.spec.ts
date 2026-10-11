import { expect, test } from "@playwright/test";

test("Transaction row menu nests group destinations under Move to Group", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const menu = page.getByTestId("transaction-tree-action-menu");
  const row = page.getByTestId("transaction-left-tree").getByTestId("transaction-left-tree-row-demo_txn_read");
  await row.locator("..").locator(".transaction-left-tree-more").click();
  await expect(menu.getByRole("menuitem")).toHaveText([/Focus in Timeline/, /Move to Group/, /Duplicate/, /Delete/]);
  const trigger = menu.getByRole("menuitem", { name: /Move to Group/ });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const sub = menu.getByRole("group", { name: "Move to Group" });
  await expect(sub.getByRole("menuitem", { name: "CPU" })).toBeEnabled();
  await expect(sub.getByRole("menuitem", { name: "Ungrouped" })).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();
  await sub.getByRole("menuitem", { name: "CPU" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("history-status")).not.toHaveText(history);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
});

test("'New Group…' in the Move to Group submenu creates the Group and moves the Transaction as ONE undoable step (#749)", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const history = page.getByTestId("history-status");
  await expect(history).toHaveText("History 0 / Redo 0");
  const newGroup = page.getByLabel("Rename Group Group 1");
  await expect(newGroup).toHaveCount(0);
  await page.getByRole("button", { name: "More actions for Transaction2" }).click();
  await page.getByRole("menuitem", { name: "Move to Group" }).click();
  await page.getByRole("menuitem", { name: "New Group…" }).click();
  await expect(history).toHaveText("History 1 / Redo 0"); // create + move = one batch
  await expect(newGroup).toHaveCount(1);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(history).toHaveText("History 0 / Redo 1");
  await expect(newGroup).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(history).toHaveText("History 1 / Redo 0");
  await expect(newGroup).toHaveCount(1);
});
