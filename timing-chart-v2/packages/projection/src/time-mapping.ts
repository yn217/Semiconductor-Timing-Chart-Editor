import type { SignalValueChange, Timeline, TimeGroup } from "@timing-chart-v2/schema";

export interface DisplayTimeMapping {
  readonly displayCycleCount: number;
  readonly sourceToDisplay: readonly (number | undefined)[];
  readonly displayToSource: readonly number[];
  readonly labelFor: (displayCycle: number) => number;
}

const identityMapping = (cycleCount: number): DisplayTimeMapping => {
  const displayToSource = Array.from({ length: cycleCount }, (_, index) => index);
  return { displayCycleCount: cycleCount, sourceToDisplay: displayToSource, displayToSource, labelFor: (displayCycle) => displayCycle };
};

export function buildDisplayTimeMapping(timeline: Pick<Timeline, "cycleCount" | "labelAnchors">, timeGroups: readonly TimeGroup[]): DisplayTimeMapping {
  const collapsedRanges = timeGroups
    .filter((group) => group.presentation?.collapsed)
    .map((group) => [group.start, group.end] as const)
    .sort((left, right) => left[0] - right[0]);
  if (collapsedRanges.length === 0) return identityMapping(timeline.cycleCount);

  const sourceToDisplay: (number | undefined)[] = [];
  const displayToSource: number[] = [];
  let display = 0;
  for (let source = 0; source < timeline.cycleCount; source += 1) {
    const insideCollapsedRange = collapsedRanges.some(([start, end]) => source >= start && source < end);
    if (insideCollapsedRange) { sourceToDisplay[source] = undefined; continue; }
    sourceToDisplay[source] = display;
    displayToSource[display] = source;
    display += 1;
  }

  const labelOverrides = new Map(timeline.labelAnchors.map((anchor) => [anchor.display, anchor.source]));
  return {
    displayCycleCount: display,
    sourceToDisplay,
    displayToSource,
    labelFor: (displayCycle) => labelOverrides.get(displayCycle) ?? displayToSource[displayCycle] ?? displayCycle,
  };
}

export function remapValueChangesToDisplay(values: readonly SignalValueChange[], mapping: DisplayTimeMapping): readonly SignalValueChange[] {
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
