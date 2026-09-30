import { expect, test, type CDPSession } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startInCycleSample } from "../e2e/cycle-startup.js";

startInCycleSample(test);

const showcaseFixtures = [
  { id: 21, file: "21_large_feature_showcase.tcd.json", cycles: 128 },
  { id: 24, file: "24_protocol_transaction_showcase.tcd.json", cycles: 192 },
] as const;

for (const fixture of showcaseFixtures) test(`real-world #${fixture.id} showcase reaches visible-waveform readiness within the 1s budget`, async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await browserMetrics(cdp);
  const file = readFileSync(resolve(process.cwd(), `samples/showcase/${fixture.file}`));
  const document = JSON.parse(file.toString("utf8")) as { document?: { title?: string }; timeline?: { cycleCount?: number }; signals?: unknown[]; transactions?: unknown[]; annotations?: unknown[]; bookmarks?: unknown[] };
  const structure = { signals: document.signals?.length ?? 0, transactions: document.transactions?.length ?? 0, annotations: document.annotations?.length ?? 0, bookmarks: document.bookmarks?.length ?? 0 };
  const openStartedAt = await page.evaluate(() => performance.now());
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: fixture.file,
    mimeType: "application/json",
    buffer: file,
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 45_000 });
  await expect.poll(() => host.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.filter((owner) => (owner as HTMLElement).dataset.waveState === "ready").length), { timeout: 45_000 }).toBeGreaterThan(0);
  if (document.document?.title) await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title);
  const after = await browserMetrics(cdp);
  const evidence = await host.evaluate((surface, input: { readonly start: number; readonly structure: typeof structure }) => {
    const durations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
    const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as Record<string, unknown>;
    const waveBatch = JSON.parse(surface.getAttribute("data-open-wave-batch-metrics") ?? "{}") as Record<string, number>;
    const owners = Array.from(surface.querySelectorAll<HTMLElement>("[data-role='wave-owner']"), (owner) => ({
      signalId: owner.dataset.signalId ?? owner.dataset.waveOwner,
      start: owner.dataset.renderedSourceWindowStart,
      end: owner.dataset.renderedSourceWindowEnd,
      state: owner.dataset.waveState,
      imageBacked: owner.querySelector("image[data-wave-svg-image]") !== null,
    }));
    return {
      elapsedMs: performance.now() - input.start,
      durations,
      structure: input.structure,
      mountedWaveOwners: counters.mountedWaveOwners,
      projection: {
        calls: counters.projectionCalls,
        durationMs: counters.projectionDurationMs,
        fullReplaceCalls: counters.fullReplaceCalls,
        viewportOnlyCalls: counters.viewportOnlyCalls,
        changeCalls: counters.changeCalls,
      },
      renderer: {
        annotationResolvePasses: counters.annotationResolvePasses,
        resolvedAnnotations: counters.resolvedAnnotations,
        diagnosticPublishCount: counters.diagnosticPublishCount,
        diagnosticSerializationDurationMs: counters.diagnosticSerializationDurationMs,
      },
      timingDiagnostics: {
        validatorInvocations: counters.validatorInvocations,
        fullPasses: Number(surface.getAttribute("data-timing-diagnostics-full-passes") ?? 0),
        reuses: Number(surface.getAttribute("data-timing-diagnostics-reuses") ?? 0),
        lastDiagnosticsDurationMs: Number(surface.getAttribute("data-last-diagnostics-duration-ms") ?? 0),
      },
      minimap: {
        overviewBuilds: Number(document.querySelector<HTMLElement>("[data-testid='minimap']")?.dataset.overviewBuilds ?? 0),
        overviewSignalLookups: Number(document.querySelector<HTMLElement>("[data-testid='minimap']")?.dataset.overviewSignalLookups ?? 0),
        transactionOverviewBuilds: Number(document.querySelector<HTMLElement>("[data-testid='minimap']")?.dataset.transactionOverviewBuilds ?? 0),
      },
      waveBatch,
      owners,
    };
  }, { start: openStartedAt, structure });
  const browserDelta = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "PaintDuration"].map((name) => [name, ((after[name] ?? 0) - (before[name] ?? 0)) * 1_000]));

  expect(evidence.owners.length).toBeGreaterThan(0);
  expect(document.timeline?.cycleCount).toBe(fixture.cycles);
  expect(evidence.owners.every((owner) => Number.isFinite(Number(owner.start)) && Number.isFinite(Number(owner.end)) && Number(owner.start) >= 0 && Number(owner.end) <= fixture.cycles && Number(owner.end) > Number(owner.start))).toBe(true);
  if (fixture.id === 24) expect(evidence.owners.every((owner) => owner.start === "0" && owner.end === String(fixture.cycles))).toBe(true);
  expect(evidence.waveBatch.renderCount).toBeGreaterThan(0);
  expect(evidence.durations["visible-waveforms-ready"]).toBeGreaterThan(0);
  expect(evidence.durations["visible-waveforms-ready"]).toBeLessThan(1_000);
  await testInfo.attach(`showcase-${fixture.id}-open.json`, { body: Buffer.from(JSON.stringify({ fixture: fixture.file, viewport: "1672x941", trace: "off", ...evidence, browserDelta }, null, 2)), contentType: "application/json" });
  console.log(`[real-world-showcase-open] ${JSON.stringify({ fixture: fixture.file, ...evidence, browserDelta, trace: "off" })}`);
});

