import type { SignalValueChange, Timeline, TimeGroup } from "@timing-chart-v2/schema";

export interface DisplayTimeMapping {
  readonly sourceCycleCount: number;
  readonly displayCycleCount: number;
  readonly isIdentity: boolean;
  readonly collapsedRanges: readonly (readonly [start: number, end: number])[];
  readonly collapsedGroupAtSource: (sourceCycle: number) => TimeGroup | undefined;
  readonly displayAtSource: (sourceCycle: number) => number | undefined;
  readonly sourceAtDisplay: (displayCycle: number) => number | undefined;
  readonly labelFor: (displayCycle: number) => number;
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
  const sourceStart = start < end ? mapping.sourceAtDisplay(start) ?? mapping.sourceCycleCount : mapping.sourceCycleCount;
  const sourceEnd = start < end ? (mapping.sourceAtDisplay(end - 1) ?? sourceStart - 1) + 1 : sourceStart;
  return { displayStart: start, displayEnd: end, sourceStart, sourceEnd, overscanCycles, rowStart, rowEnd, generation, pinnedIds: [...pinnedIds] };
}

export type HiddenSourcePositionPolicy = "floor" | "ceil" | "interpolate" | "omit";

/** Resolve a source position without inventing display-cycle zero for folded input. */
export function resolveSourcePosition(mapping: DisplayTimeMapping, sourceCycle: number, policy: HiddenSourcePositionPolicy = "omit"): number | undefined {
  if (!Number.isFinite(sourceCycle)) return undefined;
  if (sourceCycle >= mapping.sourceCycleCount) return mapping.displayCycleCount;
  const clamped = Math.max(0, sourceCycle);
  const direct = mapping.displayAtSource(clamped);
  if (direct !== undefined) return direct;
  if (policy === "omit") return undefined;
  const index = Math.floor(clamped);
  if (policy === "interpolate") {
    const lower = mapping.displayAtSource(index);
    const upper = mapping.displayAtSource(index + 1);
    if (lower !== undefined && upper !== undefined) return lower + (clamped - index) * (upper - lower);
    if (lower !== undefined) return lower;
    if (upper !== undefined) return upper;
  }
  const folded = collapsedRangeContaining(mapping.collapsedRanges, clamped);
  if (folded && policy === "floor") return folded[0] > 0 ? mapping.displayAtSource(folded[0] - 1) : undefined;
  if (folded && policy === "ceil") return folded[1] < mapping.sourceCycleCount ? mapping.displayAtSource(folded[1]) : undefined;
  if (policy === "floor" || policy === "ceil") return mapping.displayAtSource(Math.min(index, mapping.sourceCycleCount - 1));
  return undefined;
}

function collapsedRangeContaining(ranges: DisplayTimeMapping["collapsedRanges"], sourceCycle: number): DisplayTimeMapping["collapsedRanges"][number] | undefined {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ranges[middle]![0] <= sourceCycle) low = middle + 1;
    else high = middle;
  }
  const candidate = ranges[low - 1];
  return candidate && sourceCycle < candidate[1] ? candidate : undefined;
}

