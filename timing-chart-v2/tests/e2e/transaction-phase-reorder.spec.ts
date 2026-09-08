import { expect, test } from "@playwright/test";

// #454: Phase table "Reorder" -- pure local draft array reordering (swaps
// position only; Start/End travel with the row), same shared CSS/markup
// in both the Inspector's own Phase table and the Bottom Panel's own copy
// (transaction-editor.tsx). Nothing commits until Apply, matching every
// other phase edit in this table.

test("Inspector Phase table Move Up/Down reorders the draft without committing until Apply", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Transaction end").fill("20");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await inspector.getByTestId("add-transaction-phase").click();
  await inspector.getByTestId("add-transaction-phase").click();
  await inspector.getByLabel("Phase 1 name").fill("ALPHA");
  await expect(inspector.getByLabel("Move phase 1 up")).toBeDisabled();
  await expect(inspector.getByLabel("Move phase 2 down")).toBeDisabled();

  const before = await page.getByTestId("history-status").textContent();
  await inspector.getByLabel("Move phase 1 down").click();
  await expect(inspector.getByLabel("Phase 1 name")).not.toHaveValue("ALPHA");
  await expect(inspector.getByLabel("Phase 2 name")).toHaveValue("ALPHA");
  // Draft-only: no Canonical/History change from reordering alone.
  await expect(page.getByTestId("history-status")).toHaveText(before!);

  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(inspector.getByLabel("Phase 2 name")).toHaveValue("ALPHA");
});
