import type { SignalValueChange, Timeline, TimeGroup } from "@timing-chart-v2/schema";

export interface DisplayTimeMapping {
  readonly displayCycleCount: number;
  readonly isIdentity: boolean;
  readonly sourceToDisplay: readonly (number | undefined)[];
  readonly displayToSource: readonly number[];
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
  const sources = mapping.displayToSource.slice(start, end);
  return { displayStart: start, displayEnd: end, sourceStart: sources[0] ?? 0, sourceEnd: (sources.at(-1) ?? 0) + 1, overscanCycles, rowStart, rowEnd, generation, pinnedIds: [...pinnedIds] };
}

export type HiddenSourcePositionPolicy = "floor" | "ceil" | "interpolate" | "omit";

/** Resolve a source position without inventing display-cycle zero for folded input. */
export function resolveSourcePosition(mapping: DisplayTimeMapping, sourceCycle: number, policy: HiddenSourcePositionPolicy = "omit"): number | undefined {
  if (!Number.isFinite(sourceCycle)) return undefined;
  if (sourceCycle >= mapping.sourceToDisplay.length) return mapping.displayCycleCount;
  const clamped = Math.max(0, sourceCycle);
  if (Number.isInteger(clamped) && mapping.sourceToDisplay[clamped] !== undefined) return mapping.sourceToDisplay[clamped];
  if (policy === "omit") return undefined;
  const index = Math.floor(clamped);
  if (policy === "interpolate") {
    const lower = mapping.sourceToDisplay[index];
    const upper = mapping.sourceToDisplay[index + 1];
    if (lower !== undefined && upper !== undefined) return lower + (clamped - index) * (upper - lower);
    if (lower !== undefined) return lower;
    if (upper !== undefined) return upper;
  }
  if (policy === "floor") for (let cycle = Math.min(index, mapping.sourceToDisplay.length - 1); cycle >= 0; cycle -= 1) if (mapping.sourceToDisplay[cycle] !== undefined) return mapping.sourceToDisplay[cycle];
  if (policy === "ceil") for (let cycle = Math.max(0, index); cycle < mapping.sourceToDisplay.length; cycle += 1) if (mapping.sourceToDisplay[cycle] !== undefined) return mapping.sourceToDisplay[cycle];
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

const identityMapping = (timeline: Pick<Timeline, "cycleCount" | "labelAnchors">): DisplayTimeMapping => {
  const displayToSource = Array.from({ length: timeline.cycleCount }, (_, index) => index);
  return { displayCycleCount: timeline.cycleCount, isIdentity: true, sourceToDisplay: displayToSource, displayToSource, labelFor: (displayCycle) => labelForSourceCycle(timeline.labelAnchors, displayCycle) };
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

  const sourceToDisplay: (number | undefined)[] = [];
  const displayToSource: number[] = [];
  let display = 0;
  let collapsedRangeIndex = 0;
  for (let source = 0; source < timeline.cycleCount; source += 1) {
    while (collapsedRangeIndex < collapsedRanges.length && source >= collapsedRanges[collapsedRangeIndex]![1]) collapsedRangeIndex += 1;
    const currentRange = collapsedRanges[collapsedRangeIndex];
    const insideCollapsedRange = currentRange !== undefined && source >= currentRange[0] && source < currentRange[1];
    if (insideCollapsedRange) { sourceToDisplay[source] = undefined; continue; }
    sourceToDisplay[source] = display;
    displayToSource[display] = source;
    display += 1;
  }

  // LabelAnchor.source is a source-timeline boundary; its display value is
  // the ruler label shown at the corresponding rendered boundary.
  return {
    displayCycleCount: display,
    isIdentity: false,
    sourceToDisplay,
    displayToSource,
    // The exclusive terminal boundary is not a rendered cycle slot and is
    // therefore absent from displayToSource. It must still retain the
    // canonical half-open timeline end label after a fold; never fall back to
    // the last visible source cycle (or an arbitrary display index).
    labelFor: (displayCycle) => {
      const sourceCycle = displayCycle === display ? timeline.cycleCount : displayToSource[displayCycle];
      return sourceCycle === undefined ? displayCycle : labelForSourceCycle(timeline.labelAnchors, sourceCycle);
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
  private key: string | undefined;
  private mapping: DisplayTimeMapping | undefined;
  private builds = 0;
  private hits = 0;
  private sourceCyclesVisited = 0;
  private foldRangesVisited = 0;
  private buildDurationMs = 0;
  private buildDurationsMs: number[] = [];
  private valueRemapPasses = 0;
  private identityFastPathHits = 0;
  private mappingKeyBuilds = 0;
  private lastCycleCount: number | undefined;
  private lastLabelAnchors: Timeline["labelAnchors"] | undefined;
  private lastTimeGroups: readonly TimeGroup[] | undefined;

  get(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): DisplayTimeMapping {
    if (this.mapping !== undefined && this.lastCycleCount === timeline.cycleCount && this.lastLabelAnchors === timeline.labelAnchors && this.lastTimeGroups === timeGroups) {
      this.hits += 1;
      return this.mapping;
    }
    this.mappingKeyBuilds += 1;
    const nextKey = displayTimeMappingKey(timeline, timeGroups);
    this.lastCycleCount = timeline.cycleCount;
    this.lastLabelAnchors = timeline.labelAnchors;
    this.lastTimeGroups = timeGroups;
    if (this.mapping !== undefined && this.key === nextKey) {
      this.hits += 1;
      return this.mapping;
    }
    this.key = nextKey;
    const started = Date.now();
    this.mapping = buildDisplayTimeMapping(timeline, timeGroups);
    this.builds += 1;
    this.sourceCyclesVisited += timeline.cycleCount;
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
      mappingKeyBuilds: this.mappingKeyBuilds,
    };
  }

  remapValueChanges(values: readonly SignalValueChange[], mapping: DisplayTimeMapping): readonly SignalValueChange[] {
    if (mapping.isIdentity) this.identityFastPathHits += 1;
    else this.valueRemapPasses += 1;
    return remapValueChangesToDisplay(values, mapping);
  }

  clear(): void {
    this.key = undefined;
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

function displayTimeMappingKey(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): string {
  const anchors = timeline.labelAnchors
    .map((anchor) => `${anchor.source}:${anchor.display}`)
    .sort()
    .join(",");
  const collapsedGroups = timeGroups
    .filter((group) => group.presentation?.collapsed)
    .map((group) => `${group.start}:${group.end}:${group.id}`)
    .sort()
    .join(",");
  return `${timeline.cycleCount}|${anchors}|${collapsedGroups}`;
}

export function remapValueChangesToDisplay(values: readonly SignalValueChange[], mapping: DisplayTimeMapping): readonly SignalValueChange[] {
  if (mapping.isIdentity) return values;
  const result: SignalValueChange[] = [];
  let lastValue: SignalValueChange["value"] | undefined;
  let cursor = 0;
  for (let display = 0; display < mapping.displayCycleCount; display += 1) {
    const source = mapping.displayToSource[display]!;
    while (cursor + 1 < values.length && values[cursor + 1]!.start <= source) cursor += 1;
    const active = values[cursor]?.value;
    if (active === undefined) continue;
    if (active !== lastValue) {
      const sourceChange = values[cursor];
      if (sourceChange) result.push({ ...sourceChange, start: display });
      lastValue = active;
    }
  }
  return result;
}
