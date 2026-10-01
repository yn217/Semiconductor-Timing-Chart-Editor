import { describe, expect, it } from "vitest";
import { bookmarksInSourceWindow, indexTransactionIntervals, transactionGeometryGuidesInSourceWindow, transactionIntervalsInWindow, transactionRowsInWindow } from "../../apps/editor/src/runtime/transaction-virtual-index.js";

describe("Transaction horizontal interval window", () => {
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