function buildCollapsedGroupLookup(groups: readonly TimeGroup[]): (sourceCycle: number) => TimeGroup | undefined {
  const collapsed = groups.flatMap((group) => group.presentation?.collapsed ? [group] : []);
  if (collapsed.length === 0) return () => undefined;
  const events = collapsed.flatMap((group, index) => [
    { cycle: group.start, starts: true, index },
    { cycle: group.end, starts: false, index },
  ]).sort((left, right) => left.cycle - right.cycle || Number(left.starts) - Number(right.starts));
  const active = new Uint8Array(collapsed.length);
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
  const pop = () => {
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heap.length) break;
        const right = left + 1;
        const child = right < heap.length && heap[right]! < heap[left]! ? right : left;
        if (heap[child]! >= last) break;
        heap[index] = heap[child]!;
        index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  const segments: { start: number; end: number; group: TimeGroup }[] = [];
  for (let eventIndex = 0; eventIndex < events.length;) {
    const cycle = events[eventIndex]!.cycle;
    while (eventIndex < events.length && events[eventIndex]!.cycle === cycle && !events[eventIndex]!.starts) {
      active[events[eventIndex]!.index] = 0;
      eventIndex += 1;
    }
    while (eventIndex < events.length && events[eventIndex]!.cycle === cycle) {
      const event = events[eventIndex]!;
      active[event.index] = 1;
      push(event.index);
      eventIndex += 1;
    }
    while (heap.length > 0 && active[heap[0]!] === 0) pop();
    const nextCycle = events[eventIndex]?.cycle ?? cycle;
    const group = heap.length > 0 ? collapsed[heap[0]!] : undefined;
    if (group && nextCycle > cycle) {
      const previous = segments.at(-1);
      if (previous?.end === cycle && previous.group.id === group.id) previous.end = nextCycle;
      else segments.push({ start: cycle, end: nextCycle, group });
    }
  }
  return (sourceCycle) => {
    let low = 0, high = segments.length;
    while (low < high) { const middle = (low + high) >>> 1; if (segments[middle]!.start <= sourceCycle) low = middle + 1; else high = middle; }
    const segment = segments[low - 1];
    return segment && sourceCycle < segment.end ? segment.group : undefined;
  };
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

const identityMapping = (timeline: Pick<Timeline, "cycleCount" | "labelAnchors">): DisplayTimeMapping => {
  return {
    sourceCycleCount: timeline.cycleCount,
    displayCycleCount: timeline.cycleCount,
    isIdentity: true,
    collapsedRanges: [],
    collapsedGroupAtSource: () => undefined,
    displayAtSource: (sourceCycle) => Number.isInteger(sourceCycle) && sourceCycle >= 0 && sourceCycle < timeline.cycleCount ? sourceCycle : undefined,
    sourceAtDisplay: (displayCycle) => Number.isInteger(displayCycle) && displayCycle >= 0 && displayCycle < timeline.cycleCount ? displayCycle : undefined,
    labelFor: (displayCycle) => labelForSourceCycle(timeline, displayCycle),
  };
};

export function buildDisplayTimeMapping(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): DisplayTimeMapping {
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

  const collapsedPrefix: number[] = [];
  const collapsedDisplayStarts: number[] = [];
  let removed = 0;
  for (const [start, end] of collapsedRanges) {
    collapsedDisplayStarts.push(start - removed);
    removed += end - start;
    collapsedPrefix.push(removed);
  }
  const display = timeline.cycleCount - removed;
  const displayAtSource = (sourceCycle: number): number | undefined => {
    if (!Number.isInteger(sourceCycle) || sourceCycle < 0 || sourceCycle >= timeline.cycleCount) return undefined;
    const folded = collapsedRangeContaining(collapsedRanges, sourceCycle);
    if (folded) return undefined;
    let low = 0, high = collapsedRanges.length;
    while (low < high) { const middle = (low + high) >>> 1; if (collapsedRanges[middle]![1] <= sourceCycle) low = middle + 1; else high = middle; }
    return sourceCycle - (low === 0 ? 0 : collapsedPrefix[low - 1]!);
  };
  const sourceAtDisplay = (displayCycle: number): number | undefined => {
    if (!Number.isInteger(displayCycle) || displayCycle < 0 || displayCycle >= display) return undefined;
    let low = 0, high = collapsedDisplayStarts.length;
    while (low < high) { const middle = (low + high) >>> 1; if (collapsedDisplayStarts[middle]! <= displayCycle) low = middle + 1; else high = middle; }
    return displayCycle + (low === 0 ? 0 : collapsedPrefix[low - 1]!);
  };

  // LabelAnchor.source is a source-timeline boundary; its display value is
  // the ruler label shown at the corresponding rendered boundary.
  return {
    sourceCycleCount: timeline.cycleCount,
    displayCycleCount: display,
    isIdentity: false,
    collapsedRanges,
    collapsedGroupAtSource: buildCollapsedGroupLookup(timeGroups),
    // The exclusive terminal boundary is not a rendered cycle slot and is
    // therefore absent from sourceAtDisplay. It must still retain the
    // canonical half-open timeline end label after a fold; never fall back to
    // the last visible source cycle (or an arbitrary display index).
    labelFor: (displayCycle) => {
      const sourceCycle = displayCycle === display ? timeline.cycleCount : sourceAtDisplay(displayCycle);
      return sourceCycle === undefined ? displayCycle : labelForSourceCycle(timeline, sourceCycle);
    },
    displayAtSource,
    sourceAtDisplay,
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
}

/** Owns the derived display-time mapping for one projection consumer. */
export class DisplayTimeMappingCache {
  private cycleCount: number | undefined;
  private labelAnchors: Timeline["labelAnchors"] | undefined;
  private timeGroups: readonly TimeGroup[] | undefined;
  private mapping: DisplayTimeMapping | undefined;
  private builds = 0;
  private hits = 0;
  private sourceCyclesVisited = 0;
  private foldRangesVisited = 0;
  private buildDurationMs = 0;
  private buildDurationsMs: number[] = [];
  private valueRemapPasses = 0;
  private identityFastPathHits = 0;

  get(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): DisplayTimeMapping {
    // Canonical collections are immutable: their identity is the version key.
    // Avoid serializing/sorting every LabelAnchor and collapsed TimeGroup just
    // to discover that this cache still owns the exact same inputs.
    if (this.mapping !== undefined
      && this.cycleCount === timeline.cycleCount
      && this.labelAnchors === timeline.labelAnchors
      && this.timeGroups === timeGroups) {
      this.hits += 1;
      return this.mapping;
    }
    this.cycleCount = timeline.cycleCount;
    this.labelAnchors = timeline.labelAnchors;
    this.timeGroups = timeGroups;
    const started = Date.now();
    this.mapping = buildDisplayTimeMapping(timeline, timeGroups);
    this.builds += 1;
    // Mapping construction now indexes fold intervals rather than enumerating
    // every source cycle; this counter intentionally remains unchanged.
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
    };
  }

  remapValueChanges(values: readonly SignalValueChange[], mapping: DisplayTimeMapping): readonly SignalValueChange[] {
    if (mapping.isIdentity) this.identityFastPathHits += 1;
    else this.valueRemapPasses += 1;
    return remapValueChangesToDisplay(values, mapping);
  }

  clear(): void {
    this.cycleCount = undefined;
    this.labelAnchors = undefined;
    this.timeGroups = undefined;
    this.mapping = undefined;
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
  let valueIndex = 0;
  let foldIndex = 0;
  let activeChange: SignalValueChange | undefined;
  while (true) {
    const nextValueCycle = values[valueIndex]?.start ?? Infinity;
    const nextFoldEnd = mapping.collapsedRanges[foldIndex]?.[1] ?? Infinity;
    const sourceCycle = Math.min(nextValueCycle, nextFoldEnd);
    if (sourceCycle >= mapping.sourceCycleCount) break;

    while (valueIndex < values.length && values[valueIndex]!.start <= sourceCycle) {
      activeChange = values[valueIndex]!;
      valueIndex += 1;
    }
    while (foldIndex < mapping.collapsedRanges.length && mapping.collapsedRanges[foldIndex]![1] <= sourceCycle) foldIndex += 1;

    const displayCycle = mapping.displayAtSource(sourceCycle);
    if (displayCycle !== undefined && activeChange && activeChange.value !== lastValue) {
      result.push({ ...activeChange, start: displayCycle });
      lastValue = activeChange.value;
    }
  }
  return result;
}
