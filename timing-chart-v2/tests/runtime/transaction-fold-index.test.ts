import { describe, expect, it } from "vitest";
import { mergeTransactionFoldRanges, transactionFoldBoundariesInWindow, transactionFoldContainingCycle, transactionFoldContainingEndBoundary, transactionFoldRangesIntersecting, transactionVisibleSegments } from "../../apps/editor/src/runtime/transaction-fold-index.js";

describe("Transaction fold interval index", () => {
  it("slices sorted viewport boundaries with binary lookup and inclusive endpoints", () => {
    const boundaries = Array.from({ length: 4_000 }, (_, index) => index * 3);
    let indexedReads = 0;
    const indexed = new Proxy(boundaries, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(transactionFoldBoundariesInWindow(indexed, 3_000, 3_009)).toEqual([3_000, 3_003, 3_006, 3_009]);
    expect(indexedReads).toBeLessThan(32);
  });

  it("merges nested, overlapping, and adjacent folds with a linear union pass", () => {
    expect(mergeTransactionFoldRanges([[20, 30], [2, 8], [4, 12], [12, 14], [40, 45]])).toEqual([[2, 14], [20, 30], [40, 45]]);
  });

  it("finds only folds intersecting the requested source interval", () => {
    const ranges = Array.from({ length: 2_000 }, (_, index) => [index * 10, index * 10 + 3] as const);
    let indexedReads = 0;
    const indexed = new Proxy(ranges, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(transactionFoldRangesIntersecting(indexed, 15_000, 15_008)).toEqual([[15_000, 15_003]]);
    expect(indexedReads).toBeLessThan(32);
  });

  it("classifies start/end fold ownership with logarithmic lookup", () => {
    const ranges = Array.from({ length: 2_000 }, (_, index) => [index * 10 + 2, index * 10 + 5] as const);
    let indexedReads = 0;
    const indexed = new Proxy(ranges, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(transactionFoldContainingCycle(indexed, 19_994)).toEqual([19_992, 19_995]);
    expect(transactionFoldContainingCycle(indexed, 19_995)).toBeUndefined();
    expect(transactionFoldContainingEndBoundary(indexed, 19_995)).toEqual([19_992, 19_995]);
    expect(transactionFoldContainingEndBoundary(indexed, 19_992)).toBeUndefined();
    expect(indexedReads).toBeLessThan(100);
  });

  it("preserves half-open interval boundaries", () => {
    const ranges = mergeTransactionFoldRanges([[10, 20], [30, 40]]);
    expect(transactionFoldRangesIntersecting(ranges, 20, 30)).toEqual([]);
    expect(transactionFoldRangesIntersecting(ranges, 19, 31)).toEqual([[10, 20], [30, 40]]);
  });

  it("splits a long transaction around thousands of folds with a single linear pass", () => {
    const ranges = Array.from({ length: 2_000 }, (_, index) => [index * 10 + 2, index * 10 + 5] as const);
    let indexedReads = 0;
    const indexed = new Proxy(ranges, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    const segments = transactionVisibleSegments(0, 20_000, indexed);

    expect(segments).toHaveLength(2_001);
    expect(segments.slice(0, 2)).toEqual([{ start: 0, end: 2 }, { start: 5, end: 12 }]);
    expect(segments.at(-1)).toEqual({ start: 19_995, end: 20_000 });
    expect(indexedReads).toBeLessThanOrEqual(ranges.length);
  });
});
