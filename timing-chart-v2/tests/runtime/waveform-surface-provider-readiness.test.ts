import { describe, expect, it, vi } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { toWaveJson } from "@timing-chart-v2/wavedrom-adapter";
import { GeometryRegistry } from "../../apps/editor/src/runtime/geometry-registry.js";
import { createWaveformSurfaceProvider, type WaveformProviderContext } from "../../apps/editor/src/runtime/waveform-surface-provider.js";
import type { RenderedWave, WaveDromAdapter, WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("waveform provider primary geometry readiness", () => {
  it("publishes reference geometry before awaiting a non-reference WaveDrom render", async () => {
    const document = generatePerformanceDocument({ signalCount: 50, cycleCount: 100 });
    const renderedNonReference = deferred<RenderedWave>();
    const ready = vi.fn();
    const lifecycle: string[] = [];
    const referenceSignalId = document.timeline.referenceClock!;
    const nonReferenceSignalId = document.signals[1]!.id;
    const snapshot = { document, revision: 0 };
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      renderWave: vi.fn(async (signalId, waveJson) => {
        lifecycle.push(`render:${signalId}`);
        if (signalId === nonReferenceSignalId) return renderedNonReference.promise;
        const svg = {} as SVGSVGElement;
        return { signalId, ownerKey: signalId, svg, renderIndex: 0, waveJson };
      }),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 }),
    };
    const context: WaveformProviderContext = {
      sessionController: { snapshot: () => snapshot },
      getDocumentEpoch: () => 1,
      mappingCache: new DisplayTimeMappingCache(),
      adapter,
      geometryRegistry: new GeometryRegistry(),
      markOpenPhase: vi.fn(),
      onReferenceGeometryReady: () => { lifecycle.push("reference-ready"); ready(); },
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {} }) as unknown as HTMLElement;

    const batch = provider.mountWaveBatch!([
      { signalId: nonReferenceSignalId, owner: owner(), documentEpoch: 1 },
      { signalId: referenceSignalId, owner: owner(), documentEpoch: 1 },
    ]);

    expect(ready).toHaveBeenCalledTimes(1);
    expect(context.geometryRegistry.maps.has(referenceSignalId)).toBe(true);
    await vi.waitFor(() => expect(adapter.renderWave).toHaveBeenCalledTimes(2));
    expect(adapter.renderWave).toHaveBeenCalledTimes(2);
    expect(adapter.renderWave.mock.calls[0]?.[0]).toBe(referenceSignalId);
    expect(adapter.renderWave.mock.calls[1]?.[0]).toBe(nonReferenceSignalId);
    expect(lifecycle.indexOf("reference-ready")).toBeLessThan(lifecycle.indexOf(`render:${nonReferenceSignalId}`));
    renderedNonReference.resolve({ signalId: nonReferenceSignalId, ownerKey: nonReferenceSignalId, svg: {} as SVGSVGElement, renderIndex: 1, waveJson: { wave: "01" } satisfies WaveJsonSignal });
    const results = await batch;
    expect(results.map((item) => item.signalId)).toEqual([nonReferenceSignalId, referenceSignalId]);
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
