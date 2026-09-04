import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test.setTimeout(120_000);

test("yields between bounded WaveDrom batches during Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const initial = JSON.parse(await surface.getAttribute("data-performance-counters") ?? "null") as { waveBatchCount: number };

  await surface.evaluate((element) => {
    const hostElement = element.closest<HTMLElement>("[data-testid='cycle-surface']");
    const evidence: Array<{ pending: number; rows: number }> = [];
    const observer = new MutationObserver(() => {
      const counters = JSON.parse((element as HTMLElement).dataset.performanceCounters ?? "null") as { waveBatchPending?: number } | null;
      if ((counters?.waveBatchPending ?? 0) > 0 && !hostElement?.hasAttribute("data-editor-idle")) {
        evidence.push({ pending: counters!.waveBatchPending!, rows: element.querySelectorAll("[data-role='left-row']").length });
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-performance-counters"] });
    (globalThis as unknown as { __openBatchEvidence: typeof evidence; __openBatchObserver: MutationObserver }).__openBatchEvidence = evidence;
    (globalThis as unknown as { __openBatchObserver: MutationObserver }).__openBatchObserver = observer;
  });

  const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 500 });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "progressive-open.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  await page.waitForTimeout(0);

  const evidence = await page.evaluate(() => {
    const globalState = globalThis as unknown as { __openBatchEvidence: Array<{ pending: number; rows: number }>; __openBatchObserver: MutationObserver };
    globalState.__openBatchObserver.disconnect();
    const surfaceElement = document.querySelector<HTMLElement>("[data-testid='cycle-surface'] [data-role='timing-chart-surface']");
    return {
      pendingBeforeIdle: globalState.__openBatchEvidence,
      final: JSON.parse(surfaceElement?.dataset.performanceCounters ?? "null") as Record<string, number>,
      history: document.querySelector<HTMLElement>("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector<HTMLElement>("[data-testid='dirty-status']")?.textContent,
    };
  });
  console.log(`[open-progressive] ${JSON.stringify(evidence)}`);

  expect(evidence.pendingBeforeIdle.length).toBeGreaterThan(0);
  expect(evidence.pendingBeforeIdle.some((item) => item.rows > 0)).toBe(true);
  expect(evidence.final.waveBatchCount - initial.waveBatchCount).toBeGreaterThan(1);
  expect(evidence.final.waveBatchMaxSize).toBeLessThanOrEqual(8);
  expect(evidence.final.waveBatchFrameYields).toBeGreaterThanOrEqual(evidence.final.waveBatchCount);
  expect(evidence.final.waveBatchPending).toBe(0);
  expect(evidence.history).toBe("History 0 / Redo 0");
  expect(evidence.dirty).toBe("Clean");
});

test("makes the reference ruler usable before all visible waves finish", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.evaluate((element) => {
    const samples: Array<{ readonly pending: number; readonly rulerTicks: number; readonly batches: number }> = [];
    const observer = new MutationObserver(() => {
      const marks = JSON.parse((element as HTMLElement).dataset.openPhaseMarks ?? "{}") as Record<string, number>;
      if (marks["first-correct-paint"] === undefined || (element as HTMLElement).dataset.editorIdle !== undefined) return;
      const surface = element.querySelector<HTMLElement>('[data-role="timing-chart-surface"]');
      const counters = JSON.parse(surface?.dataset.performanceCounters ?? "{}") as { waveBatchPending?: number; waveBatchCount?: number };
      const viewport = element.closest<HTMLElement>("[data-testid='cycle-viewport']");
      samples.push({ pending: counters.waveBatchPending ?? 0, rulerTicks: viewport?.querySelectorAll("[data-testid='cycle-ruler'] [data-cycle]").length ?? 0, batches: counters.waveBatchCount ?? 0 });
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-open-phase-marks", "data-editor-idle"] });
    (globalThis as unknown as { __earlyRulerSamples: typeof samples; __earlyRulerObserver: MutationObserver }).__earlyRulerSamples = samples;
    (globalThis as unknown as { __earlyRulerObserver: MutationObserver }).__earlyRulerObserver = observer;
  });

  const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 500 });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "early-ruler-open.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  const evidence = await page.evaluate(() => {
    const state = globalThis as unknown as { __earlyRulerSamples: Array<{ pending: number; rulerTicks: number; batches: number }>; __earlyRulerObserver: MutationObserver };
    state.__earlyRulerObserver.disconnect();
    return state.__earlyRulerSamples;
  });
  console.log(`[early-ruler] ${JSON.stringify(evidence)}`);
  expect(evidence.some((sample) => sample.pending > 0 && sample.rulerTicks > 0)).toBe(true);
});
