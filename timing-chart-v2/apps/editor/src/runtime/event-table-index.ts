export type EventTableChange = Readonly<{ readonly start: number; readonly id?: string }>;

export type EventTableIndex<T extends EventTableChange> = Readonly<{
  ordered: readonly T[];
  occupied: ReadonlySet<number>;
  endByStart: ReadonlyMap<number, number>;
  /** start cycle -> position in `ordered` (#856: no repeated linear find). */
  indexByStart: ReadonlyMap<number, number>;
  indexByIdentity: ReadonlyMap<string, number>;
  firstFree: (extra?: number) => number | undefined;
  nextEnd: (start: number) => number;
}>;

export function buildEventTableIndex<T extends EventTableChange>(values: readonly T[], cycleCount: number): EventTableIndex<T> {
  const ordered = [...values].sort((left, right) => left.start - right.start);
  const occupied = new Set(ordered.map((change) => change.start));
  const endByStart = new Map(ordered.map((change, index) => [change.start, ordered[index + 1]?.start ?? cycleCount]));
  const indexByStart = new Map(ordered.map((change, index) => [change.start, index]));
  const indexByIdentity = new Map(ordered.map((change, index) => [change.id ?? String(change.start), index]));
  let firstAvailable = 0;
  for (const change of ordered) {
    if (change.start < firstAvailable) continue;
    if (change.start > firstAvailable) break;
    firstAvailable += 1;
  }
  const firstFree = (extra?: number) => {
    if (extra === undefined) return firstAvailable < cycleCount ? firstAvailable : undefined;
    let candidate = firstAvailable;
    while (candidate === extra || occupied.has(candidate)) candidate += 1;
    return candidate < cycleCount ? candidate : undefined;
  };
  const nextEnd = (start: number) => {
    const known = endByStart.get(start);
    if (known !== undefined) return known;
    let low = 0; let high = ordered.length;
    while (low < high) { const middle = (low + high) >>> 1; if (ordered[middle]!.start <= start) low = middle + 1; else high = middle; }
    return ordered[low]?.start ?? cycleCount;
  };
  return { ordered, occupied, endByStart, indexByStart, indexByIdentity, firstFree, nextEnd };
}
