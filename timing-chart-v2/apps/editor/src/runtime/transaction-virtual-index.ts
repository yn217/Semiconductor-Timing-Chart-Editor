export type TransactionInterval = Readonly<{ id: string; start: number; end: number }>;
export type TransactionSourceWindow = Readonly<{ start: number; end: number }>;
/** null means the first viewport measurement has not run; undefined means
 * the viewport is unavailable and callers may use the unwindowed fallback. */
export type TransactionSourceWindowState = TransactionSourceWindow | null | undefined;
export const INITIAL_TRANSACTION_SOURCE_WINDOW = null;
export type TransactionVerticalWindow = Readonly<{ top: number; height: number }>;

/** Preserve state identity when scroll/resize events resolve to the same source interval. */
export function retainTransactionSourceWindow(current: TransactionSourceWindowState, next: TransactionSourceWindowState): TransactionSourceWindowState {
  return current !== null && current !== undefined && next !== null && next !== undefined
    && current.start === next.start && current.end === next.end
    ? current
    : current === next ? current : next;
}

/** Quantize vertical virtualization updates by lane row while retaining the overscan cushion. */
export function nextTransactionVerticalWindow(current: TransactionVerticalWindow, scrollTop: number, height: number, rowHeight: number): TransactionVerticalWindow {
  const safeRowHeight = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 1;
  const safeTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  const next = { top: Math.floor(safeTop / safeRowHeight) * safeRowHeight, height };
  return current.top === next.top && current.height === next.height ? current : next;
}

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

