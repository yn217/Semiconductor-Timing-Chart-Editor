import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const samplePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

test("Transaction detail editing lives in the Inspector while Bottom stays table-first with a Draft->Apply row (#703)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator('[data-transaction-row-id="txn_read0"]').click();

  const bottom = page.getByTestId("transaction-editor");
  await expect(bottom.getByTestId("transaction-list-toolbar")).toBeVisible();
  await expect(bottom.locator(".transaction-list")).toBeVisible();
  // #703: the active Bottom row is editable through one Draft -> Apply; with no edits Apply is disabled and no draft status shows.
  await expect(bottom.getByTestId("apply-transaction-properties")).toBeDisabled();
  await expect(bottom.getByTestId("transaction-properties-unapplied")).toHaveCount(0);
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("1"); // cycle 10 at 10 cycles/TC (#750)
  await expect(page.getByTestId("inspector").getByTestId("transaction-linked-signals")).toBeVisible();
});
