export type TransactionInterval = Readonly<{ id: string; start: number; end: number }>;

export type TransactionIntervalIndex<T extends TransactionInterval> = Readonly<{
  ordered: readonly T[];
  maxEndTree: readonly number[];
  leafCount: number;
  byId: ReadonlyMap<string, T>;
}>;

export function bookmarksInSourceWindow<T extends Readonly<{ start: number }>>(
  ordered: readonly T[],
  start: number,
  end: number,
): readonly T[] {
  let low = 0;
  let high = ordered.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ordered[middle]!.start < start) low = middle + 1;
    else high = middle;
  }
  const first = low;
  high = ordered.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ordered[middle]!.start <= end) low = middle + 1;
    else high = middle;
  }
  return ordered.slice(first, low);
}

/** Build an interval index over start-sorted Transactions. Each query prunes
 * subtrees whose intervals end before the viewport or start after it. */
export function indexTransactionIntervals<T extends TransactionInterval>(items: readonly T[]): TransactionIntervalIndex<T> {
  const ordered = [...items].sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
  let leafCount = 1;
  while (leafCount < ordered.length) leafCount *= 2;
  const maxEndTree = Array.from({ length: leafCount * 2 }, () => Number.NEGATIVE_INFINITY);
  ordered.forEach((item, index) => { maxEndTree[leafCount + index] = item.end; });
  for (let node = leafCount - 1; node > 0; node -= 1) maxEndTree[node] = Math.max(maxEndTree[node * 2]!, maxEndTree[node * 2 + 1]!);
  return { ordered, maxEndTree, leafCount, byId: new Map(ordered.map((item) => [item.id, item] as const)) };
}

/** Query half-open time range [start,end), returning only intersecting
 * intervals plus a selected/active pinned item. `visitedNodes` is exposed so
 * deterministic tests can guard against regressing to a full bucket scan. */
export function transactionIntervalsInWindow<T extends TransactionInterval>(
  index: TransactionIntervalIndex<T>,
  start: number,
  end: number,
  pinnedIds?: ReadonlySet<string>,
): Readonly<{ items: readonly T[]; visitedNodes: number }> {
  if (!(end > start) || index.ordered.length === 0) return { items: [], visitedNodes: 0 };
  const result: T[] = [];
  let visitedNodes = 0;
  const visit = (node: number, left: number, right: number) => {
    if (left >= index.ordered.length || right <= left) return;
    visitedNodes += 1;
    if (index.maxEndTree[node]! <= start || index.ordered[left]!.start >= end) return;
    if (right - left === 1) {
      const item = index.ordered[left]!;
      if (item.start < end && item.end > start) result.push(item);
      return;
    }
    const middle = left + Math.floor((right - left) / 2);
    visit(node * 2, left, middle);
    visit(node * 2 + 1, middle, right);
  };
  visit(1, 0, index.leafCount);
  if (pinnedIds !== undefined && pinnedIds.size > 0) {
    const included = new Set(result.map((item) => item.id));
    for (const id of pinnedIds) {
      if (included.has(id)) continue;
      const pinned = index.byId.get(id);
      if (pinned) { result.push(pinned); included.add(id); }
    }
  }
  result.sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
  return { items: result, visitedNodes };
}

/** Select a half-open row window and retain one selected row outside it. */
export function transactionRowsInWindow<T>(
  orderedRows: readonly T[],
  startRow: number,
  endRow: number,
  pinnedRow?: T,
): readonly T[] {
  const start = Math.max(0, Math.min(orderedRows.length, Math.floor(startRow)));
  const end = Math.max(start, Math.min(orderedRows.length, Math.ceil(endRow)));
  const visible = orderedRows.slice(start, end);
  if (pinnedRow !== undefined && !visible.includes(pinnedRow)) visible.push(pinnedRow);
  return visible;
}
