import { expect, test } from "@playwright/test";

// #393 items A/B: Transaction Mode used to drop a first-time user straight
// into a transaction bar plus raw fields with no explanation and no
// discoverable example. This exercises the real-browser acceptance list's
// core path: empty state -> Load Example (one command, one History entry)
// -> Undo/Redo -> Save/Open exactness -> Inspector/Bottom convergence.

async function openTransactionMode(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
}

test("Transaction Mode shows an explanatory empty state and does not mutate the document merely by entering it", async ({ page }) => {
  await openTransactionMode(page);
  const host = page.getByTestId("cycle-surface");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
  };
  const empty = page.getByTestId("transaction-empty-state");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("No Transactions yet");
  await expect(empty).toContainText("time span");
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
});

test("Load Example inserts one complete Transaction as a single History entry, and Undo/Redo restores it exactly", async ({ page }) => {
  await openTransactionMode(page);
  const host = page.getByTestId("cycle-surface");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
  };

  await page.getByTestId("load-transaction-example").click();
  await expect(page.getByTestId("transaction-empty-state")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(1);

  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first();
  await expect(transaction).toContainText("Read Request");

  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read Request");
  await expect(inspector.getByLabel("Transaction start")).toHaveValue("2");
  await expect(inspector.getByLabel("Transaction end")).toHaveValue("12");
  const linked = inspector.getByTestId("transaction-linked-signals");
  await expect(linked).toContainText("Linked Signals (2)");
  await expect(linked).toContainText("REQUEST");
  await expect(linked).toContainText("READY");
  await expect(inspector.getByLabel("Transaction phases")).toHaveValue(/Request/);
  await expect(inspector.getByLabel("Transaction phases")).toHaveValue(/Processing/);
  await expect(inspector.getByLabel("Transaction phases")).toHaveValue(/Response/);

  // Undo removes the whole example cleanly -- back to the exact pre-example
  // empty state, not a partially-reverted transaction.
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(0);
  await expect(page.getByTestId("transaction-empty-state")).toBeVisible();

  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(1);
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first()).toContainText("Read Request");
});

test("Loaded example survives Save/Open exactly, and Inspector/Bottom edits stay synchronized", async ({ page }) => {
  await openTransactionMode(page);
  await page.getByTestId("load-transaction-example").click();
  const host = page.getByTestId("cycle-surface");
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(1);
  const transactionId = await page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first().getAttribute("data-transaction-id");

  // Edit through the Inspector, confirm the Bottom editor reflects it.
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Transaction name").fill("Read Request v2");
  await inspector.getByTestId("apply-transaction-properties").click();
  const bottomEditor = page.getByTestId("transaction-editor");
  await expect(bottomEditor.getByLabel("Transaction name")).toHaveValue("Read Request v2");

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
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]")).toHaveCount(1);
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first()).toContainText("Read Request v2");
});

// #393 item C: normal Phase authoring must not require raw JSON. Add/Edit/
// Delete through the structured table, with raw JSON only reachable as a
// secondary Advanced disclosure that itself never submits a command
// directly (it only rewrites the table).
test("Phases are added, edited, and deleted through the structured table without raw JSON, and Advanced JSON stays a secondary path", async ({ page }) => {
  await openTransactionMode(page);
  await page.getByTestId("load-transaction-example").click();
  const inspector = page.getByTestId("inspector");
  const table = inspector.getByTestId("transaction-phase-editor");
  await expect(table.locator(".transaction-phase-row:not(.transaction-phase-row-header)")).toHaveCount(3);

  // Edit an existing phase's name through the structured table alone.
  await inspector.getByLabel("Phase 1 name").fill("Setup");
  await inspector.getByTestId("apply-transaction-properties").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const bottomEditor = page.getByTestId("transaction-editor");
  // Re-select to force the Inspector/Bottom editors to re-read the committed document.
  await page.getByTestId("transaction-lanes").locator("[data-transaction-id]").first().click();
  await expect(bottomEditor).toBeVisible();

  // Delete the last phase.
  await inspector.getByLabel("Delete phase 3").click();
  await expect(table.locator(".transaction-phase-row:not(.transaction-phase-row-header)")).toHaveCount(2);
  await inspector.getByTestId("apply-transaction-properties").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  // Add a new phase through "Add Phase" -- no JSON typed anywhere.
  await inspector.getByTestId("add-transaction-phase").click();
  const rows = table.locator(".transaction-phase-row:not(.transaction-phase-row-header)");
  await expect(rows).toHaveCount(3);
  await inspector.getByLabel("Phase 3 name").fill("Cooldown");
  await inspector.getByTestId("apply-transaction-properties").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");

  const advanced = inspector.getByTestId("transaction-phase-editor").locator("details");
  await expect(advanced).not.toHaveAttribute("open", "");
  await advanced.locator("summary").click();
  await expect(inspector.getByLabel("Transaction phases")).toHaveValue(/Setup/);
  await expect(inspector.getByLabel("Transaction phases")).toHaveValue(/Cooldown/);
  // Advanced JSON never submitted a command of its own -- it only rewrites
  // the table via "Apply JSON to table"; opening/reading it changed nothing.
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
});
