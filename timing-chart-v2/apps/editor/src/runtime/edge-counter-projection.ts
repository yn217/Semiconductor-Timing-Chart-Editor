import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";
import type { EdgeCounterOverlayPrimitive } from "@timing-chart-v2/renderer";
import { resolveEdgeCounterMarker, type CanonicalDocument, type SignalId } from "@timing-chart-v2/schema";

export interface SelectedClockEdge {
  readonly signalId: SignalId;
  readonly cycle: number;
  readonly kind: "rising" | "falling";
}

export function projectEdgeCounters(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, visibleRange: Readonly<{ start: number; end: number }>, selectedCycle: number, xScale = 1, selectedEdge?: SelectedClockEdge): EdgeCounterOverlayPrimitive[] {
  return document.signals.flatMap((signal) => {
    if (signal.type !== "clock" || !signal.edgeCounter.show) return [];
    const map = maps.get(signal.id);
    const rowY = projection.rowLayout.find((row) => row.rowId === signal.id)?.y ?? 0;
    if (!map) return [];
    const edges: { readonly x: number; readonly y: number; readonly kind: "rising" | "falling"; readonly cycle: number }[] = [];
    for (let cycle = 0; cycle < document.timeline.cycleCount; cycle += 1) {
      for (const kind of ["rising", "falling"] as const) {
        if (signal.edgeCounter.mode !== "both" && signal.edgeCounter.mode !== kind) continue;
        const local = map.find({ signalId: signal.id, cycle, point: kind === "rising" ? "rising-edge" : "falling-edge" });
        if (local) edges.push({ x: local.point.x * xScale, y: rowY + local.point.y, kind, cycle });
      }
    }
    edges.sort((left, right) => left.x - right.x || left.kind.localeCompare(right.kind));
    const marker = resolveEdgeCounterMarker(document, signal.edgeCounter);
    const selectedEdgeIndex = selectedEdge?.signalId === signal.id
      ? edges.findIndex((edge) => edge.cycle === selectedEdge.cycle && edge.kind === selectedEdge.kind)
      : -1;
    const countFrom = signal.edgeCounter.countFrom === "visible-range-start" ? visibleRange.start
      : signal.edgeCounter.countFrom === "selected-edge" && selectedEdgeIndex >= 0 ? edges[selectedEdgeIndex]!.cycle
        : signal.edgeCounter.countFrom === "selected-edge" ? selectedCycle
        : signal.edgeCounter.countFrom === "marker" ? marker?.start
        : Number.NEGATIVE_INFINITY;
    const counted = countFrom === undefined ? [] : signal.edgeCounter.countFrom === "selected-edge" && selectedEdgeIndex >= 0 ? edges.slice(selectedEdgeIndex) : edges.filter((edge) => edge.cycle >= countFrom);
    return counted.flatMap((edge, index) => index % Math.max(1, signal.edgeCounter.labelEvery) === 0 ? [{ id: `edge:${signal.id}:${edge.kind}:${edge.cycle}`, signalId: signal.id, x: edge.x + signal.edgeCounter.offset.x, y: edge.y + signal.edgeCounter.offset.y + (signal.edgeCounter.position === "above" ? -6 : 10), label: String(signal.edgeCounter.startNumber + index) }] : []);
  });
}
