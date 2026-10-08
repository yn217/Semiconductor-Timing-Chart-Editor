import { describe, expect, it, vi } from "vitest";
import { renderGeometryGrid } from "../../apps/editor/src/render-geometry-grid.js";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { canonicalFixture } from "../fixtures/canonical.js";
import { applyPublishedTimeAxisMetrics, publishZoomX, refreshGridPresentation, refreshRangeBandPresentation, refreshRulerAndGridIfNeeded, refreshTimelinePresentation, syncPresentationScale } from "../../apps/editor/src/runtime/timeline-presentation-refresh.js";
import { ViewMetricsOwner } from "../../apps/editor/src/runtime/view-metrics.js";

vi.mock("../../apps/editor/src/render-geometry-grid.js", () => ({ renderGeometryGrid: vi.fn() }));

describe("Open ruler/grid readiness", () => {
  it("keeps an empty-axis rebuild uninitialized so new timing geometry can recover it (#1102)", () => {
    const document = { ...canonicalFixture(), signals: [], signalGroups: [] };
    const element = () => ({ dataset: {}, style: { setProperty: vi.fn() }, closest: () => null, replaceChildren: vi.fn() }) as unknown as HTMLElement;
    const ruler = element();
    const viewport = Object.assign(element(), { clientWidth: 800, scrollLeft: 0 });
    const result = refreshTimelinePresentation({
      reason: "ruler", document, ruler, grid: element(), viewport,
      host: element(), rulerViewport: element(), geometryMaps: new Map(), geometrySvgs: new Map(),
      mappingCache: new DisplayTimeMappingCache(),
      metricsOwner: new ViewMetricsOwner({ leftPaneWidth: 200, frozenPaneWidth: 200, inspectorWidth: 300, viewportWidth: 800, zoom: 1 }),
      currentZoom: 1, previousScale: 1, rulerInitialized: true, timeAxis: { mode: "clockless" },
      totalHeight: 0, gridEnabled: false, cyclesPerTc: 10,
      markOpenPhase: vi.fn(), onPlayhead: vi.fn(), onRange: vi.fn(), onResize: vi.fn(),
    });
    expect(result.timeAxis.geometry).toBeUndefined();
    expect(result.rulerInitialized).toBe(false);
    const recover = vi.fn();
    refreshRulerAndGridIfNeeded(() => result.rulerInitialized, recover, vi.fn());
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild ruler and grid a second time after reference geometry initialized them", () => {
    const refreshRuler = vi.fn();
    const refreshGrid = vi.fn();

    refreshRulerAndGridIfNeeded(() => true, refreshRuler, refreshGrid);

    expect(refreshRuler).not.toHaveBeenCalled();
    expect(refreshGrid).not.toHaveBeenCalled();
  });

  it("initializes ruler and grid together when no reference geometry callback ran", () => {
    const refreshRuler = vi.fn();
    const refreshGrid = vi.fn();

    refreshRulerAndGridIfNeeded(() => false, refreshRuler, refreshGrid);

    expect(refreshRuler).toHaveBeenCalledTimes(1);
    expect(refreshGrid).toHaveBeenCalledTimes(1);
  });

  it("renders Grid from the published immutable TimeAxisMetrics generation", () => {
    const document = canonicalFixture();
    const clock = document.signals.find((signal) => signal.type === "clock")!;
    const mapping = new DisplayTimeMappingCache().get(document.timeline, document.timeGroups);
    const geometry = { signalId: clock.id, find: vi.fn() } as never;
    const timeAxis = { mode: "reference-clock" as const, ownerSignalId: clock.id, geometry };
    const metrics = Object.freeze({ generation: 7, timeAxis, mapping, presentationScale: 1.5, displayCycleCount: mapping.displayCycleCount });
    const grid = { closest: () => ({ dataset: { viewMode: "Cycle" } }) } as unknown as HTMLElement;

    refreshGridPresentation(grid, document, new Map([[clock.id, geometry]]), new DisplayTimeMappingCache(), true, 100, 800, 1, 10, metrics);

    expect(renderGeometryGrid).toHaveBeenCalledWith(grid, geometry, clock.id, true, 100, mapping, 800, 1.5, "reference-clock", 1, metrics);
  });

  it("repositions ruler boundaries and mounted Wave owners from the published generation", () => {
    const document = canonicalFixture();
    const mapping = new DisplayTimeMappingCache().get(document.timeline, [
      { id: "fold" as never, name: "Fold", start: 2, end: 4, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "2 cycles" } },
    ]);
    const tick = { dataset: { geometrySourceCycle: "4" }, style: { left: "stale" } };
    const marker = { dataset: { geometrySourceCycle: "6" }, style: { left: "stale" } };
    const owner = {
      tagName: "DIV",
      dataset: { renderedSourceWindowStart: "4", renderedSourceWindowEnd: "6" },
      style: { left: "stale", width: "stale" },
      querySelector: () => ({ viewBox: { baseVal: { width: 120 } } }),
    };
    const ruler = { querySelectorAll: (selector: string) => selector === "[data-geometry-source-cycle]" ? [tick, marker] : [], closest: () => undefined } as unknown as HTMLElement;
    const viewport = { querySelectorAll: (selector: string) => selector === "[data-wave-owner]" ? [owner] : [] } as unknown as HTMLElement;
    const metrics = Object.freeze({
      generation: 9,
      mapping,
      presentationScale: 1.5,
      pxPerDisplayCycle: 10,
      screenOriginX: 100,
      sourceBoundaryToContentX: (cycle: number) => 100 + (mapping.sourceToDisplay(cycle) ?? 0) * 10,
      displayBoundaryToContentX: (cycle: number) => 100 + cycle * 10,
    }) as never;

    applyPublishedTimeAxisMetrics(ruler, viewport, metrics);

    expect(tick.style.left).toBe("120px");
    expect(marker.style.left).toBe("140px");
    expect(owner.style.left).toBe("89.25px");
    expect(owner.style.width).toBe("180px");
  });

  it("reapplies TimeGroup outline start and end from the same published generation", () => {
    const outline = {
      dataset: { geometrySourceCycle: "2", geometryEndSourceCycle: "6" },
      style: { left: "stale", width: "stale" },
    };
    const ruler = { querySelectorAll: () => [outline], closest: () => undefined } as unknown as HTMLElement;
    const mapping = {
      sourceToDisplay: (cycle: number) => cycle,
      sourceCycleCount: 10,
    } as never;
    const metrics = Object.freeze({
      generation: 14,
      mapping,
      sourceBoundaryToContentX: (cycle: number) => 30 + cycle * 12,
    }) as never;

    applyPublishedTimeAxisMetrics(ruler, undefined, metrics);

    expect(outline.style.left).toBe("54px");
    expect(outline.style.width).toBe("48px");
  });

  it("projects both range boundaries and zoom from one captured metrics generation", () => {
    const element = () => ({ hidden: true, dataset: {} as Record<string, string>, style: {} as Record<string, string>, setAttribute: vi.fn() });
    const band = element();
    const rulerBand = element();
    const viewport = { querySelector: () => band, clientHeight: 0 } as unknown as HTMLElement;
    const ruler = { querySelector: () => rulerBand, querySelectorAll: () => [] } as unknown as HTMLElement;
    const metrics = Object.freeze({ generation: 12, zoom: 2 }) as never;
    const resolveBoundary = vi.fn((cycle: number, snapshot: { generation: number }) => cycle * (snapshot.generation === 12 ? 10 : 100));

    refreshRangeBandPresentation(viewport, ruler, {} as HTMLElement, true, undefined, { start: 2, end: 6 }, resolveBoundary, metrics, 5, 40);

    expect(resolveBoundary).toHaveBeenCalledWith(2, metrics);
    expect(resolveBoundary).toHaveBeenCalledWith(6, metrics);
    expect(band.style.left).toBe("45px");
    expect(band.style.width).toBe("80px");
    expect(rulerBand.style.left).toBe("20px");
    expect(rulerBand.style.width).toBe("40px");
  });
});

