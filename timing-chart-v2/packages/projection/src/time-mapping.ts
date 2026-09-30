import type { SignalValueChange, Timeline, TimeGroup } from "@timing-chart-v2/schema";

export interface DisplayTimeMapping {
  readonly sourceCycleCount: number;
  readonly displayCycleCount: number;
  readonly isIdentity: boolean;
  /** O(1) for identity mappings; O(log foldCount) for folded mappings. */
  readonly sourceToDisplay: (sourceCycle: number) => number | undefined;
  /** O(1) for identity mappings; O(log foldCount) for folded mappings. */
  readonly displayToSource: (displayCycle: number) => number | undefined;
  /** First visible display boundary whose source is at or after sourceCycle. */
  readonly displayBoundaryAtOrAfterSource: (sourceCycle: number) => number;
  /** Canonical first collapsed TimeGroup containing a hidden source position, found through a prebuilt index. */
  readonly collapsedGroupAtSource: (sourceCycle: number) => TimeGroup | undefined;
  readonly labelFor: (displayCycle: number) => number;
}

interface FoldInterval {
  readonly start: number;
  readonly end: number;
  readonly removedBefore: number;
  readonly displayStart: number;
}

interface FoldOwnerSegment {
  readonly start: number;
  readonly end: number;
  readonly groupIndex: number;
}

function buildFoldOwnerSegments(timeGroups: readonly TimeGroup[]): readonly FoldOwnerSegment[] {
  const events = new Map<number, { readonly starts: number[]; readonly ends: number[] }>();
  timeGroups.forEach((group, groupIndex) => {
    if (!group.presentation?.collapsed || group.end <= group.start) return;
    const start = events.get(group.start) ?? { starts: [], ends: [] };
    start.starts.push(groupIndex);
    events.set(group.start, start);
    const end = events.get(group.end) ?? { starts: [], ends: [] };
    end.ends.push(groupIndex);
    events.set(group.end, end);
  });
  if (events.size === 0) return [];

  const points = [...events.keys()].sort((left, right) => left - right);
  const active = new Uint8Array(timeGroups.length);
  const heap: number[] = [];
  const push = (value: number) => {
    let index = heap.length;
    heap.push(value);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (heap[parent]! <= value) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = value;
  };
  const discardInactive = () => {
    while (heap.length > 0 && active[heap[0]!] === 0) {
      const tail = heap.pop()!;
      if (heap.length === 0) break;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child = right < heap.length && heap[right]! < heap[left]! ? right : left;
        if (heap[child]! >= tail) break;
        heap[index] = heap[child]!;
        index = child;
      }
      heap[index] = tail;
    }
  };

  const segments: FoldOwnerSegment[] = [];
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex]!;
    const nextPoint = points[pointIndex + 1];
    const event = events.get(point)!;
    for (const index of event.ends) active[index] = 0;
    for (const index of event.starts) { active[index] = 1; push(index); }
    discardInactive();
    const owner = heap[0];
    if (nextPoint !== undefined && point < nextPoint && owner !== undefined) {
      const previous = segments[segments.length - 1];
      if (previous?.end === point && previous.groupIndex === owner) segments[segments.length - 1] = { ...previous, end: nextPoint };
      else segments.push({ start: point, end: nextPoint, groupIndex: owner });
    }
  }
  return segments;
}

function foldOwnerAtSource(segments: readonly FoldOwnerSegment[], groups: readonly TimeGroup[], sourceCycle: number): TimeGroup | undefined {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (segments[middle]!.start <= sourceCycle) low = middle + 1;
    else high = middle;
  }
  const segment = low > 0 ? segments[low - 1] : undefined;
  return segment && sourceCycle < segment.end ? groups[segment.groupIndex] : undefined;
}

/** Shared viewport query result consumed by time-based projections.  Bounds
 * are supplied in display space by the owning timeline geometry/viewport;
 * source bounds are derived here so consumers cannot invent a second mapper.
 */
export interface DisplayTimeViewport {
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly overscanCycles: number;
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly generation: number;
  readonly pinnedIds: readonly string[];
}

