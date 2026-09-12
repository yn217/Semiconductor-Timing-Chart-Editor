import { expect, test, type Page } from "@playwright/test";

// #393 items A/B: Transaction Mode used to drop a first-time user straight
// into a transaction bar plus raw fields with no explanation. This exercises
// the real-browser acceptance list's core path: explanatory empty state ->
// Create Transaction -> Undo/Redo -> Save/Open exactness -> Inspector/Bottom
// convergence.
//
// #453 removed the "Load Example" one-click fixture affordance from the
// normal Bottom Panel empty state (Transaction JSON with a rich example is
// meant to come through the ordinary File > Open path instead, same as any
// other document). The tests below that used to click it now build the
// same "Read Request" shape (Start 2/End 12, Request/Processing/Response
// phases, optionally linked to REQUEST/READY) through the real Create
// Transaction + Inspector Phase table + Linked Signals UI.

async function openTransactionMode(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
}

async function createReadRequestTransaction(page: Page, { withLinks = false }: { withLinks?: boolean } = {}) {
  const bottomEditor = page.getByTestId("transaction-editor");
  await bottomEditor.getByLabel("New Transaction name").fill("Read Request");
  await bottomEditor.getByLabel("New Transaction start").fill("2");
  await bottomEditor.getByLabel("New Transaction end").fill("12");
  await bottomEditor.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

  const inspector = page.getByTestId("inspector");
  const phases: readonly [string, number, number][] = [["Request", 2, 5], ["Processing", 5, 9], ["Response", 9, 12]];
  for (let i = 0; i < phases.length; i++) await inspector.getByTestId("add-transaction-phase").click();
  for (let i = 0; i < phases.length; i++) {
    const [name, start, end] = phases[i]!;
    await inspector.getByLabel(`Phase ${i + 1} name`).fill(name);
    await inspector.getByLabel(`Phase ${i + 1} start`).fill(String(start));
    await inspector.getByLabel(`Phase ${i + 1} end`).fill(String(end));
  }
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

  if (withLinks) {
    // Linking a signal dispatches transaction.linkSignal immediately and
    // updates the canonical revision. The picker's open/closed flag is
    // module-scoped (see
    // transaction-linked-signals.tsx) so it survives that remount, same as
    // Label Style's accordion state; no need to re-open between picks.
    await inspector.getByTestId("open-linked-signal-picker").click();
    for (const name of ["REQUEST", "READY"]) {
      await inspector.getByLabel("Search linked signals").fill(name);
      await inspector.getByRole("option", { name: new RegExp(name) }).click();
    }
  }
}

test("Transaction property edits preserve editor and Inspector identity", async ({ page }) => {
  await openTransactionMode(page);
  const editor = page.getByTestId("transaction-editor");
  await editor.getByLabel("New Transaction name").fill("Stable Editor");
  await editor.getByLabel("New Transaction start").fill("2");
  await editor.getByLabel("New Transaction end").fill("8");
  await editor.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByText("Editing:", { exact: false })).toHaveCount(0);
  await expect(editor.locator("[data-transaction-table-header='true']")).toBeVisible();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue("Stable Editor");
  const start = inspector.getByLabel("Transaction start", { exact: true });
  await start.fill("3");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(start).toHaveValue("3");
  await expect(editor.locator("[data-transaction-table-header='true']")).toBeVisible();
  await expect(editor.getByTestId("apply-transaction-properties")).toHaveCount(0);
});

test("Transaction Mode shows the create form directly and does not mutate the document merely by entering it", async ({ page }) => {
  await openTransactionMode(page);
  const host = page.getByTestId("cycle-surface");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
  };
  await expect(page.getByTestId("transaction-empty-state")).toHaveCount(0);
  await expect(page.getByLabel("New Transaction name")).toBeVisible();
  await expect(page.getByText("No Transactions match this search.")).toHaveCount(0);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
});

test("Transaction search empty state is reserved for an active no-match filter", async ({ page }) => {
  await openTransactionMode(page);
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const search = page.getByLabel("Search transactions");
  await search.fill("no-such-transaction");
  await expect(page.getByText("No Transactions match this search.")).toBeVisible();
});

test("Create Transaction removes the empty state as a single History entry, and Undo/Redo restores it exactly", async ({ page }) => {
  await openTransactionMode(page);

  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-empty-state")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(1);

  // Undo removes the created Transaction cleanly -- back to the exact
  // pre-creation empty state, not a partially-reverted one.
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(0);
  await expect(page.getByTestId("transaction-empty-state")).toHaveCount(0);
  await expect(page.getByLabel("New Transaction name")).toBeVisible();

  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(1);
});

test("A Transaction built with phases and Linked Signals survives Save/Open exactly, and Inspector/Bottom edits stay synchronized", async ({ page }) => {
  await openTransactionMode(page);
  await createReadRequestTransaction(page, { withLinks: true });
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("transaction-editor");
  const createdRow = bottom.locator("[data-transaction-row-id]").filter({ hasText: "Read Request" });
  await expect(createdRow).toHaveCount(1);
  const transactionId = await createdRow.getAttribute("data-transaction-row-id");

  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read Request");
  const linked = inspector.getByTestId("transaction-linked-signals");
  await expect(linked).toContainText("Linked Signals (2)");
  await expect(linked).toContainText("REQUEST");
  await expect(linked).toContainText("READY");

  // Edit through the Inspector; the Bottom remains table-first.
  await inspector.getByLabel("Transaction name").fill("Read Request v2");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(bottom.locator("[data-transaction-row-id]").filter({ hasText: "Read Request v2" })).toHaveCount(1);
  await expect(bottom.getByTestId("apply-transaction-properties")).toHaveCount(0);

  // Save/Open must reproduce the exact Transaction/phase/link state.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const savedText = fs.readFileSync(path!, "utf-8");
  const saved = JSON.parse(savedText) as { transactions: readonly { id: string; name: string; phases?: readonly unknown[]; linkedSignals?: readonly string[] }[] };
  const savedTransaction = saved.transactions.find((item) => item.id === transactionId);
  expect(savedTransaction).toBeDefined();
  expect(savedTransaction!.name).toBe("Read Request v2");
  expect(savedTransaction!.phases?.length).toBe(3);
  expect(savedTransaction!.linkedSignals?.length).toBe(2);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path!);
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(6);
  await expect(page.getByTestId("transaction-lanes").locator(`[data-transaction-id='${transactionId}']`)).toContainText("Read Request v2");
});

