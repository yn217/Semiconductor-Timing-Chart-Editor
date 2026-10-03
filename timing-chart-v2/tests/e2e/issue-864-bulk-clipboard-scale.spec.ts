import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";
import { documentState, expectViewOnly } from "./view-only.js";

startInCycleMode(test);

/**
 * #864 browser acceptance (production route). The document limit is 10,000 Signals, so the benchmark is split into
 *  (a) the largest LEGAL same-document Paste (5k -> 10k; also 1k -> 2k): one History entry, bounded apply-to-idle / Long Tasks, exact one-step Undo;
 *  (b) the limit boundary (10k -> 20k attempted): Canonical / History / Dirty / count unchanged AND user-visible RESOURCE_LIMIT_EXCEEDED Problem;
 *  (c) real Cut semantics: Cut deletes immediately (signal.bulkDelete, one History entry); Paste re-inserts; dependents reject Cut via Problems.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;
const home = (page: Page) => page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();

async function timed(page: Page, action: () => Promise<void>): Promise<{ ms: number; longTasks: number; maxLongTask: number }> {
  await page.evaluate(() => {
    const host = window as unknown as { __lt?: { tasks: number[]; observer: PerformanceObserver } };
    host.__lt?.observer.disconnect();
    const tasks: number[] = [];
    const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) tasks.push(e.duration); });
    observer.observe({ entryTypes: ["longtask"] });
    host.__lt = { tasks, observer };
  });
  const start = Date.now();
  await action();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  const ms = Date.now() - start;
  const tasks = await page.evaluate(() => (window as unknown as { __lt: { tasks: number[] } }).__lt.tasks);
  return { ms, longTasks: tasks.length, maxLongTask: Math.round(Math.max(0, ...tasks)) };
}

async function openSignals(page: Page, count: number, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: count, cycleCount: 40, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `b864-${count}.tcd.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", String(count), { timeout: 240_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 240_000 });
  await home(page);
  const ribbon = page.getByTestId("ribbon");
  const rows = surface.locator("[data-role='frozen-row']:not([data-kind='comment'])");
  return {
    surface, ribbon, rows,
    signalCount: () => page.locator(".editor-shell").getAttribute("data-signal-count"),
    historyDepth: async () => Number(/History (\d+)/.exec((await page.getByTestId("history-status").textContent()) ?? "")?.[1] ?? "-1"),
    status: () => ribbon.getByTestId("clipboard-status").textContent(),
    selectAll: async () => { await rows.first().click(); await page.keyboard.press("Control+a"); await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 }); },
  };
}

const pct = (values: number[], p: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!; };

for (const [count, size, samples] of [[1_000, sizes[0], 1], [1_000, sizes[1], 5], [5_000, sizes[1], 5]] as const) {
  test(`Signals x${count}: legal Select All -> Copy -> Paste is one bounded History step with exact Undo (${samples} samples) at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(900_000);
    const ui = await openSignals(page, count, size);
    await ui.selectAll();
    await ui.ribbon.getByRole("button", { name: "Copy", exact: true }).click();
    const h0 = await ui.historyDepth();
    const runs: Array<{ ms: number; longTasks: number; maxLongTask: number }> = [];
    for (let sample = 0; sample < samples; sample += 1) {
      runs.push(await timed(page, () => ui.ribbon.getByRole("button", { name: "Paste", exact: true }).click()));
      await expect.poll(ui.signalCount, { timeout: 120_000, message: `Paste doubled the Signals (${String(await ui.status())})` }).toBe(String(count * 2));
      expect(await ui.historyDepth() - h0, "Paste is one History entry").toBe(1);
      await page.keyboard.press("Control+z");
      await expect.poll(ui.signalCount, { timeout: 120_000 }).toBe(String(count));
      expect(await ui.historyDepth(), "Undo removes the whole paste in one step").toBe(h0);
      await expect(ui.surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
    }
    const ms = runs.map((run) => run.ms);
    console.log("E864-PASTE", JSON.stringify({ count, size, samples, p50: pct(ms, 0.5), p95: samples >= 5 ? pct(ms, 0.95) : null, max: Math.max(...ms), longTasks: runs.map((run) => run.longTasks), maxLongTask: Math.max(...runs.map((run) => run.maxLongTask)), runs }));
    expect(Math.max(...ms), "Paste apply-to-idle").toBeLessThan(count >= 5_000 ? 60_000 : 15_000);
  });
}

async function attemptOverLimitPaste(page: Page) {
  const ui = await openSignals(page, 10_000, sizes[1]);
  await ui.selectAll();
  await ui.ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ui.ribbon.getByTestId("clipboard-status")).toHaveText(/10000 signals/);
  const before = await documentState(page);
  const statusBar = page.locator(".status-bar, [data-testid=status-bar]").first();
  const problems = async () => /Problems:\s*(\d+)/.exec((await statusBar.textContent()) ?? "")?.[1] ?? "?";
  const problemsBefore = await problems();
  await timed(page, () => ui.ribbon.getByRole("button", { name: "Paste", exact: true }).click());
  return { ui, before, problems, problemsBefore };
}

test("Signals x10000: Paste that would exceed the 10,000-Signal limit is rejected atomically at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  const { ui, before } = await attemptOverLimitPaste(page);
  // The limit rejection itself is correct product behaviour: nothing changes, nothing partial.
  await expectViewOnly(page, before, "a rejected over-limit Paste leaves Canonical / History / Dirty untouched");
  expect(await ui.signalCount(), "no partial paste").toBe("10000");
});

test("Signals x10000: over-limit Paste rejection gives user-visible RESOURCE_LIMIT_EXCEEDED Problem at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  const { ui, problems, problemsBefore } = await attemptOverLimitPaste(page);
  const status = (await ui.status()) ?? "";
  const problemsAfter = await problems();
  console.log("E864-LIMIT", JSON.stringify({ status, problemsBefore, problemsAfter }));
  expect(status, "the Clipboard status explains why Paste was rejected").toMatch(/Paste rejected:.*resource limit exceeded for signals/i);
  // The rejection is surfaced through Problems (RESOURCE_LIMIT_EXCEEDED on signal.bulkCreateAcrossGroups, 20,000 exceeds 10,000).
  expect(Number(problemsAfter), "the over-limit Paste adds a Problem").toBe(Number(problemsBefore) + 1);
  await page.getByRole("tab", { name: /^Problems/ }).or(page.locator("[role=tab]:has-text('Problems')")).first().click();
  await expect(page.getByTestId("problems-panel").or(page.locator(".problems-panel")).first()).toContainText("RESOURCE_LIMIT_EXCEEDED");
});

test("Signals x1000: Cut is an immediate atomic bulk delete (one History step, exact Undo); Cut of Signals with Annotation dependents is rejected via Problems at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  const ui = await openSignals(page, 1_000, sizes[1]);
  const statusBar = page.locator(".status-bar, [data-testid=status-bar]").first();
  const problems = async () => Number(/Problems:\s*(\d+)/.exec((await statusBar.textContent()) ?? "")?.[1] ?? "-1");
  // (1) Rows 2 (SIG_1) carries Annotation dependents in the generated document: Cut must be rejected atomically and say why.
  // A previous Copy must survive a rejected Cut (the clipboard is replaced only when the Cut really happens).
  await ui.rows.nth(20).click();
  await ui.ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  const before = await documentState(page);
  await ui.rows.nth(1).click();
  await ui.ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect.poll(problems, { message: "Cut with dependents adds a Problem" }).toBe(1);
  await expectViewOnly(page, before, "a rejected Cut leaves Canonical / History / Dirty untouched");
  await expect(ui.ribbon.getByTestId("clipboard-status"), "a rejected Cut says so").toContainText("Cut rejected");
  await ui.ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(ui.ribbon.getByTestId("clipboard-status"), "Paste after a rejected Cut still pastes the copied Signal").toHaveText("Pasted 1 signal");
  await expect.poll(ui.signalCount).toBe("1001");
  await page.keyboard.press("Control+z");
  await expect.poll(ui.signalCount).toBe("1000");
  // (2) Ten ordinary Signals without dependents (Signals 14..23; the 12 generated Annotations reference Signals 0..12), multi-selected with Ctrl+click (Shift+click does not extend a Frozen-row selection).
  await ui.rows.nth(14).click();
  for (let row = 15; row <= 23; row += 1) await ui.rows.nth(row).click({ modifiers: ["Control"] });
  const h0 = await ui.historyDepth();
  const cut = await timed(page, () => ui.ribbon.getByRole("button", { name: "Cut", exact: true }).click());
  const afterCut = { count: await ui.signalCount(), history: await ui.historyDepth(), status: await ui.status() };
  await ui.rows.nth(2).click();
  const paste = await timed(page, () => ui.ribbon.getByRole("button", { name: "Paste", exact: true }).click());
  const afterPaste = { count: await ui.signalCount(), history: await ui.historyDepth(), status: await ui.status() };
  console.log("E864-CUT", JSON.stringify({ cut, paste, h0, afterCut, afterPaste }));
  expect(afterCut.count, "Cut removes the selection immediately").toBe("990");
  expect(afterCut.history - h0, "Cut is one History entry").toBe(1);
  expect(afterPaste.count, "Paste re-inserts the cut Signals").toBe("1000");
  expect(afterPaste.history - afterCut.history, "Paste is one History entry").toBe(1);
  await page.keyboard.press("Control+z");
  await expect.poll(ui.signalCount).toBe("990");
  await page.keyboard.press("Control+z");
  await expect.poll(ui.signalCount, { message: "two Undo steps restore the original" }).toBe("1000");
  expect(await ui.historyDepth()).toBe(h0);
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// #864 remaining matrix: Transactions (limit 10,000), Annotation collection route (limit 20,000), and 100k-cycle timeline independence.
// Exactness is checked on the saved Canonical JSON (File > Save), counts on .editor-shell data attributes, History/Dirty/revision on the
// user-visible status. Timings are DIRECTIONAL (logged as E864-*), with generous regression bounds only.
// ---------------------------------------------------------------------------------------------------------------------------------------
type SavedTransaction = { id: string; name: string; groupId?: string; linkedSignals?: string[]; start: number; end: number };
type SavedAnnotation = { id: string; label?: string; start?: { signalId?: string }; end?: { signalId?: string } };
type Saved = { signals: Array<{ id: string }>; transactions: SavedTransaction[]; transactionGroups?: Array<{ id: string }>; annotations: SavedAnnotation[]; annotationGroups?: Array<{ id: string; annotationIds: string[] }> };

async function saveSnapshot(page: Page): Promise<Saved> {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await download).path();
  await home(page);
  return JSON.parse(readFileSync(path!, "utf8")) as Saved;
}

const editorState = async (page: Page) => ({
  revision: Number(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")),
  history: Number(/History (\d+)/.exec((await page.getByTestId("history-status").textContent()) ?? "")?.[1] ?? "-1"),
  dirty: (await page.getByTestId("dirty-status").textContent()) ?? "",
  transactions: Number(await page.locator(".editor-shell").getAttribute("data-transaction-count")),
});

function transactionDocument(transactionCount: number) {
  const base = generatePerformanceDocument({ signalCount: 1_000, cycleCount: 100, profile: "standard" });
  const transactionGroups = Array.from({ length: 4 }, (_, index) => ({ id: `txg_b864_${index}`, name: `TG${index}`, order: index }));
  const transactions = Array.from({ length: transactionCount }, (_, index) => ({ id: `txn_b864_${index}`, name: `T${index}`, start: index % 90, end: (index % 90) + 4, laneId: `lane_${index % 8}`, linkedSignals: [`sig_perf_${index % 1_000}`], groupId: `txg_b864_${index % 4}` }));
  return { ...base, transactions, transactionGroups };
}

async function openTransactions(page: Page, transactionCount: number) {
  await page.setViewportSize(sizes[1]);
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `t864-${transactionCount}.tcd.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(transactionDocument(transactionCount))) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", String(transactionCount), { timeout: 240_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 240_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  const ribbon = page.getByTestId("ribbon");
  const editor = page.getByTestId("bottom-editor");
  const selectAll = async () => {
    const row = editor.locator(".transaction-list-row > button[data-selected], .transaction-list-row > .transaction-list-row-editor[data-selected]").first();
    await row.click();
    await row.focus();
    await page.keyboard.press("Control+a");
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
    await home(page);
  };
  return { surface, ribbon, selectAll, status: () => ribbon.getByTestId("clipboard-status").textContent(), button: (name: string) => ribbon.getByRole("button", { name, exact: true }).first() };
}

const transactionCount = async (page: Page) => (await editorState(page)).transactions;

for (const operation of ["Paste", "Duplicate"] as const) {
  test(`Transactions x1000: Select All -> ${operation === "Paste" ? "Copy -> Paste" : "Duplicate"} is one History step with exact Undo/Redo, fresh IDs and preserved references at 1672x941`, async ({ page }) => {
    test.setTimeout(600_000);
    const ui = await openTransactions(page, 1_000);
    const base = await saveSnapshot(page);
    await ui.selectAll();
    if (operation === "Paste") {
      await ui.button("Copy").click();
      await expect(ui.ribbon.getByTestId("clipboard-status")).toHaveText("Copied 1000 transactions");
    }
    const s0 = await editorState(page);
    expect(s0.dirty).toBe("Clean");
    const run = await timed(page, () => ui.button(operation).click());
    await expect.poll(() => transactionCount(page), { timeout: 120_000, message: String(await ui.status()) }).toBe(2_000);
    const s1 = await editorState(page);
    expect(s1.history - s0.history, `${operation} is one History entry`).toBe(1);
    expect(s1.revision - s0.revision, `${operation} is one Canonical revision`).toBe(1);
    expect(s1.dirty).toBe("Modified");
    await expect(ui.ribbon.getByTestId("clipboard-status")).toHaveText(`${operation === "Paste" ? "Pasted" : "Duplicated"} 1000 transactions`);
    const after = await saveSnapshot(page);
    const baseIds = new Set(base.transactions.map((item) => item.id));
    const created = after.transactions.filter((item) => !baseIds.has(item.id));
    expect(created, "1000 fresh stable IDs").toHaveLength(1_000);
    expect(new Set(after.transactions.map((item) => item.id)).size, "IDs unique").toBe(2_000);
    const suffix = operation === "Paste" ? " Paste" : " Copy";
    const byName = new Map(base.transactions.map((item) => [item.name, item]));
    for (const item of created) {
      const source = byName.get(item.name.slice(0, -suffix.length));
      expect(source, `created ${item.id} maps to a source`).toBeTruthy();
      expect({ groupId: item.groupId, linkedSignals: item.linkedSignals, start: item.start, end: item.end }, "references / group membership preserved").toEqual({ groupId: source!.groupId, linkedSignals: source!.linkedSignals, start: source!.start, end: source!.end });
    }
    expect(after.transactionGroups).toEqual(base.transactionGroups);
    await page.keyboard.press("Control+z");
    await expect.poll(() => transactionCount(page), { timeout: 120_000 }).toBe(1_000);
    expect((await editorState(page)).history, "one Undo removes the whole batch").toBe(s0.history);
    expect((await saveSnapshot(page)).transactions, "Undo restores the Transactions exactly").toEqual(base.transactions);
    await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).first().click();
    await expect.poll(() => transactionCount(page), { timeout: 120_000 }).toBe(2_000);
    expect((await saveSnapshot(page)).transactions, "Redo re-applies the identical batch").toEqual(after.transactions);
    console.log("E864-TXN", JSON.stringify({ operation, run, s0, s1 }));
    expect(run.ms, `${operation} apply-to-idle (directional bound)`).toBeLessThan(30_000);
  });
}

test("Transactions x1000: Select All -> Cut (one History step) -> Paste (one History step); two Undo steps restore exactly at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  const ui = await openTransactions(page, 1_000);
  const base = await saveSnapshot(page);
  await ui.selectAll();
  const s0 = await editorState(page);
  const cut = await timed(page, () => ui.button("Cut").click());
  await expect.poll(() => transactionCount(page), { timeout: 120_000, message: String(await ui.status()) }).toBe(0);
  const s1 = await editorState(page);
  await expect(ui.ribbon.getByTestId("clipboard-status")).toHaveText("Cut 1000 transactions");
  expect([s1.history - s0.history, s1.revision - s0.revision, s1.dirty]).toEqual([1, 1, "Modified"]);
  const paste = await timed(page, () => ui.button("Paste").click());
  await expect.poll(() => transactionCount(page), { timeout: 120_000, message: String(await ui.status()) }).toBe(1_000);
  const s2 = await editorState(page);
  expect([s2.history - s1.history, s2.revision - s1.revision]).toEqual([1, 1]);
  const pasted = await saveSnapshot(page);
  // Transaction Cut = bulkDelete; Paste re-creates with fresh stable IDs and a " Paste" name suffix (Signal Cut restores IDs instead); content,
  // order, references and group membership are preserved.
  expect(pasted.transactions.map(({ id: _id, name, ...rest }) => ({ ...rest, name: name.replace(/ Paste$/, "") }))).toEqual(base.transactions.map(({ id: _id, ...rest }) => rest));
  await page.keyboard.press("Control+z");
  await expect.poll(() => transactionCount(page), { timeout: 120_000 }).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(() => transactionCount(page), { timeout: 120_000 }).toBe(1_000);
  expect((await editorState(page)).history).toBe(s0.history);
  expect((await saveSnapshot(page)).transactions, "two Undo steps restore the original exactly").toEqual(base.transactions);
  console.log("E864-TXN-CUT", JSON.stringify({ cut, paste }));
});

test("Transactions x5000: largest legal Paste (5,000 -> 10,000) is one History step; a further Paste over the 10,000 limit is rejected atomically with a RESOURCE_LIMIT_EXCEEDED Problem at 1672x941", async ({ page }) => {
  test.setTimeout(900_000);
  const ui = await openTransactions(page, 5_000);
  await ui.selectAll();
  await ui.button("Copy").click();
  await expect(ui.ribbon.getByTestId("clipboard-status")).toHaveText("Copied 5000 transactions");
  const s0 = await editorState(page);
  const legal = await timed(page, () => ui.button("Paste").click());
  await expect.poll(() => transactionCount(page), { timeout: 180_000, message: String(await ui.status()) }).toBe(10_000);
  const s1 = await editorState(page);
  expect([s1.history - s0.history, s1.revision - s0.revision, s1.dirty]).toEqual([1, 1, "Modified"]);
  const problems = async () => Number(/Problems:\s*(\d+)/.exec((await page.getByTestId("problems-status").textContent()) ?? "")?.[1] ?? "-1");
  const problemsBefore = await problems();
  const before = await documentState(page);
  const rejected = await timed(page, () => ui.button("Paste").click());
  await expectViewOnly(page, before, "a rejected over-limit Transaction Paste leaves Canonical / History / Dirty untouched");
  expect(await transactionCount(page), "no partial paste").toBe(10_000);
  await expect.poll(problems, { message: "the over-limit Paste adds a Problem" }).toBe(problemsBefore + 1);
  await expect(ui.ribbon.getByTestId("clipboard-status")).toHaveText(/Paste rejected:.*resource limit exceeded for transactions/i);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: /Problems/ }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("RESOURCE_LIMIT_EXCEEDED");
  await page.keyboard.press("Control+z");
  await expect.poll(() => transactionCount(page), { timeout: 180_000 }).toBe(5_000);
  console.log("E864-TXN-LIMIT", JSON.stringify({ legal, rejected, status: await ui.status() }));
  expect(legal.ms, "5k Transaction Paste apply-to-idle (directional bound)").toBeLessThan(60_000);
});

// Annotations: the clipboard carries ALL selected Annotations (multi-entity Copy/Cut/Paste/Duplicate, owner decision on #864; covered at the
// end of this file as E864-ANN-MULTI); the Annotation collection Import (annotation.replaceCollection, file IDs kept) is the other bulk route.
function annotationDocument() {
  const base = generatePerformanceDocument({ signalCount: 1_000, cycleCount: 100, profile: "annotation-heavy" }); // 2,000 measurement Annotations
  const annotationGroups = [
    { id: "ag_b864_even", name: "Even", annotationIds: base.annotations.filter((_, index) => index % 2 === 0 && index < 400).map((item) => item.id) },
    { id: "ag_b864_tail", name: "Tail", annotationIds: base.annotations.slice(1_500, 1_600).map((item) => item.id) },
  ];
  return { ...base, annotations: base.annotations.slice(0, 1_000), annotationGroups: annotationGroups.map((group) => ({ ...group, annotationIds: group.annotationIds.filter((id) => Number(id.split("_").at(-1)) < 1_000) })), extra: base.annotations.slice(1_000) };
}

async function openAnnotations(page: Page, size: { width: number; height: number } = sizes[1], override?: Record<string, unknown>) {
  const { extra, ...generated } = annotationDocument();
  const document = { ...generated, ...override };
  await page.setViewportSize(size);
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "a864.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("annotation-count-status")).toHaveText(`Annotations: ${(document.annotations as unknown[]).length}`, { timeout: 240_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 240_000 });
  await home(page);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const importFile = (name: string, annotations: unknown) => page.getByLabel("Import annotations").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(annotations)) });
  return { surface, extra, importFile, status: page.getByTestId("annotation-collection-status") };
}

test("Annotations x1000 -> x2000: collection Import preserves references, IDs and group membership as one History step with exact Undo/Redo at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  const ui = await openAnnotations(page);
  const base = await saveSnapshot(page);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const imported = [...base.annotations, ...ui.extra];
  const s0 = await editorState(page);
  const run = await timed(page, () => ui.importFile("annotations-2000.json", imported));
  await expect(ui.status).toHaveText("Imported 2000 annotations", { timeout: 120_000 });
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 2000");
  const s1 = await editorState(page);
  expect([s1.history - s0.history, s1.revision - s0.revision, s1.dirty], "one History entry, one revision, Dirty").toEqual([1, 1, "Modified"]);
  const after = await saveSnapshot(page);
  expect(after.annotations, "references and stable IDs exactly as imported").toEqual(JSON.parse(JSON.stringify(imported)));
  expect(after.annotationGroups, "group membership of kept Annotations is unchanged").toEqual(base.annotationGroups);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1000", { timeout: 120_000 });
  expect((await editorState(page)).history).toBe(s0.history);
  const undone = await saveSnapshot(page);
  expect([undone.annotations, undone.annotationGroups], "one Undo restores Annotations and groups exactly").toEqual([base.annotations, base.annotationGroups]);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 2000", { timeout: 120_000 });
  expect((await saveSnapshot(page)).annotations, "Redo is exact").toEqual(after.annotations);
  console.log("E864-ANN-IMPORT", JSON.stringify({ run, s0, s1 }));
  expect(run.ms, "2k Annotation import apply-to-idle (directional bound)").toBeLessThan(30_000);

  // Removing grouped members through the same route prunes them from their groups atomically, and Undo restores the membership exactly.
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const s2 = await editorState(page);
  await ui.importFile("annotations-odd.json", after.annotations.filter((_, index) => index % 2 === 1));
  await expect(ui.status).toHaveText("Imported 1000 annotations", { timeout: 120_000 });
  expect((await editorState(page)).history - s2.history).toBe(1);
  const pruned = await saveSnapshot(page);
  expect(pruned.annotationGroups?.find((group) => group.id === "ag_b864_even")?.annotationIds, "removed members are pruned from the group").toEqual([]);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 2000", { timeout: 120_000 });
  expect((await saveSnapshot(page)).annotationGroups, "Undo restores group membership").toEqual(base.annotationGroups);
});

test("Annotations x1000: an Import whose LAST item references a missing Signal is rejected atomically (no partial import) at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  const ui = await openAnnotations(page);
  const base = await saveSnapshot(page);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const broken = [...base.annotations, ...ui.extra.slice(0, 999), { ...ui.extra[999]!, start: { ...ui.extra[999]!.start, signalId: "sig_missing_b864" } }];
  const before = await documentState(page);
  await ui.importFile("annotations-broken.json", broken);
  await expect(ui.status).not.toHaveText("", { timeout: 120_000 });
  const status = (await ui.status.textContent()) ?? "";
  console.log("E864-ANN-REJECT", JSON.stringify({ status }));
  expect(status, "the rejection names the reason").toMatch(/sig_missing_b864|signal|reference/i);
  await expectViewOnly(page, before, "a rejected Annotation import leaves Canonical / History / Dirty untouched");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1000");
});

test("Annotations x1000: single Annotation Copy -> Paste regenerates the stable ID, keeps references, one History step, exact Undo at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  await openAnnotations(page);
  const base = await saveSnapshot(page);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  await page.getByTestId("annotation-list").locator("[data-annotation-list-id]").first().click();
  await home(page);
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Copied .* annotation/);
  const s0 = await editorState(page);
  const run = await timed(page, () => ribbon.getByRole("button", { name: "Paste", exact: true }).click());
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1001");
  const s1 = await editorState(page);
  expect([s1.history - s0.history, s1.revision - s0.revision, s1.dirty]).toEqual([1, 1, "Modified"]);
  const after = await saveSnapshot(page);
  const baseIds = new Set(base.annotations.map((item) => item.id));
  const created = after.annotations.filter((item) => !baseIds.has(item.id));
  expect(created).toHaveLength(1);
  const source = base.annotations.find((item) => item.label === created[0]!.label)!;
  expect({ ...created[0], id: source.id }, "content and Signal references preserved; only the ID is new").toEqual(source);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 1000");
  expect((await saveSnapshot(page)).annotations).toEqual(base.annotations);
  console.log("E864-ANN-PASTE", JSON.stringify({ run }));
});

// 100k-cycle timeline: the same 100-Signal clipboard batch must not get more expensive because the timeline is 100x longer.
function longTimelineDocument(cycles: number) {
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 1_000, profile: "standard", transitionCount: 8 });
  const scale = cycles / 1_000;
  const signals = base.signals.map((signal) => "values" in signal ? { ...signal, values: signal.values.map((value) => ({ ...value, start: Math.floor(value.start * scale) })) } : signal);
  return { ...base, signals, timeline: { ...base.timeline, end: cycles, cycleCount: cycles } };
}

test("Signals x100 on 1k vs 100k cycles: Select All -> Copy -> Paste cost does not scale with timeline length (directional) at 1672x941", async ({ page }) => {
  test.setTimeout(900_000);
  const results: Record<string, { ms: number; longTasks: number; maxLongTask: number }[]> = {};
  for (const cycles of [1_000, 100_000]) {
    await page.setViewportSize(sizes[1]);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `c864-${cycles}.tcd.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(longTimelineDocument(cycles))) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "100", { timeout: 240_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 240_000 });
    await home(page);
    const ribbon = page.getByTestId("ribbon");
    await ribbon.getByRole("button", { name: "Select All Signals", exact: true }).click();
    await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied 100 signals");
    results[cycles] = [];
    for (let sample = 0; sample < 3; sample += 1) {
      const s0 = await editorState(page);
      results[cycles]!.push(await timed(page, () => ribbon.getByRole("button", { name: "Paste", exact: true }).click()));
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "200", { timeout: 120_000 });
      const s1 = await editorState(page);
      expect([s1.history - s0.history, s1.revision - s0.revision], `${cycles} cycles: one History entry / revision`).toEqual([1, 1]);
      await page.keyboard.press("Control+z");
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "100", { timeout: 120_000 });
      expect((await editorState(page)).history).toBe(s0.history);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
    }
  }
  const median = (runs: { ms: number }[]) => pct(runs.map((run) => run.ms), 0.5);
  console.log("E864-CYCLES", JSON.stringify({ results, p50_1k: median(results[1_000]!), p50_100k: median(results[100_000]!) }));
  // Directional guard only (shared machine): a 100x longer timeline must not make the same batch ~proportionally slower.
  expect(median(results[100_000]!), "100k-cycle Paste p50 vs 1k-cycle p50").toBeLessThan(Math.max(3_000, median(results[1_000]!) * 5));
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// #864 multi-Annotation clipboard (E864-ANN-MULTI): Select All in Annotation context -> Copy/Cut/Duplicate/Paste of the whole selection as ONE
// annotation.bulkCreate / annotation.bulkDelete History entry. Fresh stable IDs, Signal references unchanged, a source group with >= 2 copied
// members is recreated as a NEW group (same name) over the copies, exact Undo/Redo on the saved Canonical JSON. Timings are directional.
// ---------------------------------------------------------------------------------------------------------------------------------------
const annotationCount = async (page: Page) => Number(/Annotations: (\d+)/.exec((await page.getByTestId("annotation-count-status").textContent()) ?? "")?.[1] ?? "-1");
async function selectAllAnnotations(page: Page) {
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const row = page.getByTestId("annotation-list").locator("[data-annotation-list-id]").first();
  await row.click();
  await row.focus();
  await page.keyboard.press("Control+a");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  await home(page);
}
const strip = <T extends { id: string }>(items: readonly T[]) => items.map(({ id: _id, ...rest }) => rest);
/** `created` are the pasted copies in source order; checks content/references and the mirrored new group (no dangling members). */
function expectMirroredCopies(base: Saved, after: Saved, created: readonly SavedAnnotation[], label: string) {
  expect(created, `${label}: 1000 copies`).toHaveLength(1_000);
  expect(new Set(after.annotations.map((item) => item.id)).size, `${label}: IDs unique`).toBe(after.annotations.length);
  expect(created.some((item) => base.annotations.some((source) => source.id === item.id)), `${label}: fresh stable IDs`).toBe(false);
  expect(strip(created), `${label}: content and Signal references preserved in order`).toEqual(strip(base.annotations));
  const newIdByOld = new Map(base.annotations.map((item, index) => [item.id, created[index]!.id]));
  const sourceEven = base.annotationGroups!.find((group) => group.id === "ag_b864_even")!;
  const newGroups = after.annotationGroups!.filter((group) => !base.annotationGroups!.some((item) => item.id === group.id));
  expect(newGroups.map(({ id: _id, ...rest }) => rest), `${label}: the copied group is recreated over the copies`).toEqual([{ name: "Even", annotationIds: sourceEven.annotationIds.map((id) => newIdByOld.get(id)) }]);
}
const newAnnotations = (base: Saved, after: Saved) => { const ids = new Set(base.annotations.map((item) => item.id)); return after.annotations.filter((item) => !ids.has(item.id)); };

