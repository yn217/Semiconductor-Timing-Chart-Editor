import { expect, test } from "@playwright/test";

// #461: `transaction.update` reconstructs the entity and only preserves
// groupId/color/description when the command itself carries them. The
// Bottom Panel's primary Apply (Name/Start/End/Lane/Phases) used to send
// only those fields, so editing e.g. Start alone silently wiped a
// previously set Group/Color/Description -- real Canonical data loss.
// This reproduces the issue's own concrete failure scenario and confirms
// it no longer happens: set Group + Color, then edit Start only via the
// Inspector's primary form, and confirm Group/Color survive.
test("editing only Start via the Inspector does not silently clear a Transaction's Group or Color", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  await page.getByTestId("transaction-tree-more").click();
  await page.getByTestId("add-transaction-group-tree").click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const bottomEditor = page.getByTestId("transaction-editor");
  const inspector = page.getByTestId("inspector");
  const groupSelect = inspector.getByLabel("Transaction group");
  await groupSelect.selectOption({ index: 1 });
  await inspector.getByLabel("Transaction color").fill("#ff0000");
  await inspector.getByTestId("apply-inspector-transaction").click();

  const groupValueBefore = await groupSelect.inputValue();
  expect(groupValueBefore).not.toBe("");
  await expect(inspector.getByLabel("Transaction group")).toHaveValue(groupValueBefore);
  await expect(inspector.getByLabel("Transaction color")).toHaveValue("#ff0000");

  // Edit Start ONLY through the Inspector's primary Apply -- the exact
  // path the issue describes, which never touched Group/Color/Description.
  const startInput = inspector.getByLabel("Transaction start", { exact: true });
  const startBefore = Number(await startInput.inputValue());
  await startInput.fill(String(startBefore + 1));
  await inspector.getByTestId("apply-inspector-transaction").click();

  // Group and Color must survive in the Inspector and Bottom table row.
  await expect(groupSelect).toHaveValue(groupValueBefore);
  await expect(inspector.getByLabel("Transaction color")).toHaveValue("#ff0000");
  await expect(inspector.getByLabel("Transaction group")).toHaveValue(groupValueBefore);
  await expect(bottomEditor.locator(".transaction-list-row").filter({ hasText: "Transaction" }).first()).toBeVisible();
});
