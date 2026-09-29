import { appendFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

/**
 * Heavy engineering stress benchmark, not the product Open SLO. The ordinary
 * product policy windows this workload to 0..128; this test changes only the
 * served module response for this page so it can measure full 0..500 work.
 * No production constant or runtime API is changed.
 *
 * Run explicitly with `--trace off`. Default to one sample; PERF_RUNS may be
 * set to 2..5 for a bounded comparison iteration.
 */
const RUNS = Number(process.env.PERF_RUNS ?? 1);
if (!Number.isInteger(RUNS) || RUNS < 1 || RUNS > 5) {
  throw new Error(`PERF_RUNS must be an integer from 1 to 5; received ${process.env.PERF_RUNS}.`);
}
// Vite may normalize the numeric separator in transformed module responses.
const FULL_SPAN_LIMIT = /(export const FULL_DOCUMENT_WAVEFORM_SIGNAL_CYCLE_LIMIT\s*=\s*)32_?768/;

for (let run = 1; run <= RUNS; run += 1) {
  test(`fixed 100x500 full-span production Open, run ${run}/${RUNS}`, async ({ page }) => {
    test.setTimeout(180_000);
    let overrideMatched = false;
    await page.route(/\/timeline-geometry-owner\.ts(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      overrideMatched = FULL_SPAN_LIMIT.test(source);
      const body = source.replace(FULL_SPAN_LIMIT, (_match, prefix: string) => `${prefix}1_000_000`);
      await route.fulfill({ response, body });
    });

    // 100 rows at the normal row pitch plus overscan; keep all owners mounted.
    await page.setViewportSize({ width: 1672, height: 3700 });
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    expect(overrideMatched, "the stress-only source-span override must match the served module").toBe(true);

    const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 500 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const readCdpMetrics = async () => Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]),
    ) as Record<string, number>;
    const before = await readCdpMetrics();

    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: "perf_100x500_fullspan.tcd.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    // Poll inside the page so Playwright's DOM snapshot traversal is outside
    // the measured readiness interval (and use the app's own open phase times).
    await page.evaluate((title) => new Promise<void>((resolve) => {
      const poll = () => {
        const heading = window.document.querySelector(".app-titlebar h1");
        const host = window.document.querySelector<HTMLElement>("[data-testid='cycle-surface']");
        if (heading?.textContent === title && host?.dataset.editorIdle === "true") resolve();
        else setTimeout(poll, 20);
      };
      poll();
    }), document.document.title);

    const host = page.getByTestId("cycle-surface");
    const waveBatch = JSON.parse((await host.getAttribute("data-open-wave-batch-metrics")) ?? "{}") as Record<string, number>;
    const phaseMarks = JSON.parse((await host.getAttribute("data-open-phase-marks")) ?? "{}") as Record<string, number>;
    const phaseDurations = JSON.parse((await host.getAttribute("data-open-phase-durations")) ?? "{}") as Record<string, number>;
    const after = await readCdpMetrics();

    const ownerSpans = await host.locator("[data-role='wave-owner'][data-rendered-source-window-start]").evaluateAll((elements) => {
      const byOwner = new Map<string, Readonly<{ ownerId: string; start: string; end: string }>>();
      for (const element of elements) {
        const node = element as HTMLElement;
        const ownerId = node.dataset.waveOwner ?? node.dataset.signalId;
        if (!ownerId) continue;
        byOwner.set(ownerId, {
          ownerId,
          start: node.dataset.renderedSourceWindowStart ?? "?",
          end: node.dataset.renderedSourceWindowEnd ?? "?",
        });
      }
      return [...byOwner.values()];
    });

    // Fixed-work guard: count unique mounted semantic owners and validate each
    // one's actual source span, not just a union of DOM spans.
    expect(waveBatch.renderCount, "all 100 Signals must have rendered").toBe(100);
    expect(ownerSpans, "all 100 distinct Signal owners must be mounted").toHaveLength(100);
    expect(ownerSpans.every((owner) => owner.start === "0" && owner.end === "500"), "every owner must cover source cycles 0..500").toBe(true);

    const deltaMs = (metric: string) => ((after[metric] ?? 0) - (before[metric] ?? 0)) * 1000;
    const row = {
      run,
      workload: { signalCount: 100, cycleCount: 500, mountedOwners: ownerSpans.length, ownerSpan: "0-500" },
      readinessMs: {
        presentationReady: phaseDurations["presentation-ready"],
        firstVisibleWavePainted: phaseDurations["first-visible-wave-painted"],
        visibleWaveformsReady: phaseDurations["visible-waveforms-ready"],
        idle: phaseDurations.idle,
      },
      mainThreadMs: {
        task: +deltaMs("TaskDuration").toFixed(1),
        script: +deltaMs("ScriptDuration").toFixed(1),
        style: +deltaMs("RecalcStyleDuration").toFixed(1),
        layout: +deltaMs("LayoutDuration").toFixed(1),
      },
      styleCount: (after.RecalcStyleCount ?? 0) - (before.RecalcStyleCount ?? 0),
      layoutCount: (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0),
      waveBatch,
      phaseMarks,
      phaseDurations,
    };
    if (process.env.PERF_OUT) appendFileSync(process.env.PERF_OUT, `${JSON.stringify(row)}\n`);
    console.log(`FIXED_PERF ${JSON.stringify(row)}`);
  });
}
