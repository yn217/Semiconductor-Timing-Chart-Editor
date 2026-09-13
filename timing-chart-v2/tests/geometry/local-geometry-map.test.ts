import { describe, expect, it } from "vitest";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";

const signalId = "sig_geometry" as SignalId;

describe("Immutable Local Geometry Map", () => {
  it("resolves stable signal/cycle/point identity", () => {
    const map = new ImmutableLocalGeometryMap(signalId, [{ cycle: 3, point: "rising-edge", position: { x: 42, y: 10 } }]);
    expect(map.find({ signalId, cycle: 3, point: "rising-edge" })).toMatchObject({ signalId, point: { x: 42, y: 10 } });
    expect(map.find({ signalId, cycle: 3, point: "falling-edge" })).toBeUndefined();
  });

  it("rejects a different or missing signal owner", () => {
    const map = new ImmutableLocalGeometryMap(signalId, [{ cycle: 0, point: "cycle-start", position: { x: 0, y: 10 } }]);
    expect(map.find({ signalId: "sig_other" as SignalId, cycle: 0, point: "cycle-start" })).toBeUndefined();
    expect(map.find({ cycle: 0, point: "cycle-start" })).toBeUndefined();
  });

  it("applies persisted pixel offset without mutating base geometry", () => {
    const map = new ImmutableLocalGeometryMap(signalId, [{ cycle: 1, point: "value-start", position: { x: 20, y: 10 } }]);
    expect(map.find({ signalId, cycle: 1, point: "value-start", offset: { x: 3, y: -4 } })?.point).toEqual({ x: 23, y: 6 });
    expect(map.find({ signalId, cycle: 1, point: "value-start" })?.point).toEqual({ x: 20, y: 10 });
  });

  it("resolves semantic threshold anchors independently of pixel offsets", () => {
    const map = new ImmutableLocalGeometryMap(signalId, [
      { cycle: 2, point: "transition-center", threshold: 0.3, position: { x: 50, y: 14 } },
      { cycle: 2, point: "transition-center", threshold: 0.7, position: { x: 50, y: 26 } },
    ]);
    expect(map.find({ signalId, cycle: 2, point: "transition-center", threshold: 0.3 })?.point).toEqual({ x: 50, y: 14 });
    expect(map.find({ signalId, cycle: 2, point: "transition-center", threshold: 0.7 })?.point).toEqual({ x: 50, y: 26 });
  });

  it("exposes every semantic cycle boundary independently of edge entries", () => {
    const map = new ImmutableLocalGeometryMap(signalId, [
      { cycle: 0, point: "cycle-start", position: { x: 0, y: 0 } },
      { cycle: 1, point: "cycle-start", position: { x: 12, y: 0 } },
      { cycle: 2, point: "cycle-start", position: { x: 27, y: 0 } },
      { cycle: 2, point: "rising-edge", position: { x: 27, y: 4 } },
    ]);
    expect(map.cycleBoundaryEntries?.().map((entry) => [entry.cycle, entry.position.x])).toEqual([[0, 0], [1, 12], [2, 27]]);
    expect(map.edgeEntries?.()).toHaveLength(1);
  });

  it("resolves arbitrary explicit transition values through the geometry-owned resolver", () => {
    const map = new ImmutableLocalGeometryMap(signalId, [], [{ cycle: 2, point: "transition-center", resolve: (fraction) => ({ x: fraction * 100, y: 20 + fraction * 10 }) }]);
    expect(map.find({ signalId, cycle: 2, point: "transition-center", transition: { kind: "ratio", value: 0.17 } })?.point).toEqual({ x: 17, y: 21.7 });
  });
});
