import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";
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

interface EnabledPulseRange {
  readonly start: number;
  readonly end: number;
  readonly enabled: boolean;
  readonly enabledBefore: number;
}

interface SignalStartOrdinalIndex {
  readonly mode: "rising" | "falling" | "both";
  readonly primaryKind: "rising" | "falling";
  readonly eventsPerPulse: number;
  readonly pulseCount: number;
  readonly ranges: readonly EnabledPulseRange[];
  readonly suppressedEnabledPulses: readonly number[];
}

const edgeIndexCache = new WeakMap<object, WeakMap<object, EdgeIndex>>();
const signalStartOrdinalCache = new WeakMap<object, Map<string, SignalStartOrdinalIndex>>();

function upperBound(values: readonly number[], value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundChanges(changes: readonly { readonly start: number }[], cycle: number): number {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (changes[middle]!.start <= cycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

function signalStartOrdinalIndex(
  signal: Extract<CanonicalDocument["signals"][number], { readonly type: "clock" }>,
  mode: SignalStartOrdinalIndex["mode"],
  cycleCount: number,
): SignalStartOrdinalIndex | undefined {
  const { generator } = signal;
  const inactiveLevel = generator.polarity === "positive" ? 0 : 1;
  // A 100%-duty Clock has no independent pulse per period, and an active
  // initial level can add transitions at disabled-slot boundaries. Keep those
  // cases on the existing geometry-order path until their run semantics are
  // modeled explicitly rather than inventing ordinals.
  if (!(generator.duty > 0 && generator.duty < 1) || generator.initial !== inactiveLevel
    || !Number.isInteger(generator.period) || generator.period < 1
    || !Number.isInteger(generator.start) || generator.start < 0 || generator.start % generator.period !== 0
    || !Number.isFinite(generator.phase) || generator.phase < 0 || generator.phase >= generator.period) return undefined;

  let cache = signalStartOrdinalCache.get(signal);
  const cacheKey = `${mode}:${cycleCount}`;
  const cached = cache?.get(cacheKey);
  if (cached) return cached;

  const pulseCount = Math.max(0, Math.ceil((cycleCount - generator.start) / generator.period));
  const changes = signal.enable ?? [];
  let changeIndex = upperBoundChanges(changes, generator.start) - 1;
  let enabled = changeIndex < 0 ? true : isClockEnableValue(changes[changeIndex]!.value);
  let cursor = 0;
  let enabledBefore = 0;
  const ranges: EnabledPulseRange[] = [];
  for (let index = changeIndex + 1; index < changes.length; index += 1) {
    const change = changes[index]!;
    if (change.start >= cycleCount) break;
    if (change.start <= generator.start) continue;
    const boundary = Math.max(cursor, Math.min(pulseCount, Math.floor((change.start - generator.start) / generator.period)));
    ranges.push({ start: cursor, end: boundary, enabled, enabledBefore });
    if (enabled) enabledBefore += boundary - cursor;
    cursor = boundary;
    enabled = isClockEnableValue(change.value);
  }
  ranges.push({ start: cursor, end: pulseCount, enabled, enabledBefore });
  const findRange = (pulse: number): EnabledPulseRange | undefined => {
    let low = 0;
    let high = ranges.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ranges[middle]!.end <= pulse) low = middle + 1;
      else high = middle;
    }
    const range = ranges[low];
    return range && pulse >= range.start ? range : undefined;
  };
  const suppressed = [...new Set(generator.suppressedPeriods ?? [])]
    .filter((pulse): pulse is number => Number.isInteger(pulse) && pulse >= 0 && pulse < pulseCount)
    .filter((pulse) => findRange(pulse)?.enabled === true)
    .sort((left, right) => left - right);
  const primaryKind = generator.polarity === "positive" ? "rising" : "falling";
  const index: SignalStartOrdinalIndex = Object.freeze({
    mode,
    primaryKind,
    eventsPerPulse: mode === "both" ? 2 : 1,
    pulseCount,
    ranges: Object.freeze(ranges),
    suppressedEnabledPulses: Object.freeze(suppressed),
  });
  cache ??= new Map();
  cache.set(cacheKey, index);
  signalStartOrdinalCache.set(signal, cache);
  return index;
}

function isClockEnableValue(value: string | number): boolean {
  const normalized = String(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "high";
}

function signalStartEdgeOrdinal(index: SignalStartOrdinalIndex, cycle: number, kind: EdgePoint["kind"], signal: Extract<CanonicalDocument["signals"][number], { readonly type: "clock" }>): number | undefined {
  const { generator } = signal;
  const pulse = Math.floor((cycle - generator.start) / generator.period);
  if (pulse < 0 || pulse >= index.pulseCount) return undefined;
  let low = 0;
  let high = index.ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.ranges[middle]!.end <= pulse) low = middle + 1;
    else high = middle;
  }
  const range = index.ranges[low];
  if (!range || pulse < range.start || !range.enabled) return undefined;
  const suppressedBefore = upperBound(index.suppressedEnabledPulses, pulse);
  if (suppressedBefore > 0 && index.suppressedEnabledPulses[suppressedBefore - 1] === pulse) return undefined;
  const enabledBefore = range.enabledBefore + (range.enabled ? pulse - range.start : 0);
  const activeBefore = enabledBefore - suppressedBefore;
  const selectedInPulse = index.mode === "both" || kind === index.mode;
  if (!selectedInPulse) return undefined;
  const withinPulse = index.mode === "both" && kind !== index.primaryKind ? 1 : 0;
  return activeBefore * index.eventsPerPulse + withinPulse;
}

