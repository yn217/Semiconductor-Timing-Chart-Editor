import type { ScenarioDocumentModel, ScenarioId, ScenarioSignalState, SignalId, SignalValueChange, TimingScenario } from "./types.js";

export type ScenarioSignalDifference = Readonly<{
  signalId: SignalId;
  ranges: readonly Readonly<{ start: number; end: number }>[];
}>;

type ClockState = Extract<ScenarioSignalState, { kind: "clock" }>;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** The latest change at or before the cycle; changes are sorted by start. */
function latestChange(changes: readonly SignalValueChange[], cycle: number): SignalValueChange | undefined {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (changes[middle]!.start <= cycle) low = middle + 1;
    else high = middle;
  }
  return changes[low - 1];
}

function stateAt(state: ScenarioSignalState | undefined, cycle: number): unknown {
  if (!state) return undefined;
  if (state.kind === "clock") return enableAt(state, cycle);
  const change = latestChange(state.values, cycle);
  const current = change === undefined ? undefined : { value: change.value, ...(change.displayLabel === undefined ? {} : { displayLabel: change.displayLabel }) };
  return { kind: state.kind, current, resetSemantics: state.resetSemantics };
}

/** Clock enable is compared by its values only: Duplicate remaps change IDs without changing behaviour. */
function enableAt(state: ClockState, cycle: number): string | number | undefined {
  return state.enable === undefined ? undefined : latestChange(state.enable, cycle)?.value;
}

/** Everything about a Clock except its enable waveform. The edge counter anchor is compared by the resolved Bookmark start, not by its ID. */
function clockStaticIdentity(scenario: TimingScenario, state: ClockState): unknown {
  const { anchorId, ...edgeCounter } = state.edgeCounter;
  const anchor = anchorId === undefined ? undefined : scenario.bookmarks.find((bookmark) => bookmark.id === anchorId)?.start ?? "unresolved";
  return { generator: state.generator, edgeCounter, anchor };
}

function mergeRange(ranges: { start: number; end: number }[], start: number, end: number): void {
  const previous = ranges.at(-1);
  if (previous?.end === start) previous.end = end;
  else ranges.push({ start, end });
}

/** Compare active waveform states by stable Signal ID and event boundaries, never by scanning every cycle. */
export function compareScenarioSignalStreams(
  model: ScenarioDocumentModel,
  leftScenarioId: ScenarioId,
  rightScenarioId: ScenarioId,
): readonly ScenarioSignalDifference[] {
  if (leftScenarioId === rightScenarioId) return [];
  const left = model.scenarios.find((scenario) => scenario.id === leftScenarioId);
  const right = model.scenarios.find((scenario) => scenario.id === rightScenarioId);
  if (!left || !right) throw new Error("Both comparison Scenarios must exist in the Timing Document.");
  const start = Math.min(left.timeline.start, right.timeline.start);
  const end = Math.max(left.timeline.end, right.timeline.end);
  const differences: ScenarioSignalDifference[] = [];
  for (const definition of model.signalDefinitions) {
    if (definition.type === "commentRow") continue;
    const leftState = left.signalStates[definition.id];
    const rightState = right.signalStates[definition.id];
    if (end <= start) continue;
    const whole = [{ start, end }];
    if (leftState?.kind === "clock" || rightState?.kind === "clock") {
      const bothClocks = leftState?.kind === "clock" && rightState?.kind === "clock";
      const ranges = bothClocks && sameValue(clockStaticIdentity(left, leftState), clockStaticIdentity(right, rightState))
        ? enableDifferenceRanges(leftState, rightState, start, end)
        : sameValue(leftState, rightState) ? [] : whole;
      if (ranges.length > 0) differences.push({ signalId: definition.id, ranges });
      continue;
    }
    const boundaries = new Set<number>([start, end]);
    for (const state of [leftState, rightState]) {
      if (state?.kind === "values") for (const change of state.values) if (change.start > start && change.start < end) boundaries.add(change.start);
    }
    const sorted = [...boundaries].sort((a, b) => a - b);
    const ranges: { start: number; end: number }[] = [];
    for (let index = 0; index + 1 < sorted.length; index += 1) {
      const from = sorted[index]!;
      const to = sorted[index + 1]!;
      if (to > from && !sameValue(stateAt(leftState, from), stateAt(rightState, from))) mergeRange(ranges, from, to);
    }
    if (ranges.length > 0) differences.push({ signalId: definition.id, ranges });
  }
  return differences;
}

function enableDifferenceRanges(left: ClockState, right: ClockState, start: number, end: number): { start: number; end: number }[] {
  const boundaries = new Set<number>([start, end]);
  for (const state of [left, right]) for (const change of state.enable ?? []) if (change.start > start && change.start < end) boundaries.add(change.start);
  const sorted = [...boundaries].sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const from = sorted[index]!;
    const to = sorted[index + 1]!;
    if (to > from && enableAt(left, from) !== enableAt(right, from)) mergeRange(ranges, from, to);
  }
  return ranges;
}
