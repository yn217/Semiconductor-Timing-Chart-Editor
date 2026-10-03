import { describe, expect, it } from "vitest";
import { bookmarksOutsideFolds, hiddenBookmarkFoldSummaries, bookmarksForSourceWindowState, bookmarksInSourceWindow, indexTransactionIntervals, INITIAL_TRANSACTION_SOURCE_WINDOW, transactionGeometryGuidesInSourceWindow, transactionIntervalsForSourceWindowState, transactionIntervalsInWindow, transactionIntervalsOutsideFolds, transactionRowsInWindow } from "../../apps/editor/src/runtime/transaction-virtual-index.js";

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
    expect(visible).toEqual([{ id: "tx-9999", start: 99_990, end: 99_995 }]);
    expect(transactionIntervalsOutsideFolds(index, folds, { start: 0, end: 100_000 }, new Set(["tx-5000"])).map((item) => item.id).sort()).toEqual(["tx-5000", "tx-9999"]);
  });

  it("keeps only visible Bookmarks as individual markers and represents 10k hidden ones with one fold summary", () => {
    const bookmarks = Array.from({ length: 10_002 }, (_, index) => ({ id: `bookmark-${index}`, start: index }));
    const folds = [[0, 9_999]] as const;
    const visible = bookmarksOutsideFolds(bookmarks, folds, { start: 0, end: 10_001 });
    expect(visible.map((bookmark) => bookmark.start)).toEqual([10_000, 10_001]);
    expect(hiddenBookmarkFoldSummaries(bookmarks, folds, { start: 0, end: 10_001 })).toEqual([{ start: 0, end: 9_999, count: 10_000 }]);
    expect(bookmarksOutsideFolds(bookmarks, folds, null)).toEqual([]);
  });
});
