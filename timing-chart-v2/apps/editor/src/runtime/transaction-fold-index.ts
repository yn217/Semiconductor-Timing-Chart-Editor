export type TransactionFoldRange = readonly [start: number, end: number];

/** Return sorted fold boundaries within the inclusive viewport range. */
export function transactionFoldBoundariesInWindow(
  boundaries: readonly number[],
  start: number,
  end: number,
): readonly number[] {
  const lowerBound = (target: number, upper: boolean): number => {
    let low = 0;
    let high = boundaries.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (upper ? boundaries[middle]! <= target : boundaries[middle]! < target) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return boundaries.slice(lowerBound(start, false), lowerBound(end, true));
}

/** Sort and union fold intervals with a single append/update pass after sorting. */
export function mergeTransactionFoldRanges(ranges: readonly TransactionFoldRange[]): readonly TransactionFoldRange[] {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const previous = merged.at(-1);
    if (!previous || start > previous[1]) merged.push([start, end]);
    else previous[1] = Math.max(previous[1], end);
  }
  return merged.map(([start, end]) => Object.freeze([start, end] as const));
}

/** Return only folds intersecting [start, end), using a lower-bound search. */
export function transactionFoldRangesIntersecting(
  ranges: readonly TransactionFoldRange[],
  start: number,
  end: number,
): readonly TransactionFoldRange[] {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ranges[middle]![1] <= start) low = middle + 1;
    else high = middle;
  }
  const result: TransactionFoldRange[] = [];
  for (let index = low; index < ranges.length && ranges[index]![0] < end; index += 1) result.push(ranges[index]!);
  return result;
}

/** Split a source interval around sorted, merged folds in one linear pass. */
export function transactionVisibleSegments(
  start: number,
  end: number,
  folds: readonly TransactionFoldRange[],
): readonly { readonly start: number; readonly end: number }[] {
  const visible: { start: number; end: number }[] = [];
  let cursor = start;
  for (const [foldStart, foldEnd] of folds) {
    const clippedStart = Math.max(start, foldStart);
    const clippedEnd = Math.min(end, foldEnd);
    if (clippedEnd <= cursor || clippedStart >= end) continue;
    if (clippedStart > cursor) visible.push({ start: cursor, end: clippedStart });
    cursor = Math.max(cursor, clippedEnd);
  }
  if (cursor < end) visible.push({ start: cursor, end });
  return visible;
}
