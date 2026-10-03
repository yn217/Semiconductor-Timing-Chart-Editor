import { describe, expect, it } from "vitest";
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
    expect(visible.map((bookmark) => bookmark.start)).toEqual([10_000, 10_001]);
    expect(hiddenBookmarkFoldSummaries(bookmarks, folds, { start: 0, end: 10_001 })).toEqual([{ start: 0, end: 9_999, count: 10_000 }]);
    expect(bookmarksOutsideFolds(bookmarks, folds, { start: 0, end: 10_001 }, bookmarks[5])).toEqual([bookmarks[5], bookmarks[10_000], bookmarks[10_001]]);
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
});
