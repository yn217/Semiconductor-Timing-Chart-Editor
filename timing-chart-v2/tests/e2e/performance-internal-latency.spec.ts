import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

type LatencySummary = { samples: number[]; median: number; p95: number; max: number };
type LongTask = { startTime: number; duration: number };
type InteractionWindow = { startTime: number; endTime: number };
type LatencyEvidence = { interactions: Record<string, LatencySummary & { longTasks: LongTask[] }>; longTasks: { count: number; duration: number } };

test("measures GUI latency inside Chromium rather than through Playwright RPC time", async ({ page }, testInfo) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  await page.evaluate(() => {
    type SampleStore = Record<string, number[]>;
    type WindowStore = Record<string, InteractionWindow[]>;
    const win = window as typeof window & { __v2Latency?: SampleStore; __v2LatencyNext?: string; __v2InteractionWindows?: WindowStore; __v2LongTasks?: LongTask[]; __v2LongTaskObserver?: PerformanceObserver };
    const samples: SampleStore = {};
    const windows: WindowStore = {};
    const longTasks: LongTask[] = [];
    win.__v2Latency = samples;
    win.__v2InteractionWindows = windows;
    win.__v2LongTasks = longTasks;
    const record = (name: string) => {
      const start = performance.now();
      const interval = { startTime: start, endTime: Number.POSITIVE_INFINITY };
      (windows[name] ??= []).push(interval);
      requestAnimationFrame(() => {
        interval.endTime = performance.now();
        (samples[name] ??= []).push(interval.endTime - start);
      });
    };
    document.addEventListener("click", () => {
      const name = win.__v2LatencyNext;
      if (name) { delete win.__v2LatencyNext; record(name); }
    }, true);
    document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")?.addEventListener("scroll", () => {
      const name = win.__v2LatencyNext;
      if (name) { delete win.__v2LatencyNext; record(name); }
    }, { passive: true });
    if ("PerformanceObserver" in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        });
        observer.observe({ type: "longtask", buffered: true });
        win.__v2LongTaskObserver = observer;
      } catch { /* Long Task API is optional; interaction timing remains measurable. */ }
    }
  });

  const runMeasured = async (name: string, action: (trial: number) => Promise<void>) => {
    for (let trial = 0; trial < 5; trial += 1) {
      const before = await page.evaluate((key) => ((window as typeof window & { __v2Latency?: Record<string, number[]> }).__v2Latency?.[key] ?? []).length, name);
      await page.evaluate((key) => { (window as typeof window & { __v2LatencyNext?: string }).__v2LatencyNext = key; }, name);
      await action(trial);
      await expect.poll(async () => await page.evaluate((key) => ((window as typeof window & { __v2Latency?: Record<string, number[]> }).__v2Latency?.[key] ?? []).length, name)).toBeGreaterThan(before);
    }
  };

  await runMeasured("signal-selection", async (trial) => {
    const signalId = trial % 2 === 0 ? "sig_cycle_request" : "sig_cycle_ready";
    await host.locator(`[data-role='frozen-row'][data-row-id='${signalId}']`).click();
  });
  await runMeasured("ribbon-tab", async (trial) => {
    const tab = trial % 2 === 0 ? "View" : "Home";
    await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
  });
  await runMeasured("zoom", async () => {
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  });
  await runMeasured("panel-visibility", async () => {
    await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  });
  await runMeasured("scroll", async () => {
    await page.getByTestId("cycle-viewport").evaluate((element) => element.scrollBy({ left: 120, top: 20, behavior: "auto" }));
  });

  await page.evaluate(() => {
    const win = window as typeof window & { __v2LongTasks?: LongTask[]; __v2LongTaskObserver?: PerformanceObserver };
    for (const entry of win.__v2LongTaskObserver?.takeRecords() ?? []) win.__v2LongTasks?.push({ startTime: entry.startTime, duration: entry.duration });
  });
  const evidence = await page.evaluate((): LatencyEvidence => {
    const win = window as typeof window & { __v2Latency?: Record<string, number[]>; __v2InteractionWindows?: Record<string, InteractionWindow[]>; __v2LongTasks?: LongTask[] };
    const interactions: Record<string, LatencySummary & { longTasks: LongTask[] }> = {};
    const overlapping = new Map<string, LongTask>();
    for (const [name, raw] of Object.entries(win.__v2Latency ?? {})) {
      const samples = raw.filter(Number.isFinite).sort((a, b) => a - b);
      const at = (fraction: number) => samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * fraction))] ?? 0;
      const intervals = win.__v2InteractionWindows?.[name] ?? [];
      const longTasks = (win.__v2LongTasks ?? []).filter((task) => intervals.some((interval) => task.startTime < interval.endTime && task.startTime + task.duration > interval.startTime));
      for (const task of longTasks) overlapping.set(`${task.startTime}:${task.duration}`, task);
      interactions[name] = { samples, median: at(0.5), p95: at(0.95), max: samples.at(-1) ?? 0, longTasks };
    }
    const longTasks = [...overlapping.values()];
    return { interactions, longTasks: { count: longTasks.length, duration: longTasks.reduce((sum, task) => sum + task.duration, 0) } };
  });
  console.log(`[v2-internal-latency] ${JSON.stringify(evidence)}`);
  expect(Object.keys(evidence.interactions)).toEqual(expect.arrayContaining(["signal-selection", "ribbon-tab", "zoom", "panel-visibility", "scroll"]));
  for (const [name, summary] of Object.entries(evidence.interactions)) {
    expect(summary.samples.length, name).toBeGreaterThan(0);
    expect(Number.isFinite(summary.median), name).toBe(true);
    expect(summary.p95, name).toBeGreaterThanOrEqual(summary.median);
    expect(summary.max, name).toBeLessThan(50);
    expect(summary.longTasks, `${name} Long Tasks overlapping its input-to-frame window`).toEqual([]);
  }
  expect(evidence.longTasks.count, "measured ordinary interactions must not overlap a Long Task").toBe(0);
  await testInfo.attach("v2-internal-latency.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
});
