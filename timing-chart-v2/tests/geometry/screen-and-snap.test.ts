import { describe, expect, it } from "vitest";
import { DefaultScreenGeometryProjector, ImmutableLocalGeometryMap, ImmutableSnapIndex, resolveTimeAxisGeometry, SemanticSnapCandidateService } from "@timing-chart-v2/geometry";
import type { SignalId, TimeGroupId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const signalId = "sig_snap" as SignalId;

describe("Screen Geometry and snapping", () => {
  it("resolves the first actually rendered axis owner without a Clock", () => {
    const source = canonicalFixture();
    const hiddenFirst = { ...source.signals[0]!, display: { ...source.signals[0]!.display, visible: false } };
    const owner = source.signals[1]!;
    const document = { ...source, timeline: { ...source.timeline, referenceClock: undefined }, signals: [hiddenFirst, owner] };
    const map = new ImmutableLocalGeometryMap(owner.id, [{ cycle: 0, point: "cycle-start", position: { x: 0, y: 0 } }]);
    expect(resolveTimeAxisGeometry(document, new Map([[owner.id, map]]))).toMatchObject({ mode: "clockless", ownerSignalId: owner.id, geometry: map });
  });
  it("applies scroll and zoom only at the Screen Geometry boundary", () => {
    const projector = new DefaultScreenGeometryProjector();
    const point = projector.toScreen({ signalId, anchor: { signalId, cycle: 2, point: "rising-edge" }, point: { x: 120, y: 35 } }, { scrollX: 20, scrollY: 5, zoom: 1.5 });
    expect(point).toEqual({ x: 150, y: 45 });
    expect(projector.fromScreen(point, { scrollX: 20, scrollY: 5, zoom: 1.5 })).toEqual({ x: 120, y: 35 });
  });

  it.each([0.5, 1, 1.5, 2])("round-trips local coordinates at %sx zoom", (zoom) => {
    const projector = new DefaultScreenGeometryProjector();
    const local = { signalId, anchor: { signalId, cycle: 2, point: "rising-edge" as const }, point: { x: 120, y: 35 } };
    const transform = { scrollX: 17, scrollY: 9, zoom };
    expect(projector.fromScreen(projector.toScreen(local, transform), transform)).toEqual(local.point);
  });

  it("returns the exact nearest semantic candidate inside tolerance", () => {
    const index = new ImmutableSnapIndex([
      { kind: "cycle-boundary", anchor: { signalId, cycle: 2, point: "cycle-start" }, point: { x: 100, y: 20 } },
      { kind: "signal-transition", anchor: { signalId, cycle: 2, point: "transition-center" }, point: { x: 104, y: 22 } },
    ]);
    expect(index.nearest({ x: 103, y: 22 }, 5)).toMatchObject({ kind: "signal-transition", distance: 1, anchor: { cycle: 2, point: "transition-center" } });
    expect(index.nearest({ x: 103, y: 22 }, 5, ["cycle-boundary"])).toMatchObject({ kind: "cycle-boundary" });
    expect(index.nearest({ x: 120, y: 40 }, 5)).toBeUndefined();
    expect(index.metrics()).toEqual({ queries: 3, candidatesVisited: 6 });
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

  it("exposes the exclusive terminal boundary from WaveDrom local geometry", () => {
    const document = canonicalFixture();
    const signal = document.signals.find((item) => item.type !== "commentRow")!;
    const map = new ImmutableLocalGeometryMap(signal.id, [{ cycle: document.timeline.cycleCount, point: "cycle-start", position: { x: 240, y: 0 } }]);
    const index = new SemanticSnapCandidateService().build({ document, geometryMaps: new Map([[signal.id, map]]), rowY: new Map([[signal.id, 0]]) });
    expect(index.nearest({ x: 240, y: 0 }, 1, ["cycle-boundary"])).toMatchObject({ anchor: { cycle: document.timeline.cycleCount, point: "cycle-start" } });
  });

  it("keeps folded snap candidates in canonical source-cycle coordinates", () => {
    const source = canonicalFixture();
    const document = {
      ...source,
      timeGroups: [{ id: "time_fold" as TimeGroupId, name: "Fold", start: 2, end: 4, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "GAP" } }],
    };
    const signal = document.signals[0]!;
    const map = new ImmutableLocalGeometryMap(signal.id, Array.from({ length: 7 }, (_, cycle) => ({ cycle, point: "cycle-start" as const, position: { x: cycle * 10, y: 0 } })));
    const sourceByRendered = [0, 1, 4, 5, 6, 7, 8];
    const renderedBySource = new Map(sourceByRendered.map((sourceCycle, renderedCycle) => [sourceCycle, renderedCycle]));
    const index = new SemanticSnapCandidateService().build({
      document,
      geometryMaps: new Map([[signal.id, map]]),
      rowY: new Map([[signal.id, 0]]),
      renderedCycleCount: 6,
      sourceCycleForRenderedCycle: (cycle) => sourceByRendered[cycle],
      renderedCycleForSourceCycle: (cycle) => renderedBySource.get(cycle),
    });
    expect(index.nearest({ x: 20, y: 0 }, 1, ["cycle-boundary"])).toMatchObject({ anchor: { cycle: 4, point: "cycle-start" } });
    expect(index.entries().some((candidate) => candidate.anchor.cycle === 2 || candidate.anchor.cycle === 3)).toBe(false);
  });

  it("builds only against the currently projected viewport rows", () => {
    const source = canonicalFixture();
    const stale = source.signals[0]!;
    const current = source.signals[1]!;
    const staleMap = new ImmutableLocalGeometryMap(stale.id, [{ cycle: 0, point: "row-center", position: { x: 10, y: 0 } }]);
    const currentMap = new ImmutableLocalGeometryMap(current.id, [{ cycle: 0, point: "row-center", position: { x: 110, y: 0 } }]);
    const service = new SemanticSnapCandidateService();
    const index = service.build({
      document: source,
      geometryMaps: new Map([[stale.id, staleMap], [current.id, currentMap]]),
      rowY: new Map([[current.id, 240]]),
      renderedCycleCount: 0,
    });

    expect(index.entries()).not.toHaveLength(0);
    expect(new Set(index.entries().map((candidate) => candidate.ownerId))).toEqual(new Set([current.id]));
    expect(index.entries().every((candidate) => candidate.point.y >= 240)).toBe(true);
    expect(service.metrics().candidateCount).toBe(index.entries().length);
  });
});
