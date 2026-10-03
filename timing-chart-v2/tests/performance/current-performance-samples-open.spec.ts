import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type CDPSession } from "@playwright/test";

const performanceFixtures = [
  { file: "perf_100x500_full_span.tcd.json", signals: 100, cycles: 500, transactions: 12, annotations: 10 },
  { file: "perf_1000x1000_virtualized.tcd.json", signals: 1_000, cycles: 1_000, transactions: 16, annotations: 12 },
  { file: "perf_100x100000_sparse_timeline.tcd.json", signals: 100, cycles: 100_000, transactions: 12, annotations: 10 },
] as const;

for (const fixture of performanceFixtures) test(`current performance workload ${fixture.file} opens through production File input`, async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await browserMetrics(cdp);
  const file = readFileSync(resolve(process.cwd(), `samples/performance/${fixture.file}`));
  const document = JSON.parse(file.toString("utf8")) as { document: { title: string }; timeline: { cycleCount: number }; signals: unknown[]; transactions: unknown[]; annotations: unknown[] };
  expect(document.signals).toHaveLength(fixture.signals);
  expect(document.timeline.cycleCount).toBe(fixture.cycles);
  expect(document.transactions).toHaveLength(fixture.transactions);
  expect(document.annotations).toHaveLength(fixture.annotations);

  const startedAt = await page.evaluate(() => performance.now());
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: fixture.file, mimeType: "application/json", buffer: file });
  await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title);
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  const after = await browserMetrics(cdp);
  const evidence = await host.evaluate((surface, openStart) => {
    const durations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
    const marks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
    const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
    const waveBatch = JSON.parse(surface.getAttribute("data-open-wave-batch-metrics") ?? "{}") as Record<string, number>;
    const actualStart = marks["open-command-start"] ?? openStart;
    const longTasks = performance.getEntriesByType("longtask").filter((entry) => entry.startTime >= actualStart && entry.startTime <= performance.now()).map((entry) => entry.duration);
    const owners = Array.from(surface.querySelectorAll<HTMLElement>("[data-role='wave-owner']"), (owner) => ({
      signalId: owner.dataset.signalId ?? owner.dataset.waveOwner,
      start: Number(owner.dataset.renderedSourceWindowStart),
      end: Number(owner.dataset.renderedSourceWindowEnd),
      state: owner.dataset.waveState,
    }));
    return { durations, marks, mountedWaveOwners: counters.mountedWaveOwners, waveBatch, longTasks: { count: longTasks.length, maxDurationMs: Math.max(0, ...longTasks) }, owners };
  }, startedAt);
  const browserDelta = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "PaintDuration"].map((name) => [name, ((after[name] ?? 0) - (before[name] ?? 0)) * 1_000]));
  expect(evidence.owners.length).toBeGreaterThan(0);
  expect(evidence.owners.every((owner) => Number.isFinite(owner.start) && Number.isFinite(owner.end) && owner.start >= 0 && owner.end <= fixture.cycles && owner.end > owner.start)).toBe(true);
  expect(evidence.durations["presentation-ready"]).toBeGreaterThan(0);
  expect(evidence.durations["visible-waveforms-ready"]).toBeGreaterThan(0);
  await testInfo.attach(`${fixture.file}-open.json`, { body: Buffer.from(JSON.stringify({ fixture: fixture.file, viewport: "1672x941", trace: "off", ...evidence, browserDelta }, null, 2)), contentType: "application/json" });
  console.log(`[current-performance-samples-open] ${JSON.stringify({ fixture: fixture.file, ...evidence, browserDelta, trace: "off" })}`);
});

async function browserMetrics(cdp: CDPSession) {
  const result = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}
