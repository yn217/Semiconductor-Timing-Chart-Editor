import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

test("Bottom Transaction Panel stays table-first with no persistent selected-item editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  const editor = page.getByTestId("transaction-editor");
  await expect(editor.getByTestId("transaction-list-toolbar")).toBeVisible();
  await expect(editor.locator(".transaction-list")).toBeVisible();
  await expect(editor.getByText("Editing:")).toHaveCount(0);
  await expect(editor.getByTestId("apply-transaction-properties")).toHaveCount(0);

  await page.locator('[data-transaction-row-id="txn_read0"]').click();
  await expect(editor.getByTestId("transaction-list-toolbar")).toBeVisible();
  await expect(editor.locator(".transaction-list")).toBeVisible();
  await expect(editor.getByText("Editing:")).toHaveCount(0);
  await expect(editor.getByTestId("apply-transaction-properties")).toHaveCount(0);
});