describe("Zoom counter-scale variable scope (#175)", () => {
  function fakeElement() {
    const values = new Map<string, string>();
    const style = { getPropertyValue: (name: string) => values.get(name) ?? "", setProperty: vi.fn((name: string, value: string) => { values.set(name, value); }) };
    return { style, values };
  }
  function fakeScope(matches: Record<string, ReturnType<typeof fakeElement>[]>) {
    const self = fakeElement();
    return { ...self, querySelectorAll: (selector: string) => Object.entries(matches).filter(([key]) => selector.includes(key)).flatMap(([, list]) => list).map((item) => ({ style: item.style })) };
  }

  it("publishes --zoom-x on ruler/overlay layers only, never on the viewport itself", () => {
    const ruler = fakeElement();
    const overlay = fakeElement();
    const viewport = fakeScope({ ".cycle-ruler": [ruler], "annotation-overlay-surface": [overlay] });
    publishZoomX(viewport as unknown as ParentNode, 2);
    expect(ruler.values.get("--zoom-x")).toBe("2");
    expect(overlay.values.get("--zoom-x")).toBe("2");
    expect(viewport.style.setProperty).not.toHaveBeenCalled();
    publishZoomX(viewport as unknown as ParentNode, 2);
    expect(ruler.style.setProperty).toHaveBeenCalledTimes(1);
  });

  it("keeps --presentation-x-scale on the host and gives wave text its own layer variable", () => {
    const waves = fakeElement();
    const overlay = fakeElement();
    const host = fakeScope({ "stable-waveform-surface": [waves], "annotation-overlay-surface": [overlay] });
    syncPresentationScale(host as unknown as HTMLElement, 1.5, 2);
    expect(host.values.get("--presentation-x-scale")).toBe("3");
    expect(host.values.has("--zoom-x")).toBe(false);
    expect(waves.values.get("--wave-label-x-scale")).toBe("3");
    expect(overlay.values.get("--zoom-x")).toBe("1.5");
  });
});
