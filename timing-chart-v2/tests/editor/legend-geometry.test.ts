import { describe, expect, it } from "vitest";
import { clampLegendToVisibleViewport, legendLocalPointFromClient, legendVisibleClientHeight } from "../../apps/editor/src/legend-geometry.js";

describe("Legend viewport coordinates", () => {
  it("converts client coordinates into the absolute-position containing block including scroll", () => {
    expect(legendLocalPointFromClient(
      { x: 420, y: 310 },
      { left: 265, top: 90, scrollLeft: 120, scrollTop: 40 },
    )).toEqual({ x: 275, y: 260 });
  });

  it("bounds the Cycle canvas above the Bottom panel and its horizontal scrollbar", () => {
    expect(legendVisibleClientHeight(204, 694, 831, 250, 430)).toBe(226);
  });

  it("bounds Combined Legend coordinates to the lower Cycle pane, not the outer stacked viewport", () => {
    const visibleHeight = legendVisibleClientHeight(372, 444, 592, 0, 429);
    expect(visibleHeight).toBe(57);
    expect(clampLegendToVisibleViewport(
      { x: 501, y: 202 },
      { width: 216, height: 24 },
      { left: 265, top: 372, scrollLeft: 0, scrollTop: 0, clientWidth: 717, clientHeight: visibleHeight },
    )).toEqual({ x: 501, y: 33 });
  });

  it("keeps a dragged Legend wholly inside the visible viewport instead of under editor chrome", () => {
    const viewport = { left: 265, top: 90, scrollLeft: 120, scrollTop: 40, clientWidth: 800, clientHeight: 500 };
    expect(clampLegendToVisibleViewport({ x: -20, y: 15 }, { width: 180, height: 60 }, viewport)).toEqual({ x: 120, y: 40 });
    expect(clampLegendToVisibleViewport({ x: 1500, y: 900 }, { width: 180, height: 60 }, viewport)).toEqual({ x: 740, y: 480 });
  });
});
