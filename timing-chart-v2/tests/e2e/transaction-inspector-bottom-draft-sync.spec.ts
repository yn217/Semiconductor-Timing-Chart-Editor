import { expect, test } from "@playwright/test";

// #454 acceptance: "Bottom編集とInspector編集が同じCanonical結果になる",
// "Undo/Redo後にInspectorが古いdraftで上書きしない", "選択切替で別Transaction
// へdraftが漏れない" -- verifies Inspector and Bottom Panel share one
// Canonical Transaction (edits from either surface show up on the other),
// Undo/Redo doesn't leave Inspector on a stale pre-undo draft, and an
// unapplied draft never leaks onto a newly-selected Transaction.
test("Transaction Inspector and Bottom Panel share one Canonical result, survive Undo/Redo, and never leak an unapplied draft across selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  const bottom = page.getByTestId("transaction-editor");

  // Item: Bottom edit and Inspector edit produce the same Canonical result.
  // Edit via Bottom, confirm Inspector reflects it.
  await bottom.getByLabel("Transaction name", { exact: true }).fill("FromBottom");
  await bottom.getByTestId("apply-transaction-properties").click();
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("FromBottom");

  // Edit via Inspector, confirm Bottom reflects it.
  await inspector.getByLabel("Transaction name").fill("FromInspector");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(bottom.getByLabel("Transaction name", { exact: true })).toHaveValue("FromInspector");

  // Item: Undo/Redo doesn't leave Inspector showing a stale draft.
  const historyBefore = await page.getByTestId("history-status").textContent();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("FromBottom");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("FromInspector");

  // Item: switching selection doesn't leak a draft onto a different Transaction.
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await inspector.getByLabel("Transaction name").fill("StagedButNotApplied");
  // Switch selection to the first transaction via the Bottom list, without applying.
  await bottom.locator(".transaction-list-row button").first().click();
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("FromInspector");
  await expect(inspector.getByLabel("Transaction name")).not.toHaveValue("StagedButNotApplied");
});
