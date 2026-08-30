export type CycleRange = Readonly<{ start: number; end: number }>;

/** Normalize two selected boundaries into the editor's [start, end) range. */
export function rangeFromBoundaries(first: number, second: number, cycleCount: number): CycleRange {
  const start = Math.min(first, second);
  const endBoundary = Math.max(first, second);
  return {
    start: Math.max(0, Math.min(start, cycleCount - 1)),
    end: Math.max(1, Math.min(cycleCount, endBoundary > start ? endBoundary : start + 1)),
  };
}
