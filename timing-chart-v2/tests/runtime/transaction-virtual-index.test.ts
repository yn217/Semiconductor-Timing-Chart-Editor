import { describe, expect, it } from "vitest";
import type { TransactionIntervalIndex, TransactionInterval } from "../../apps/editor/src/runtime/transaction-virtual-index.js";
import { bookmarksOutsideFolds, hiddenBookmarkFoldSummaries, bookmarksForSourceWindowState, bookmarksInSourceWindow, indexTransactionIntervals, INITIAL_TRANSACTION_SOURCE_WINDOW, nextTransactionVerticalWindow, retainTransactionSourceWindow, transactionGeometryGuidesInSourceWindow, transactionIntervalsForSourceWindowState, transactionIntervalsInWindow, transactionIntervalsOutsideFolds, transactionRowsInWindow } from "../../apps/editor/src/runtime/transaction-virtual-index.js";

describe("Transaction horizontal interval window", () => {
  it("keeps the initial unmeasured render empty, then applies a bounded or explicit unwindowed source", () => {
    const transactions = Array.from({ length: 10_000 }, (_, index) => ({ id: `tx-${index}`, start: index * 10, end: index * 10 + 5 }));
    const index = indexTransactionIntervals(transactions);
    const bookmarks = transactions.map(({ start }) => ({ start }));

    expect(INITIAL_TRANSACTION_SOURCE_WINDOW).toBeNull();
    expect(transactionIntervalsForSourceWindowState(index, INITIAL_TRANSACTION_SOURCE_WINDOW)).toEqual([]);
    expect(bookmarksForSourceWindowState(bookmarks, INITIAL_TRANSACTION_SOURCE_WINDOW)).toEqual([]);
    expect(transactionIntervalsForSourceWindowState(index, { start: 50_000, end: 50_020 }).map((item) => item.id)).toEqual(["tx-5000", "tx-5001"]);
    expect(transactionIntervalsForSourceWindowState(index, undefined)).toHaveLength(10_000);
    expect(bookmarksForSourceWindowState(bookmarks, undefined)).toHaveLength(10_000);
  });

  it("queries a narrow viewport from a 10k sequential lane without visiting the bucket", () => {
    const transactions = Array.from({ length: 10_000 }, (_, index) => ({ id: `tx-${index}`, start: index * 10, end: index * 10 + 5 }));
    const index = indexTransactionIntervals(transactions);
    const result = transactionIntervalsInWindow(index, 50_000, 50_040);
    expect(result.items.map((item) => item.id)).toEqual(["tx-5000", "tx-5001", "tx-5002", "tx-5003"]);
    expect(result.visitedNodes).toBeLessThan(64);
  });

  it("retains long intervals crossing the viewport and pins an offscreen selected item", () => {
    const index = indexTransactionIntervals([
      { id: "long", start: 0, end: 100 },
      { id: "left", start: 1, end: 2 },
      { id: "visible", start: 20, end: 30 },
      { id: "right", start: 40, end: 50 },
    ]);
    expect(transactionIntervalsInWindow(index, 25, 26).items.map((item) => item.id)).toEqual(["long", "visible"]);
    expect(transactionIntervalsInWindow(index, 25, 26, new Set(["right"])).items.map((item) => item.id)).toEqual(["long", "visible", "right"]);
  });

  it("slices sorted Bookmark markers to the source-time window", () => {
    const bookmarks = Array.from({ length: 10_000 }, (_, index) => ({ id: `mark-${index}`, start: index * 10 }));
    expect(bookmarksInSourceWindow(bookmarks, 50_000, 50_030).map((item) => item.id)).toEqual(["mark-5000", "mark-5001", "mark-5002", "mark-5003"]);
  });

  it("bounds guide DOM candidates to the shared source window while retaining offscreen bar boundaries separately", () => {
    const boundaries = Array.from({ length: 10_000 }, (_, cycle) => ({ cycle, x: cycle * 2 }));
    const visible = transactionGeometryGuidesInSourceWindow(boundaries, 4_950, 5_050);
    expect(visible).toHaveLength(101);
    expect(visible[0]).toEqual({ cycle: 4_950, x: 9_900 });
    expect(visible.at(-1)).toEqual({ cycle: 5_050, x: 10_100 });
    expect(visible.some((boundary) => boundary.cycle === 0 || boundary.cycle === 9_999)).toBe(false);
  });
});

