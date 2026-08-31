import { describe, expect, it, vi } from "vitest";
import { createTimelineViewportRuntime, type TimelineViewportRuntimeContext } from "../../apps/editor/src/runtime/timeline-viewport-runtime.js";

function context(): TimelineViewportRuntimeContext {
  let zoom = 1;
  let scroll = { left: 0, top: 0 };
  return {
    dom: Object.fromEntries(["viewportRef", "waveformRef", "rulerRef", "gridRef", "overlayRef", "rangeBandRef", "playheadRef"].map((key) => [key, { current: null }])) as TimelineViewportRuntimeContext["dom"],
    geometry: { getDisplayTimeMapping: () => ({}), getTimeAxisGeometry: () => ({}), getLocalGeometryMap: () => ({}), sourceCycleToLocalX: (cycle) => cycle * 10, sourceBoundaryToLocalX: (cycle) => cycle * 10, localXToScreenX: (x) => x },
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
    runtime.setZoom(9);
    expect(runtimeContext.viewport.getZoom()).toBe(2);
    runtime.fitSelection(100, 300);
    expect(runtimeContext.viewport.getZoom()).toBe(2);
    expect(runtimeContext.render.requestRender).toHaveBeenCalled();
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
});
