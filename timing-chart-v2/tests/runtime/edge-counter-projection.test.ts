import { describe, expect, it } from "vitest";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";
import { createEdgeCounterProjectionMetrics, projectEdgeCounters } from "../../apps/editor/src/runtime/edge-counter-projection.js";
import { canonicalFixture } from "../fixtures/canonical.js";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping } from "@timing-chart-v2/projection";
import type { TimeGroupId } from "@timing-chart-v2/schema";

function identityMapping() {
  const base = canonicalFixture();
  return buildDisplayTimeMapping(base.timeline, base.timeGroups);
}

function geometryForClock(): LocalGeometryMap {
  return {
    signalId: "sig_clk",
    find(anchor) {
      if (anchor.signalId !== "sig_clk" || anchor.cycle < 0 || anchor.cycle >= 8) return undefined;
      return { signalId: "sig_clk", anchor, point: { x: anchor.cycle * 10 + (anchor.point === "falling-edge" ? 5 : 0), y: 0 } };
    },
  };
}

function projection(): RenderProjection {
  return { rowLayout: [{ rowId: "sig_clk", groupId: "grp_main", groupName: "Main", kind: "timing", name: "CLK", visible: true, y: 0, height: 28 }], navigationRowLayout: [], documentEpoch: 0, revision: 0, canonicalRowIds: ["sig_clk", "sig_data"], visibleRowIds: ["sig_clk"], mountedRowIds: ["sig_clk"], leftRowIds: [], frozenLabelRowIds: ["sig_clk"], timingRowIds: ["sig_clk"], groupHeaders: [], leftGroupHeaders: [], mountedGroupHeaderIds: [], mountedLeftGroupHeaderIds: [], canonicalSignalIds: ["sig_clk"], mountedSignalIds: ["sig_clk"], waveSignalIds: [], totalHeight: 28, navigationTotalHeight: 0, transform: { scrollX: 0, scrollY: 0, zoom: 1 }, collapsedGroupIds: [] };
}