for (const size of sizes) {
  test(`Annotations x1000: Select All -> Copy -> Paste = 2000 in one History step; fresh IDs, references and group membership; exact Undo/Redo (E864-ANN-MULTI) at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(600_000);
    await openAnnotations(page, size);
    const base = await saveSnapshot(page);
    await selectAllAnnotations(page);
    const ribbon = page.getByTestId("ribbon");
    await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied 1000 annotations");
    const s0 = await editorState(page);
    const run = await timed(page, () => ribbon.getByRole("button", { name: "Paste", exact: true }).click());
    await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(2_000);
    await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Pasted 1000 annotations");
    const s1 = await editorState(page);
    expect([s1.history - s0.history, s1.revision - s0.revision, s1.dirty], "one History entry, one revision, Dirty").toEqual([1, 1, "Modified"]);
    const after = await saveSnapshot(page);
    expectMirroredCopies(base, after, newAnnotations(base, after), "Paste");
    await page.keyboard.press("Control+z");
    await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(1_000);
    expect((await editorState(page)).history).toBe(s0.history);
    const undone = await saveSnapshot(page);
    expect([undone.annotations, undone.annotationGroups], "one Undo restores exactly").toEqual([base.annotations, base.annotationGroups]);
    await ribbon.getByRole("button", { name: "Redo", exact: true }).first().click();
    await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(2_000);
    const redone = await saveSnapshot(page);
    expect([redone.annotations, redone.annotationGroups], "Redo is exact").toEqual([after.annotations, after.annotationGroups]);
    console.log("E864-ANN-MULTI", JSON.stringify({ case: "copy-paste", size, run, s0, s1 }));
    expect(run.ms, "1k Annotation Paste apply-to-idle (directional bound)").toBeLessThan(30_000);
  });
}

test("Annotations x1000: Select All -> Cut (one bulk delete) -> Paste (one bulk create); Duplicate; exact Undo (E864-ANN-MULTI) at 1672x941", async ({ page }) => {
  test.setTimeout(600_000);
  await openAnnotations(page);
  const base = await saveSnapshot(page);
  const ribbon = page.getByTestId("ribbon");
  await selectAllAnnotations(page);
  const s0 = await editorState(page);
  const cut = await timed(page, () => ribbon.getByRole("button", { name: "Cut", exact: true }).click());
  await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(0);
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Cut 1000 annotations");
  const s1 = await editorState(page);
  expect([s1.history - s0.history, s1.revision - s0.revision], "Cut is one History entry").toEqual([1, 1]);
  const paste = await timed(page, () => ribbon.getByRole("button", { name: "Paste", exact: true }).click());
  await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(1_000);
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Pasted 1000 annotations");
  expect((await editorState(page)).history - s1.history, "Paste is one History entry").toBe(1);
  const pasted = await saveSnapshot(page);
  // Cut prunes the members from the source group (kept, empty, exactly as single Annotation delete does); Paste mirrors it in a new group.
  expect(pasted.annotationGroups!.find((group) => group.id === "ag_b864_even")!.annotationIds).toEqual([]);
  expectMirroredCopies(base, pasted, pasted.annotations, "Cut -> Paste");
  await page.keyboard.press("Control+z");
  await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(1_000);
  expect((await editorState(page)).history).toBe(s0.history);
  const restored = await saveSnapshot(page);
  expect([restored.annotations, restored.annotationGroups], "two Undo steps restore exactly").toEqual([base.annotations, base.annotationGroups]);
  await selectAllAnnotations(page);
  const s2 = await editorState(page);
  const duplicate = await timed(page, () => ribbon.getByRole("button", { name: "Duplicate", exact: true }).first().click());
  await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(2_000);
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Duplicated 1000 annotations");
  expect((await editorState(page)).history - s2.history, "Duplicate is one History entry").toBe(1);
  const duplicated = await saveSnapshot(page);
  expectMirroredCopies(base, duplicated, newAnnotations(base, duplicated), "Duplicate");
  await page.keyboard.press("Control+z");
  await expect.poll(() => annotationCount(page), { timeout: 120_000 }).toBe(1_000);
  console.log("E864-ANN-MULTI", JSON.stringify({ case: "cut-paste-duplicate", cut, paste, duplicate }));
});

test("Annotations x10000: largest legal Paste (10,000 -> 20,000) is one History step; a further Paste over the 20,000 limit is rejected atomically with a RESOURCE_LIMIT_EXCEEDED Problem (E864-ANN-MULTI) at 1672x941", async ({ page }) => {
  test.setTimeout(900_000);
  const template = annotationDocument();
  const pool = [...template.annotations, ...template.extra];
  const annotations = Array.from({ length: 10_000 }, (_, index) => ({ ...pool[index % pool.length]!, id: `ann_b864_limit_${index}`, label: `L${index}` }));
  await openAnnotations(page, sizes[1], { annotations, annotationGroups: [] });
  const ribbon = page.getByTestId("ribbon");
  await selectAllAnnotations(page);
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied 10000 annotations");
  const s0 = await editorState(page);
  const legal = await timed(page, () => ribbon.getByRole("button", { name: "Paste", exact: true }).click());
  await expect.poll(() => annotationCount(page), { timeout: 180_000 }).toBe(20_000);
  const s1 = await editorState(page);
  expect([s1.history - s0.history, s1.revision - s0.revision], "largest legal Paste is one History entry").toEqual([1, 1]);
  const problems = async () => Number(/Problems:\s*(\d+)/.exec((await page.getByTestId("problems-status").textContent()) ?? "")?.[1] ?? "-1");
  const problemsBefore = await problems();
  const before = await documentState(page);
  const rejected = await timed(page, () => ribbon.getByRole("button", { name: "Paste", exact: true }).click());
  await expectViewOnly(page, before, "a rejected over-limit Annotation Paste leaves Canonical / History / Dirty untouched");
  expect(await annotationCount(page), "no partial paste").toBe(20_000);
  await expect.poll(problems, { message: "the over-limit Paste adds a Problem" }).toBe(problemsBefore + 1);
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Paste rejected:.*resource limit exceeded for annotations/i);
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: /Problems/ }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("RESOURCE_LIMIT_EXCEEDED");
  await page.keyboard.press("Control+z");
  await expect.poll(() => annotationCount(page), { timeout: 180_000 }).toBe(10_000);
  console.log("E864-ANN-MULTI", JSON.stringify({ case: "limit", legal, rejected, status: await ribbon.getByTestId("clipboard-status").textContent() }));
  expect(legal.ms, "10k Annotation Paste apply-to-idle (directional bound)").toBeLessThan(90_000);
});
