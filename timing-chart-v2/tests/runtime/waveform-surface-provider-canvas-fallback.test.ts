import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { GeometryRegistry } from "../../apps/editor/src/runtime/geometry-registry.js";
import { createWaveformSurfaceProvider, type WaveformProviderContext } from "../../apps/editor/src/runtime/waveform-surface-provider.js";
import type { WaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";

describe("Canvas renderer capability fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the normative WaveDrom adapter for a period clock even when Canvas is forced", async () => {
    vi.stubGlobal("location", { search: "?wave=canvas" });
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({}) }) });
    const document = generatePerformanceDocument({ signalCount: 1, cycleCount: 8 });
    const signalId = document.timeline.referenceClock!;
    const owner = {
      dataset: {},
      style: { removeProperty: vi.fn() },
      isConnected: true,
      ownerDocument: {},
      replaceChildren: vi.fn(),
    } as unknown as HTMLElement;
    const rendered = { signalId, ownerKey: signalId, svg: {} as SVGSVGElement, renderIndex: 0, waveJson: { wave: "01", period: 2 } };
    const adapter: WaveDromAdapter = {
      toWaveJson: () => rendered.waveJson,
      renderWave: vi.fn(async () => rendered),
      prepareWave: vi.fn(async () => rendered),
      installWave: vi.fn((wave) => wave),
      extractLocalGeometry: vi.fn(() => { throw new Error("Analytic geometry should be used."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 1, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 1, mounts: 1, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 1, allocatedRenderIndices: 1 }),
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

    const result = await createWaveformSurfaceProvider(context).mountWaveBatch!([{ signalId, owner, documentEpoch: 1 }]);

    expect(result[0]?.result).toMatchObject({ waveDromRenders: 1, localGeometryBuilds: 1 });
    expect(adapter.prepareWave).toHaveBeenCalledOnce();
    expect(adapter.installWave).toHaveBeenCalledOnce();
    expect(owner.replaceChildren).not.toHaveBeenCalled();
    expect(owner.dataset.waveRenderer).toBe("svg");
    expect(owner.dataset.waveState).toBe("ready");
  });

  it("disposes a mounted Canvas artifact when its Signal owner is evicted", async () => {
    vi.stubGlobal("location", { search: "?wave=canvas" });
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({}) }) });
    const document = generatePerformanceDocument({ signalCount: 1, cycleCount: 8 });
    const signalId = document.timeline.referenceClock!;
    const context2d = {
      save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      rect: vi.fn(), clip: vi.fn(), closePath: vi.fn(), fillText: vi.fn(), stroke: vi.fn(),
      strokeStyle: "", fillStyle: "", lineWidth: 0, font: "", textBaseline: "", textAlign: "",
    };
    const canvas = { setAttribute: vi.fn(), width: 0, height: 0, style: { cssText: "", width: "", left: "" }, getContext: () => context2d } as unknown as HTMLCanvasElement;
    const owner = {
      dataset: {}, style: { removeProperty: vi.fn() }, isConnected: true,
      ownerDocument: { createElement: vi.fn(() => canvas) }, replaceChildren: vi.fn(), contains: () => true,
      closest: vi.fn(() => null), getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 30 }),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    const adapter: WaveDromAdapter = {
      toWaveJson: () => ({ wave: "0101" }),
      renderWave: vi.fn(async () => { throw new Error("Canvas should be used."); }),
      prepareWave: vi.fn(async () => { throw new Error("Canvas should be used."); }),
      installWave: vi.fn((wave) => wave),
      extractLocalGeometry: vi.fn(() => { throw new Error("Analytic geometry should be used."); }),
      geometryMetrics: () => ({ last: undefined, totalDurationMs: 0, totalUsesVisited: 0, totalGeometryEntriesEmitted: 0, totalDuplicateKeyChecks: 0, totalDuplicateKeyCollisions: 0, totalTransitionBrickLookups: 0, totalSkinPathParses: 0, totalMatrixReads: 0 }),
      dispose: vi.fn(),
      metrics: () => ({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 1, allocatedRenderIndices: 0 }),
    };
    const provider = createWaveformSurfaceProvider({
      sessionController: { snapshot: () => ({ document, revision: 0 }) },
      getDocumentEpoch: () => 1,
      mappingCache: new DisplayTimeMappingCache(),
      adapter,
      geometryRegistry: new GeometryRegistry(),
      markOpenPhase: vi.fn(),
      invalidateSnapIndex: vi.fn(),
      getViewMode: () => "Cycle",
    });

    await provider.mountWaveBatch!([{ signalId, owner, documentEpoch: 1 }]);
    expect(owner.dataset.waveRenderer).toBe("canvas");
    expect(owner.dataset.waveState).toBe("ready");
    provider.disposeWave(signalId);
    expect(owner.removeEventListener).toHaveBeenCalledWith("wave-canvas-restyle", expect.any(Function));
    expect(adapter.dispose).toHaveBeenCalledWith(signalId);
    expect(owner.dataset.waveRenderer).toBeUndefined();
  });
});