describe("selected Clock Edge Counter origin", () => {
  it("starts at the selected rendered rising/falling edge, not merely its cycle", () => {
    const base = canonicalFixture();
    const document = { ...base, signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "both" as const, countFrom: "selected-edge" as const, startNumber: 10 } }, base.signals[1]!] };
    const overlays = projectEdgeCounters(document, projection(), new Map([["sig_clk", geometryForClock()]]), identityMapping(), { start: 0, end: 8 }, 3, 1, { signalId: "sig_clk", cycle: 3, kind: "falling" });
    expect(overlays.map((overlay) => overlay.id)).toEqual(["edge:sig_clk:falling:3", "edge:sig_clk:rising:4", "edge:sig_clk:falling:4", "edge:sig_clk:rising:5", "edge:sig_clk:falling:5", "edge:sig_clk:rising:6", "edge:sig_clk:falling:6", "edge:sig_clk:rising:7", "edge:sig_clk:falling:7"]);
    expect(overlays[0]?.label).toBe("10");
  });

  it("keeps the existing cycle-based behavior when no exact edge is selected", () => {
    const base = canonicalFixture();
    const document = { ...base, signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "rising" as const, countFrom: "selected-edge" as const } }, base.signals[1]!] };
    const overlays = projectEdgeCounters(document, projection(), new Map([["sig_clk", geometryForClock()]]), identityMapping(), { start: 0, end: 8 }, 3);
    expect(overlays[0]?.id).toBe("edge:sig_clk:rising:3");
  });

  it("indexes immutable edge geometry once and reuses it across overlay refreshes", () => {
    const base = canonicalFixture();
    const document = { ...base, signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "both" as const, labelEvery: 2 } }, base.signals[1]!] };
    const map = new ImmutableLocalGeometryMap("sig_clk", Array.from({ length: 8 }, (_, cycle) => [
      { cycle, point: "rising-edge" as const, position: { x: cycle * 10, y: 0 } },
      { cycle, point: "falling-edge" as const, position: { x: cycle * 10 + 5, y: 0 } },
    ]).flat());
    const metrics = createEdgeCounterProjectionMetrics();
    const maps = new Map([["sig_clk", map]]);
    const mapping = identityMapping();
    const first = projectEdgeCounters(document, projection(), maps, mapping, { start: 0, end: 8 }, 0, 1, undefined, metrics);
    const second = projectEdgeCounters(document, projection(), maps, mapping, { start: 2, end: 4 }, 0, 1, undefined, metrics);
    expect(first.map((overlay) => overlay.id)).toEqual(["edge:sig_clk:rising:0", "edge:sig_clk:rising:1", "edge:sig_clk:rising:2", "edge:sig_clk:rising:3", "edge:sig_clk:rising:4", "edge:sig_clk:rising:5", "edge:sig_clk:rising:6", "edge:sig_clk:rising:7"]);
    expect(second).toHaveLength(8);
    expect(metrics.edgeCounterEdgeIndexBuilds).toBe(1);
    expect(metrics.edgeCounterEdgeIndexHits).toBe(1);
    expect(metrics.edgeCounterCyclesProbed).toBe(0);
    expect(metrics.edgeCounterGeometryLookups).toBe(0);
  });

  // #398: an edit that only touches one Clock's rendered waveform (a new
  // LocalGeometryMap instance for that Clock) must rebuild only that
  // Clock's edge index -- an unrelated Clock's already-indexed map must
  // stay a cache hit, not get rebuilt just because *some* Clock changed.
  it("rebuilds only the edited Clock's edge index; an unrelated Clock's index is reused", () => {
    const base = canonicalFixture();
    const clockA = { ...base.signals[0]!, id: "sig_clk_a" as typeof base.signals[0]["id"], edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "both" as const } };
    const clockB = { ...base.signals[0]!, id: "sig_clk_b" as typeof base.signals[0]["id"], edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "both" as const } };
    const document = { ...base, signals: [clockA, clockB] };
    const makeMap = (id: string) => new ImmutableLocalGeometryMap(id as never, Array.from({ length: 4 }, (_, cycle) => [
      { cycle, point: "rising-edge" as const, position: { x: cycle * 10, y: 0 } },
      { cycle, point: "falling-edge" as const, position: { x: cycle * 10 + 5, y: 0 } },
    ]).flat());
    const mapA1 = makeMap("sig_clk_a");
    const mapB = makeMap("sig_clk_b");
    const metrics = createEdgeCounterProjectionMetrics();

    // First refresh: both Clocks' indexes are built fresh.
    const mapping = identityMapping();
    projectEdgeCounters(document, projection(), new Map([["sig_clk_a", mapA1], ["sig_clk_b", mapB]]), mapping, { start: 0, end: 4 }, 0, 1, undefined, metrics);
    expect(metrics.edgeCounterEdgeIndexBuilds).toBe(2);
    expect(metrics.edgeCounterEdgeIndexHits).toBe(0);

    // Only Clock A's waveform changed -- a genuinely new LocalGeometryMap
    // instance for A; Clock B keeps its already-indexed instance.
    const mapA2 = makeMap("sig_clk_a");
    projectEdgeCounters(document, projection(), new Map([["sig_clk_a", mapA2], ["sig_clk_b", mapB]]), mapping, { start: 0, end: 4 }, 0, 1, undefined, metrics);
    expect(metrics.edgeCounterEdgeIndexBuilds).toBe(3); // +1, for A's new map only
    expect(metrics.edgeCounterEdgeIndexHits).toBe(1); // B's cached index reused
    expect(metrics.edgeCounterCyclesProbed).toBe(0);
    expect(metrics.edgeCounterGeometryLookups).toBe(0);
  });

  // #398: a refresh driven by something unrelated to any Clock (e.g. an
  // unrelated Signal rename/style edit) reuses the exact same
  // LocalGeometryMap instances -- so it must be all cache hits, zero
  // rebuilds and zero cycle/geometry probing.
  it("performs zero edge-index rebuilds and zero cycle probing when nothing Clock-related changed", () => {
    const base = canonicalFixture();
    const document = { ...base, signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "both" as const } }, base.signals[1]!] };
    const map = new ImmutableLocalGeometryMap("sig_clk", Array.from({ length: 4 }, (_, cycle) => [
      { cycle, point: "rising-edge" as const, position: { x: cycle * 10, y: 0 } },
      { cycle, point: "falling-edge" as const, position: { x: cycle * 10 + 5, y: 0 } },
    ]).flat());
    const maps = new Map([["sig_clk", map]]);
    const metrics = createEdgeCounterProjectionMetrics();
    const mapping = identityMapping();
    projectEdgeCounters(document, projection(), maps, mapping, { start: 0, end: 4 }, 0, 1, undefined, metrics);
    expect(metrics.edgeCounterEdgeIndexBuilds).toBe(1);

    // Simulate an unrelated Signal rename: same document shape, same maps
    // (the renamed signal's own geometry has nothing to do with this
    // Clock's LocalGeometryMap instance, so it is untouched/reused).
    const renamed = { ...document, signals: [document.signals[0]!, { ...document.signals[1]!, name: "DATA_RENAMED", display: { ...document.signals[1]!.display, name: "DATA_RENAMED" } }] };
    projectEdgeCounters(renamed, projection(), maps, mapping, { start: 0, end: 4 }, 0, 1, undefined, metrics);
    expect(metrics.edgeCounterEdgeIndexBuilds).toBe(1); // unchanged
    expect(metrics.edgeCounterEdgeIndexHits).toBe(1);
    expect(metrics.edgeCounterCyclesProbed).toBe(0);
    expect(metrics.edgeCounterGeometryLookups).toBe(0);
  });

  // #398: a gated/suppressed Clock interval produces no LocalGeometry edge
  // entries for the suppressed cycles (upstream waveform generation never
  // emits them) -- the edge index built from edgeEntries() must not invent
  // edges for those cycles, and must never fall back to the O(cycleCount)
  // per-cycle probe when edgeEntries() is available.
  it("does not invent edges for a gated/suppressed Clock interval", () => {
    const base = canonicalFixture();
    const document = { ...base, signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "both" as const } }, base.signals[1]!] };
    // Cycles 0-3 have real edges; cycle 2 is a suppressed/gated period, so
    // upstream geometry generation emits no rising/falling entry for it.
    const map = new ImmutableLocalGeometryMap("sig_clk", [0, 1, 3].flatMap((cycle) => [
      { cycle, point: "rising-edge" as const, position: { x: cycle * 10, y: 0 } },
      { cycle, point: "falling-edge" as const, position: { x: cycle * 10 + 5, y: 0 } },
    ]));
    const metrics = createEdgeCounterProjectionMetrics();
    const overlays = projectEdgeCounters(document, projection(), new Map([["sig_clk", map]]), identityMapping(), { start: 0, end: 4 }, 0, 1, undefined, metrics);
    const cycles = overlays.map((overlay) => Number(overlay.id.split(":").at(-1)));
    expect(cycles).not.toContain(2);
    expect(cycles.sort((left, right) => left - right)).toEqual([0, 0, 1, 1, 3, 3]);
    expect(metrics.edgeCounterCyclesProbed).toBe(0);
    expect(metrics.edgeCounterGeometryLookups).toBe(0);
  });

  it("keeps folded display-keyed Clock edges in canonical source-cycle identity", () => {
    const base = canonicalFixture();
    const timeGroups = [{ id: "fold" as TimeGroupId, name: "Fold", start: 2, end: 4, presentation: { collapsed: true } }];
    const document = { ...base, timeline: { ...base.timeline, cycleCount: 8 }, timeGroups,
      signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "rising" as const, countFrom: "visible-range-start" as const, startNumber: 20 } }, base.signals[1]!] };
    const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
    const map = new ImmutableLocalGeometryMap("sig_clk", Array.from({ length: mapping.displayCycleCount }, (_, cycle) => ({
      cycle, point: "rising-edge" as const, position: { x: cycle * 10, y: 0 },
    })), [], "display");

    const overlays = projectEdgeCounters(document, projection(), new Map([["sig_clk", map]]), mapping, { start: 4, end: 8 }, 4);

    expect(overlays.map((overlay) => overlay.id)).toEqual(["edge:sig_clk:rising:4", "edge:sig_clk:rising:5", "edge:sig_clk:rising:6", "edge:sig_clk:rising:7"]);
    expect(overlays.map((overlay) => overlay.label)).toEqual(["20", "21", "22", "23"]);
    expect(overlays[0]?.x).toBe(20); // display boundary 2 maps to source cycle 4
  });
});