export function createDisplayTimeViewport(mapping: DisplayTimeMapping, displayStart: number, displayEnd: number, overscanCycles: number, rowStart: number, rowEnd: number, generation: number, pinnedIds: readonly string[] = []): DisplayTimeViewport {
  const start = Math.max(0, Math.floor(displayStart - overscanCycles));
  const end = Math.min(mapping.displayCycleCount, Math.ceil(displayEnd + overscanCycles));
  const sourceStart = mapping.displayToSource(start) ?? 0;
  const lastSource = mapping.displayToSource(end - 1) ?? sourceStart;
  return { displayStart: start, displayEnd: end, sourceStart, sourceEnd: lastSource + 1, overscanCycles, rowStart, rowEnd, generation, pinnedIds: [...pinnedIds] };
}

export type HiddenSourcePositionPolicy = "floor" | "ceil" | "interpolate" | "omit";

function firstDisplayAtOrAfterSource(mapping: DisplayTimeMapping, sourceCycle: number): number {
  let low = 0;
  let high = mapping.displayCycleCount;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (mapping.displayToSource(middle)! < sourceCycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Resolve a source position without inventing display-cycle zero for folded input. */
export function resolveSourcePosition(mapping: DisplayTimeMapping, sourceCycle: number, policy: HiddenSourcePositionPolicy = "omit"): number | undefined {
  if (!Number.isFinite(sourceCycle)) return undefined;
  if (sourceCycle >= mapping.sourceCycleCount) return mapping.displayCycleCount;
  const clamped = Math.max(0, sourceCycle);
  if (Number.isInteger(clamped) && mapping.sourceToDisplay(clamped) !== undefined) return mapping.sourceToDisplay(clamped);
  if (policy === "omit") return undefined;
  const index = Math.floor(clamped);
  if (policy === "interpolate") {
    const lower = mapping.sourceToDisplay(index);
    const upper = mapping.sourceToDisplay(index + 1);
    if (lower !== undefined && upper !== undefined) return lower + (clamped - index) * (upper - lower);
    if (lower !== undefined) return lower;
    if (upper !== undefined) return upper;
  }
  if (policy === "floor") {
    const display = firstDisplayAtOrAfterSource(mapping, index + 1) - 1;
    return display >= 0 ? display : undefined;
  }
  if (policy === "ceil") {
    const display = firstDisplayAtOrAfterSource(mapping, Math.max(0, index));
    return display < mapping.displayCycleCount ? display : undefined;
  }
  return undefined;
}

// #862: sorted anchors are cached per labelAnchors array identity and looked up by binary search (was: copy + sort on every label).
const sortedAnchorsByArray = new WeakMap<Timeline["labelAnchors"], Timeline["labelAnchors"]>();
function labelForSourceCycle(timeline: Pick<Timeline, "labelAnchors">, sourceCycle: number): number {
  let anchors = sortedAnchorsByArray.get(timeline.labelAnchors);
  if (!anchors) { anchors = [...timeline.labelAnchors].sort((left, right) => left.source - right.source); sortedAnchorsByArray.set(timeline.labelAnchors, anchors); }
  let low = 0, high = anchors.length; // first anchor with source > sourceCycle
  while (low < high) { const mid = (low + high) >>> 1; if (anchors[mid]!.source > sourceCycle) high = mid; else low = mid + 1; }
  const active = low === 0 ? undefined : anchors[low - 1];
  return active === undefined ? sourceCycle : active.display + (sourceCycle - active.source);
}

function upperBound<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (predicate(values[middle]!)) low = middle + 1;
    else high = middle;
  }
  return low;
}

function identityMapping(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">): DisplayTimeMapping {
  const sourceToDisplay = (sourceCycle: number) => Number.isInteger(sourceCycle) && sourceCycle >= 0 && sourceCycle < timeline.cycleCount ? sourceCycle : undefined;
  const displayToSource = (displayCycle: number) => Number.isInteger(displayCycle) && displayCycle >= 0 && displayCycle < timeline.cycleCount ? displayCycle : undefined;
  return {
    sourceCycleCount: timeline.cycleCount,
    displayCycleCount: timeline.cycleCount,
    isIdentity: true,
    sourceToDisplay,
    displayToSource,
    displayBoundaryAtOrAfterSource: (sourceCycle) => Math.min(timeline.cycleCount, Math.max(0, Math.ceil(sourceCycle))),
    collapsedGroupAtSource: () => undefined,
    labelFor: (displayCycle) => labelForSourceCycle(timeline, displayCycle),
  };
}

