import { expect, test } from "@playwright/test";

test("Inspector Phases are editable in place and share one draft with the Bottom Phases tab", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByTestId("edit-transaction-phases")).toHaveCount(0);
  const editor = inspector.getByTestId("inspector-phase-editor");
  await expect(editor).toBeVisible();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Phases", exact: true }).click();
  const bottom = page.getByTestId("transaction-bottom-phases");
  const history = await page.getByTestId("history-status").innerText();

  await editor.getByLabel("Phase 1 name").fill("SHARED_DRAFT");
  await expect(bottom.getByLabel("Bottom Phase 1 name")).toHaveValue("SHARED_DRAFT");
  await expect(page.getByTestId("history-status")).toHaveText(history);

  await bottom.getByLabel("Bottom Phase 1 name").fill("FROM_BOTTOM");
  await expect(editor.getByLabel("Phase 1 name")).toHaveValue("FROM_BOTTOM");

  await editor.getByTestId("apply-transaction-phases").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(bottom.getByLabel("Bottom Phase 1 name")).toHaveValue("FROM_BOTTOM");
  await expect(page.getByTestId("transaction-bottom-phases-unapplied")).toHaveCount(0);
});
