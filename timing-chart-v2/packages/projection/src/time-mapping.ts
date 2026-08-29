import type { SignalValueChange, Timeline, TimeGroup } from "@timing-chart-v2/schema";

export interface DisplayTimeMapping {
  readonly displayCycleCount: number;
  readonly isIdentity: boolean;
  readonly sourceToDisplay: readonly (number | undefined)[];
  readonly displayToSource: readonly number[];
  readonly labelFor: (displayCycle: number) => number;
}

const identityMapping = (cycleCount: number): DisplayTimeMapping => {
  const displayToSource = Array.from({ length: cycleCount }, (_, index) => index);
  return { displayCycleCount: cycleCount, isIdentity: true, sourceToDisplay: displayToSource, displayToSource, labelFor: (displayCycle) => displayCycle };
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
  if (collapsedRanges.length === 0) return identityMapping(timeline.cycleCount);

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
  const labelOverrides = new Map(timeline.labelAnchors.map((anchor) => [anchor.source, anchor.display]));
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
      return labelOverrides.get(sourceCycle ?? -1) ?? sourceCycle ?? displayCycle;
    },
  };
}

export interface DisplayTimeMappingCacheMetrics {
  readonly builds: number;
  readonly hits: number;
  readonly sourceCyclesVisited: number;
  readonly foldRangesVisited: number;
  readonly buildDurationMs: number;
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

  get(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): DisplayTimeMapping {
    const nextKey = displayTimeMappingKey(timeline, timeGroups);
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
    this.buildDurationMs += Date.now() - started;
    return this.mapping;
  }

  metrics(): DisplayTimeMappingCacheMetrics {
    return { builds: this.builds, hits: this.hits, sourceCyclesVisited: this.sourceCyclesVisited, foldRangesVisited: this.foldRangesVisited, buildDurationMs: this.buildDurationMs };
  }

  clear(): void {
    this.key = undefined;
    this.mapping = undefined;
  }
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
      result.push({ start: display, value: active });
      lastValue = active;
    }
  }
  return result;
}
