import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap, OffsetLocalGeometryMap, UniformCycleLocalGeometryMap, uniformCycleBoundaryEntries, WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X } from "@timing-chart-v2/geometry";
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

describe("UniformCycleLocalGeometryMap (#755, allocation-free equivalent of the entry-based map)", () => {
  const id = "sig" as SignalId;
  const points = ["cycle-start", "cycle-center", "value-center", "row-center", "cycle-end", "rising-edge"] as const;
  for (const sourceCycles of [[0, 1, 2, 3, 4], [500, 501, 502, 503], [0, 1, 4, 5, 9]]) {
    it(`answers every anchor exactly like ImmutableLocalGeometryMap for source cycles ${sourceCycles.join(",")}`, () => {
      const input = { sourceCycles, originX: 20.5, cycleWidth: 40, rowY: 15 };
      const eager = new ImmutableLocalGeometryMap(id, uniformCycleBoundaryEntries(input), []);
      const lazy = new UniformCycleLocalGeometryMap(id, input);
      for (const cycle of [-1, ...sourceCycles, sourceCycles[sourceCycles.length - 1]! + 1, 2]) {
        for (const point of points) {
          for (const offset of [undefined, { x: 3, y: -2 }]) {
            const anchor = { signalId: id, cycle, point, ...(offset ? { offset } : {}) } as never;
            expect(lazy.find(anchor)?.point).toEqual(eager.find(anchor)?.point);
          }
        }
      }
      expect(lazy.cycleBoundaryEntries().map((entry) => [entry.cycle, entry.position.x])).toEqual(eager.cycleBoundaryEntries().map((entry) => [entry.cycle, entry.position.x]));
      expect(lazy.find({ signalId: "other" as SignalId, cycle: sourceCycles[0]!, point: "cycle-start" } as never)).toBeUndefined();
    });
  }
});

describe("OffsetLocalGeometryMap (#757, window-relative -> document-absolute X)", () => {
  const id = "sig" as SignalId;
  const inner = new UniformCycleLocalGeometryMap(id, { sourceCycles: [500, 501, 502], originX: 20.5, cycleWidth: 40, rowY: 15 });
  const shifted = new OffsetLocalGeometryMap(inner, 500 * 40);
  it("shifts every anchor and entry by the window display offset and never mutates the inner map", () => {
    expect(inner.find({ signalId: id, cycle: 501, point: "cycle-start" })?.point.x).toBe(60.5);
    expect(shifted.find({ signalId: id, cycle: 501, point: "cycle-start" })?.point.x).toBe(20_060.5);
    expect(shifted.find({ signalId: id, cycle: 501, point: "cycle-start" })?.point.y).toBe(15);
    expect(shifted.cycleBoundaryEntries().map((entry) => entry.position.x)).toEqual([20_020.5, 20_060.5, 20_100.5]);
    expect(shifted.edgeEntries()).toEqual([]);
    expect(shifted.find({ signalId: id, cycle: 9, point: "cycle-start" })).toBeUndefined();
  });
});
