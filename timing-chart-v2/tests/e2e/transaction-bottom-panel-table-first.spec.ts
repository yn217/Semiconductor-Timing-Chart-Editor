import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// #429/#397 Transaction Mode Product Closure P0-6: the Bottom Transaction
// Panel used to always render the single-item editing form (create-new or
// edit-selected) FIRST, pushing the multi-row table's toolbar and rows
// below it -- the opposite of the approved reference's "table is the
// dominant/primary content" structure. The toolbar+table now render
// immediately after the header (and any empty-state), with the single-
// item editor moved after them. No existing field/testid/behavior was
// removed -- this is a pure reorder.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

test("Bottom Transaction Panel's toolbar+table render before the single-item editor, both selected and unselected", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  const editor = page.getByTestId("transaction-editor");
  const domOrder = async () => editor.evaluate((section) => {
    const all = Array.from(section.querySelectorAll("*"));
    const indexOf = (selector: string) => { const el = section.querySelector(selector); return el ? all.indexOf(el) : -1; };
    return [indexOf("[data-testid='transaction-list-toolbar']"), indexOf(".transaction-list"), indexOf("form")];
  });

  // Nothing selected: toolbar/table still lead, "Create Transaction" form
  // (no current selection) comes after.
  const [toolbarPos1, tablePos1, formPos1] = await domOrder();
  expect(toolbarPos1).toBeGreaterThanOrEqual(0);
  expect(tablePos1).toBeGreaterThanOrEqual(0);
  expect(formPos1).toBeGreaterThan(tablePos1);

  // A Transaction selected: toolbar/table still lead, the "Editing: X" form
  // comes after -- Apply/Cancel/Name/Start/End remain fully present and
  // functional, just visually secondary to the table.
  await page.getByTestId("transaction-tree-row-txn_read0").click();
  const [toolbarPos2, tablePos2, formPos2] = await domOrder();
  expect(toolbarPos2).toBeLessThan(formPos2);
  expect(tablePos2).toBeLessThan(formPos2);
  await expect(editor.getByText("Editing: Read_0")).toBeVisible();
  await expect(editor.getByLabel("Transaction name")).toHaveValue("Read_0");
  await expect(editor.getByTestId("apply-transaction-properties")).toBeVisible();
});
