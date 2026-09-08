import { expect, test } from "@playwright/test";

// #426 Bottom Panel Consolidation: the Goal's own target structure for the
// Transaction tab is "List / Timing / Phase / Linked Signals" -- Phase and
// Linked Signal editing previously existed only in the Inspector (#454),
// leaving the Bottom Panel without them. This exercises the Bottom Panel's
// own Phase table (same `transaction.update` command, batched into the
// existing Draft/Apply pair) and Linked Signals list (same
// `TransactionLinkedSignals` component + immediate-commit `onToggle`
// Inspector already uses) -- confirming one shared command owner, not a
// second Phase/LinkedSignal model.

async function openTransactionMode(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
}

test("Bottom Panel Transaction tab exposes Phase and Linked Signals, sharing Inspector's own command owner", async ({ page }) => {
  await openTransactionMode(page);
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const bottom = page.getByTestId("transaction-editor");
  await bottom.getByLabel("Transaction name", { exact: true }).fill("Read Request");
  await bottom.getByLabel("Transaction start", { exact: true }).fill("2");
  await bottom.getByLabel("Transaction end", { exact: true }).fill("12");
  await bottom.getByTestId("apply-transaction-properties").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  // Ribbon's "Create Transaction" is its own History entry (1); this Name/
  // Start/End Apply on the freshly-created row is a second (2).
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  // Phase table: Bottom's own testid/aria-labels, distinct from Inspector's,
  // since both editors are on screen for the same Transaction at once.
  await expect(bottom.getByTestId("transaction-bottom-phase-editor")).toBeVisible();
  await bottom.getByTestId("add-bottom-transaction-phase").click();
  await bottom.getByLabel("Bottom Phase 1 name").fill("Request");
  await bottom.getByLabel("Bottom Phase 1 start").fill("2");
  await bottom.getByLabel("Bottom Phase 1 end").fill("5");
  // Draft: no Canonical change before Apply.
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(bottom.getByTestId("transaction-properties-unapplied")).toBeVisible();
  await bottom.getByTestId("apply-transaction-properties").click();
  // One logical History unit for the whole Timing+Phase batch.
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  // The same Phase now shows in the Inspector's own Phase table too --
  // one Canonical Transaction, not a second Phase model.
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Phase 1 name")).toHaveValue("Request");

  // Linked Signals: reuses the exact same TransactionLinkedSignals
  // component Inspector uses -- immediate commit, own History entry each.
  await bottom.getByTestId("open-linked-signal-picker").click();
  await bottom.getByLabel("Search linked signals").fill("CLOCK");
  await bottom.getByRole("option", { name: /CLOCK/ }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
  await expect(bottom.getByTestId("transaction-linked-signals")).toContainText("CLOCK");
  // Inspector reflects the same link -- one shared Canonical owner.
  await expect(inspector.getByTestId("transaction-linked-signals")).toContainText("CLOCK");
});
