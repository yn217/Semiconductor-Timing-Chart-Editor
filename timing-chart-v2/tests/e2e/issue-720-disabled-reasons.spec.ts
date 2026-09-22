import { expect, test } from "@playwright/test";

test("disabled Bottom Transaction commands explain why", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  for (const id of ["bottom-transaction-duplicate", "bottom-transaction-delete", "bottom-transaction-ungroup"]) {
    await expect(bottom.getByTestId(id)).toBeDisabled();
    await expect(bottom.getByTestId(id)).toHaveAttribute("title", /Select (a|exactly one) Transaction first/);
  }
  await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
  await expect(bottom.getByTestId("bottom-transaction-duplicate")).toHaveAttribute("title", "Duplicate selected Transaction");
});
