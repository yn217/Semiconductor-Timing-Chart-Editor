import { describe, expect, it } from "vitest";
import { waveOwnerPlacement } from "../../apps/editor/src/runtime/wave-owner-placement.js";

describe("wave owner placement", () => {
  it("uses the captured TimeAxisMetrics boundary and scale instead of mixed scalar inputs", () => {
    const metrics = {
      presentationScale: 2,
      pxPerDisplayCycle: 40,
      displayBoundaryToContentX: (displayCycle: number) => 20.5 + displayCycle * 40,
    };
    const placement = waveOwnerPlacement({
      displayStart: 2,
      displayEnd: 6,
      pxPerDisplayCycle: 700,
      waveOriginPx: 900,
      presentationScale: 9,
      viewBoxWidth: 160,
      metrics,
    });

    expect(placement).toEqual({ left: 59.5, width: 320 });
  });
});
