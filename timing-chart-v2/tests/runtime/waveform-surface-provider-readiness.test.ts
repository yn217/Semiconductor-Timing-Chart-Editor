import { describe, expect, it, vi } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { toWaveJson } from "@timing-chart-v2/wavedrom-adapter";
import type { BookmarkId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { GeometryRegistry } from "../../apps/editor/src/runtime/geometry-registry.js";
import { createWaveformSurfaceProvider, type WaveformProviderContext } from "../../apps/editor/src/runtime/waveform-surface-provider.js";
import type { RenderedWave, WaveDromAdapter, WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("waveform provider primary geometry readiness", () => {
  it("reuses the Signal index across unrelated document revisions with the same Signal collection", async () => {
    const source = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 100 });
    let signalCollectionTraversals = 0;
    const signalCollection = source.signals;
    const signals = new Proxy(signalCollection, {
      get(target, property, receiver) {
        if (property === "map" || property === Symbol.iterator) signalCollectionTraversals += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    let snapshot = { document: { ...source, signals }, revision: 0 };
    const adapter: WaveDromAdapter = {
      toWaveJson: (input) => toWaveJson(input),
      renderWave: vi.fn(async (signalId, waveJson) => ({ signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson })),
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
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);
    const request = { signalId: source.signals[1]!.id, owner: { style: { removeProperty: vi.fn() }, dataset: {} } as unknown as HTMLElement, documentEpoch: 1 };

    await provider.mountWaveBatch!([request]);
    expect(signalCollectionTraversals).toBe(1);
    snapshot = { document: { ...snapshot.document, bookmarks: [...snapshot.document.bookmarks, { id: "bookmark_index_reuse" as BookmarkId, name: "Review", start: 1 }] }, revision: 1 };
    await provider.mountWaveBatch!([request]);

    expect(signalCollectionTraversals).toBe(1);
    const replacementSignals = new Proxy([...signalCollection], {
      get(target, property, receiver) {
        if (property === "map" || property === Symbol.iterator) signalCollectionTraversals += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    snapshot = { document: { ...snapshot.document, signals: replacementSignals }, revision: 2 };
    await provider.mountWaveBatch!([request]);
    expect(signalCollectionTraversals).toBe(2);
  });

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

  it("isolates a clock projection failure to that signal while rendering valid siblings", async () => {
    const source = canonicalFixture();
    const clock = source.signals.find((signal) => signal.type === "clock");
    const validSignal = source.signals.find((signal) => signal.type === "bus");
    if (!clock || clock.type !== "clock" || !validSignal || validSignal.type !== "bus") throw new Error("fixture needs a clock and bus");
    const document = {
      ...source,
      signals: source.signals.map((signal) => signal.id === clock.id
        ? { ...clock, generator: { ...clock.generator, phase: 0.25 } }
        : signal),
    };
    const snapshot = { document, revision: 0 };
    const adapter: WaveDromAdapter = {
      toWaveJson: (input) => toWaveJson(input),
      renderWave: vi.fn(async (signalId, waveJson) => ({ signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson })),
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
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {} }) as unknown as HTMLElement;

    const result = await provider.mountWaveBatch!([
      { signalId: clock.id, owner: owner(), documentEpoch: 1 },
      { signalId: validSignal.id, owner: owner(), documentEpoch: 1 },
    ]);

    expect(result.find((item) => item.signalId === clock.id)?.error).toMatchObject({ name: "WaveDromAdapterError", code: "UNSUPPORTED_CLOCK_PHASE" });
    expect(result.find((item) => item.signalId === validSignal.id)?.result).toBeDefined();
    expect(adapter.renderWave).toHaveBeenCalledTimes(1);
    expect(adapter.renderWave.mock.calls[0]?.[0]).toBe(validSignal.id);
  });
});
