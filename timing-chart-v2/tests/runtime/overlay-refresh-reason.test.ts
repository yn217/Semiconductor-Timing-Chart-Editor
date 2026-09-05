import { describe, expect, it, vi } from "vitest";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";
import { refreshRendererForReason } from "../../apps/editor/src/runtime/use-editor-runtime-bridge.js";
import { canonicalFixture } from "../fixtures/canonical.js";

function projection(): RenderProjection {
  return { rowLayout: [{ rowId: "sig_clk", groupId: "grp_main", groupName: "Main", kind: "timing", name: "CLK", visible: true, y: 0, height: 28 }], navigationRowLayout: [], documentEpoch: 0, revision: 0, canonicalRowIds: ["sig_clk", "sig_data"], visibleRowIds: ["sig_clk"], mountedRowIds: ["sig_clk"], leftRowIds: [], frozenLabelRowIds: ["sig_clk"], timingRowIds: ["sig_clk"], groupHeaders: [], leftGroupHeaders: [], mountedGroupHeaderIds: [], mountedLeftGroupHeaderIds: [], canonicalSignalIds: ["sig_clk"], mountedSignalIds: ["sig_clk"], waveSignalIds: [], totalHeight: 28, navigationTotalHeight: 0, transform: { scrollX: 0, scrollY: 0, zoom: 1 }, collapsedGroupIds: [] };
}

function clockGeometry(): LocalGeometryMap {
  return { signalId: "sig_clk", find(anchor) { if (anchor.signalId !== "sig_clk" || anchor.cycle < 0 || anchor.cycle >= 8) return undefined; return { signalId: "sig_clk", anchor, point: { x: anchor.cycle * 10 + (anchor.point === "falling-edge" ? 5 : 0), y: 0 } }; } };
}

describe("renderer overlay refresh reasons", () => {
  it("keeps a range-only refresh on the edge-counter path", () => {
    const base = canonicalFixture();
    const document = { ...base, signals: [{ ...base.signals[0]!, edgeCounter: { ...base.signals[0]!.edgeCounter, show: true, mode: "rising" as const } }, base.signals[1]!] };
    const renderer = { updateEdgeCounters: vi.fn(), updateOverlays: vi.fn() };
    const mappingCache = { get: vi.fn(() => { throw new Error("range refresh must not resolve annotation mapping"); }) };

    refreshRendererForReason(renderer, { current: null }, "range", document, projection(), new Map([["sig_clk", clockGeometry()]]), mappingCache, 1, { start: 0, end: 8 }, 0, undefined);

    expect(renderer.updateEdgeCounters).toHaveBeenCalledOnce();
    expect(renderer.updateOverlays).not.toHaveBeenCalled();
    expect(renderer.updateEdgeCounters.mock.lastCall?.[0]).toHaveLength(8);
    expect(mappingCache.get).not.toHaveBeenCalled();
  });
});