export function buildDisplayTimeMapping(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): DisplayTimeMapping {
  const foldOwnerSegments = buildFoldOwnerSegments(timeGroups);
  const collapsedRanges: [number, number][] = [];
  for (const group of timeGroups
    .filter((group) => group.presentation?.collapsed)
    .map((group) => [group.start, group.end] as const)
    .sort((left, right) => left[0] - right[0])) {
    const previous = collapsedRanges[collapsedRanges.length - 1];
    if (previous && group[0] <= previous[1]) previous[1] = Math.max(previous[1], group[1]);
    else collapsedRanges.push([group[0], group[1]]);
  }
  if (collapsedRanges.length === 0) return identityMapping(timeline);

  const folds: FoldInterval[] = [];
  let removed = 0;
  for (const [start, end] of collapsedRanges) {
    folds.push({ start, end, removedBefore: removed, displayStart: start - removed });
    removed += end - start;
  }
  const displayCycleCount = timeline.cycleCount - removed;
  const sourceToDisplay = (sourceCycle: number): number | undefined => {
    if (!Number.isInteger(sourceCycle) || sourceCycle < 0 || sourceCycle >= timeline.cycleCount) return undefined;
    const preceding = upperBound(folds, (fold) => fold.start <= sourceCycle) - 1;
    if (preceding >= 0) {
      const fold = folds[preceding]!;
      if (sourceCycle < fold.end) return undefined;
      return sourceCycle - (fold.removedBefore + fold.end - fold.start);
    }
    return sourceCycle;
  };
  const displayToSource = (displayCycle: number): number | undefined => {
    if (!Number.isInteger(displayCycle) || displayCycle < 0 || displayCycle >= displayCycleCount) return undefined;
    const preceding = upperBound(folds, (fold) => fold.displayStart <= displayCycle) - 1;
    return displayCycle + (preceding >= 0 ? folds[preceding]!.removedBefore + folds[preceding]!.end - folds[preceding]!.start : 0);
  };
  const displayBoundaryAtOrAfterSource = (sourceCycle: number): number => {
    if (sourceCycle <= 0) return 0;
    if (sourceCycle >= timeline.cycleCount) return displayCycleCount;
    const preceding = upperBound(folds, (fold) => fold.start <= sourceCycle) - 1;
    if (preceding >= 0) {
      const fold = folds[preceding]!;
      if (sourceCycle < fold.end) return fold.displayStart;
    }
    return sourceCycle - (preceding >= 0 ? folds[preceding]!.removedBefore + folds[preceding]!.end - folds[preceding]!.start : 0);
  };

  // LabelAnchor.source is a source-timeline boundary; its display value is
  // the ruler label shown at the corresponding rendered boundary.
  return {
    sourceCycleCount: timeline.cycleCount,
    displayCycleCount,
    isIdentity: false,
    sourceToDisplay,
    displayToSource,
    displayBoundaryAtOrAfterSource,
    collapsedGroupAtSource: (sourceCycle) => foldOwnerAtSource(foldOwnerSegments, timeGroups, sourceCycle),
    // The exclusive terminal boundary is not a rendered cycle slot and is
    // therefore absent from displayToSource. It must still retain the
    // canonical half-open timeline end label after a fold; never fall back to
    // the last visible source cycle (or an arbitrary display index).
    labelFor: (displayCycle) => {
      const sourceCycle = displayCycle === displayCycleCount ? timeline.cycleCount : displayToSource(displayCycle);
      return sourceCycle === undefined ? displayCycle : labelForSourceCycle(timeline, sourceCycle);
    },
  };
}

export interface DisplayTimeMappingCacheMetrics {
  readonly builds: number;
  readonly hits: number;
  readonly sourceCyclesVisited: number;
  readonly foldRangesVisited: number;
  readonly buildDurationMs: number;
  readonly buildDurationMedianMs: number;
  readonly buildDurationP95Ms: number;
  readonly valueRemapPasses: number;
  readonly identityFastPathHits: number;
  readonly mappingKeyBuilds: number;
}

