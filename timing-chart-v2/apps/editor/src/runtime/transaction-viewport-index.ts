/** A start-sorted interval index for viewport queries in one Transaction lane. */
export type SourceInterval = Readonly<{ id: string; start: number; end: number }>;

export type SourceIntervalIndex<T extends SourceInterval> = Readonly<{
  sorted: readonly T[];
  leafBase: number;
  maxEndTree: readonly number[];
}>;

export function buildSourceIntervalIndex<T extends SourceInterval>(items: readonly T[]): SourceIntervalIndex<T> {
  const sorted = [...items].sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
  let leafBase = 1;
  while (leafBase < sorted.length) leafBase *= 2;
  const maxEndTree = Array.from({ length: leafBase * 2 }, () => Number.NEGATIVE_INFINITY);
  sorted.forEach((item, index) => { maxEndTree[leafBase + index] = item.end; });
  for (let node = leafBase - 1; node > 0; node -= 1) maxEndTree[node] = Math.max(maxEndTree[node * 2]!, maxEndTree[node * 2 + 1]!);
  return { sorted, leafBase, maxEndTree };
}

/** Return intervals intersecting [start, end), including long intervals that began before the window. */
export function querySourceIntervalIndex<T extends SourceInterval>(index: SourceIntervalIndex<T>, start: number, end: number): readonly T[] {
  if (end <= start || index.sorted.length === 0) return [];
  let upper = 0;
  let right = index.sorted.length;
  while (upper < right) {
    const middle = Math.floor((upper + right) / 2);
    if (index.sorted[middle]!.start < end) upper = middle + 1;
    else right = middle;
  }
  const result: T[] = [];
  const visit = (node: number, left: number, rightBound: number) => {
    if (left >= upper || index.maxEndTree[node]! <= start) return;
    if (rightBound - left === 1) {
      const item = index.sorted[left];
      if (item && item.end > start) result.push(item);
      return;
    }
    const middle = left + Math.floor((rightBound - left) / 2);
    visit(node * 2, left, middle);
    visit(node * 2 + 1, middle, rightBound);
  };
  visit(1, 0, index.leafBase);
  return result;
}

/**
 * Invert the shared monotonic source-boundary projection without introducing
 * a second time mapper. Folded source cycles may share an X; lower/upper
 * bounds deliberately include the complete equal-X run.
 */
export function sourceCycleWindowForXRange(
  boundaryX: (cycle: number) => number | undefined,
  cycleCount: number,
  xStart: number,
  xEnd: number,
  overscan = 2,
): Readonly<{ start: number; end: number }> | undefined {
  if (!Number.isFinite(xStart) || !Number.isFinite(xEnd) || xEnd <= xStart || cycleCount < 0) return undefined;
  const firstDefined = boundaryX(0);
  const lastDefined = boundaryX(cycleCount);
  if (firstDefined === undefined || lastDefined === undefined) return undefined;
  const lowerBound = (target: number, strict: boolean) => {
    let low = 0;
    let high = cycleCount + 1;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const value = boundaryX(middle);
      if (value === undefined) return undefined;
      if (strict ? value <= target : value < target) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const first = lowerBound(xStart, false);
  const afterLast = lowerBound(xEnd, true);
  if (first === undefined || afterLast === undefined) return undefined;
  const padding = Math.max(0, Math.floor(overscan));
  return {
    start: Math.max(0, Math.min(cycleCount, first - padding)),
    end: Math.max(0, Math.min(cycleCount, afterLast + padding)),
  };
}
