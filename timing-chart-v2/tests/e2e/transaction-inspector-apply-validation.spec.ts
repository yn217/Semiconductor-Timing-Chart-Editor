import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const samplePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/old/pre-reset-2026-10-02/acceptance-429/sample-transaction-mode-closure.tcd.json");

test("does not offer an invalid Add Phase when the existing phases fill the Transaction range", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-txn_read0").click();

  const inspector = page.getByTestId("inspector");
  const rows = inspector.getByTestId("inspector-phase-editor").locator(".transaction-bottom-phase-row:not(.transaction-bottom-phase-head)");
  await expect(rows).toHaveCount(3);
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();
  const add = inspector.getByTestId("add-transaction-phase");
  await expect(add).toBeDisabled();
  await expect(inspector.getByRole("note")).toHaveText("No unused cycles remain. Extend the Transaction or shorten a Phase to add another.");
  await inspector.getByRole("button", { name: "Phases", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Add to Phases", exact: true })).toBeDisabled();
  await inspector.getByRole("button", { name: "Phases", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
});

test("commits an available Phase as one History unit and preserves it through Undo/Redo and Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-txn_read0").click();

  const inspector = page.getByTestId("inspector");
  const rows = inspector.getByTestId("inspector-phase-editor").locator(".transaction-bottom-phase-row:not(.transaction-bottom-phase-head)");
  await inspector.getByLabel("Transaction end").fill("6.1"); // TC (10 cycles/TC) = 61 cycles
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const add = inspector.getByTestId("add-transaction-phase");
  await expect(add).toBeEnabled();
  await add.click();
  await expect(rows).toHaveCount(4);
  await expect(inspector.getByLabel("Phase 4 start")).toHaveValue("6");
  await expect(inspector.getByLabel("Phase 4 end")).toHaveValue("6.1");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const fs = await import("node:fs");
  const saved = JSON.parse(fs.readFileSync(savedPath!, "utf8")) as { transactions: readonly { id: string; phases?: readonly { name: string; start: number; end: number }[] }[] };
  expect(saved.transactions.find((transaction) => transaction.id === "txn_read0")?.phases).toHaveLength(4);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByTestId("transaction-left-tree-row-txn_read0").click();
  await expect(rows).toHaveCount(4);
  await expect(inspector.getByLabel("Phase 4 start")).toHaveValue("6");
  await expect(inspector.getByLabel("Phase 4 end")).toHaveValue("6.1");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

// #454 Visual Quality Closure ("unclear draft state"): a rejected Transaction
// Inspector Apply (e.g. End beyond the document's own cycle count) used to
// fail completely silently -- the draft stayed on-screen looking applied,
// with no error message and no History change, indistinguishable from a
// successful Apply except that nothing actually happened. Now surfaced via
// the same shared status output the Phases validation already used.
test("a rejected Transaction Apply surfaces its reason instead of silently no-opping", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const inspector = page.getByTestId("inspector");
  const end = inspector.getByLabel("Transaction end");
  const cycleCount = Number(await end.getAttribute("max"));
  await end.fill(String(cycleCount + 1));
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(inspector.getByRole("status")).toHaveText(/half-open|range|cycle/i);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await inspector.getByLabel("Transaction end").fill("2"); // 2 TC = 20 cycles
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});
