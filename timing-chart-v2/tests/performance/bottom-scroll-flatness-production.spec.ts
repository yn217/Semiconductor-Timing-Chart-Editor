import { expect, test, type Locator, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #856 closure evidence (PRODUCTION build): Bottom virtualized surfaces must keep per-step scroll cost approximately FLAT as the total
 * collection grows while the viewport is fixed. Every step jumps three viewports (so the whole mounted window is replaced each step,
 * independent of N); the median frame time at the large N must stay within a small factor of the small N.
 */
type Surface = { name: string; small: number; large: number; mode: "Cycle" | "Transaction"; document: (count: number) => object; open: (page: Page) => Promise<Locator>; countAttr: (count: number) => string };

const surfaces: Surface[] = [
  {
    name: "Event Table (transitions of one Signal)", small: 1_000, large: 20_000, mode: "Cycle",
    document: (count) => {
      const base = generatePerformanceDocument({ signalCount: 50, cycleCount: 1000, profile: "standard" });
      const target = base.signals.find((signal) => signal.type === "bus" || signal.type === "binary")!;
      return { ...base, timeline: { ...base.timeline, end: count + 10, cycleCount: count + 10 }, signals: base.signals.map((signal) => signal.id === target.id ? { ...signal, values: Array.from({ length: count }, (_, index) => ({ start: index, value: signal.type === "binary" ? index % 2 : `0x${(index % 4096).toString(16)}` })) } : signal), __target: target.id };
    },
    countAttr: () => "50",
    open: async (page) => {
      const target = await page.evaluate(() => (window as unknown as { __flatTarget: string }).__flatTarget);
      await page.locator(`[data-role='frozen-row'][data-row-id='${target}']`).first().click({ force: true });
      return page.locator(".event-table-scroll");
    },
  },
  {
    name: "Transaction table", small: 1_000, large: 8_000, mode: "Transaction",
    document: (count) => generatePerformanceDocument({ signalCount: count, cycleCount: 100, profile: "transaction-heavy" }),
    countAttr: (count) => String(count),
    open: async (page) => { await expect(page.getByText("All Transactions")).toBeVisible(); return page.locator(".transaction-list"); },
  },
  {
    name: "Annotation list", small: 1_000, large: 8_000, mode: "Cycle",
    document: (count) => generatePerformanceDocument({ signalCount: count / 2, cycleCount: 100, profile: "annotation-heavy" }),
    countAttr: (count) => String(count / 2),
    open: async (page) => { await page.getByRole("tab", { name: /^Annotation/ }).click(); return page.getByTestId("annotation-list"); },
  },
];

async function measure(page: Page, surface: Surface, count: number): Promise<{ p50: number; p95: number; longTasks: number; scrollHeight: number }> {
  await page.addInitScript((mode) => { try { window.localStorage.setItem("timing-chart-v2.view-mode", mode); } catch { /* best effort */ } }, surface.mode);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const { __target, ...document } = surface.document(count) as { __target?: string };
  if (__target) await page.evaluate((target) => { (window as unknown as { __flatTarget: string }).__flatTarget = target; }, __target);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "flat.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", surface.countAttr(count), { timeout: 180_000 });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  const scroller = await surface.open(page);
  await expect(scroller).toBeVisible({ timeout: 60_000 });
  return scroller.evaluate(async (element) => {
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) longTasks.push(entry.duration); });
    try { observer.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
    const total = element.scrollHeight - element.clientHeight;
    const stride = element.clientHeight * 3;
    const frames: number[] = [];
    let position = 0; let previous = performance.now();
    for (let step = 0; step < 60; step += 1) {
      position = (position + stride) % Math.max(1, total);
      element.scrollTop = position;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now(); frames.push(now - previous); previous = now;
    }
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
    return { p50: Math.round(pick(0.5) * 10) / 10, p95: Math.round(pick(0.95) * 10) / 10, longTasks: longTasks.length, scrollHeight: element.scrollHeight };
  });
}

for (const surface of surfaces) test(`production scroll cost stays flat as the collection grows: ${surface.name}`, async ({ browser }) => {
  test.setTimeout(420_000);
  const results: Record<number, Awaited<ReturnType<typeof measure>>> = {};
  for (const count of [surface.small, surface.large]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try { results[count] = await measure(page, surface, count); } finally { await context.close(); }
  }
  const small = results[surface.small]!; const large = results[surface.large]!;
  console.log(`[bottom-scroll-flatness-production] ${JSON.stringify({ surface: surface.name, small: { count: surface.small, ...small }, large: { count: surface.large, ...large }, p50Ratio: Math.round((large.p50 / small.p50) * 100) / 100 })}`);
  expect(large.scrollHeight, "the large collection has a real scroll extent").toBeGreaterThan(small.scrollHeight * 2);
  expect(large.p50, "median frame at the large N vs the small N (flat within 2x + 10 ms)").toBeLessThan(small.p50 * 2 + 10);
});
