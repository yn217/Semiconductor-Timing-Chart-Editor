import { describe, expect, it } from "vitest";
import { clampCursorToCycleCount } from "../../apps/editor/src/workspace/use-workspace-ui-state.js";

describe("cursor clamp to the current timeline", () => {
  it("pulls a cursor past the new last cycle back to it", () => {
    expect(clampCursorToCycleCount(50, 10)).toBe(9);
  });

  it("leaves in-range, unset and unknown-length cursors alone", () => {
    expect(clampCursorToCycleCount(3, 10)).toBe(3);
    expect(clampCursorToCycleCount(undefined, 10)).toBeUndefined();
    expect(clampCursorToCycleCount(7, undefined)).toBe(7);
  });

  it("holds a cursor at cycle 0 on a single-cycle timeline", () => {
    expect(clampCursorToCycleCount(5, 1)).toBe(0);
    expect(clampCursorToCycleCount(5, 0)).toBe(0);
  });
});

/** A non-DOM stand-in for the viewport: the zoom controller only reads and writes these few fields. */
function fakeViewport(scrollLeft: number) {
  return {
    scrollLeft,
    scrollWidth: 3000,
    clientWidth: 800,
    style: { setProperty: () => undefined, getPropertyValue: () => "" },
    dataset: {},
    dispatchEvent: () => true,
  } as unknown as HTMLElement & { scrollLeft: number };
}

function fakeZoomContext(viewport: HTMLElement): TimelineZoomSurfaceContext {
  const style = { setProperty: () => undefined, transformOrigin: "0 0", scale: "", translate: "", transform: "" } as unknown as CSSStyleDeclaration;
  const element = { style, dataset: {}, parentElement: null } as unknown as HTMLElement;
  return {
    rendererHost: { ...element, isConnected: true } as unknown as HTMLElement,
    timingSurface: element,
    viewport,
    ruler: element,
    scalable: [],
    leftPaneWidth: 0,
    frozenPaneWidth: 0,
    inspectorWidth: 0,
    viewportWidth: 800,
    timelineOffset: 0,
    onPresentationScale: () => undefined,
    onZoom: () => undefined,
  };
}
