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
