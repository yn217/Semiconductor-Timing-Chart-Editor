import { describe, expect, it, vi } from "vitest";
import { resolveTimeAxisGeometry, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
import { refreshRendererForReason } from "../../apps/editor/src/runtime/render-coordinator.js";
import type { TimeAxisMetrics } from "../../apps/editor/src/runtime/timeline-geometry-owner.js";
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
    const timeAxisMetrics = Object.freeze({
      generation: 1,
      timeAxis: resolveTimeAxisGeometry(document, new Map([["sig_clk", clockGeometry()]])),
      mapping: buildDisplayTimeMapping(document.timeline, []),
      presentationScale: 1,
      displayCycleCount: document.timeline.cycleCount,
    }) satisfies TimeAxisMetrics;

    refreshRendererForReason(renderer, { current: null }, "range", document, projection(), new Map([["sig_clk", clockGeometry()]]), timeAxisMetrics, { start: 0, end: 8 }, 0, undefined);

    expect(renderer.updateEdgeCounters).toHaveBeenCalledOnce();
    expect(renderer.updateOverlays).not.toHaveBeenCalled();
    expect(renderer.updateEdgeCounters.mock.lastCall?.[0]).toHaveLength(8);
  });

  it("projects annotation overlays using the captured TimeAxisMetrics mapping and scale", () => {
    const base = canonicalFixture();
    const signal = base.signals[0]!;
    const document = {
      ...base,
      timeGroups: [{ id: "fold" as never, name: "Fold", start: 2, end: 4, presentation: { collapsed: true, foldStyle: "axis-break" as const, foldLabel: "2 cycles" } }],
      annotations: [{ id: "ann" as never, type: "text" as const, label: "Fold edge", visible: true, anchor: { signalId: signal.id, cycle: 4, point: "cycle-start" as const } }],
    };
    const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
    const geometry: LocalGeometryMap = {
      signalId: signal.id,
      find(anchor) {
        if (anchor.signalId !== signal.id || anchor.point !== "cycle-start") return undefined;
        const display = mapping.sourceToDisplay(anchor.cycle);
        return display === undefined ? undefined : { signalId: signal.id, anchor, point: { x: display * 10, y: 0 } };
      },
    };
    const timeAxisMetrics = Object.freeze({
      generation: 7,
      timeAxis: resolveTimeAxisGeometry(document, new Map([[signal.id, geometry]])),
      mapping,
      presentationScale: 2,
      displayCycleCount: mapping.displayCycleCount,
      sourceBoundaryToContentX: (sourceCycle: number) => { const display = mapping.sourceToDisplay(sourceCycle); return display === undefined ? undefined : display * 10 * 2; },
    }) satisfies TimeAxisMetrics;
    const renderer = { updateEdgeCounters: vi.fn(), updateOverlays: vi.fn() };
    const host = { current: null };

    refreshRendererForReason(renderer, host, "selection", document, projection(), new Map([[signal.id, geometry]]), timeAxisMetrics, { start: 0, end: 8 }, 0, undefined);

    expect(renderer.updateOverlays.mock.lastCall?.[0]).toMatchObject([{ id: "ann", anchors: [{ x: 40 }] }]);
  });

  it("writes selection state only when an Annotation selection actually changes", () => {
    const base = canonicalFixture();
    const signal = base.signals[0]!;
    const document = { ...base, annotations: [{ id: "ann" as never, type: "text" as const, label: "A", visible: true, anchor: { signalId: signal.id, cycle: 2, point: "cycle-start" as const } }] };
    const geometry: LocalGeometryMap = { signalId: signal.id, find(anchor) { return anchor.signalId === signal.id ? { signalId: signal.id, anchor, point: { x: anchor.cycle * 10, y: 0 } } : undefined; } };
    const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
    const timeAxisMetrics = Object.freeze({ generation: 1, timeAxis: resolveTimeAxisGeometry(document, new Map([[signal.id, geometry]])), mapping, presentationScale: 1, displayCycleCount: mapping.displayCycleCount, sourceBoundaryToContentX: (cycle: number) => cycle * 10 }) satisfies TimeAxisMetrics;
    const writes: string[] = [];
    let selected = "false";
    const dataset = { annotationId: "ann" } as DOMStringMap;
    Object.defineProperty(dataset, "selected", { configurable: true, get: () => selected, set: (value: string) => { selected = value; writes.push(value); } });
    const owner = { dataset } as HTMLElement;
    const root = { dataset: {}, querySelectorAll: () => [owner] } as unknown as HTMLDivElement;
    const host = { current: root };
    const renderer = { updateEdgeCounters: vi.fn(), updateOverlays: vi.fn() };
    const refresh = (selectedAnnotationId: string | undefined) => refreshRendererForReason(renderer, host, "selection", document, projection(), new Map([[signal.id, geometry]]), timeAxisMetrics, { start: 0, end: 8 }, 0, selectedAnnotationId);

    refresh(undefined);
    expect(writes).toEqual([]);
    refresh("ann");
    expect(writes).toEqual(["true"]);
    refresh("ann");
    expect(writes).toEqual(["true"]);
    refresh(undefined);
    expect(writes).toEqual(["true", "false"]);
  });
});
