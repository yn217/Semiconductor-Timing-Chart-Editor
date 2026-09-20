import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #755 measurement harness: longest main-thread task and total blocked time during one far jump.
test("far jump long-task measurement (100 signals x 10000 cycles, Combined)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(process.env.P755_CANVAS ? "/?canvas755" : "/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 10_000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p755.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  await page.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  const viewport = page.getByTestId("cycle-viewport");
  await page.evaluate(() => {
    const tasks: number[] = [];
    (window as unknown as { __tasks: number[] }).__tasks = tasks;
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) tasks.push(entry.duration); }).observe({ entryTypes: ["longtask"] });
  });
  const max = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
  const fs = await import('node:fs');
  await page.context().browser()!.startTracing(page, { path: 'test-results/p755-trace.json', categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  const batchesBefore = JSON.parse((await surface.getAttribute('data-session-counters'))!).waveBatchCount as number;
  const started = Date.now();
  await viewport.evaluate((el, left) => { el.scrollLeft = left; }, Math.floor(max / 2));
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  const settleMs = Date.now() - started;
  await page.context().browser()!.stopTracing();
  void fs;
  const tasks = await page.evaluate(() => (window as unknown as { __tasks: number[] }).__tasks);
  const longest = Math.max(0, ...tasks);
  const extra = await page.evaluate(() => ({ liveDomElements: document.querySelectorAll('*').length, canvases: document.querySelectorAll('canvas[data-wave-canvas]').length, waveSvgs: document.querySelectorAll("[data-role='wave-owner'] svg").length, jsHeapMB: Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6) }));
  console.log(JSON.stringify({ metric: "far-jump", settleMs, waveBatches: (JSON.parse((await surface.getAttribute('data-session-counters'))!).waveBatchCount as number) - batchesBefore, longestTaskMs: Math.round(longest), longTaskCount: tasks.length, blockedMs: Math.round(tasks.reduce((a, b) => a + b, 0)), ...extra }));
});