describe("Transaction vertical row window", () => {
  it("reuses the same vertical window for horizontal-only scroll and buckets vertical updates by lane row", () => {
    const initial = { top: 0, height: 720 };
    expect(nextTransactionVerticalWindow(initial, 1, 720, 40)).toBe(initial);
    expect(nextTransactionVerticalWindow(initial, 39, 720, 40)).toBe(initial);
    expect(nextTransactionVerticalWindow(initial, 40, 720, 40)).toEqual({ top: 40, height: 720 });
    expect(nextTransactionVerticalWindow(initial, 1, 700, 40)).toEqual({ top: 0, height: 700 });
  });

  it("retains source-window identity when scroll resolves to the same interval", () => {
    const current = { start: 20, end: 40 } as const;
    expect(retainTransactionSourceWindow(current, { start: 20, end: 40 })).toBe(current);
    expect(retainTransactionSourceWindow(null, null)).toBeNull();
    expect(retainTransactionSourceWindow(current, { start: 21, end: 40 })).toEqual({ start: 21, end: 40 });
  });

  it("slices a 10k row lane to only the requested viewport rows", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => index);
    expect(transactionRowsInWindow(rows, 499.2, 508.1)).toEqual([499, 500, 501, 502, 503, 504, 505, 506, 507, 508]);
  });

  it("pins a selected row outside the ordinary window without scanning or replacing the window", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => index);
    const visible = transactionRowsInWindow(rows, 400, 410, rows[9_999]);
    expect(visible).toEqual([400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 9_999]);
  });

  it("clamps windows at both ends and handles empty lanes", () => {
    expect(transactionRowsInWindow([0, 1, 2], -5, 2)).toEqual([0, 1]);
    expect(transactionRowsInWindow([0, 1, 2], 2, 99)).toEqual([2]);
    expect(transactionRowsInWindow([], 0, 10)).toEqual([]);
  });
});

