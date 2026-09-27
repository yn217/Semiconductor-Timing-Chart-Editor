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
  it("records Open job classification, duplicate owners, markup reuse, and render stages", async () => {
    const document = generatePerformanceDocument({ signalCount: 2, cycleCount: 10 });
    const referenceSignalId = document.timeline.referenceClock!;
    const recordOpenWaveBatch = vi.fn();
    const retainArtifact = vi.fn();
    const geometryRegistry = new GeometryRegistry();
    const invalidateSnapIndex = vi.fn();
    const owner = { style: { removeProperty: vi.fn() }, dataset: {}, isConnected: true } as unknown as HTMLElement;
    let renders = 0;
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      renderWave: vi.fn(async (signalId, waveJson) => {
        renders += 1;
        return { signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson,
          markupCacheHit: renders === 2, renderStages: { waveJsonBytes: 10, svgMarkupBytes: 20, domInstallMs: 2 } };
      }),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      retainArtifact,
      metrics: () => ({ renderCalls: renders, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 1, cacheMisses: 1, mounts: renders, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 1, allocatedRenderIndices: 1 }),
    };
    const context: WaveformProviderContext = {
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache: new DisplayTimeMappingCache(),
      adapter,
      geometryRegistry,
      markOpenPhase: vi.fn(),
      recordOpenWaveBatch,
      isPrimaryPresentationOpening: () => true,
      invalidateSnapIndex,
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);

    await provider.mountWaveBatch!([
      { signalId: referenceSignalId, owner, documentEpoch: 1 },
      { signalId: referenceSignalId, owner, documentEpoch: 1 },
    ]);

    expect(recordOpenWaveBatch).toHaveBeenCalledWith(expect.objectContaining({
      requestedCount: 2,
      requiredNowCount: 2,
      deferredCount: 0,
      skippedStaleBeforeRunCount: 0,
      staleAfterRunCount: 0,
      duplicateOwnerRequestCount: 1,
      reusedMarkupCount: 1,
      markupCacheMissCount: 1,
      waveJsonBytes: 20,
      svgMarkupBytes: 40,
      domInstallMs: 4,
    }));
    const priorSnapInvalidations = invalidateSnapIndex.mock.calls.length;
    provider.retainWaveArtifact!(referenceSignalId);
    expect(retainArtifact).toHaveBeenCalledWith(referenceSignalId);
    expect(invalidateSnapIndex).toHaveBeenCalledTimes(priorSnapInvalidations + 1);
  });

  it("reuses the Signal index across unrelated document revisions with the same Signal collection", async () => {
    const source = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 100 });
    let signalCollectionTraversals = 0;
    let signalCollectionSearches = 0;
    const signalCollection = source.signals;
    const signals = new Proxy(signalCollection, {
      get(target, property, receiver) {
        if (property === "map" || property === Symbol.iterator) signalCollectionTraversals += 1;
        if (property === "find" || property === "some") signalCollectionSearches += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    let snapshot = { document: { ...source, signals }, revision: 0 };
    const adapter: WaveDromAdapter = {
      toWaveJson: (input) => toWaveJson(input),
      renderWave: vi.fn(async (signalId, waveJson) => {
        signalCollectionSearches = 0;
        return { signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson };
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
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);
    const owner = { style: { removeProperty: vi.fn() }, dataset: {} } as unknown as HTMLElement & { requestCycleBoundaryPositions?: (cycles: readonly number[]) => Readonly<Record<number, number>> };
    const request = { signalId: source.timeline.referenceClock!, owner, documentEpoch: 1 };

    await provider.mountWaveBatch!([request]);
    expect(signalCollectionTraversals).toBe(1);
    expect(signalCollectionSearches).toBe(0);
    expect(owner.dataset.cycleBoundaryGeometry).toBeUndefined();
    expect(owner.requestCycleBoundaryPositions?.([0, 1])).toMatchObject({ 0: expect.any(Number), 1: expect.any(Number) });
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

  it("marks the first visible WaveDrom artifact when it mounts, without waiting for later owners", async () => {
    const document = generatePerformanceDocument({ signalCount: 2, cycleCount: 10 });
    const referenceSignalId = document.timeline.referenceClock!;
    const nonReferenceSignalId = document.signals[1]!.id;
    const laterRender = deferred<RenderedWave>();
    const markOpenPhase = vi.fn();
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      renderWave: vi.fn(async (signalId, waveJson) => {
        if (signalId === nonReferenceSignalId) return laterRender.promise;
        return { signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson };
      }),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 }),
    };
    const context: WaveformProviderContext = {
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache: new DisplayTimeMappingCache(),
      adapter,
      geometryRegistry: new GeometryRegistry(),
      markOpenPhase,
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);
    const owner = () => ({ isConnected: true, style: { removeProperty: vi.fn() }, dataset: {} }) as unknown as HTMLElement;
    const batch = provider.mountWaveBatch!([
      { signalId: nonReferenceSignalId, owner: owner(), documentEpoch: 1 },
      { signalId: referenceSignalId, owner: owner(), documentEpoch: 1 },
    ]);

    await vi.waitFor(() => expect(adapter.renderWave).toHaveBeenCalledTimes(2));
    expect(markOpenPhase).toHaveBeenCalledWith("first-visible-wave-painted");
    laterRender.resolve({ signalId: nonReferenceSignalId, ownerKey: nonReferenceSignalId, svg: {} as SVGSVGElement, renderIndex: 1, waveJson: { wave: "01" } });
    await batch;
  });

  it("yields opening render slices through the browser task queue instead of waiting for an animation frame", async () => {
    const document = generatePerformanceDocument({ signalCount: 2, cycleCount: 10 });
    const referenceSignalId = document.timeline.referenceClock!;
    const requestAnimationFrame = vi.fn(() => 1);
    const recordOpenWaveBatch = vi.fn();
    let messageChannelCount = 0;
    class TestMessageChannel {
      readonly port1 = { onmessage: null as ((event: MessageEvent) => void) | null, close: vi.fn() };
      readonly port2 = {
        postMessage: vi.fn(() => queueMicrotask(() => this.port1.onmessage?.(new MessageEvent("message")))),
        close: vi.fn(),
      };
      constructor() { messageChannelCount += 1; }
    }
    let now = 0;
    const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 10; return now; });
    vi.stubGlobal("scheduler", undefined);
    vi.stubGlobal("MessageChannel", TestMessageChannel);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    try {
      const adapter: WaveDromAdapter = {
        toWaveJson: (source) => toWaveJson(source),
        renderWave: vi.fn(async (signalId, waveJson) => ({ signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson })),
        extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
        geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
        dispose: vi.fn(),
        metrics: () => ({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 }),
      };
      const context: WaveformProviderContext = {
        sessionController: { snapshot: () => ({ document, revision: 0 }) },
        getDocumentEpoch: () => 1,
        mappingCache: new DisplayTimeMappingCache(),
        adapter,
        geometryRegistry: new GeometryRegistry(),
        markOpenPhase: vi.fn(),
        recordOpenWaveBatch,
        isPrimaryPresentationOpening: () => true,
        invalidateSnapIndex: vi.fn(),
        getViewMode: () => "Cycle",
      };
      const provider = createWaveformSurfaceProvider(context);
      const owner = { style: { removeProperty: vi.fn() }, dataset: {} } as unknown as HTMLElement;
      await provider.mountWaveBatch!([
        { signalId: referenceSignalId, owner, documentEpoch: 1 },
        { signalId: document.signals[1]!.id, owner: { style: { removeProperty: vi.fn() }, dataset: {} } as unknown as HTMLElement, documentEpoch: 1 },
      ]);

      expect(messageChannelCount).toBe(1);
      expect(requestAnimationFrame).not.toHaveBeenCalled();
      expect(recordOpenWaveBatch).toHaveBeenCalledWith(expect.objectContaining({
        renderCount: 2,
        cooperativeYieldCount: 1,
      }));
    } finally {
      performanceNow.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("skips WaveJSON preparation for viewport requests invalidated by reference reprojection", async () => {
    const document = generatePerformanceDocument({ signalCount: 50, cycleCount: 100 });
    const referenceSignalId = document.timeline.referenceClock!;
    const nonReference = document.signals.find((signal) => signal.id !== referenceSignalId);
    if (!nonReference || nonReference.type === "clock" || nonReference.type === "commentRow") throw new Error("fixture needs a value signal beside its reference clock");
    const nonReferenceSignalId = nonReference.id;
    let nonReferenceFresh = true;
    const toWaveJsonSpy = vi.fn(toWaveJson);
    const mappingCache = new DisplayTimeMappingCache();
    const remapValueChanges = vi.spyOn(mappingCache, "remapValueChanges");
    const adapter: WaveDromAdapter = {
      toWaveJson: toWaveJsonSpy,
      renderWave: vi.fn(async (signalId, waveJson) => ({ signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson })),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 }),
    };
    const context: WaveformProviderContext = {
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache,
      adapter,
      geometryRegistry: new GeometryRegistry(),
      markOpenPhase: vi.fn(),
      onReferenceGeometryReady: async () => { nonReferenceFresh = false; },
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const provider = createWaveformSurfaceProvider(context);
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {} }) as unknown as HTMLElement;

    const results = await provider.mountWaveBatch!([
      { signalId: nonReferenceSignalId, owner: owner(), documentEpoch: 1, sourceWindow: { start: 0, end: 100 }, isFresh: () => nonReferenceFresh },
      { signalId: referenceSignalId, owner: owner(), documentEpoch: 1 },
    ]);

    expect(toWaveJsonSpy).toHaveBeenCalledTimes(1);
    expect(remapValueChanges).not.toHaveBeenCalledWith(nonReference.values, expect.anything());
    expect(adapter.renderWave).toHaveBeenCalledTimes(1);
    expect(adapter.renderWave.mock.calls[0]?.[0]).toBe(referenceSignalId);
    expect(results.find((item) => item.signalId === nonReferenceSignalId)).toMatchObject({ stale: true });
    expect(results.find((item) => item.signalId === referenceSignalId)?.result).toBeDefined();
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
