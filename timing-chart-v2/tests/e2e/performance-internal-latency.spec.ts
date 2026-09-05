import { expect, test } from "@playwright/test";

type LatencySummary = { samples: number[]; median: number; p95: number; max: number };
type LatencyEvidence = { interactions: Record<string, LatencySummary>; longTasks: { count: number; duration: number } };

test("measures GUI latency inside Chromium rather than through Playwright RPC time", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  await page.evaluate(() => {
    type SampleStore = Record<string, number[]>;
    const win = window as typeof window & { __v2Latency?: SampleStore; __v2LatencyNext?: string; __v2LongTasks?: number[] };
    const samples: SampleStore = {};
    const longTasks: number[] = [];
    win.__v2Latency = samples;
    win.__v2LongTasks = longTasks;
    const record = (name: string) => {
      const start = performance.now();
      requestAnimationFrame(() => { (samples[name] ??= []).push(performance.now() - start); });
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
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true });
      } catch { /* Long Task API is optional; interaction timing remains measurable. */ }
    }
  });

  const runMeasured = async (name: string, action: () => Promise<void>) => {
    const before = await page.evaluate((key) => ((window as typeof window & { __v2Latency?: Record<string, number[]> }).__v2Latency?.[key] ?? []).length, name);
    await page.evaluate((key) => { (window as typeof window & { __v2LatencyNext?: string }).__v2LatencyNext = key; }, name);
    await action();
    await expect.poll(async () => await page.evaluate((key) => ((window as typeof window & { __v2Latency?: Record<string, number[]> }).__v2Latency?.[key] ?? []).length, name)).toBeGreaterThan(before);
  };

  await runMeasured("signal-selection", async () => {
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  });
  await runMeasured("ribbon-tab", async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
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

  const evidence = await page.evaluate((): LatencyEvidence => {
    const win = window as typeof window & { __v2Latency?: Record<string, number[]>; __v2LongTasks?: number[] };
    const interactions: Record<string, LatencySummary> = {};
    for (const [name, raw] of Object.entries(win.__v2Latency ?? {})) {
      const samples = raw.filter(Number.isFinite).sort((a, b) => a - b);
      const at = (fraction: number) => samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * fraction))] ?? 0;
      interactions[name] = { samples, median: at(0.5), p95: at(0.95), max: samples.at(-1) ?? 0 };
    }
    const durations = (win.__v2LongTasks ?? []).filter(Number.isFinite);
    return { interactions, longTasks: { count: durations.length, duration: durations.reduce((sum, value) => sum + value, 0) } };
  });
  console.log(`[v2-internal-latency] ${JSON.stringify(evidence)}`);
  expect(Object.keys(evidence.interactions)).toEqual(expect.arrayContaining(["signal-selection", "ribbon-tab", "zoom", "panel-visibility", "scroll"]));
  for (const [name, summary] of Object.entries(evidence.interactions)) {
    expect(summary.samples.length, name).toBeGreaterThan(0);
    expect(Number.isFinite(summary.median), name).toBe(true);
    expect(summary.p95, name).toBeGreaterThanOrEqual(summary.median);
    expect(summary.max, name).toBeLessThan(50);
  }
  expect(evidence.longTasks.count).toBeGreaterThanOrEqual(0);
});
