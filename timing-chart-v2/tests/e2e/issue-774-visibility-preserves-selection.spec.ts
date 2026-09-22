import { expect, test } from "@playwright/test";

// #774: Tree-level visibility commands (Show/Hide All, per-Group Show/Hide) must change visibility only -- the user's selection (and the
// scope of the NEXT bulk command) must not silently become "every Transaction that was just toggled".
test("Hide All preserves the current selection, and the next Delete acts only on it", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const rowA = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const otherRow = page.getByTestId("transaction-left-tree-row-demo_txn_write");
  const history = await page.getByTestId("history-status").innerText();

  await rowA.click();
  await page.getByTestId("transaction-tree-more").click();
  await page.getByTestId("transaction-tree-hide-all").click();
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(history);
  await expect(rowA).toHaveAttribute("data-selected", "true");
  await expect(otherRow).toHaveAttribute("data-selected", "false");

  // Prove the scope of the NEXT command: Delete now must delete only A, not everything Hide All touched.
  const totalBefore = await page.locator(".transaction-left-tree-row").count();
  await rowA.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect.poll(() => page.locator(".transaction-left-tree-row").count()).toBe(totalBefore - 1);
  await expect(otherRow).toBeAttached();
});

test("per-Group Hide All preserves the current selection", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const rowA = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const otherRow = page.getByTestId("transaction-left-tree-row-demo_txn_write");
  const history = await page.getByTestId("history-status").innerText();

  await rowA.click();
  const groupHeader = page.locator("[data-transaction-group-id='demo_tgrp_memory'] .transaction-left-tree-group-header");
  await groupHeader.locator(".transaction-left-tree-more").click();
  await page.getByRole("menuitem", { name: "Hide All", exact: true }).click();
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(history);
  await expect(rowA).toHaveAttribute("data-selected", "true");
  await expect(otherRow).toHaveAttribute("data-selected", "false");
});