describe("fold-hidden Transaction and Bookmark rescue stays bounded (#865 regression)", () => {
  it("queries visible Transaction intervals around a fold and pins only selected hidden IDs", () => {
    const transactions = Array.from({ length: 10_000 }, (_, index) => ({ id: `tx-${index}`, start: index * 10, end: index * 10 + 5 }));
    const index = indexTransactionIntervals(transactions);
    const folds = [[0, 99_990]] as const;
    const visible = transactionIntervalsOutsideFolds(index, folds, { start: 0, end: 100_000 });
    expect(visible.map((item) => item.id)).toEqual(["tx-0", "tx-1", "tx-2", "tx-3", "tx-4", "tx-5", "tx-6", "tx-7", "tx-9999"]);
    expect(transactionIntervalsOutsideFolds(index, folds, { start: 0, end: 100_000 }, new Set(["tx-5000"])).map((item) => item.id).sort()).toEqual(["tx-0", "tx-1", "tx-2", "tx-3", "tx-4", "tx-5", "tx-5000", "tx-6", "tx-7", "tx-9999"]);
  });

  it("caps folded Transaction representatives while preserving an explicitly pinned stable ID", () => {
    const transactions = Array.from({ length: 100 }, (_, index) => ({ id: `hidden-${index}`, start: index * 10 + 1, end: index * 10 + 2 }));
    const folds = transactions.map(({ start }) => [start - 1, start + 3] as const);
    const index = indexTransactionIntervals(transactions);
    const representatives = transactionIntervalsOutsideFolds(index, folds, { start: 0, end: 1_000 });
    const withSelection = transactionIntervalsOutsideFolds(index, folds, { start: 0, end: 1_000 }, new Set(["hidden-99"]));

    expect(representatives).toHaveLength(32);
    expect(withSelection).toHaveLength(33);
    expect(withSelection.some((item) => item.id === "hidden-99")).toBe(true);
  });

  it("keeps only visible Bookmarks as individual markers and represents 10k hidden ones with one fold summary", () => {
    const bookmarks = Array.from({ length: 10_002 }, (_, index) => ({ id: `bookmark-${index}`, start: index }));
    const folds = [[0, 9_999]] as const;
    const visible = bookmarksOutsideFolds(bookmarks, folds, { start: 0, end: 10_001 });
    // Folds are half-open [0,9999): the Bookmark at the fold end (9999) is visible.
    expect(visible.map((bookmark) => bookmark.start)).toEqual([9_999, 10_000, 10_001]);
    expect(hiddenBookmarkFoldSummaries(bookmarks, folds, { start: 0, end: 10_001 })).toEqual([{ start: 0, end: 9_999, count: 9_999 }]);
    expect(bookmarksOutsideFolds(bookmarks, folds, { start: 0, end: 10_001 }, bookmarks[5])).toEqual([bookmarks[5], bookmarks[9_999], bookmarks[10_000], bookmarks[10_001]]);
    expect(bookmarksOutsideFolds(bookmarks, folds, null)).toEqual([]);
  });

  it("queries visible fold summaries without scanning all collapsed ranges", () => {
    const folds = Array.from({ length: 10_000 }, (_, index) => [index * 10, index * 10 + 4] as const);
    const bookmarks = folds.map(([start]) => ({ start }));
    let indexedReads = 0;
    const measuredFolds = new Proxy(folds, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(hiddenBookmarkFoldSummaries(bookmarks, measuredFolds, { start: 50_000, end: 50_019 })).toEqual([
      { start: 50_000, end: 50_004, count: 1 },
      { start: 50_010, end: 50_014, count: 1 },
    ]);
    expect(indexedReads).toBeLessThan(40);
  });

  it("treats a Bookmark exactly at a fold end as visible regardless of window start (folds are half-open)", () => {
    const bookmarks = [{ id: "at-end", start: 20 }];
    expect(bookmarksOutsideFolds(bookmarks, [[10, 20]], { start: 0, end: 100 })).toEqual(bookmarks);
    expect(bookmarksOutsideFolds(bookmarks, [[10, 20]], { start: 20, end: 100 })).toEqual(bookmarks);
    expect(bookmarksOutsideFolds(bookmarks, [[10, 20], [50, 60]], { start: 0, end: 100 })).toEqual(bookmarks);
    expect(bookmarksOutsideFolds([{ start: 10 }], [[10, 20]], { start: 0, end: 100 })).toEqual([]);
    expect(hiddenBookmarkFoldSummaries(bookmarks, [[10, 20]], { start: 0, end: 100 })).toEqual([]);
    expect(hiddenBookmarkFoldSummaries([{ start: 10 }, { start: 19 }, { start: 20 }], [[10, 20]], { start: 0, end: 100 })).toEqual([{ start: 10, end: 20, count: 2 }]);
  });
});

// Pre-#865 full-scan reference implementations (fold-end visibility fix applied
// to the Bookmark reference) used to prove the lower-bound rewrite is output-identical.
type Folds = readonly (readonly [number, number])[];
function referenceTransactionsOutsideFolds<T extends TransactionInterval>(index: TransactionIntervalIndex<T>, folds: Folds, window: { start: number; end: number }, pinnedIds?: ReadonlySet<string>): readonly T[] {
  const result = new Map<string, T>();
  let cursor = window.start;
  for (const [foldStart, foldEnd] of folds) {
    if (foldEnd <= cursor || foldStart >= window.end) continue;
    if (foldStart > cursor) for (const item of transactionIntervalsInWindow(index, cursor, Math.min(foldStart, window.end)).items) result.set(item.id, item);
    cursor = Math.max(cursor, foldEnd);
    if (cursor >= window.end) break;
  }
  if (cursor < window.end) for (const item of transactionIntervalsInWindow(index, cursor, window.end).items) result.set(item.id, item);
  const representativeIds = new Set<string>();
  const startsAtOrAfter = (cycle: number) => { let low = 0; let high = index.ordered.length; while (low < high) { const middle = low + Math.floor((high - low) / 2); if (index.ordered[middle]!.start < cycle) low = middle + 1; else high = middle; } return low; };
  for (const [foldStart, foldEnd] of folds) {
    if (representativeIds.size >= 32) break;
    if (foldEnd < window.start || foldStart > window.end) continue;
    const first = startsAtOrAfter(foldStart);
    const probeEnd = Math.min(index.ordered.length, first + 8);
    let count = 0;
    for (let position = first; position < probeEnd && count < 8; position += 1) {
      const item = index.ordered[position]!;
      if (item.start >= foldEnd) break;
      if (item.end <= foldEnd) { result.set(item.id, item); representativeIds.add(item.id); count += 1; if (representativeIds.size >= 32) break; }
    }
  }
  for (const id of pinnedIds ?? []) { const pinned = index.byId.get(id); if (pinned) result.set(id, pinned); }
  return [...result.values()].sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
}
function referenceBookmarksOutsideFolds<T extends { start: number }>(ordered: readonly T[], folds: Folds, window: { start: number; end: number }): readonly T[] {
  const hidden = (cycle: number) => folds.some(([start, end]) => cycle >= start && cycle < end);
  return ordered.filter((bookmark) => bookmark.start >= window.start && bookmark.start <= window.end && !hidden(bookmark.start));
}
function seededRandom(seed: number) { let state = seed >>> 0; return () => { state = (state * 1_664_525 + 1_013_904_223) >>> 0; return state / 2 ** 32; }; }
function foldFixture(count: number, random: () => number): Folds {
  const folds: [number, number][] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) { const start = cursor + 1 + Math.floor(random() * 20); const end = start + 1 + Math.floor(random() * 20); folds.push([start, end]); cursor = end; }
  return folds;
}

