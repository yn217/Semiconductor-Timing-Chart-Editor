import { describe, expect, it } from "vitest";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";
import { createEdgeCounterProjectionMetrics, projectEdgeCounters } from "../../apps/editor/src/runtime/edge-counter-projection.js";
import { canonicalFixture } from "../fixtures/canonical.js";
import { ImmutableLocalGeometryMap } from "@timing-chart-v2/geometry";

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
    const overlays = projectEdgeCounters(document, projection(), new Map([["sig_clk", geometryForClock()]]), { start: 0, end: 8 }, 3, 1, { signalId: "sig_clk", cycle: 3, kind: "falling" });
    expect(overlays.map((overlay) => overlay.id)).toEqual(["edge:sig_clk:falling:3", "edge:sig_clk:rising:4", "edge:sig_clk:falling:4", "edge:sig_clk:rising:5", "edge:sig_clk:falling:5", "edge:sig_clk:rising:6", "edge:sig_clk:falling:6", "edge:sig_clk:rising:7", "edge:sig_clk:falling:7"]);
    expect(overlays[0]?.label).toBe("10");
  });

  it("keeps the existing cycle-based behavior when no exact edge is selected", () => {
    const base = canonicalFixture();
    const document = { ...base, signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "rising" as const, countFrom: "selected-edge" as const } }, base.signals[1]!] };
    const overlays = projectEdgeCounters(document, projection(), new Map([["sig_clk", geometryForClock()]]), { start: 0, end: 8 }, 3);
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
    const first = projectEdgeCounters(document, projection(), maps, { start: 0, end: 8 }, 0, 1, undefined, metrics);
    const second = projectEdgeCounters(document, projection(), maps, { start: 2, end: 4 }, 0, 1, undefined, metrics);
    expect(first.map((overlay) => overlay.id)).toEqual(["edge:sig_clk:rising:0", "edge:sig_clk:rising:1", "edge:sig_clk:rising:2", "edge:sig_clk:rising:3", "edge:sig_clk:rising:4", "edge:sig_clk:rising:5", "edge:sig_clk:rising:6", "edge:sig_clk:rising:7"]);
    expect(second).toHaveLength(8);
    expect(metrics.edgeCounterEdgeIndexBuilds).toBe(1);
    expect(metrics.edgeCounterEdgeIndexHits).toBe(1);
    expect(metrics.edgeCounterCyclesProbed).toBe(0);
    expect(metrics.edgeCounterGeometryLookups).toBe(0);
  });
});
