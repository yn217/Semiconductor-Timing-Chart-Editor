import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap, uniformCycleBoundaryEntries, WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";

describe("uniformCycleBoundaryEntries (#755, renderer-independent cycle grid)", () => {
  const entries = uniformCycleBoundaryEntries({ sourceCycles: [0, 1, 2, 3], originX: WAVEDROM_ORIGIN_X, cycleWidth: WAVEDROM_CYCLE_WIDTH, rowY: 15 });
  const map = new ImmutableLocalGeometryMap("sig" as SignalId, entries, []);

  it("places cycle boundaries at origin + index * cycle width", () => {
    expect(map.find({ signalId: "sig" as SignalId, cycle: 2, point: "cycle-start" })?.point.x).toBe(100.5);
    expect(map.find({ signalId: "sig" as SignalId, cycle: 2, point: "cycle-end" })?.point.x).toBe(140.5);
    expect(map.find({ signalId: "sig" as SignalId, cycle: 1, point: "cycle-center" })?.point.x).toBe(80.5);
  });

  it("publishes the terminal boundary as a resolvable cycle-start", () => {
    expect(map.find({ signalId: "sig" as SignalId, cycle: 3, point: "cycle-start" })?.point.x).toBe(140.5);
  });

  it("uses the supplied source-cycle mapping (windows and folds), not local indices", () => {
    const windowed = new ImmutableLocalGeometryMap("sig" as SignalId, uniformCycleBoundaryEntries({ sourceCycles: [500, 501, 502], originX: 20.5, cycleWidth: 40, rowY: 0 }), []);
    expect(windowed.find({ signalId: "sig" as SignalId, cycle: 501, point: "cycle-start" })?.point.x).toBe(60.5);
    expect(windowed.find({ signalId: "sig" as SignalId, cycle: 1, point: "cycle-start" })).toBeUndefined();
  });
});
