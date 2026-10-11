import { expect, test } from "@playwright/test";

test("#1121 keeps Transaction Bottom drafts across tab and mode switches, and guards Save/New", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.locator('.transaction-list-row[data-transaction-row-id="demo_txn_read"] > button:not(.transaction-disclosure-slot)').click();

  const name = page.getByLabel("Bottom Transaction name", { exact: true });
  await expect(name).toHaveValue("Read_0");
  await name.fill("Read_0 draft");
  const historyBefore = await page.getByTestId("history-status").innerText();
  const revisionBefore = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.getByRole("tab", { name: "Phases", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  await expect(name).toHaveValue("Read_0 draft");

  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  await expect(name).toHaveValue("Read_0 draft");
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("operation-feedback")).toContainText("Apply or revert the unapplied Transaction Bottom edits before saving");
  await expect(name).toHaveValue("Read_0 draft");

  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("unsaved-cancel").click();
  await expect(name).toHaveValue("Read_0 draft");

  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard-transaction-draft").click();
  await expect(page.getByTestId("unsaved-file-dialog")).toHaveCount(0);
  await expect(page.getByTestId("transaction-draft-lifecycle-warning")).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});
