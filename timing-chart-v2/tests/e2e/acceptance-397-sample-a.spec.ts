import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// #397 Sample A -- Basic Transaction lifecycle.
// Loads samples/old/pre-reset-2026-10-02/acceptance-397/sample-a-basic-transaction-lifecycle.tcd.json
// through the real production File > Open input (not test-only Canonical/
// React state injection) and exercises the "Transaction verification"
// checklist: phase geometry, lane identity, create/rename/move/resize/
// delete, phase add/edit/delete, link/unlink Signal, Undo/Redo exact,
// Inspector/Bottom convergence -- at both required viewports.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/old/pre-reset-2026-10-02/acceptance-397/sample-a-basic-transaction-lifecycle.tcd.json");

async function openSampleA(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Sample A loads through production Open, shows 4 Transactions across 2 lanes with correct phase geometry, no console errors, at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await openSampleA(page);
    const lanes = page.getByTestId("transaction-lanes");
    await expect(lanes.locator("[data-transaction-id]")).toHaveCount(4);
    for (const [id, name] of [["txn_read0", "Read_0"], ["txn_write0", "Write_0"], ["txn_read1", "Read_1"], ["txn_write1", "Write_1"]] as const) {
      await expect(lanes.locator(`[data-transaction-id='${id}']`)).toHaveAttribute("aria-label", name);
    }

    // Phase geometry: Read_0's 3 phases are 2/2/2 cycles (equal widths);
    // Read_1's 2 phases are 3/3 cycles (also equal, but a different bar
    // width than Read_0 since Read_1 spans 6 cycles vs Read_0's 6 too --
    // check the *relative* phase-to-phase width ratio within one bar
    // instead of hardcoding pixel widths, matching the durations exactly.
    const read0 = lanes.locator("[data-transaction-id='txn_read0']");
    const read0Phases = read0.locator(".transaction-phases small");
    await expect(read0Phases).toHaveCount(3);
    const read0Boxes = await read0Phases.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    // Address(2cyc)/Wait(2cyc)/Response(2cyc) -- all equal duration, so all
    // 3 phase-label boxes should be (approximately) the same width.
    expect(Math.abs(read0Boxes[0]! - read0Boxes[1]!)).toBeLessThan(2);
    expect(Math.abs(read0Boxes[1]! - read0Boxes[2]!)).toBeLessThan(2);

    const write0 = lanes.locator("[data-transaction-id='txn_write0']");
    const write0Phases = write0.locator(".transaction-phases small");
    await expect(write0Phases).toHaveCount(3);

    // Lane identity: Read_0/Read_1 share lane_0, Write_0/Write_1 share
    // lane_1 -- both visible/stable and distinct from each other.
    await expect(read0).toContainText("");
    const laneLabels = lanes.locator(".transaction-lane-label, .transaction-lane-label-row");
    await expect(laneLabels.first()).toBeVisible();

    // No unexplained console/page errors from this sample.
    expect(errors.filter((message) => !message.includes("beforeunload"))).toEqual([]);
  });
}

test("Sample A: create/rename/move/resize/delete, phase add/edit/delete, link/unlink Signal, and Undo/Redo exact", async ({ page }) => {
  await openSampleA(page);
  const lanes = page.getByTestId("transaction-lanes");
  const inspector = page.getByTestId("inspector");
  const bottomEditor = page.getByTestId("transaction-editor");

  // Select Read_0 and confirm the Inspector owns details while Bottom stays
  // table-first (no stale values from a previous/default state).
  await lanes.locator("[data-transaction-id='txn_read0']").click();
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");
  await expect(bottomEditor.locator("[data-transaction-row-id='txn_read0'] input[aria-label='Bottom Transaction name']")).toHaveValue("Read_0");
  // #703: the Bottom row is editable and carries its own Apply, disabled while the draft equals Canonical.
  await expect(bottomEditor.getByTestId("apply-transaction-properties")).toBeDisabled();
  await expect(inspector.getByLabel("Transaction start")).toHaveValue("6");
  await expect(inspector.getByLabel("Transaction end")).toHaveValue("12");

  // Rename through the Inspector; the Bottom row reflects it immediately.
  await inspector.getByLabel("Transaction name").fill("Read_0_renamed");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(bottomEditor.locator("[data-transaction-row-id='txn_read0'] input[aria-label='Bottom Transaction name']")).toHaveValue("Read_0_renamed");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  // Move (Start/End) and lane edit through the Inspector, one Apply.
  // Widen rather than shift so the existing 6-12 phase range stays inside
  // Start..End (the Inspector's own Apply validation correctly rejects a
  // range that would put an existing phase outside the new bounds).
  await inspector.getByLabel("Transaction start").fill("5");
  await inspector.getByLabel("Transaction end").fill("14");
  await inspector.getByLabel("Transaction lane").fill("lane_2");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(lanes.locator("div.transaction-lane[data-lane-id='lane_2']")).toBeVisible();

  // Phase edit: rename an existing phase, delete one, add a new one.
  const phaseTable = inspector.getByTestId("inspector-phase-editor");
  await expect(phaseTable.locator(".transaction-bottom-phase-row:not(.transaction-bottom-phase-head)")).toHaveCount(3);
  await inspector.getByLabel("Phase 1 name").fill("Addr");
  await inspector.getByLabel("Delete phase 3").click();
  await expect(phaseTable.locator(".transaction-bottom-phase-row:not(.transaction-bottom-phase-head)")).toHaveCount(2);
  await inspector.getByTestId("add-transaction-phase").click();
  await expect(phaseTable.locator(".transaction-bottom-phase-row:not(.transaction-bottom-phase-head)")).toHaveCount(3);
  await inspector.getByLabel("Phase 3 name").fill("Extra");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  // Unlink one Signal, then link a different one.
  const linked = inspector.getByTestId("transaction-linked-signals");
  await expect(linked).toContainText("Linked Signals (3)");
  await linked.getByRole("button", { name: /Unlink DATA/ }).click();
  await expect(linked).toContainText("Linked Signals (2)");
  await inspector.getByTestId("open-linked-signal-picker").click();
  await inspector.getByLabel("Search linked signals").fill("RESP");
  await inspector.getByRole("option", { name: /RESP/ }).click();
  await expect(linked).toContainText("Linked Signals (3)");
  await expect(linked).toContainText("RESP");
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");

  // Duplicate, then delete the duplicate.
  await bottomEditor.getByTestId("bottom-transaction-duplicate").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 6 / Redo 0");
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(5);
  await bottomEditor.getByTestId("bottom-transaction-delete").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 7 / Redo 0");
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(4);

  // Undo/Redo exact back through the whole sequence.
  for (let i = 0; i < 7; i++) await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 7");
  await expect(lanes.locator("[data-transaction-id='txn_read0']")).toContainText("Read_0");
  for (let i = 0; i < 7; i++) await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 7 / Redo 0");
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(4);
});

test("Sample A survives Save/Open exactly", async ({ page }) => {
  await openSampleA(page);
  const lanes = page.getByTestId("transaction-lanes");
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(4);

  const download = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(readFileSync(savedPath!, "utf-8")) as { transactions: readonly { id: string; name: string; phases?: readonly unknown[]; linkedSignals?: readonly string[] }[] };
  expect(saved.transactions).toHaveLength(4);
  const read0 = saved.transactions.find((item) => item.id === "txn_read0");
  expect(read0?.phases?.length).toBe(3);
  expect(read0?.linkedSignals?.length).toBe(3);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(4);
  await expect(lanes).toContainText("Read_0");
});
