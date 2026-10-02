import { describe, expect, it, vi } from "vitest";
import { renderGeometryGrid } from "../../apps/editor/src/render-geometry-grid.js";
import { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import { canonicalFixture } from "../fixtures/canonical.js";
import { refreshGridPresentation, refreshRangeBandPresentation, refreshRulerAndGridIfNeeded } from "../../apps/editor/src/runtime/timeline-presentation-refresh.js";

vi.mock("../../apps/editor/src/render-geometry-grid.js", () => ({ renderGeometryGrid: vi.fn() }));

describe("Open ruler/grid readiness", () => {
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

    expect(renderGeometryGrid).toHaveBeenCalledWith(grid, geometry, clock.id, true, 100, mapping, 800, 1.5, "reference-clock", 1);
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
