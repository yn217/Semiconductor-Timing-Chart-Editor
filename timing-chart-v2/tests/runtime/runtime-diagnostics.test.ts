import { describe, expect, it } from "vitest";
import { createOpenPhaseTracker } from "../../apps/editor/src/runtime/runtime-diagnostics.js";

describe("open phase readiness contract", () => {
  it("publishes readiness stages in order and cycle-view-ready only after the first correct paint", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    const tracker = createOpenPhaseTracker(host);

    tracker.begin(0);
    expect(host.dataset.openReadiness).toBe("opening");
    tracker.mark("canonical-replaced", 1);
    expect(host.dataset.openReadiness).toBe("document-ready");
    tracker.mark("row-shell-painted", 1);
    tracker.mark("reference-geometry-ready", 2);
    expect(host.dataset.cycleViewReady).toBeUndefined();
    tracker.mark("ruler-painted", 3);
    expect(host.dataset.openReadiness).toBe("presentation-ready");
    expect(host.dataset.cycleViewReady).toBe("true");
    tracker.mark("visible-waveforms-ready", 4);
    expect(host.dataset.openReadiness).toBe("visible-waveforms-ready");
    tracker.mark("all-visible-idle", 5);
    expect(host.dataset.openReadiness).toBe("visible-waveforms-ready");
    tracker.mark("diagnostics-ready", 6);
    expect(host.dataset.openReadiness).toBe("idle");

    tracker.begin(7);
    expect(host.dataset.openReadiness).toBe("opening");
    expect(host.dataset.cycleViewReady).toBeUndefined();
  });

  it("defers waveform readiness when rendering finishes before presentation", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    const tracker = createOpenPhaseTracker(host);

    tracker.begin(0);
    tracker.mark("canonical-replaced", 1);
    tracker.mark("visible-waveforms-ready", 2);
    tracker.mark("all-visible-idle", 3);
    tracker.mark("diagnostics-ready", 3.5);
    expect(host.dataset.openReadiness).toBe("document-ready");
    expect(host.dataset.cycleViewReady).toBeUndefined();

    tracker.mark("row-shell-painted", 4);
    tracker.mark("reference-geometry-ready", 5);
    tracker.mark("ruler-painted", 6);
    expect(host.dataset.openReadiness).toBe("idle");
    expect(host.dataset.cycleViewReady).toBe("true");
  });

  it("notifies presentation and diagnostics owners at their respective readiness stages", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    let presentationNotifications = 0;
    let diagnosticsNotifications = 0;
    const tracker = createOpenPhaseTracker(host, () => { presentationNotifications += 1; }, () => { diagnosticsNotifications += 1; });

    tracker.begin(0);
    tracker.mark("canonical-replaced", 1);
    tracker.mark("row-shell-painted", 2);
    tracker.mark("reference-geometry-ready", 3);
    tracker.mark("ruler-painted", 4);
    expect(presentationNotifications).toBe(1);
    expect(diagnosticsNotifications).toBe(0);
    tracker.mark("visible-waveforms-ready", 5);
    tracker.mark("visible-waveforms-ready", 6);
    expect(diagnosticsNotifications).toBe(1);
    tracker.begin(7);
    tracker.mark("canonical-replaced", 8);
    tracker.mark("row-shell-painted", 9);
    tracker.mark("reference-geometry-ready", 10);
    tracker.mark("ruler-painted", 11);
    expect(diagnosticsNotifications).toBe(1);
    tracker.mark("visible-waveforms-ready", 12);
    expect(diagnosticsNotifications).toBe(2);
  });

  it("waits for presentation before notifying diagnostics if visible waves finish first", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    let diagnosticsNotifications = 0;
    const tracker = createOpenPhaseTracker(host, undefined, () => { diagnosticsNotifications += 1; });
    tracker.begin(0);
    tracker.mark("canonical-replaced", 1);
    tracker.mark("visible-waveforms-ready", 2);
    expect(diagnosticsNotifications).toBe(0);
    tracker.mark("row-shell-painted", 3);
    tracker.mark("reference-geometry-ready", 4);
    tracker.mark("ruler-painted", 5);
    expect(diagnosticsNotifications).toBe(1);
  });

  it("aggregates Open waveform batch scheduling metrics and resets them for the next Open", () => {
    const host = { dataset: {} } as unknown as HTMLElement;
    const tracker = createOpenPhaseTracker(host);

    tracker.begin(0);
    const zeroMetrics = {
      batchWallMs: 0, waveJsonPreparationMs: 0, renderAwaitMs: 0, renderCount: 0, cooperativeYieldCount: 0, cooperativeYieldWaitMs: 0,
      requestedCount: 0, requiredNowCount: 0, deferredCount: 0, skippedStaleBeforeRunCount: 0, staleAfterRunCount: 0,
      duplicateOwnerRequestCount: 0, reusedMarkupCount: 0, markupCacheMissCount: 0, waveJsonBytes: 0, semanticValuesBytes: 0,
      svgMarkupBytes: 0, cacheKeySerializeMs: 0, waveDromRenderAnyMs: 0, onmlStringifyMs: 0, valueLabelLayoutMs: 0,
      markupSafetyMs: 0, templateParseMs: 0, svgSafetyDomWalkMs: 0, domInstallMs: 0, totalSignalWallMs: 0,
    };
    tracker.recordWaveBatch({ ...zeroMetrics, batchWallMs: 120, waveJsonPreparationMs: 40, renderAwaitMs: 80, renderCount: 4, cooperativeYieldCount: 3, cooperativeYieldWaitMs: 45, requestedCount: 6, requiredNowCount: 4, deferredCount: 1, skippedStaleBeforeRunCount: 1, reusedMarkupCount: 2, markupCacheMissCount: 2, svgMarkupBytes: 900 });
    tracker.recordWaveBatch({ ...zeroMetrics, batchWallMs: 30, waveJsonPreparationMs: 10, renderAwaitMs: 20, renderCount: 1, cooperativeYieldCount: 1, cooperativeYieldWaitMs: 16, requestedCount: 1, requiredNowCount: 1, markupCacheMissCount: 1, svgMarkupBytes: 300 });
    expect(JSON.parse(host.dataset.openWaveBatchMetrics!)).toEqual({
      batchCount: 2,
      batchWallMs: 150,
      waveJsonPreparationMs: 50,
      renderAwaitMs: 100,
      renderCount: 5,
      cooperativeYieldCount: 4,
      cooperativeYieldWaitMs: 61,
      requestedCount: 7,
      requiredNowCount: 5,
      deferredCount: 1,
      skippedStaleBeforeRunCount: 1,
      staleAfterRunCount: 0,
      duplicateOwnerRequestCount: 0,
      reusedMarkupCount: 2,
      markupCacheMissCount: 3,
      waveJsonBytes: 0,
      semanticValuesBytes: 0,
      svgMarkupBytes: 1200,
      cacheKeySerializeMs: 0,
      waveDromRenderAnyMs: 0,
      onmlStringifyMs: 0,
      valueLabelLayoutMs: 0,
      markupSafetyMs: 0,
      templateParseMs: 0,
      svgSafetyDomWalkMs: 0,
      domInstallMs: 0,
      totalSignalWallMs: 0,
    });

    tracker.begin(200);
    expect(host.dataset.openWaveBatchMetrics).toBeUndefined();
    tracker.recordWaveBatch({ ...zeroMetrics, batchWallMs: 10, renderAwaitMs: 7, renderCount: 1 });
    expect(JSON.parse(host.dataset.openWaveBatchMetrics!)).toMatchObject({ batchCount: 1, renderCount: 1, cooperativeYieldCount: 0 });
  });
});
