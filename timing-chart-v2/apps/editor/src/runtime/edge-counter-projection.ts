import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";
import type { EdgeCounterOverlayPrimitive } from "@timing-chart-v2/renderer";
import { resolveEdgeCounterMarker, type CanonicalDocument, type SignalId } from "@timing-chart-v2/schema";

export interface EdgeCounterProjectionMetrics {
  edgeCounterClocksVisited: number;
  edgeCounterCyclesProbed: number;
  edgeCounterGeometryLookups: number;
  edgeCounterEdgeIndexBuilds: number;
  edgeCounterEdgeIndexHits: number;
  edgeCounterVisibleLabelsProjected: number;
}

export function createEdgeCounterProjectionMetrics(): EdgeCounterProjectionMetrics {
  return { edgeCounterClocksVisited: 0, edgeCounterCyclesProbed: 0, edgeCounterGeometryLookups: 0, edgeCounterEdgeIndexBuilds: 0, edgeCounterEdgeIndexHits: 0, edgeCounterVisibleLabelsProjected: 0 };
}

export interface SelectedClockEdge {
  readonly signalId: SignalId;
  readonly cycle: number;
  readonly kind: "rising" | "falling";
}

interface EdgePoint {
  readonly x: number;
  readonly y: number;
  readonly kind: "rising" | "falling";
  readonly cycle: number;
}

interface EdgeIndex {
  readonly all: readonly EdgePoint[];
  readonly rising: readonly EdgePoint[];
  readonly falling: readonly EdgePoint[];
}

const edgeIndexCache = new WeakMap<object, EdgeIndex>();

function edgeIndexFor(map: LocalGeometryMap, metrics?: EdgeCounterProjectionMetrics): EdgeIndex | undefined {
  const indexed = edgeIndexCache.get(map);
  if (indexed) {
    if (metrics) metrics.edgeCounterEdgeIndexHits += 1;
    return indexed;
  }
  if (!map.edgeEntries) return undefined;
  const all = map.edgeEntries().flatMap((entry) => {
    if (entry.point !== "rising-edge" && entry.point !== "falling-edge") return [];
    return [{ x: entry.position.x, y: entry.position.y, kind: entry.point === "rising-edge" ? "rising" as const : "falling" as const, cycle: entry.cycle }];
  }).sort((left, right) => left.x - right.x || left.kind.localeCompare(right.kind));
  const index = { all: Object.freeze(all), rising: Object.freeze(all.filter((edge) => edge.kind === "rising")), falling: Object.freeze(all.filter((edge) => edge.kind === "falling")) };
  edgeIndexCache.set(map, index);
  if (metrics) metrics.edgeCounterEdgeIndexBuilds += 1;
  return index;
}

function fallbackEdges(document: CanonicalDocument, signal: Extract<CanonicalDocument["signals"][number], { readonly type: "clock" }>, map: LocalGeometryMap, metrics?: EdgeCounterProjectionMetrics): EdgePoint[] {
  const edges: EdgePoint[] = [];
  for (let cycle = 0; cycle < document.timeline.cycleCount; cycle += 1) {
    if (metrics) metrics.edgeCounterCyclesProbed += 1;
    for (const kind of ["rising", "falling"] as const) {
      if (signal.edgeCounter.mode !== "both" && signal.edgeCounter.mode !== kind) continue;
      if (metrics) metrics.edgeCounterGeometryLookups += 1;
      const local = map.find({ signalId: signal.id, cycle, point: kind === "rising" ? "rising-edge" : "falling-edge" });
      if (local) edges.push({ x: local.point.x, y: local.point.y, kind, cycle });
    }
  }
  return edges.sort((left, right) => left.x - right.x || left.kind.localeCompare(right.kind));
}

export function projectEdgeCounters(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, visibleRange: Readonly<{ start: number; end: number }>, selectedCycle: number, xScale = 1, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): EdgeCounterOverlayPrimitive[] {
  const rowYBySignalId = new Map(projection.rowLayout.map((row) => [row.rowId, row.y]));
  return document.signals.flatMap((signal) => {
    if (signal.type !== "clock" || !signal.edgeCounter.show) return [];
    if (metrics) metrics.edgeCounterClocksVisited += 1;
    const map = maps.get(signal.id);
    const rowY = rowYBySignalId.get(signal.id) ?? 0;
    if (!map) return [];
    const indexed = edgeIndexFor(map, metrics);
    const edges = (indexed ? signal.edgeCounter.mode === "both" ? indexed.all : signal.edgeCounter.mode === "rising" ? indexed.rising : indexed.falling : fallbackEdges(document, signal, map, metrics)).map((edge) => ({ ...edge, x: edge.x * xScale, y: rowY + edge.y }));
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
    return counted.flatMap((edge, index) => index % Math.max(1, signal.edgeCounter.labelEvery) === 0 ? (metrics && (metrics.edgeCounterVisibleLabelsProjected += 1), [{ id: `edge:${signal.id}:${edge.kind}:${edge.cycle}`, signalId: signal.id, x: edge.x + signal.edgeCounter.offset.x, y: edge.y + signal.edgeCounter.offset.y + (signal.edgeCounter.position === "above" ? -6 : 10), label: String(signal.edgeCounter.startNumber + index) }]) : []);
  });
}
