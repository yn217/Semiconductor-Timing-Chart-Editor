import { describe, expect, it, vi } from "vitest";
import { createTimelineViewportRuntime, type TimelineViewportRuntimeContext } from "../../apps/editor/src/runtime/timeline-viewport-runtime.js";

function context(): TimelineViewportRuntimeContext {
  let zoom = 1;
  let publishedZoom = 1;
  let scroll = { left: 0, top: 0 };
  return {
    dom: Object.fromEntries(["viewportRef", "waveformRef", "rulerRef", "gridRef", "overlayRef", "rangeBandRef", "playheadRef"].map((key) => [key, { current: null }])) as TimelineViewportRuntimeContext["dom"],
    geometry: { getTimeAxisMetrics: () => ({ zoom: publishedZoom, localXToSourceBoundary: (x: number) => Math.round(x / 10) }), getTimeAxisGeometry: () => ({}), getLocalGeometryMap: () => ({}), sourceCycleToLocalX: (cycle) => cycle * 10, sourceBoundaryToLocalX: (_document, cycle) => cycle * 10, requestSourceCycle: () => undefined, clearRequestedSourceCycle: () => undefined, localXToScreenX: (x) => x },
    viewport: { getMetrics: () => ({ width: 1000, leftInset: 100 }), getScrollState: () => scroll, setScrollState: (next) => { scroll = { ...scroll, ...next }; }, getZoom: () => zoom, setZoom: (next) => { zoom = next; } },
    document: { getSnapshot: () => ({}), getCanonicalRevision: () => 1, getDocumentEpoch: () => 1 },
    render: { requestRender: vi.fn(), requestOverlayRefresh: vi.fn(), waitForRendererIdle: async () => undefined },
    lifecycle: { isCurrentEpoch: () => true },
  };
}

describe("TimelineViewportRuntime", () => {
  it("owns bounded zoom and fit calculations without canonical mutation", () => {
    const runtimeContext = context();
    const runtime = createTimelineViewportRuntime(runtimeContext);
    runtime.attach();
    runtime.setZoom(9);
    expect(runtimeContext.viewport.getZoom()).toBe(8);
    runtime.fitSelection(100, 300);
    expect(runtimeContext.viewport.getZoom()).toBe(4.4);
    expect(runtimeContext.render.requestRender).toHaveBeenCalled();
  });

  it("does not schedule a second presentation pass for the same zoom", () => {
    const runtimeContext = context();
    const runtime = createTimelineViewportRuntime(runtimeContext);
    runtime.attach();

    runtime.setZoom(1);
    runtime.setZoom(1);

    expect(runtimeContext.render.requestRender).toHaveBeenCalledTimes(1);
  });

  it("republishes zoom when viewport state changed without updating TimeAxisMetrics", () => {
    const runtimeContext = context();
    const runtime = createTimelineViewportRuntime(runtimeContext);
    runtime.attach();
    runtime.setZoom(1);
    runtimeContext.viewport.setZoom(2);

    runtime.setZoom(2);

    expect(runtimeContext.render.requestRender).toHaveBeenCalledTimes(2);
  });

  it("drops refresh requests from a stale document epoch", () => {
    let current = 1;
    const runtimeContext = context();
    runtimeContext.lifecycle.isCurrentEpoch = (epoch) => epoch === current;
    const runtime = createTimelineViewportRuntime(runtimeContext);
    runtime.onDocumentEpochChanged(1);
    current = 2;
    runtime.refreshRuler();
    expect(runtimeContext.render.requestRender).not.toHaveBeenCalled();
  });

  it("drops a pending cycle reveal when the document epoch changes before renderer idle", async () => {
    let currentEpoch = 1;
    let resolveIdle!: () => void;
    const runtimeContext = context();
    runtimeContext.lifecycle.isCurrentEpoch = (epoch) => epoch === currentEpoch;
    runtimeContext.geometry.sourceBoundaryToLocalX = () => undefined;
    runtimeContext.geometry.requestSourceCycle = vi.fn();
    runtimeContext.geometry.clearRequestedSourceCycle = vi.fn();
    runtimeContext.viewport.setScrollState = vi.fn();
    runtimeContext.render.waitForRendererIdle = () => new Promise<void>((resolve) => { resolveIdle = resolve; });
    const runtime = createTimelineViewportRuntime(runtimeContext);
    runtime.attach();

    runtime.navigateToCycle(148);
    expect(runtimeContext.geometry.requestSourceCycle).toHaveBeenCalledWith(148);
    expect(runtimeContext.viewport.setScrollState).not.toHaveBeenCalled();

    currentEpoch = 2;
    runtime.onDocumentEpochChanged(2);
    resolveIdle();
    await Promise.resolve();

    expect(runtimeContext.viewport.setScrollState).not.toHaveBeenCalled();
    expect(runtimeContext.geometry.clearRequestedSourceCycle).not.toHaveBeenCalled();
  });

  it("uses the shared TimeAxisMetrics zoom for bookmark navigation", () => {
    const runtimeContext = context();
    runtimeContext.geometry.sourceBoundaryToLocalX = (_document, cycle) => cycle * 30;
    runtimeContext.geometry.getTimeAxisMetrics = () => ({ zoom: 2 });
    const setScrollState = vi.fn();
    runtimeContext.viewport.setScrollState = setScrollState;
    const runtime = createTimelineViewportRuntime(runtimeContext);
    runtime.attach();

    runtime.navigateToCycle(10);

    expect(setScrollState).toHaveBeenCalledWith({ left: 250 });
  });

  it("maps cursor content X with the immutable metrics inverse and the same zoom snapshot", () => {
    const runtimeContext = context();
    const inverse = vi.fn((x: number) => Math.round(x / 10));
    runtimeContext.geometry.getTimeAxisMetrics = () => ({ zoom: 2, localXToSourceBoundary: inverse });
    const runtime = createTimelineViewportRuntime(runtimeContext);
    runtime.attach();

    expect(runtime.screenXToSourceCycle(80)).toBe(4);
    expect(inverse).toHaveBeenCalledWith(40, { clamp: true });
  });
});
