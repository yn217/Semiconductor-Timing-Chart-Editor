import { describe, expect, it } from "vitest";
import { applyTimelineZoom, type TimelineZoomSurfaceContext } from "../../apps/editor/src/runtime/viewport-controller.js";

// #417 (Codex's fix): applyTimelineZoom's syncRulerScroll now reads
// `getComputedStyle(ruler).transform` to recover the ruler's current
// untransformed layout origin -- this test file runs in a non-browser
// (Node) vitest environment with no such global. Stub only if absent, so
// this file keeps working unmodified if it's ever run under a DOM
// environment that already provides a real one.
(globalThis as unknown as { getComputedStyle?: (element: Element) => CSSStyleDeclaration }).getComputedStyle ??= () => ({ transform: "none" }) as CSSStyleDeclaration;

function styleProbe() {
  let origin = "";
  let originWrites = 0;
  const style = {
    get transformOrigin() { return origin; },
    set transformOrigin(value: string) { originWrites += 1; origin = value; },
    scale: "",
    setProperty: () => undefined,
  } as unknown as CSSStyleDeclaration;
  return { style, get originWrites() { return originWrites; } };
}

function elementWithStyle(style: CSSStyleDeclaration): HTMLElement {
  const rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  return {
    style,
    dataset: {},
    querySelector: () => null,
    // #417 (Codex's fix): applyTimelineZoom now calls syncRulerScroll
    // unconditionally, which reads real layout geometry (getBoundingClientRect,
    // getComputedStyle().transform, parentElement, scrollLeft) to keep the
    // ruler continuously aligned to the actual rendered scale rather than a
    // one-time frozen value. These focused unit tests exercise
    // applyTimelineZoom's own scale/origin/width bookkeeping in a
    // non-browser environment (no real layout to measure), so the mock
    // elements need enough of a stub surface for that geometry read to
    // complete as a no-op rather than throw.
    getBoundingClientRect: () => rect,
    parentElement: null,
    scrollLeft: 0,
    // d8c45098 (MiniMap resync-after-zoom fix): applyTimelineZoom now
    // dispatches a "timeline-viewport-resize" event on the viewport after
    // writing its width, since scroll-width changes aren't observable
    // through ResizeObserver on the viewport itself. No-op stub for the
    // same reason as the geometry reads above.
    dispatchEvent: () => true,
  } as unknown as HTMLElement;
}

describe("applyTimelineZoom", () => {
  it("initializes transform origins once while updating view-only scale each time", () => {
    const scalable = styleProbe();
    const ruler = styleProbe();
    const viewport = elementWithStyle(styleProbe().style);
    const chart = elementWithStyle(styleProbe().style);
    let hostQueries = 0;
    const host = { ...elementWithStyle(styleProbe().style), querySelector: () => { hostQueries += 1; return chart; } } as unknown as HTMLElement;
    const context = {
      rendererHost: host,
      timingSurface: chart,
      viewport,
      ruler: elementWithStyle(ruler.style),
      scalable: [elementWithStyle(scalable.style)],
      leftPaneWidth: 0,
      frozenPaneWidth: 0,
      inspectorWidth: 0,
      viewportWidth: 800,
      timelineOffset: 0,
      onPresentationScale: () => undefined,
      onSyncFrozenColumns: () => undefined,
      onZoom: () => undefined,
    } satisfies TimelineZoomSurfaceContext;

    expect(applyTimelineZoom(1.1, context)).toBe(1.1);
    expect(applyTimelineZoom(1.2, context)).toBe(1.2);
    expect(scalable.originWrites).toBe(1);
    expect(ruler.originWrites).toBe(1);
    expect(scalable.style.scale).toBe("1.2 1");
    expect(hostQueries).toBe(0);
  });

  it("clamps programmatic zoom to the shared 800% ceiling", () => {
    const context = {
      rendererHost: elementWithStyle(styleProbe().style),
      timingSurface: elementWithStyle(styleProbe().style),
      viewport: elementWithStyle(styleProbe().style),
      ruler: elementWithStyle(styleProbe().style),
      scalable: [],
      leftPaneWidth: 0,
      frozenPaneWidth: 0,
      inspectorWidth: 0,
      viewportWidth: 800,
      timelineOffset: 0,
      onPresentationScale: () => undefined,
      onSyncFrozenColumns: () => undefined,
      onZoom: () => undefined,
    } satisfies TimelineZoomSurfaceContext;

    expect(applyTimelineZoom(9, context)).toBe(8);
  });
});
