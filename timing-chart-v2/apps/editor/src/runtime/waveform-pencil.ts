import type { SignalValueChange } from "@timing-chart-v2/schema";

export type BinaryLevel = 0 | 1;
export type RowPosition = number;
export type WaveformPencilStroke = Readonly<{
  readonly cycleCount: number;
  readonly initial: readonly SignalValueChange[];
  readonly samples: Map<number, BinaryLevel>;
  readonly last: Readonly<{ cycle: number; rowPosition: RowPosition }>;
}>;

const levelAt = (rowPosition: RowPosition): BinaryLevel => rowPosition < 0.5 ? 1 : 0;

export function beginWaveformPencilStroke(values: readonly SignalValueChange[], cycleCount: number, cycle: number, rowPosition: RowPosition): WaveformPencilStroke | undefined {
  if (!Number.isInteger(cycleCount) || cycleCount < 1 || !Number.isInteger(cycle) || cycle < 0 || cycle >= cycleCount || !Number.isFinite(rowPosition)) return undefined;
  const position = Math.max(0, Math.min(1, rowPosition));
  const samples = new Map<number, BinaryLevel>([[cycle, levelAt(position)]]);
  return { cycleCount, initial: values, samples, last: { cycle, rowPosition: position } };
}

/** Interpolate the pointer path at each crossed source-cycle boundary. Later visits replace earlier samples. */
export function extendWaveformPencilStroke(stroke: WaveformPencilStroke, cycle: number, rowPosition: RowPosition): WaveformPencilStroke {
  if (!Number.isInteger(cycle) || cycle < 0 || cycle >= stroke.cycleCount || !Number.isFinite(rowPosition)) return stroke;
  const position = Math.max(0, Math.min(1, rowPosition));
  const from = stroke.last;
  const distance = Math.abs(cycle - from.cycle);
  if (distance === 0) {
    stroke.samples.set(cycle, levelAt(position));
    return { ...stroke, last: { cycle, rowPosition: position } };
  }
  const direction = Math.sign(cycle - from.cycle);
  for (let step = 1; step <= distance; step += 1) {
    const ratio = step / distance;
    const interpolatedPosition = from.rowPosition + (position - from.rowPosition) * ratio;
    stroke.samples.set(from.cycle + direction * step, levelAt(interpolatedPosition));
  }
  return { ...stroke, last: { cycle, rowPosition: position } };
}

/** Apply only painted cells, rebuilding transitions at their boundaries and retaining IDs for surviving semantic changes. */
export function finishWaveformPencilStroke(stroke: WaveformPencilStroke): readonly SignalValueChange[] {
  const initial = [...stroke.initial].sort((left, right) => left.start - right.start);
  const originalAt = new Map(initial.map((change) => [change.start, change]));
  const boundaries = new Set<number>(initial.map((change) => change.start));
  const affectedBoundaries = new Set<number>();
  for (const cycle of stroke.samples.keys()) {
    boundaries.add(cycle);
    affectedBoundaries.add(cycle);
    if (cycle + 1 < stroke.cycleCount) {
      boundaries.add(cycle + 1);
      affectedBoundaries.add(cycle + 1);
    }
  }
  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  let originalIndex = 0;
  let previousValue: string | number | undefined;
  const result: SignalValueChange[] = [];
  for (const boundary of orderedBoundaries) {
    while (originalIndex + 1 < initial.length && initial[originalIndex + 1]!.start <= boundary) originalIndex += 1;
    const original = initial[originalIndex];
    const value = stroke.samples.get(boundary) ?? original?.value;
    const matchingOriginal = originalAt.get(boundary);
    if (value === undefined) continue;
    if (result.length > 0 && Object.is(value, previousValue)) {
      const hasMetadata = matchingOriginal?.comment !== undefined || matchingOriginal?.displayLabel !== undefined || matchingOriginal?.displayFormat !== undefined;
      if (!matchingOriginal || (!hasMetadata && affectedBoundaries.has(boundary))) continue;
    }
    result.push(matchingOriginal ? { ...matchingOriginal, value } : { start: boundary, value });
    previousValue = value;
  }
  const unchanged = result.length === stroke.initial.length && result.every((change, index) => {
    const before = stroke.initial[index];
    return before !== undefined && Object.keys(change).length === Object.keys(before).length && Object.keys(change).every((key) => Object.is(change[key as keyof typeof change], before[key as keyof typeof before]));
  });
  return unchanged ? stroke.initial : result;
}
