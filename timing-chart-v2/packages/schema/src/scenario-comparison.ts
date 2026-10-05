import type { ScenarioDocumentModel, ScenarioId, ScenarioSignalState, SignalId } from "./types.js";

export type ScenarioSignalDifference = Readonly<{
  signalId: SignalId;
  ranges: readonly Readonly<{ start: number; end: number }>[];
}>;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stateAt(state: ScenarioSignalState | undefined, cycle: number): unknown {
  if (!state) return undefined;
  if (state.kind === "clock") return { kind: state.kind, generator: state.generator, enable: state.enable, edgeCounter: state.edgeCounter };
  let low = 0;
  let high = state.values.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (state.values[middle]!.start <= cycle) low = middle + 1;
    else high = middle;
  }
  const change = state.values[low - 1];
  const current = change === undefined ? undefined : { value: change.value, ...(change.displayLabel === undefined ? {} : { displayLabel: change.displayLabel }) };
  return { kind: state.kind, current, resetSemantics: state.resetSemantics };
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
    if (leftState?.kind === "clock" || rightState?.kind === "clock") {
      if (!sameValue(leftState, rightState) && end > start) differences.push({ signalId: definition.id, ranges: [{ start, end }] });
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