describe("collapsed fold scans are bounded by the window (#865 scaling)", () => {
  it("returns identical Transaction and Bookmark results to the full-scan reference on randomized fixtures", () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const random = seededRandom(seed);
      const folds = foldFixture(200, random);
      const span = folds.at(-1)![1] + 30;
      const transactions = Array.from({ length: 1_500 }, (_, index) => { const start = Math.floor(random() * span); return { id: `tx-${index}`, start, end: start + 1 + Math.floor(random() * 40) }; });
      const index = indexTransactionIntervals(transactions);
      const bookmarks = Array.from({ length: 800 }, (_, id) => ({ id: `b-${id}`, start: Math.floor(random() * span) })).sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
      for (let query = 0; query < 20; query += 1) {
        const start = Math.floor(random() * span);
        const window = { start, end: start + Math.floor(random() * 300) };
        const pinned = new Set([`tx-${Math.floor(random() * transactions.length)}`]);
        expect(transactionIntervalsOutsideFolds(index, folds, window, pinned)).toEqual(referenceTransactionsOutsideFolds(index, folds, window, pinned));
        expect(bookmarksOutsideFolds(bookmarks, folds, window)).toEqual(referenceBookmarksOutsideFolds(bookmarks, folds, window));
      }
    }
  });

  it("visits only folds intersecting the window at 50k collapsed folds", () => {
    const folds = Array.from({ length: 50_000 }, (_, index) => [index * 10, index * 10 + 5] as const);
    const transactions = folds.map(([start], index) => ({ id: `tx-${index}`, start: start + 6, end: start + 8 }));
    const index = indexTransactionIntervals(transactions);
    const bookmarks = transactions.map(({ start }) => ({ start }));
    for (const windowStart of [0, 250_000, 499_900]) {
      const window = { start: windowStart, end: windowStart + 100 };
      const intersecting = folds.filter(([start, end]) => end >= window.start && start <= window.end).length;
      const transactionStats = { foldsVisited: 0 };
      transactionIntervalsOutsideFolds(index, folds, window, undefined, transactionStats);
      // Two passes (visible runs + representatives) over intersecting folds, plus one terminating read each.
      expect(transactionStats.foldsVisited).toBeLessThanOrEqual(2 * intersecting + 2);
      const bookmarkStats = { foldsVisited: 0 };
      bookmarksOutsideFolds(bookmarks, folds, window, undefined, bookmarkStats);
      expect(bookmarkStats.foldsVisited).toBeLessThanOrEqual(intersecting + 1);
    }
  });
});
