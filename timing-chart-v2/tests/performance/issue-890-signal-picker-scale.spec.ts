import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("Signal picker records browser-internal open/search timings and bounded results at 100/1k/10k", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.addInitScript(() => {
    const target = globalThis as typeof globalThis & { __signalPickerSearchSamples?: number[]; __signalPickerOpenSamples?: number[]; __signalPickerGcCount?: number; __signalPickerGcSupported?: boolean };
    target.__signalPickerSearchSamples = [];
    target.__signalPickerOpenSamples = [];
    target.__signalPickerGcCount = 0;
    target.__signalPickerGcSupported = PerformanceObserver.supportedEntryTypes.includes("gc");
    document.addEventListener("focusin", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.closest(".signal-id-picker")) return;
      const startedAt = performance.now();
      const picker = input.closest(".signal-id-picker");
      if (!picker || picker.querySelector(".signal-id-picker-results")) return;
      const observer = new MutationObserver(() => {
        if (!picker.querySelector(".signal-id-picker-results")) return;
        target.__signalPickerOpenSamples?.push(performance.now() - startedAt);
        observer.disconnect();
      });
      observer.observe(picker, { childList: true, subtree: true });
    }, true);
    document.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.closest(".signal-id-picker") || !input.value.startsWith("SIG_")) return;
      const startedAt = performance.now();
      const query = input.value;
      const picker = input.closest(".signal-id-picker");
      if (!picker) return;
      let recorded = false;
      const finish = () => {
        if (recorded || input.value !== query || !picker.querySelector(".signal-id-picker-results [role='option']")) return;
        recorded = true;
        target.__signalPickerSearchSamples?.push(performance.now() - startedAt);
        observer.disconnect();
      };
      const observer = new MutationObserver(() => {
        finish();
      });
      observer.observe(picker, { childList: true, subtree: true, characterData: true });
      requestAnimationFrame(finish);
    }, true);
    try {
      if (!target.__signalPickerGcSupported) return;
      new PerformanceObserver((observer) => { target.__signalPickerGcCount = (target.__signalPickerGcCount ?? 0) + observer.getEntries().length; })
        .observe({ entryTypes: ["gc"] });
    } catch { /* Chromium may not expose GC entries in this execution profile. */ }
  });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const evidence: Array<Record<string, unknown>> = [];
  for (const signalCount of [100, 1_000, 10_000]) {
    const document = generatePerformanceDocument({ signalCount, cycleCount: 32 });
    const annotation = document.annotations.find((item) => item.id === "ann_perf_0");
    if (!annotation) throw new Error("Performance document must include the two-anchor measurement annotation.");
    const fileName = `signal-picker-${signalCount}.tcd.json`;
    const memoryBefore = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize);
    const gcBefore = await page.evaluate(() => (globalThis as typeof globalThis & { __signalPickerGcCount?: number }).__signalPickerGcCount ?? 0);
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: fileName,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", String(signalCount), { timeout: 60_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();

    const annotationRow = page.getByTestId("annotation-list").locator("[data-annotation-list-id='ann_perf_0']");
    await annotationRow.click();
    const editor = page.getByTestId("annotation-editor");
    const picker = editor.getByRole("combobox", { name: "Inspector annotation anchor signal" });
    await page.evaluate(() => { (globalThis as typeof globalThis & { __signalPickerOpenSamples?: number[] }).__signalPickerOpenSamples = []; });
    await picker.focus();
    await expect(editor.locator(".signal-id-picker-results")).toBeVisible();
    await page.waitForFunction(() => (globalThis as typeof globalThis & { __signalPickerOpenSamples?: number[] }).__signalPickerOpenSamples?.length === 1);
    for (let sample = 1; sample < 7; sample += 1) {
      await picker.blur();
      await picker.focus();
      await page.waitForFunction((sampleCount) => (globalThis as typeof globalThis & { __signalPickerOpenSamples?: number[] }).__signalPickerOpenSamples?.length === sampleCount, sample + 1);
    }
    const pickerOpenSamples = await page.evaluate(() => (globalThis as typeof globalThis & { __signalPickerOpenSamples?: number[] }).__signalPickerOpenSamples ?? []);
    const mountedOptions = await editor.locator(".signal-id-picker-results [role='option']").count();
    const nativePickerOptions = await editor.locator(".signal-id-picker option").count();

    await page.evaluate(() => { (globalThis as typeof globalThis & { __signalPickerSearchSamples?: number[] }).__signalPickerSearchSamples = []; });
    const query = `SIG_${signalCount - 1}`;
    for (let sample = 0; sample < 7; sample += 1) {
      await picker.fill("");
      await picker.fill(query);
      const expected = editor.locator(".signal-id-picker-results [role='option']").filter({ hasText: query });
      await expect(expected).toHaveCount(1);
      await page.waitForFunction((sampleCount) => (globalThis as typeof globalThis & { __signalPickerSearchSamples?: number[] }).__signalPickerSearchSamples?.length === sampleCount, sample + 1);
      if (sample < 6) await picker.fill("");
    }
    await page.waitForFunction(() => (globalThis as typeof globalThis & { __signalPickerSearchSamples?: number[] }).__signalPickerSearchSamples?.length === 7);
    const filterSamples = await page.evaluate(() => (globalThis as typeof globalThis & { __signalPickerSearchSamples?: number[] }).__signalPickerSearchSamples ?? []);
    const memoryAfter = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize);
    const gcCount = await page.evaluate(() => (globalThis as typeof globalThis & { __signalPickerGcCount?: number }).__signalPickerGcCount ?? 0);
    const sample = {
      signalCount,
      productionOpenVisibleWaveformsReadyMs: Number(JSON.parse(await host.getAttribute("data-open-phase-durations") ?? "{}")["visible-waveforms-ready"] ?? 0),
      pickerOpenLatency: {
        samples: pickerOpenSamples,
        p50Ms: percentile(pickerOpenSamples, 0.5),
        p95Ms: percentile(pickerOpenSamples, 0.95),
      },
      filterLatency: {
        samples: filterSamples,
        p50Ms: percentile(filterSamples, 0.5),
        p95Ms: percentile(filterSamples, 0.95),
      },
      mountedResultOptions: mountedOptions,
      nativePickerOptions,
      memoryBeforeBytes: memoryBefore ?? null,
      memoryAfterBytes: memoryAfter ?? null,
      heapDeltaBytes: memoryBefore === undefined || memoryAfter === undefined ? null : memoryAfter - memoryBefore,
      gcObservationCount: gcCount - gcBefore,
      gcEntryTypeSupported: await page.evaluate(() => (globalThis as typeof globalThis & { __signalPickerGcSupported?: boolean }).__signalPickerGcSupported ?? false),
    };
    expect(mountedOptions).toBeLessThanOrEqual(51);
    expect(nativePickerOptions).toBe(0);
    expect(filterSamples).toHaveLength(7);
    evidence.push(sample);
  }
  await testInfo.attach("issue-890-signal-picker-scale.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
  console.log(`[issue-890-picker-scale] ${JSON.stringify(evidence)}`);
});

function percentile(samples: readonly number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)]!;
}