function edgeIndexFor(map: LocalGeometryMap, mapping: DisplayTimeMapping, metrics?: EdgeCounterProjectionMetrics): EdgeIndex | undefined {
  let byMapping = edgeIndexCache.get(map);
  const indexed = byMapping?.get(mapping);
  if (indexed) {
    if (metrics) metrics.edgeCounterEdgeIndexHits += 1;
    return indexed;
  }
  if (!map.edgeEntries) return undefined;
  const all = map.edgeEntries().flatMap((entry) => {
    if (entry.point !== "rising-edge" && entry.point !== "falling-edge") return [];
    const cycle = map.cycleKeyDomain === "display" ? mapping.displayToSource(entry.cycle) : entry.cycle;
    return cycle === undefined ? [] : [{ x: entry.position.x, y: entry.position.y, kind: entry.point === "rising-edge" ? "rising" as const : "falling" as const, cycle }];
  }).sort((left, right) => left.x - right.x || left.kind.localeCompare(right.kind));
  const index = { all: Object.freeze(all), rising: Object.freeze(all.filter((edge) => edge.kind === "rising")), falling: Object.freeze(all.filter((edge) => edge.kind === "falling")) };
  byMapping ??= new WeakMap<object, EdgeIndex>();
  byMapping.set(mapping, index);
  edgeIndexCache.set(map, byMapping);
  if (metrics) metrics.edgeCounterEdgeIndexBuilds += 1;
  return index;
}

function fallbackEdges(document: CanonicalDocument, signal: Extract<CanonicalDocument["signals"][number], { readonly type: "clock" }>, map: LocalGeometryMap, mapping: DisplayTimeMapping, metrics?: EdgeCounterProjectionMetrics): EdgePoint[] {
  const edges: EdgePoint[] = [];
  for (let cycle = 0; cycle < document.timeline.cycleCount; cycle += 1) {
    if (metrics) metrics.edgeCounterCyclesProbed += 1;
    for (const kind of ["rising", "falling"] as const) {
      if (signal.edgeCounter.mode !== "both" && signal.edgeCounter.mode !== kind) continue;
      if (metrics) metrics.edgeCounterGeometryLookups += 1;
      const geometryCycle = map.cycleKeyDomain === "display" ? mapping.sourceToDisplay(cycle) : cycle;
      if (geometryCycle === undefined) continue;
      const local = map.find({ signalId: signal.id, cycle: geometryCycle, point: kind === "rising" ? "rising-edge" : "falling-edge" });
      if (local) edges.push({ x: local.point.x, y: local.point.y, kind, cycle });
    }
  }
  return edges.sort((left, right) => left.x - right.x || left.kind.localeCompare(right.kind));
}

export function projectEdgeCounters(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, visibleRange: Readonly<{ start: number; end: number }>, selectedCycle: number, xScale = 1, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): EdgeCounterOverlayPrimitive[] {
  const rowYBySignalId = new Map(projection.rowLayout.map((row) => [row.rowId, row.y]));
  return document.signals.flatMap((signal) => {
    if (signal.type !== "clock" || !signal.edgeCounter.show) return [];
    if (metrics) metrics.edgeCounterClocksVisited += 1;
    const map = maps.get(signal.id);
    const rowY = rowYBySignalId.get(signal.id) ?? 0;
    if (!map) return [];
    const indexed = edgeIndexFor(map, mapping, metrics);
    const edges = (indexed ? signal.edgeCounter.mode === "both" ? indexed.all : signal.edgeCounter.mode === "rising" ? indexed.rising : indexed.falling : fallbackEdges(document, signal, map, mapping, metrics)).map((edge) => ({ ...edge, x: edge.x * xScale, y: rowY + edge.y }));
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
    const signalStartIndex = signal.edgeCounter.countFrom === "signal-start"
      ? signalStartOrdinalIndex(signal, signal.edgeCounter.mode, document.timeline.cycleCount)
      : undefined;
    return counted.flatMap((edge, index) => {
      const ordinal = signalStartIndex === undefined ? index
        : signalStartEdgeOrdinal(signalStartIndex, edge.cycle, edge.kind, signal) ?? index;
      return ordinal % Math.max(1, signal.edgeCounter.labelEvery) === 0
        ? (metrics && (metrics.edgeCounterVisibleLabelsProjected += 1), [{ id: `edge:${signal.id}:${edge.kind}:${edge.cycle}`, signalId: signal.id, x: edge.x + signal.edgeCounter.offset.x, y: edge.y + signal.edgeCounter.offset.y + (signal.edgeCounter.position === "above" ? -6 : 10), label: String(signal.edgeCounter.startNumber + ordinal) }])
        : [];
    });
  });
}
