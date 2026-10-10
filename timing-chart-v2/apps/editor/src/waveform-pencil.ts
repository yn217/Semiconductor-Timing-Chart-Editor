import type { ValueSignal } from "@timing-chart-v2/schema";

export type PencilLevel = 0 | 1;
type ValueChange = ValueSignal["values"][number];

/** Upper half of the Signal row draws HIGH (1), lower half LOW (0). `localY` and `rowY` share one coordinate space. */
export function pencilLevelAtY(localY: number, rowY: number, rowHeight: number): PencilLevel {
  return localY < rowY + rowHeight / 2 ? 1 : 0;
}

/**
 * Cells the pointer crossed between two samples. The previous cell is excluded (it was already drawn), the current cell is
 * included with the live level, and intermediate cells take the level of the straight pointer trajectory between the samples,
 * so a fast move never skips a cell and never fills cells away from the trajectory.
 */
export function pencilTrajectory(previous: { readonly cell: number; readonly y: number }, current: { readonly cell: number; readonly y: number }, levelAt: (y: number) => PencilLevel): readonly (readonly [cell: number, level: PencilLevel])[] {
  if (current.cell === previous.cell) return [[current.cell, levelAt(current.y)]];
  const step = current.cell > previous.cell ? 1 : -1;
  const span = Math.abs(current.cell - previous.cell);
  const cells: (readonly [number, PencilLevel])[] = [];
  for (let offset = 1; offset <= span; offset += 1) {
    const cell = previous.cell + step * offset;
    const y = offset === span ? current.y : previous.y + ((current.y - previous.y) * offset) / span;
    cells.push([cell, levelAt(y)]);
  }
  return cells;
}

const token = (value: string | number): string => String(value).trim().toLowerCase();

/**
 * Apply one finished pen stroke to a binary Signal's change points. Only painted cells change: the value of the cell after a
 * painted run is pinned with an explicit change point, existing change points keep their stable id (and comment), new ones get
 * none (the command assigns a fresh id), and change points that became redundant next to a touched cell are folded away.
 * Returns undefined when the stroke leaves the waveform semantically unchanged.
 */
export function applyPencilStroke(values: readonly ValueChange[], cycleCount: number, painted: ReadonlyMap<number, PencilLevel>): readonly ValueChange[] | undefined {
  const sorted = [...values].sort((left, right) => left.start - right.start);
  if (sorted.length === 0 || painted.size === 0) return undefined;
  const effectiveAt = (cycle: number): string | number => {
    let value: string | number = sorted[0]!.value;
    for (const change of sorted) { if (change.start > cycle) break; value = change.value; }
    return value;
  };
  const literal = (level: PencilLevel): string | number => typeof sorted[0]!.value === "number" ? level : String(level);
  const byStart = new Map<number, ValueChange>(sorted.map((change) => [change.start, change]));
  const touched = new Set<number>();
  for (const cell of painted.keys()) {
    const next = cell + 1;
    if (next < cycleCount && !painted.has(next) && !byStart.has(next)) {
      byStart.set(next, { start: next, value: effectiveAt(next) } as ValueChange);
      touched.add(next);
    }
  }
  for (const [cell, level] of painted) {
    if (cell < 0 || cell >= cycleCount) continue;
    const existing = byStart.get(cell) ?? sorted.find((change) => change.start === cell);
    byStart.set(cell, existing === undefined ? { start: cell, value: literal(level) } as ValueChange : { ...existing, value: literal(level) });
    touched.add(cell);
    if (byStart.has(cell + 1)) touched.add(cell + 1);
  }
  const ordered = [...byStart.values()].sort((left, right) => left.start - right.start);
  const next: ValueChange[] = [];
  for (const change of ordered) {
    const previous = next.at(-1);
    const redundant = previous !== undefined && change.start > 0 && touched.has(change.start) && token(previous.value) === token(change.value) && change.comment === undefined && change.displayFormat === undefined;
    if (!redundant) next.push(change);
  }
  const same = next.length === sorted.length && next.every((change, index) => change.start === sorted[index]!.start && token(change.value) === token(sorted[index]!.value));
  return same ? undefined : next;
}