/** Owns the derived display-time mapping for one projection consumer. */
export class DisplayTimeMappingCache {
  private mapping: DisplayTimeMapping | undefined;
  private builds = 0;
  private hits = 0;
  private sourceCyclesVisited = 0;
  private foldRangesVisited = 0;
  private buildDurationMs = 0;
  private buildDurationsMs: number[] = [];
  private valueRemapPasses = 0;
  private identityFastPathHits = 0;
  private lastCycleCount: number | undefined;
  private lastLabelAnchors: Timeline["labelAnchors"] | undefined;
  private lastTimeGroups: readonly TimeGroup[] | undefined;

  get(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): DisplayTimeMapping {
    if (this.mapping !== undefined && this.lastCycleCount === timeline.cycleCount && this.lastLabelAnchors === timeline.labelAnchors && this.lastTimeGroups === timeGroups) {
      this.hits += 1;
      return this.mapping;
    }
    this.lastCycleCount = timeline.cycleCount;
    this.lastLabelAnchors = timeline.labelAnchors;
    this.lastTimeGroups = timeGroups;
    const started = Date.now();
    this.mapping = buildDisplayTimeMapping(timeline, timeGroups);
    this.builds += 1;
    // Mapping construction visits only the collapsed intervals; no source
    // cycle-sized table is allocated or traversed.
    this.foldRangesVisited += timeGroups.filter((group) => group.presentation?.collapsed).length;
    const durationMs = Date.now() - started;
    this.buildDurationMs += durationMs;
    this.buildDurationsMs.push(durationMs);
    return this.mapping;
  }

  metrics(): DisplayTimeMappingCacheMetrics {
    return {
      builds: this.builds,
      hits: this.hits,
      sourceCyclesVisited: this.sourceCyclesVisited,
      foldRangesVisited: this.foldRangesVisited,
      buildDurationMs: this.buildDurationMs,
      buildDurationMedianMs: percentile(this.buildDurationsMs, 0.5),
      buildDurationP95Ms: percentile(this.buildDurationsMs, 0.95),
      valueRemapPasses: this.valueRemapPasses,
      identityFastPathHits: this.identityFastPathHits,
      // Kept as a zero-valued diagnostic field for existing consumers; cache
      // validity is now strictly collection-identity based and builds no key.
      mappingKeyBuilds: 0,
    };
  }

  remapValueChanges(values: readonly SignalValueChange[], mapping: DisplayTimeMapping): readonly SignalValueChange[] {
    if (mapping.isIdentity) this.identityFastPathHits += 1;
    else this.valueRemapPasses += 1;
    return remapValueChangesToDisplay(values, mapping);
  }

  clear(): void {
    this.mapping = undefined;
    this.lastCycleCount = undefined;
    this.lastLabelAnchors = undefined;
    this.lastTimeGroups = undefined;
  }
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]!;
}

export function remapValueChangesToDisplay(values: readonly SignalValueChange[], mapping: DisplayTimeMapping): readonly SignalValueChange[] {
  if (mapping.isIdentity) return values;
  const result: SignalValueChange[] = [];
  let lastValue: SignalValueChange["value"] | undefined;
  const displayForSource = (sourceCycle: number): number => {
    return firstDisplayAtOrAfterSource(mapping, sourceCycle);
  };

  // Map sparse source changes directly to their visible display boundary.
  // Multiple changes inside one folded interval land on its first visible
  // successor; only the last hidden value can be observed there.
  let previousDisplay = -1;
  let pendingAtDisplay: SignalValueChange | undefined;
  const emitPending = (display: number): void => {
    if (pendingAtDisplay && pendingAtDisplay.value !== lastValue) {
      result.push({ ...pendingAtDisplay, start: display });
      lastValue = pendingAtDisplay.value;
    } else if (pendingAtDisplay) {
      lastValue = pendingAtDisplay.value;
    }
    pendingAtDisplay = undefined;
  };

  for (const change of values) {
    const display = displayForSource(change.start);
    if (display >= mapping.displayCycleCount) continue;
    if (display !== previousDisplay) {
      if (previousDisplay >= 0) emitPending(previousDisplay);
      previousDisplay = display;
    }
    pendingAtDisplay = change;
  }
  if (previousDisplay >= 0) emitPending(previousDisplay);
  return result;
}
