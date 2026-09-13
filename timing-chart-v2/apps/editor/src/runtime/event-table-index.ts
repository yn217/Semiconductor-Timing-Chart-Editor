export type EventTableChange = Readonly<{ readonly start: number }>;

export type EventTableIndex<T extends EventTableChange> = Readonly<{
  ordered: readonly T[];
  occupied: ReadonlySet<number>;
  endByStart: ReadonlyMap<number, number>;
  firstFree: (extra?: number) => number | undefined;
  nextEnd: (start: number) => number;
}>;

export function buildEventTableIndex<T extends EventTableChange>(values: readonly T[], cycleCount: number): EventTableIndex<T> {
  const ordered = [...values].sort((left, right) => left.start - right.start);
  const occupied = new Set(ordered.map((change) => change.start));
  const endByStart = new Map(ordered.map((change, index) => [change.start, ordered[index + 1]?.start ?? cycleCount]));
  const firstFree = (extra?: number) => {
    let candidate = 0;
    for (const change of ordered) {
      while (candidate === extra) candidate += 1;
      if (change.start < candidate) continue;
      if (change.start > candidate) break;
      candidate += 1;
    }
    while (candidate === extra) candidate += 1;
    return candidate < cycleCount ? candidate : undefined;
  };
  const nextEnd = (start: number) => {
    const known = endByStart.get(start);
    if (known !== undefined) return known;
    let low = 0; let high = ordered.length;
    while (low < high) { const middle = (low + high) >>> 1; if (ordered[middle]!.start <= start) low = middle + 1; else high = middle; }
    return ordered[low]?.start ?? cycleCount;
  };
  return { ordered, occupied, endByStart, firstFree, nextEnd };
}
