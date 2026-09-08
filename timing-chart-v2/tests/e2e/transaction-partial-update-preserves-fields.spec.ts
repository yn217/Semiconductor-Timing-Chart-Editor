import { expect, test } from "@playwright/test";

// #461: `transaction.update` reconstructs the entity and only preserves
// groupId/color/description when the command itself carries them. The
// Bottom Panel's primary Apply (Name/Start/End/Lane/Phases) used to send
// only those fields, so editing e.g. Start alone silently wiped a
// previously set Group/Color/Description -- real Canonical data loss.
// This reproduces the issue's own concrete failure scenario and confirms
// it no longer happens: set Group + Color, then edit Start only via the
// Bottom Panel's main form, and confirm Group/Color survive.
test("editing only Start via the Bottom Panel does not silently clear a Transaction's Group or Color", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();

  await page.getByTestId("add-transaction-group-tree").click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const bottomEditor = page.getByTestId("transaction-editor");
  const groupSelect = bottomEditor.getByLabel("Move selected transaction to group");
  await groupSelect.selectOption({ label: "Group 1" });
  await bottomEditor.getByLabel("Set selected transaction color").fill("#ff0000");

  const groupValueBefore = await groupSelect.inputValue();
  expect(groupValueBefore).not.toBe("");
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Transaction group")).toHaveValue(groupValueBefore);
  await expect(inspector.getByLabel("Transaction color")).toHaveValue("#ff0000");

  // Edit Start ONLY through the Bottom Panel's primary Apply -- the exact
  // path the issue describes, which never touched Group/Color/Description.
  const startInput = bottomEditor.getByLabel("Transaction start", { exact: true });
  const startBefore = Number(await startInput.inputValue());
  await startInput.fill(String(startBefore + 1));
  await expect(bottomEditor.getByTestId("apply-transaction-properties")).toBeEnabled();
  await bottomEditor.getByTestId("apply-transaction-properties").click();

  // Group and Color must survive, in both the Bottom Panel and Inspector.
  await expect(groupSelect).toHaveValue(groupValueBefore);
  await expect(bottomEditor.getByLabel("Set selected transaction color")).toHaveValue("#ff0000");
  await expect(inspector.getByLabel("Transaction color")).toHaveValue("#ff0000");
  await expect(inspector.getByLabel("Transaction group")).toHaveValue(groupValueBefore);
});
