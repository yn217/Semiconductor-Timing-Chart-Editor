import { describe, expect, it } from "vitest";
import { clampLegendToVisibleSurface, legendContainingBlockOffset, legendLocalPointFromClient } from "../../apps/editor/src/legend-geometry.js";

describe("Legend document-overlay geometry", () => {
  it("converts pointer coordinates through the visible document origin and scroll", () => {
    expect(legendLocalPointFromClient(
      { x: 420, y: 310 },
      { left: 265, top: 90, scrollLeft: 120, scrollTop: 40 },
    )).toEqual({ x: 275, y: 260 });
  });

  it("projects canonical overlay coordinates into the scrolled absolute-position containing block", () => {
    const offset = legendContainingBlockOffset(
      { x: 265, y: 224 },
      { x: 265, y: 224 },
      { x: 0, y: 148 },
    );
    expect(offset).toEqual({ x: 0, y: -148 });
    const renderedTop = 224 + offset.y + 148;
    expect(renderedTop).toBe(224);
  });

  it("clamps the whole Legend into the visible document area, excluding fixed panes", () => {
    const surface = { scrollLeft: 120, scrollTop: 40, clientWidth: 800, clientHeight: 500 };
    expect(clampLegendToVisibleSurface({ x: -20, y: 15 }, { width: 180, height: 60 }, surface)).toEqual({ x: 120, y: 40 });
    expect(clampLegendToVisibleSurface({ x: 1500, y: 900 }, { width: 180, height: 60 }, surface)).toEqual({ x: 740, y: 480 });
  });

  it("keeps an oversized Legend anchored to the visible surface origin", () => {
    expect(clampLegendToVisibleSurface(
      { x: 900, y: 700 },
      { width: 900, height: 700 },
      { scrollLeft: 20, scrollTop: 10, clientWidth: 600, clientHeight: 300 },
    )).toEqual({ x: 20, y: 10 });
  });
});
