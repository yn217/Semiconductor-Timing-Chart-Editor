import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #856 (Event Table): a top-to-bottom traversal of the Bottom Event Table of ONE Signal holding 20,000 transitions keeps the DOM bounded,
 * the scroll extent real, and the frame time loose-bounded. Numbers are logged as one JSON line for the Issue. Each of the 150 steps
 * advances ~133 rows against a ~29-row window, so every step replaces the whole mounted window (a page-jump worst case, not smooth scrolling).
 */
test("Bottom Event Table scroll over 20,000 transitions keeps its extent, bounded DOM and responsive frames", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 50, cycleCount: 1000, profile: "standard" });
  const target = base.signals.find((signal) => signal.type === "bus" || signal.type === "binary")!;
  const transitions = 20_000;
  const document = {
    ...base,
    timeline: { ...base.timeline, end: transitions + 10, cycleCount: transitions + 10 },
    signals: base.signals.map((signal) => signal.id === target.id ? { ...signal, values: Array.from({ length: transitions }, (_, index) => ({ start: index, value: signal.type === "binary" ? index % 2 : `0x${(index % 4096).toString(16)}` })) } : signal),
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b856e.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "50", { timeout: 180_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  await page.locator(`[data-role='frozen-row'][data-row-id='${target.id}']`).first().click({ force: true });
  const table = page.locator(".event-table-scroll");
  await expect(table).toBeVisible({ timeout: 60_000 });
  const originalFirstTransition = table.locator("form.event-row[data-event-start='0']");
  const recycledSlot = await originalFirstTransition.evaluateHandle((row) => row);

  const result = await table.evaluate(async (element) => {
    const rowsMounted = () => element.querySelectorAll("[role='row'], tr, [data-event-row]").length;
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) longTasks.push(entry.duration); });
    try { observer.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
    const frames: number[] = [];
    const total = element.scrollHeight - element.clientHeight;
    const steps = 150;
    let maxRows = rowsMounted();
    let previous = performance.now();
    for (let step = 1; step <= steps; step += 1) {
      element.scrollTop = Math.round((total * step) / steps);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now(); frames.push(now - previous); previous = now;
      maxRows = Math.max(maxRows, rowsMounted());
    }
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
    return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, maxRows, steps, p50: pick(0.5), p95: pick(0.95), max: sorted.at(-1)!, longTasks: longTasks.length, longTaskMax: Math.max(0, ...longTasks) };
  });
  console.log("E856E", JSON.stringify(result));
  const recycledStart = await recycledSlot.evaluate((row) => row.getAttribute("data-event-start"));
  expect(recycledStart, "the original visible row node should be reassigned to another semantic transition during scrolling").not.toBe("0");
  const rowForRecycledIdentity = table.locator(`form.event-row[data-event-start='${recycledStart}']`);
  await expect(rowForRecycledIdentity).toHaveCount(1);
  expect(await rowForRecycledIdentity.evaluate((row, original) => row === original, recycledSlot)).toBe(true);
  expect(result.scrollHeight, "the table really holds the large collection").toBeGreaterThan(result.clientHeight * 20);
  expect(result.maxRows, "DOM rows stay bounded by the virtual window").toBeLessThan(300);
  expect(result.p95, "p95 frame time of a whole-window-replacing scroll step (loose, machine independent)").toBeLessThan(500);
});
