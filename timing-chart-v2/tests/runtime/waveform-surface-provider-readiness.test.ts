import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { toWaveJson } from "@timing-chart-v2/wavedrom-adapter";
import type { BookmarkId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { GeometryRegistry } from "../../apps/editor/src/runtime/geometry-registry.js";
import { LazyAnalyticGeometryMap } from "../../apps/editor/src/runtime/lazy-analytic-geometry.js";
import { createWaveformSurfaceProvider, type WaveformProviderContext } from "../../apps/editor/src/runtime/waveform-surface-provider.js";
import type { RenderedWave, WaveDromAdapter, WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("waveform provider primary geometry readiness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("installs the reference wave first and commits the other prepared owners after the batch", async () => {
    const document = generatePerformanceDocument({ signalCount: 3, cycleCount: 10 });
    const referenceSignalId = document.timeline.referenceClock!;
    const nonReferenceSignalIds = document.signals.filter((signal) => signal.id !== referenceSignalId).map((signal) => signal.id);
    const lifecycle: string[] = [];
    const geometryRegistry = new GeometryRegistry();
    const invalidateSnapIndex = vi.fn();
    const svgBySignal = new Map<string, SVGSVGElement>();
    const sourceCyclesBySignal = new Map<string, readonly number[] | undefined>();
    const decode = deferred<void>();
    let referencePrepareStarted = false;
    let nonReferencePreparedDuringDecode = false;
    let referenceDecodeResolved = false;
    const mappingCache = new DisplayTimeMappingCache();
    const remapValueChanges = mappingCache.remapValueChanges.bind(mappingCache);
    vi.spyOn(mappingCache, "remapValueChanges").mockImplementation((changes, mapping) => {
      if (referencePrepareStarted && !referenceDecodeResolved) nonReferencePreparedDuringDecode = true;
      return remapValueChanges(changes, mapping);
    });
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      renderWave: vi.fn(async () => { throw new Error("Detached prepare/install should be used."); }),
      prepareWave: vi.fn(async (signalId, waveJson) => {
        lifecycle.push(`prepare:${signalId}`);
        if (signalId === referenceSignalId) referencePrepareStarted = true;
        sourceCyclesBySignal.set(signalId, waveJson.geometrySourceCycles);
        const svg = {} as SVGSVGElement;
        svgBySignal.set(signalId, svg);
        return { signalId, ownerKey: signalId, svg, renderIndex: 0, waveJson, ...(signalId === referenceSignalId ? { svgImageReady: decode.promise } : {}) };
      }),
      installWave: vi.fn((rendered, _mount) => {
        lifecycle.push(`install:${rendered.signalId}`);
        return rendered;
      }),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 3, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 3, mounts: 3, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 3, allocatedRenderIndices: 3 }),
    };
    const context: WaveformProviderContext = {
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache,
      adapter,
      geometryRegistry,
      markOpenPhase: vi.fn(),
      isPrimaryPresentationOpening: () => true,
      invalidateSnapIndex,
      getViewMode: () => "Cycle",
    };
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {}, ownerDocument: {} as Document, isConnected: true }) as unknown as HTMLElement;
    const provider = createWaveformSurfaceProvider(context);

    const batch = provider.mountWaveBatch!([
      { signalId: nonReferenceSignalIds[0]!, owner: owner(), documentEpoch: 1, sourceWindow: { start: 1, end: 9 } },
      { signalId: nonReferenceSignalIds[1]!, owner: owner(), documentEpoch: 1, sourceWindow: { start: 1, end: 9 } },
      { signalId: referenceSignalId, owner: owner(), documentEpoch: 1, sourceWindow: { start: 1, end: 9 } },
    ]);
    await vi.waitFor(() => expect(nonReferencePreparedDuringDecode).toBe(true));
    referenceDecodeResolved = true;
    decode.resolve();
    await batch;

    expect(lifecycle).toEqual([
      `prepare:${referenceSignalId}`,
      `install:${referenceSignalId}`,
      `prepare:${nonReferenceSignalIds[0]}`,
      `prepare:${nonReferenceSignalIds[1]}`,
      `install:${nonReferenceSignalIds[0]}`,
      `install:${nonReferenceSignalIds[1]}`,
    ]);
    expect(adapter.renderWave).not.toHaveBeenCalled();
    expect(adapter.installWave).toHaveBeenCalledTimes(3);
    expect(nonReferencePreparedDuringDecode).toBe(true);
    expect(svgBySignal.size).toBe(3);
    // Reference bootstrap publishes once before rendering; the two other
    // owner maps are committed together and invalidate their shared indexes once.
    expect(invalidateSnapIndex).toHaveBeenCalledTimes(2);
    const referenceSourceCycles = sourceCyclesBySignal.get(referenceSignalId);
    expect(referenceSourceCycles).toBeDefined();
    expect(sourceCyclesBySignal.get(nonReferenceSignalIds[0]!)).toBe(referenceSourceCycles);
    expect(sourceCyclesBySignal.get(nonReferenceSignalIds[1]!)).toBe(referenceSourceCycles);
    expect(geometryRegistry.maps.get(nonReferenceSignalIds[0]!)).toBeInstanceOf(LazyAnalyticGeometryMap);
    expect(geometryRegistry.maps.get(nonReferenceSignalIds[1]!)).toBeInstanceOf(LazyAnalyticGeometryMap);
  });

  it("starts each distinct Open waveform artifact before preparing duplicate owners", async () => {
    const document = generatePerformanceDocument({ signalCount: 6, cycleCount: 20 });
    const referenceSignalId = document.timeline.referenceClock!;
    const repeatedBinaryIds = document.signals.slice(1, 5).map((signal) => signal.id);
    const distinctBusId = document.signals[5]!.id;
    const prepareOrder: string[] = [];
    const waveMarkupArtifactKey = vi.fn((waveJson: WaveJsonSignal, semanticValues: readonly string[] = []) => JSON.stringify([waveJson, semanticValues]));
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      waveMarkupArtifactKey,
      renderWave: vi.fn(async () => { throw new Error("Detached prepare/install should be used."); }),
      prepareWave: vi.fn(async (signalId, waveJson) => {
        prepareOrder.push(signalId);
        return { signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson };
      }),
      installWave: vi.fn((rendered) => rendered),
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
      isPrimaryPresentationOpening: () => true,
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {}, ownerDocument: {} as Document, isConnected: true }) as unknown as HTMLElement;
    const provider = createWaveformSurfaceProvider(context);

    await provider.mountWaveBatch!([
      ...repeatedBinaryIds.slice(0, 2).map((signalId) => ({ signalId, owner: owner(), documentEpoch: 1 })),
      { signalId: distinctBusId, owner: owner(), documentEpoch: 1 },
      ...repeatedBinaryIds.slice(2).map((signalId) => ({ signalId, owner: owner(), documentEpoch: 1 })),
      { signalId: referenceSignalId, owner: owner(), documentEpoch: 1 },
    ]);

    expect(prepareOrder).toEqual([
      referenceSignalId,
      repeatedBinaryIds[0],
      distinctBusId,
      ...repeatedBinaryIds.slice(1),
    ]);
    expect(adapter.installWave).toHaveBeenCalledTimes(document.signals.length);
    expect(waveMarkupArtifactKey).toHaveBeenCalledTimes(document.signals.length);
  });

  it("does not install a prepared waveform after its request becomes stale", async () => {
    const document = generatePerformanceDocument({ signalCount: 2, cycleCount: 10 });
    const referenceSignalId = document.timeline.referenceClock!;
    const nonReferenceSignalId = document.signals.find((signal) => signal.id !== referenceSignalId)!.id;
    const prepared = deferred<RenderedWave>();
    const nonReferencePrepareStarted = deferred<void>();
    let nonReferenceIsFresh = true;
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      renderWave: vi.fn(async () => { throw new Error("Detached prepare/install should be used."); }),
      prepareWave: vi.fn(async (signalId, waveJson) => {
        if (signalId === nonReferenceSignalId) {
          nonReferencePrepareStarted.resolve();
          return prepared.promise;
        }
        return { signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson };
      }),
      installWave: vi.fn((rendered) => rendered),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 2, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 2, mounts: 1, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 1, allocatedRenderIndices: 2 }),
    };
    const context: WaveformProviderContext = {
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache: new DisplayTimeMappingCache(),
      adapter,
      geometryRegistry: new GeometryRegistry(),
      markOpenPhase: vi.fn(),
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {}, ownerDocument: {} as Document, isConnected: true }) as unknown as HTMLElement;
    const provider = createWaveformSurfaceProvider(context);
    const batch = provider.mountWaveBatch!([
      { signalId: referenceSignalId, owner: owner(), documentEpoch: 1 },
      { signalId: nonReferenceSignalId, owner: owner(), documentEpoch: 1, isFresh: () => nonReferenceIsFresh },
    ]);

    await nonReferencePrepareStarted.promise;
    nonReferenceIsFresh = false;
    prepared.resolve({ signalId: nonReferenceSignalId, ownerKey: nonReferenceSignalId, svg: {} as SVGSVGElement, renderIndex: 1, waveJson: { wave: "01" } });
    const results = await batch;

    expect(adapter.installWave).toHaveBeenCalledTimes(1);
    expect(adapter.installWave).toHaveBeenCalledWith(expect.objectContaining({ signalId: referenceSignalId }), expect.anything());
    expect(results.find((item) => item.signalId === nonReferenceSignalId)).toMatchObject({ stale: true });
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

  it("publishes analytic owner geometry while shared SVG image decoding is pending", async () => {
    const document = generatePerformanceDocument({ signalCount: 2, cycleCount: 10 });
    const referenceSignalId = document.timeline.referenceClock!;
    const nonReferenceSignalId = document.signals.find((signal) => signal.id !== referenceSignalId)!.id;
    const decode = deferred<void>();
    const geometryRegistry = new GeometryRegistry();
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      renderWave: vi.fn(async () => { throw new Error("Detached prepare/install should be used."); }),
      prepareWave: vi.fn(async (signalId, waveJson) => ({
        signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson,
        svgImageReady: decode.promise,
      })),
      installWave: vi.fn((rendered) => rendered),
      extractLocalGeometry: vi.fn(() => { throw new Error("SVG extraction is not used in analytic mode."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, duplicateKeyCollisions: 0, transitionBrickLookups: 0, skinPathParses: 0, matrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 }),
    };
    const markOpenPhase = vi.fn();
    const provider = createWaveformSurfaceProvider({
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache: new DisplayTimeMappingCache(),
      adapter,
      geometryRegistry,
      markOpenPhase,
      isPrimaryPresentationOpening: () => true,
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    });
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {}, isConnected: true }) as unknown as HTMLElement;

    const batch = provider.mountWaveBatch!([
      { signalId: referenceSignalId, owner: owner(), documentEpoch: 1 },
      { signalId: nonReferenceSignalId, owner: owner(), documentEpoch: 1 },
    ]);
    await vi.waitFor(() => expect(geometryRegistry.maps.has(nonReferenceSignalId)).toBe(true));
    expect(markOpenPhase).not.toHaveBeenCalledWith("first-visible-wave-painted");

    decode.resolve();
    await batch;
    expect(markOpenPhase).toHaveBeenCalledWith("first-visible-wave-painted");
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
      isPrimaryPresentationOpening: () => true,
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
    // The reference owner is installed before the delayed non-reference job,
    // so its paint milestone must not be deferred until the whole batch ends.
    expect(markOpenPhase).toHaveBeenCalledWith("reference-clock-painted");
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
    const recordOpenWaveBatch = vi.fn();
    let now = 0;
    vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 10; return now; });
    const yieldForTest = vi.fn(async () => undefined);
    vi.stubGlobal("scheduler", { yield: yieldForTest });
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
      recordOpenWaveBatch,
      isPrimaryPresentationOpening: () => true,
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
    expect(recordOpenWaveBatch).toHaveBeenCalledWith(expect.objectContaining({
      skippedStaleBeforeRunCount: 1,
      cooperativeYieldCount: 0,
    }));
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
