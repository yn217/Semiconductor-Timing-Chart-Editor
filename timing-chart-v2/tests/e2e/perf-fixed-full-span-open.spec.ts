import { appendFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

/**
 * Engineering stress benchmark (NOT the product SLO): fixed 100 Signals x 500 cycles, all 100 owners rendered over the full
 * 0..500 source span, production File > Open path.
 *
 * Product behavior differs on purpose: 500 x 100 = 50 000 exceeds FULL_DOCUMENT_WAVEFORM_SIGNAL_CYCLE_LIMIT (32 768), so the
 * product renders a bounded 0..128 window. This harness forces the full span by rewriting that single constant in the module
 * response served to the page (page.route) -- no production code or constant is modified, and the override cannot leak into
 * a normal run. Every run asserts the fixed condition (100 renders, span 0-500), so a drifting condition fails loudly instead
 * of producing an incomparable number.
 *
 * Run with the trace off (Playwright's default `retain-on-failure` records continuously and inflates Open by ~1 s):
 *   npx playwright test tests/e2e/perf-fixed-full-span-open.spec.ts --workers=1 --trace off
 * Set PERF_OUT=<file> to append one JSON line per run; PERF_RUNS=<n> for the run count (default 5).
 */
const RUNS = Number(process.env.PERF_RUNS ?? 5);
// Vite serves numeric separators normalized (32_768 -> 32768); accept both spellings.
const LIMIT = /(export const FULL_DOCUMENT_WAVEFORM_SIGNAL_CYCLE_LIMIT\s*=\s*)32_?768/;

for (let run = 1; run <= RUNS; run += 1) {
  test(`fixed 100x500 full-span Open, cold run ${run}/${RUNS}`, async ({ page }) => {
    test.setTimeout(180_000);
    let overridden = false;
    await page.route(/\/timeline-geometry-owner\.ts(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      overridden = LIMIT.test(body);
      await route.fulfill({ response, body: body.replace(LIMIT, (_match, prefix: string) => `${prefix}1_000_000`) });
    });
    // 100 rows x 34 px pitch + overscan must fit so that all 100 owners are viewport-mounted.
    await page.setViewportSize({ width: 1672, height: 3700 });
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    expect(overridden, "the full-span override must have matched the served module (constant renamed/moved?)").toBe(true);

    const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 500 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const metricsOf = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) as Record<string, number>;
    const before = await metricsOf();
    const startedAt = Date.now();
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "perf_100x500.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    // In-page readiness poll: keeps Playwright's injected-script DOM traversal out of the measured window.
    await page.evaluate((title) => new Promise<void>((resolve) => {
      const tick = () => {
        const heading = window.document.querySelector(".app-titlebar h1");
        const host = window.document.querySelector<HTMLElement>("[data-testid='cycle-surface']");
        if (heading?.textContent === title && host?.dataset.editorIdle === "true") resolve(); else setTimeout(tick, 20);
      };
      tick();
    }), document.document.title);
    const openMs = Date.now() - startedAt;
    const after = await metricsOf();

    const host = page.getByTestId("cycle-surface");
    const waveBatch = JSON.parse((await host.getAttribute("data-open-wave-batch-metrics")) ?? "{}") as Record<string, number>;
    const phases = JSON.parse((await host.getAttribute("data-open-phase-marks")) ?? "{}") as Record<string, number>;
    const durations = JSON.parse((await host.getAttribute("data-open-phase-durations")) ?? "{}") as Record<string, number>;
    const renderedOwners = await page.locator("[data-wave-owner][data-wave-state='ready']").evaluateAll((elements) => elements.map((element) => {
      const owner = element as HTMLElement;
      return {
        signalId: owner.dataset.waveOwner,
        start: owner.dataset.renderedSourceWindowStart,
        end: owner.dataset.renderedSourceWindowEnd,
      };
    }));

    // Fixed-condition guard: identical work every run, or the number is not comparable.
    expect(waveBatch.renderCount, "all 100 owners must render").toBe(100);
    expect(renderedOwners, "all 100 waveform mount owners must be ready").toHaveLength(100);
    expect(new Set(renderedOwners.map((owner) => owner.signalId)).size, "each canonical Signal must own exactly one ready waveform mount").toBe(100);
    expect(renderedOwners.filter((owner) => owner.start === "0" && owner.end === "500"), "every owner must cover the full 0..500 source span").toHaveLength(100);

    const delta = (name: string) => (after[name]! - before[name]!) * 1000;
    const row = {
      run, openMs,
      taskMs: +delta("TaskDuration").toFixed(0), scriptMs: +delta("ScriptDuration").toFixed(0), styleMs: +delta("RecalcStyleDuration").toFixed(0), layoutMs: +delta("LayoutDuration").toFixed(0),
      styleCount: after.RecalcStyleCount! - before.RecalcStyleCount!, layoutCount: after.LayoutCount! - before.LayoutCount!,
      // Main thread busy vs. wall: a large gap means the critical path is waiting (yield / async decode), not computing.
      mainThreadIdleMs: +(openMs - delta("TaskDuration")).toFixed(0),
      waveBatchMs: +(waveBatch.batchWallMs ?? 0).toFixed(0), renderAwaitMs: +(waveBatch.renderAwaitMs ?? 0).toFixed(0), yieldWaitMs: +(waveBatch.cooperativeYieldWaitMs ?? 0).toFixed(0), yields: waveBatch.cooperativeYieldCount,
      reusedMarkup: waveBatch.reusedMarkupCount, markupMisses: waveBatch.markupCacheMissCount,
      phases, durations,
    };
    if (process.env.PERF_OUT) appendFileSync(process.env.PERF_OUT, `${JSON.stringify(row)}\n`);
    console.log(`PERF run ${run}: open=${openMs}ms task=${row.taskMs}ms idle=${row.mainThreadIdleMs}ms style=${row.styleMs}ms(${row.styleCount}x) layout=${row.layoutMs}ms script=${row.scriptMs}ms waveBatch=${row.waveBatchMs}ms yield=${row.yieldWaitMs}ms(${row.yields})`);
  });
}
