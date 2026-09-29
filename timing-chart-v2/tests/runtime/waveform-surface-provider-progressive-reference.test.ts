import { describe, expect, it, vi } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { toWaveJson, type RenderedWave } from "@timing-chart-v2/wavedrom-adapter";
import { GeometryRegistry } from "../../apps/editor/src/runtime/geometry-registry.js";
import { createWaveformSurfaceProvider, type WaveformProviderContext } from "../../apps/editor/src/runtime/waveform-surface-provider.js";
import type { WaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("progressive reference waveform preparation", () => {
  it("does not install or publish a progressive reference after reprojection makes its request stale", async () => {
    const document = generatePerformanceDocument({ signalCount: 2, cycleCount: 10 });
    const referenceSignalId = document.timeline.referenceClock!;
    const geometryRefresh = deferred<void>();
    const progressivePreparation = deferred<RenderedWave>();
    const progressivePrepared = deferred<void>();
    const geometryRegistry = new GeometryRegistry();
    let refreshCount = 0;
    let referenceFresh = true;
    let firstPreparation = true;
    const referenceOwner = makeOwner();
    const installed: Array<{ readonly signalId: string; readonly owner: HTMLElement }> = [];
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      renderWave: vi.fn(async () => { throw new Error("Detached prepare/install should be used."); }),
      prepareWave: vi.fn((signalId, waveJson) => {
        if (signalId === referenceSignalId && firstPreparation) {
          firstPreparation = false;
          return progressivePreparation.promise.then((rendered) => {
            progressivePrepared.resolve();
            return rendered;
          });
        }
        return Promise.resolve({ signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 1, waveJson });
      }),
      installWave: vi.fn((rendered, mount) => {
        installed.push({ signalId: rendered.signalId, owner: mount as HTMLElement });
        (mount as HTMLElement).dataset.currentWaveSignal = rendered.signalId;
        return rendered;
      }),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 }),
    };
    const markOpenPhase = vi.fn();
    const recordedBatches: Array<{ artifactInstallsBeforePresentationReady: number; staleProgressiveInstallPreventedCount: number }> = [];
    const context: WaveformProviderContext = {
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache: new DisplayTimeMappingCache(),
      adapter,
      geometryRegistry,
      markOpenPhase,
      recordOpenWaveBatch: (metrics) => recordedBatches.push(metrics),
      onReferenceGeometryReady: () => {
        refreshCount += 1;
        return refreshCount === 1 ? geometryRefresh.promise : undefined;
      },
      isPrimaryPresentationOpening: () => true,
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);
    const oldBatch = provider.mountWaveBatch!([
      { signalId: referenceSignalId, owner: referenceOwner, documentEpoch: 1, isFresh: () => referenceFresh },
    ]);

    await vi.waitFor(() => expect(vi.mocked(adapter.prepareWave).mock.calls.some(([signalId]) => signalId === referenceSignalId)).toBe(true));
    progressivePreparation.resolve({
      signalId: referenceSignalId,
      ownerKey: referenceSignalId,
      svg: {} as SVGSVGElement,
      renderIndex: 0,
      waveJson: toWaveJson({ signal: document.signals.find((signal) => signal.id === referenceSignalId)!, cycleCount: 10 }),
    });
    await progressivePrepared.promise;

    // Preparation may overlap reprojection, but the old request must not be
    // installed or satisfy paint readiness before the freshness boundary.
    expect(adapter.installWave).not.toHaveBeenCalled();
    referenceFresh = false;
    geometryRefresh.resolve();
    const oldResults = await oldBatch;
    expect(oldResults.every((item) => item.stale === true)).toBe(true);
    expect(adapter.installWave).not.toHaveBeenCalled();
    expect(referenceOwner.dataset.currentWaveSignal).toBeUndefined();
    expect(geometryRegistry.svgs.has(referenceSignalId)).toBe(false);
    expect(markOpenPhase).not.toHaveBeenCalledWith("first-visible-wave-painted");
    expect(markOpenPhase).not.toHaveBeenCalledWith("reference-clock-painted");
    expect(recordedBatches[0]).toMatchObject({ artifactInstallsBeforePresentationReady: 0, staleProgressiveInstallPreventedCount: 1 });

    // The replacement projection is current and installs each owner exactly
    // once, including the same reused reference owner node.
    referenceFresh = true;
    const replacementResults = await provider.mountWaveBatch!([
      { signalId: referenceSignalId, owner: referenceOwner, documentEpoch: 1, isFresh: () => referenceFresh },
    ]);
    expect(replacementResults.every((item) => item.result !== undefined)).toBe(true);
    expect(installed.filter((item) => item.signalId === referenceSignalId)).toEqual([
      { signalId: referenceSignalId, owner: referenceOwner },
    ]);
    expect(referenceOwner.dataset.currentWaveSignal).toBe(referenceSignalId);
    expect(geometryRegistry.svgs.has(referenceSignalId)).toBe(true);
    expect(recordedBatches[1]).toMatchObject({ artifactInstallsBeforePresentationReady: 1, staleProgressiveInstallPreventedCount: 0 });
  });
});

function makeOwner(): HTMLElement {
  return { style: { removeProperty: vi.fn() }, dataset: {}, ownerDocument: {} as Document, isConnected: true } as unknown as HTMLElement;
}
