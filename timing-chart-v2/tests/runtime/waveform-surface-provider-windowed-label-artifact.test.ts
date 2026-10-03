import { describe, expect, it, vi } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { ProductionWaveDromAdapter, toWaveJson, type WaveDromAdapter, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import { GeometryRegistry } from "../../apps/editor/src/runtime/geometry-registry.js";
import { createWaveformSurfaceProvider, type WaveformProviderContext } from "../../apps/editor/src/runtime/waveform-surface-provider.js";

/**
 * #175 vertical-scroll attribution: every bus row newly mounted by a 400px Cycle scroll step on perf_1000x1000 parsed its own
 * ~89 KB WaveDrom SVG image (~40 ms of IsolatedSVGDocumentHost per row on the main thread) because the bounded window received the
 * Signal's complete semantic-value history. Label binding is positional, so the history was misaligned with the window's `data`
 * and defeated the shared label-free artifact. Bounded bus rows with long-held values must share one artifact key.
 */
describe("bounded bus waveform semantic values", () => {
  it("are window-aligned so long-held bus rows share one WaveDrom artifact", async () => {
    const base = generatePerformanceDocument({ signalCount: 12, cycleCount: 1000 });
    const busTemplate = base.signals.find((signal) => signal.type === "bus");
    expect(busTemplate).toBeDefined();
    const busValues = (seed: number) => Array.from({ length: 4 }, (_, index) => ({ start: index * 300, value: `0x${(seed * 16 + index).toString(16).padStart(8, "0")}` }));
    const busIds = ["sig_window_bus_a", "sig_window_bus_b"];
    const document = {
      ...base,
      signals: [
        ...base.signals.filter((signal) => signal.type === "clock"),
        ...busIds.map((id, seed) => ({ ...busTemplate!, id, name: id, values: busValues(seed + 1) })),
      ],
    } as typeof base;
    const realAdapter = new ProductionWaveDromAdapter();
    const prepared: { waveJson: WaveJsonSignal; semanticValues: readonly string[] | undefined }[] = [];
    const adapter: WaveDromAdapter = {
      toWaveJson: (source) => toWaveJson(source),
      waveMarkupArtifactKey: (waveJson, semanticValues) => realAdapter.waveMarkupArtifactKey(waveJson, semanticValues),
      renderWave: vi.fn(async () => { throw new Error("Detached prepare/install should be used."); }),
      prepareWave: vi.fn(async (signalId, waveJson, _ownerDocument, semanticValues) => {
        prepared.push({ waveJson, semanticValues });
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
      isPrimaryPresentationOpening: () => false,
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    };
    const owner = () => ({ style: { removeProperty: vi.fn() }, dataset: {}, ownerDocument: {} as Document, isConnected: true }) as unknown as HTMLElement;
    const provider = createWaveformSurfaceProvider(context);
    // Window entirely inside the second held value (300..599) of each bus row.
    const sourceWindow = { start: 320, end: 580 };
    await provider.mountWaveBatch!(busIds.map((signalId) => ({ signalId: signalId as never, owner: owner(), documentEpoch: 1, sourceWindow })));

    expect(prepared).toHaveLength(2);
    for (const [seed, item] of prepared.entries()) {
      expect(item.waveJson.data).toHaveLength(1);
      // Positional label semantics: the one window label is the carried second value, not the Signal's first change.
      expect(item.semanticValues).toEqual([busValues(seed + 1)[1]!.value]);
    }
    const busKeys = prepared.map((item) => realAdapter.waveMarkupArtifactKey(item.waveJson, item.semanticValues));
    // Counter: two distinct-valued bounded bus rows -> exactly one WaveDrom artifact (one render / one SVG image parse).
    expect(new Set(busKeys).size).toBe(1);
  });
});
