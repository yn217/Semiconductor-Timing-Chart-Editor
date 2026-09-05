import { describe, expect, it } from "vitest";
import { annotationOffsetDeltaFromScreen, withSnapOffset } from "../../apps/editor/src/runtime/anchor-offset.js";
import type { SignalId } from "@timing-chart-v2/schema";

const anchor = { signalId: "sig_data" as SignalId, cycle: 2, point: "cycle-start" as const };

describe("annotation interaction offset conversion", () => {
  it("converts the scaled X drag while keeping layout Y in screen units", () => {
    expect(annotationOffsetDeltaFromScreen({ x: 15, y: 8 }, 1.5)).toEqual({ x: 10, y: 8 });
  });

  it("stores the residual after a scaled snap in canonical offset units", () => {
    expect(withSnapOffset(anchor, { x: 115, y: 28 }, { x: 100, y: 20 }, 1.5)).toEqual({
      ...anchor,
      offset: { x: 10, y: 8 },
    });
  });

  it("rejects an invalid presentation scale before mutating an anchor", () => {
    expect(() => annotationOffsetDeltaFromScreen({ x: 1, y: 1 }, 0)).toThrow("presentation scale");
  });
});
