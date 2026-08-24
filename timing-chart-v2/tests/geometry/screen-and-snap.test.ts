import { describe, expect, it } from "vitest";
import { DefaultScreenGeometryProjector, ImmutableSnapIndex } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";

const signalId = "sig_snap" as SignalId;

describe("Screen Geometry and snapping", () => {
  it("applies scroll and zoom only at the Screen Geometry boundary", () => {
    const projector = new DefaultScreenGeometryProjector();
    const point = projector.toScreen({ signalId, anchor: { signalId, cycle: 2, point: "rising-edge" }, point: { x: 120, y: 35 } }, { scrollX: 20, scrollY: 5, zoom: 1.5 });
    expect(point).toEqual({ x: 150, y: 45 });
  });

  it("returns the exact nearest semantic candidate inside tolerance", () => {
    const index = new ImmutableSnapIndex([
      { kind: "cycle-boundary", anchor: { signalId, cycle: 2, point: "cycle-start" }, point: { x: 100, y: 20 } },
      { kind: "signal-transition", anchor: { signalId, cycle: 2, point: "transition-center" }, point: { x: 104, y: 22 } },
    ]);
    expect(index.nearest({ x: 103, y: 22 }, 5)).toMatchObject({ kind: "signal-transition", distance: 1, anchor: { cycle: 2, point: "transition-center" } });
    expect(index.nearest({ x: 103, y: 22 }, 5, ["cycle-boundary"])).toMatchObject({ kind: "cycle-boundary" });
    expect(index.nearest({ x: 120, y: 40 }, 5)).toBeUndefined();
  });

  it("prefers richer semantic snap targets when exact points coincide", () => {
    const index = new ImmutableSnapIndex([
      { kind: "cycle-boundary", anchor: { signalId, cycle: 2, point: "cycle-start" }, point: { x: 100, y: 20 } },
      { kind: "clock-edge", anchor: { signalId, cycle: 2, point: "rising-edge" }, point: { x: 100, y: 20 } },
      { kind: "annotation", anchor: { signalId, cycle: 2, point: "rising-edge", offset: { x: 0, y: 0 } }, point: { x: 100, y: 20 }, ownerId: "ann_1" },
    ]);
    expect(index.nearest({ x: 100, y: 20 }, 1)).toMatchObject({ kind: "annotation", ownerId: "ann_1" });
    expect(index.nearest({ x: 100, y: 20 }, 1, undefined, ["cycle-boundary", "clock-edge"])).toMatchObject({ kind: "cycle-boundary" });
  });
});
