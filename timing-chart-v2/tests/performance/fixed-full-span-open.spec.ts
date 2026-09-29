import { expect, test, type CDPSession } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("engineering fixed-work 100x500 Open renders 100 full-span owners", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_672, height: 3_700 });

  // Keep normal product windowing untouched. This stress-only route override
  // raises the renderer full-document work limit for this page response only.
  let sourceWindowOverrideCount = 0;
  await page.route("**/timeline-geometry-owner.ts*", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const limit = /FULL_DOCUMENT_WAVEFORM_SIGNAL_CYCLE_LIMIT\s*=\s*(?:32_768|32768)/g;
    const matches = source.match(limit) ?? [];
    if (matches.length !== 1) {
      await route.fulfill({ response });
      return;
    }
    sourceWindowOverrideCount += 1;
    await route.fulfill({ response, body: source.replace(limit, "FULL_DOCUMENT_WAVEFORM_SIGNAL_CYCLE_LIMIT = 1_000_000") });
  });
  await page.addInitScript(() => {
    (globalThis as typeof globalThis & { __fixedWorkLongTasks: number }).__fixedWorkLongTasks = 0;
    new PerformanceObserver((entries) => {
      (globalThis as typeof globalThis & { __fixedWorkLongTasks: number }).__fixedWorkLongTasks += entries.getEntries().length;
    }).observe({ type: "longtask", buffered: true });
  });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  expect(sourceWindowOverrideCount, "The stress-only renderer window override must match exactly one served module").toBe(1);
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-view-mode", "Cycle");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const browserBefore = await browserMetrics(cdp);
  const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 500 });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "engineering-fixed-100x500.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  const browserAfter = await browserMetrics(cdp);

  const waveWindows = await host.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.map((owner) => {
    const element = owner as HTMLElement;
    return { signalId: element.dataset.signalId ?? element.dataset.waveOwner, start: element.dataset.renderedSourceWindowStart, end: element.dataset.renderedSourceWindowEnd };
  }));
  const measurements = await host.evaluate((surface) => {
    const durations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
    const marks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
    const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
    const waveBatch = JSON.parse(surface.getAttribute("data-open-wave-batch-metrics") ?? "{}") as Record<string, number>;
    return {
      presentationReadyMs: durations["presentation-ready"],
      firstVisibleWavePaintedMs: durations["first-visible-wave-painted"],
      visibleWaveformsReadyMs: durations["visible-waveforms-ready"],
      idleMs: durations.idle,
      marks,
      mountedWaveOwners: counters.mountedWaveOwners,
      waveBatch,
    };
  });
  const browserDelta = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "PaintDuration"].map((name) => [name, ((browserAfter[name] ?? 0) - (browserBefore[name] ?? 0)) * 1_000]));
  const longTasks = await page.evaluate(() => (globalThis as typeof globalThis & { __fixedWorkLongTasks: number }).__fixedWorkLongTasks);

  expect(waveWindows).toHaveLength(100);
  expect(waveWindows.filter((window) => window.start === "0" && window.end === "500")).toHaveLength(100);
  expect(measurements.mountedWaveOwners).toBe(100);
  expect(measurements.waveBatch.renderCount).toBe(100);
  expect(measurements.waveBatch.staleProgressiveInstallPreventedCount).toBe(0);
  expect(measurements.waveBatch.artifactInstallsBeforePresentationReady).toBeLessThanOrEqual(1);
  expect(measurements.presentationReadyMs).toBeGreaterThan(0);
  expect(measurements.firstVisibleWavePaintedMs).toBeGreaterThan(0);
  expect(measurements.visibleWaveformsReadyMs).toBeGreaterThan(0);
  expect(measurements.idleMs).toBeGreaterThan(0);

  const evidence = {
    benchmark: "engineering fixed-work; not product default viewport behavior",
    fixture: { signals: 100, sourceCycles: 500 },
    rendererWindowOverride: { sourceModuleMatches: sourceWindowOverrideCount, productionConstantsChanged: false },
    renderedOwners: waveWindows,
    measurements,
    browserDelta,
    longTasks,
    trace: "off",
    userAgent: await page.evaluate(() => navigator.userAgent),
  };
  await testInfo.attach("fixed-work-100x500-open.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
  console.log(`[fixed-work-100x500] ${JSON.stringify({ ...measurements, browserDelta, longTasks, owners: waveWindows.length, fullSpanOwners: waveWindows.filter((window) => window.start === "0" && window.end === "500").length, trace: "off" })}`);
});

async function browserMetrics(cdp: CDPSession) {
  const result = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}