function bookmarkRangeBounds<T extends Readonly<{ start: number }>>(
  ordered: readonly T[], start: number, end: number, startInclusive: boolean, endInclusive: boolean,
): readonly [number, number] {
  const lower = (value: number, inclusive: boolean) => {
    let low = 0; let high = ordered.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (inclusive ? ordered[middle]!.start < value : ordered[middle]!.start <= value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const first = lower(start, startInclusive);
  const last = lower(end, !endInclusive);
  return [first, Math.max(first, last)];
}

function bookmarkRange<T extends Readonly<{ start: number }>>(
  ordered: readonly T[], start: number, end: number, startInclusive: boolean, endInclusive: boolean,
): readonly T[] {
  const [first, last] = bookmarkRangeBounds(ordered, start, end, startInclusive, endInclusive);
  return ordered.slice(first, last);
}

export type HiddenBookmarkFoldSummary = Readonly<{ start: number; end: number; count: number }>;
type FoldRanges = readonly (readonly [start: number, end: number])[];
/** Optional deterministic counter: number of fold ranges read by a query. */
export type FoldScanStats = { foldsVisited: number };

/** First index of start-ordered, non-overlapping folds whose end reaches `cycle`
 * (`end >= cycle`, or `end > cycle` when `strict`). Folds before it cannot
 * touch a window starting at `cycle`, so scroll queries skip them in O(log F). */
function firstFoldEndingAtOrAfter(folds: FoldRanges, cycle: number, strict: boolean): number {
  let low = 0;
  let high = folds.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const end = folds[middle]![1];
    if (strict ? end <= cycle : end < cycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Query visible bookmark points without enumerating bookmarks hidden by a collapsed fold. */
export function bookmarksOutsideFolds<T extends Readonly<{ start: number }>>(
  ordered: readonly T[], folds: FoldRanges, sourceWindow: TransactionSourceWindowState, pinnedBookmark?: T, stats?: FoldScanStats,
): readonly T[] {
  if (sourceWindow === null) return [];
  const window = sourceWindow ?? (ordered.length === 0 ? { start: 0, end: 0 } : { start: ordered[0]!.start, end: ordered.at(-1)!.start });
  const result: T[] = [];
  let cursor = window.start;
  // Folds are half-open [start,end): the end cycle itself is visible, so every
  // visible run (including the tail after a fold) starts inclusively.
  for (let index = firstFoldEndingAtOrAfter(folds, cursor, false); index < folds.length; index += 1) {
    if (stats) stats.foldsVisited += 1;
    const [foldStart, foldEnd] = folds[index]!;
    if (foldStart > window.end) break;
    if (foldEnd < cursor) continue;
    if (foldStart > cursor) result.push(...bookmarkRange(ordered, cursor, Math.min(foldStart, window.end), true, false));
    cursor = Math.max(cursor, foldEnd);
    if (cursor >= window.end) break;
  }
  if (cursor <= window.end) result.push(...bookmarkRange(ordered, cursor, window.end, true, true));
  // A selected Bookmark remains addressable by stable ID even when its source
  // cycle is hidden by a fold or lies outside the ordinary viewport window.
  if (pinnedBookmark !== undefined && !result.includes(pinnedBookmark)) {
    result.push(pinnedBookmark);
    result.sort((left, right) => left.start - right.start);
  }
  return result;
}

/** One lightweight marker per visible collapsed fold, regardless of hidden Bookmark count. */
export function hiddenBookmarkFoldSummaries<T extends Readonly<{ start: number }>>(
  ordered: readonly T[], folds: FoldRanges, sourceWindow: TransactionSourceWindowState,
): readonly HiddenBookmarkFoldSummary[] {
  if (sourceWindow === null) return [];
  const window = sourceWindow ?? (ordered.length === 0 ? { start: 0, end: 0 } : { start: ordered[0]!.start, end: ordered.at(-1)!.start });
  // Fold ranges are merged and ordered by source time. Find the first range
  // that can touch the visible window, then visit only visible summaries;
  // scrolling must not enumerate every collapsed fold in the document.
  const summaries: HiddenBookmarkFoldSummary[] = [];
  for (let index = firstFoldEndingAtOrAfter(folds, window.start, false); index < folds.length; index += 1) {
    const [start, end] = folds[index]!;
    if (start > window.end) break;
    // Half-open fold: a Bookmark at `end` is visible, not hidden.
    const [first, last] = bookmarkRangeBounds(ordered, start, end, true, false);
    const count = last - first;
    if (count > 0) summaries.push({ start, end, count });
  }
  return summaries;
}

/** Resolve bookmark candidates without treating an unmeasured first render as
 * an intentionally unwindowed viewport. */
export function bookmarksForSourceWindowState<T extends Readonly<{ start: number }>>(
  ordered: readonly T[],
  sourceWindow: TransactionSourceWindowState,
): readonly T[] {
  if (sourceWindow === null) return [];
  return sourceWindow === undefined ? ordered : bookmarksInSourceWindow(ordered, sourceWindow.start, sourceWindow.end);
}

/** Slice sorted geometry boundaries to the shared horizontal source window. */
export function transactionGeometryGuidesInSourceWindow<T extends Readonly<{ cycle: number }>>(
  ordered: readonly T[],
  start: number,
  end: number,
): readonly T[] {
  let low = 0;
  let high = ordered.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ordered[middle]!.cycle < start) low = middle + 1;
    else high = middle;
  }
  const first = low;
  high = ordered.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ordered[middle]!.cycle <= end) low = middle + 1;
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

/** Return a bounded set of hidden-fold representative bars for the current viewport. */
export function transactionFoldRepresentativeIntervals<T extends TransactionInterval>(
  index: TransactionIntervalIndex<T>, folds: FoldRanges, sourceWindow: TransactionSourceWindowState,
): readonly T[] {
  if (sourceWindow === null || folds.length === 0 || index.ordered.length === 0) return [];
  const window = sourceWindow ?? { start: index.ordered[0]!.start, end: index.maxEndTree[1]! };
  const result = new Map<string, T>();
  let representativeCount = 0;
  const startsAtOrAfter = (cycle: number) => {
    let low = 0; let high = index.ordered.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (index.ordered[middle]!.start < cycle) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  for (let foldIndex = firstFoldEndingAtOrAfter(folds, window.start, false); foldIndex < folds.length; foldIndex += 1) {
    if (representativeCount >= 32) break;
    const [foldStart, foldEnd] = folds[foldIndex]!;
    if (foldStart > window.end) break;
    const first = startsAtOrAfter(foldStart);
    const probeEnd = Math.min(index.ordered.length, first + 8);
    for (let position = first; position < probeEnd && representativeCount < 32; position += 1) {
      const transaction = index.ordered[position]!;
      if (transaction.start >= foldEnd) break;
      if (transaction.end <= foldEnd) {
        result.set(transaction.id, transaction);
        representativeCount += 1;
      }
    }
  }
  return [...result.values()];
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

/** Resolve bars for the viewport lifecycle: no bars before the first layout
 * measurement, full list only when no viewport owner exists, indexed slice
 * once the shared source window is known. */
export function transactionIntervalsForSourceWindowState<T extends TransactionInterval>(
  index: TransactionIntervalIndex<T>,
  sourceWindow: TransactionSourceWindowState,
  pinnedIds?: ReadonlySet<string>,
): readonly T[] {
  if (sourceWindow === null) return [];
  if (sourceWindow === undefined) return index.ordered;
  return transactionIntervalsInWindow(index, sourceWindow.start, sourceWindow.end, pinnedIds).items;
}

/** Query only visible portions of a source window and preserve explicit ID pins.
 * Fully fold-hidden intervals are skipped by range partitioning, not scanned
 * and filtered after materializing the whole fold. */
export function transactionIntervalsOutsideFolds<T extends TransactionInterval>(
  index: TransactionIntervalIndex<T>,
  folds: FoldRanges,
  sourceWindow: TransactionSourceWindowState,
  pinnedIds?: ReadonlySet<string>,
  stats?: FoldScanStats,
): readonly T[] {
  if (sourceWindow === null) return [];
  if (folds.length === 0) return transactionIntervalsForSourceWindowState(index, sourceWindow, pinnedIds);
  const window = sourceWindow ?? (index.ordered.length === 0 ? { start: 0, end: 0 } : { start: index.ordered[0]!.start, end: index.maxEndTree[1]! });
  const result = new Map<string, T>();
  let cursor = window.start;
  for (let foldIndex = firstFoldEndingAtOrAfter(folds, cursor, true); foldIndex < folds.length; foldIndex += 1) {
    if (stats) stats.foldsVisited += 1;
    const [foldStart, foldEnd] = folds[foldIndex]!;
    if (foldStart >= window.end) break;
    if (foldEnd <= cursor) continue;
    if (foldStart > cursor) {
      for (const transaction of transactionIntervalsInWindow(index, cursor, Math.min(foldStart, window.end)).items) result.set(transaction.id, transaction);
    }
    cursor = Math.max(cursor, foldEnd);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) {
    for (const transaction of transactionIntervalsInWindow(index, cursor, window.end).items) result.set(transaction.id, transaction);
  }
  // Keep a small representative affordance for collapsed-fold contents. The
  // full semantic collection remains available in the Tree; this bounded
  // sample avoids turning a fold boundary into thousands of mounted bars.
  const representativeIds = new Set<string>();
  const representativeLimit = 32;
  const startsAtOrAfter = (cycle: number) => {
    let low = 0; let high = index.ordered.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (index.ordered[middle]!.start < cycle) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  for (let foldIndex = firstFoldEndingAtOrAfter(folds, window.start, false); foldIndex < folds.length; foldIndex += 1) {
    if (representativeIds.size >= representativeLimit) break;
    if (stats) stats.foldsVisited += 1;
    const [foldStart, foldEnd] = folds[foldIndex]!;
    if (foldStart > window.end) break;
    const first = startsAtOrAfter(foldStart);
    // Bound both the number of emitted affordances and per-fold probing. A
    // selected hidden ID is handled separately below and is never subject to
    // these representative limits.
    const probeEnd = Math.min(index.ordered.length, first + 8);
    let foldRepresentatives = 0;
    for (let position = first; position < probeEnd && foldRepresentatives < 8; position += 1) {
      const transaction = index.ordered[position]!;
      if (transaction.start >= foldEnd) break;
      if (transaction.end <= foldEnd) {
        result.set(transaction.id, transaction);
        representativeIds.add(transaction.id);
        foldRepresentatives += 1;
        if (representativeIds.size >= representativeLimit) break;
      }
    }
  }
  for (const id of pinnedIds ?? []) {
    const pinned = index.byId.get(id);
    if (pinned) result.set(id, pinned);
  }
  return [...result.values()].sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
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
