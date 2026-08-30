import { describe, expect, it } from "vitest";
import { calculateMiniMapViewportMetrics } from "../../apps/editor/src/runtime/minimap-viewport.js";

describe("MiniMap viewport projection", () => {
  it("normalizes vertical and horizontal scroll into bounded ratios", () => {
    expect(calculateMiniMapViewportMetrics({ scrollTop: 50, scrollHeight: 200, clientHeight: 100, scrollLeft: 20, scrollWidth: 120, clientWidth: 60 })).toEqual({ top: 0.5, ratio: 0.5, left: 1 / 3, width: 0.5 });
  });

  it("handles a fully visible viewport without negative positions", () => {
    expect(calculateMiniMapViewportMetrics({ scrollTop: 0, scrollHeight: 10, clientHeight: 100, scrollLeft: 0, scrollWidth: 10, clientWidth: 100 })).toEqual({ top: 0, ratio: 1, left: 0, width: 1 });
  });
});