test("real-world #24 opens its full Transaction presentation through File > Open", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode button[aria-label='Transaction']").click();
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await browserMetrics(cdp);
  const beforeOpen = await host.evaluate((surface) => {
    const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
    return {
      projectionCalls: counters.projectionCalls ?? 0,
      projectionDurationMs: counters.projectionDurationMs ?? 0,
      fullReplaceCalls: counters.fullReplaceCalls ?? 0,
      transactionLaneBuilds: Number(document.querySelector<HTMLElement>("[data-testid='transaction-lanes']")?.dataset.laneIndexBuilds ?? 0),
    };
  });
  const fileName = "24_protocol_transaction_showcase.tcd.json";
  const file = readFileSync(resolve(process.cwd(), `samples/showcase/${fileName}`));
  const fixture = JSON.parse(file.toString("utf8")) as { timeline?: { cycleCount?: number }; signals?: unknown[]; transactions?: unknown[]; annotations?: unknown[]; bookmarks?: unknown[] };
  expect({ cycles: fixture.timeline?.cycleCount, signals: fixture.signals?.length, transactions: fixture.transactions?.length, annotations: fixture.annotations?.length, bookmarks: fixture.bookmarks?.length }).toEqual({ cycles: 192, signals: 32, transactions: 7, annotations: 5, bookmarks: 3 });
  const openStartedAt = await page.evaluate(() => performance.now());
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: fileName, mimeType: "application/json", buffer: file });

  const lanes = page.getByTestId("transaction-lanes");
  await expect(page.locator(".app-titlebar h1")).toHaveText("Protocol / Transaction Showcase");
  await expect.poll(() => lanes.locator("[data-transaction-id]").count(), { timeout: 45_000 }).toBe(7);
  const after = await browserMetrics(cdp);
  const evidence = await host.evaluate((surface, input: { readonly start: number; readonly beforeOpen: typeof beforeOpen }) => {
    const durations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
    const counters = JSON.parse(surface.getAttribute("data-session-counters") ?? "{}") as Record<string, unknown>;
    const waveBatch = JSON.parse(surface.getAttribute("data-open-wave-batch-metrics") ?? "{}") as Record<string, number>;
    const bars = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='transaction-lanes'] [data-transaction-id]"), (bar) => ({
      id: bar.dataset.transactionId,
      width: bar.getBoundingClientRect().width,
    }));
    return {
      elapsedUntilSevenBarsMs: performance.now() - input.start,
      mode: surface.closest<HTMLElement>(".cycle-panel")?.dataset.viewMode,
      durations,
      barCount: bars.length,
      bars,
      projectionDelta: {
        calls: Number(counters.projectionCalls ?? 0) - input.beforeOpen.projectionCalls,
        durationMs: Number(counters.projectionDurationMs ?? 0) - input.beforeOpen.projectionDurationMs,
        fullReplaceCalls: Number(counters.fullReplaceCalls ?? 0) - input.beforeOpen.fullReplaceCalls,
      },
      transactionLaneBuilds: Number(document.querySelector<HTMLElement>("[data-testid='transaction-lanes']")?.dataset.laneIndexBuilds ?? 0) - input.beforeOpen.transactionLaneBuilds,
      mountedWaveOwners: counters.mountedWaveOwners,
      waveBatch,
    };
  }, { start: openStartedAt, beforeOpen });
  const browserDelta = Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "PaintDuration"].map((name) => [name, ((after[name] ?? 0) - (before[name] ?? 0)) * 1_000]));

  expect(evidence.mode).toBe("Transaction");
  expect(evidence.barCount).toBe(7);
  expect(evidence.bars.every((bar) => Number.isFinite(bar.width) && bar.width > 0)).toBe(true);
  expect(evidence.durations["presentation-ready"]).toBeGreaterThan(0);
  expect(evidence.durations["presentation-ready"]).toBeLessThan(1_000);
  expect(evidence.durations["first-visible-wave-painted"]).toBeLessThan(1_000);
  expect(evidence.durations["visible-waveforms-ready"]).toBeLessThan(1_000);
  expect(evidence.projectionDelta.fullReplaceCalls).toBe(1);
  expect(evidence.transactionLaneBuilds).toBe(1);
  await testInfo.attach("showcase-24-transaction-open.json", { body: Buffer.from(JSON.stringify({ fixture: fileName, viewport: "1672x941", trace: "off", ...evidence, browserDelta }, null, 2)), contentType: "application/json" });
  console.log(`[real-world-showcase-open-transaction] ${JSON.stringify({ fixture: fileName, ...evidence, browserDelta, trace: "off" })}`);
});

async function browserMetrics(cdp: CDPSession) {
  const result = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}