// #393 item C: normal Phase authoring must not require raw JSON. Add/Edit/
// Delete through the structured table, with raw JSON only reachable as a
// secondary Advanced disclosure that itself never submits a command
// directly (it only rewrites the table).
test("Phases are added, edited, and deleted through the structured table -- raw JSON editing is not part of normal Transaction editing", async ({ page }) => {
  await openTransactionMode(page);
  await createReadRequestTransaction(page);
  const inspector = page.getByTestId("inspector");
  const table = inspector.getByTestId("transaction-phase-editor");
  await expect(table.locator(".transaction-phase-row:not(.transaction-phase-row-header)")).toHaveCount(3);
  // createReadRequestTransaction is 2 commands: the Bottom Panel's create,
  // then the Inspector phase Apply.
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  // Edit an existing phase's name through the structured table alone.
  await inspector.getByLabel("Phase 1 name").fill("Setup");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  const bottomEditor = page.getByTestId("transaction-editor");
  // Re-select to force the Inspector/Bottom editors to re-read the committed document.
  await page.getByTestId("transaction-editor").locator("[data-transaction-row-id]").filter({ hasText: "Read Request" }).click();
  await expect(bottomEditor).toBeVisible();

  // Delete the last phase.
  await inspector.getByLabel("Delete phase 3").click();
  await expect(table.locator(".transaction-phase-row:not(.transaction-phase-row-header)")).toHaveCount(2);
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");

  // Add a new phase through "Add Phase" -- no JSON typed anywhere.
  await inspector.getByTestId("add-transaction-phase").click();
  const rows = table.locator(".transaction-phase-row:not(.transaction-phase-row-header)");
  await expect(rows).toHaveCount(3);
  await inspector.getByLabel("Phase 3 name").fill("Cooldown");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");

  // #429/#397: no raw "Advanced: edit as JSON" disclosure exists any more
  // -- verify the final committed state through the structured table
  // itself instead.
  await expect(inspector.getByTestId("transaction-phase-editor").locator("details")).toHaveCount(0);
  await expect(inspector.getByLabel("Phase 1 name")).toHaveValue("Setup");
  await expect(inspector.getByLabel("Phase 3 name")).toHaveValue("Cooldown");
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");
});

// #453: bulk operations -- checking several rows exposes a Group/Color/
// Delete toolbar that acts on every checked row as one atomic command batch,
// independent of whichever single row (if any) is open for editing.
test("Bulk-selecting Transactions applies Color and Delete to every checked row as one atomic History entry each", async ({ page }) => {
  await openTransactionMode(page);
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(6);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  const list = page.getByTestId("transaction-editor").locator(".transaction-list");
  const rows = list.locator(".transaction-list-row");
  await expect(rows).toHaveCount(6);
  // No bulk toolbar until at least one row is checked.
  await expect(page.getByTestId("transaction-bulk-toolbar")).toHaveCount(0);

  await rows.nth(0).locator("input[type='checkbox']").check();
  await rows.nth(1).locator("input[type='checkbox']").check();
  const bulkToolbar = page.getByTestId("transaction-bulk-toolbar");
  await expect(bulkToolbar).toBeVisible();
  await expect(page.getByTestId("transaction-bulk-count")).toHaveText("2 selected");

  // Bulk Color: one command per checked row, batched into one History entry.
  await bulkToolbar.getByLabel("Set selected transactions color").fill("#ff6600");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const swatches = rows.locator(".transaction-row-swatch");
  await expect(swatches.nth(0)).toHaveCSS("background-color", "rgb(255, 102, 0)");
  await expect(swatches.nth(1)).toHaveCSS("background-color", "rgb(255, 102, 0)");
  await expect(swatches.nth(2)).not.toHaveCSS("background-color", "rgb(255, 102, 0)");

  // Select all visible, then Bulk Delete removes every checked row as one
  // History entry and clears the checked set (nothing left to bulk-act on).
  await list.getByLabel("Select all visible transactions").check();
  await expect(page.getByTestId("transaction-bulk-count")).toHaveText("6 selected");
  await bulkToolbar.getByTestId("bulk-delete-transactions").click();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByTestId("transaction-bulk-toolbar")).toHaveCount(0);
  // #534: the zero-Transaction state is the create form itself, not a
  // separate "No Transactions yet" onboarding block -- same contract as
  // the initial empty state, now also true after bulk-deleting the last
  // remaining Transaction.
  await expect(page.getByTestId("transaction-empty-state")).toHaveCount(0);
  await expect(page.getByLabel("New Transaction name")).toBeVisible();

  // Undo restores all 6 deleted Transactions in the one History step.
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(6);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
});
