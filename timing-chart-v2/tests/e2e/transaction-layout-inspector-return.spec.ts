import { expect, test } from "@playwright/test";

async function clearActiveSelection(page: import("@playwright/test").Page) {
  await page.getByTestId("ribbon").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("button", { name: "Clear Selection", exact: true }).click();
  await expect(page.getByTestId("inspector-layout-editor")).toBeVisible();
}

test("Transaction selection can return to Layout Inspector without reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  const tree = page.getByTestId("transaction-left-tree");
  const transactionTreeRow = tree.locator('[data-transaction-tree-id="demo_txn_read"]');
  const centerTransaction = page.locator('[data-transaction-id="demo_txn_read"]');
  const bottomTransaction = page.locator('[data-transaction-row-id="demo_txn_read"] > button');
  const host = page.getByTestId("cycle-surface");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = page.getByTestId("history-status");

  for (let index = 0; index < 5; index += 1) {
    await transactionTreeRow.click();
    await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-context", "transaction");
    await clearActiveSelection(page);
  }

  await centerTransaction.click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-context", "transaction");
  await clearActiveSelection(page);
  await bottomTransaction.click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-context", "transaction");
  await clearActiveSelection(page);

  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(history).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});
