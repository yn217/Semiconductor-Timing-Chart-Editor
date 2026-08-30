import { describe, expect, it } from "vitest";
import { calculateMiniMapViewportMetrics } from "../../apps/editor/src/runtime/minimap-viewport.js";
import { pointerRatio } from "../../apps/editor/src/minimap.js";

describe("MiniMap viewport projection", () => {
  it("normalizes vertical and horizontal scroll into bounded ratios", () => {
    expect(calculateMiniMapViewportMetrics({ scrollTop: 50, scrollHeight: 200, clientHeight: 100, scrollLeft: 20, scrollWidth: 120, clientWidth: 60 })).toEqual({ top: 0.5, ratio: 0.5, left: 1 / 3, width: 0.5 });
  });

  it("handles a fully visible viewport without negative positions", () => {
    expect(calculateMiniMapViewportMetrics({ scrollTop: 0, scrollHeight: 10, clientHeight: 100, scrollLeft: 0, scrollWidth: 10, clientWidth: 100 })).toEqual({ top: 0, ratio: 1, left: 0, width: 1 });
  });

  it("keeps pointer pan finite when the minimap has no layout size", () => {
    expect(pointerRatio(10, 0, 0)).toBe(0);
    expect(pointerRatio(10, 0, Number.NaN)).toBe(0);
    expect(pointerRatio(25, 0, 100)).toBe(0.25);
  });
});
