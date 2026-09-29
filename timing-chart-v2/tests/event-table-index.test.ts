import { describe, expect, it } from "vitest";
import { buildEventTableIndex, selectedIndexRange } from "../apps/editor/src/runtime/event-table-index.js";

describe("EventTable indexed transition model", () => {
  it.each([1_000, 10_000, 100_000])("keeps lookup cost independent of cycle count (%i)", (cycleCount) => {
    const values = [{ start: 0 }, { start: Math.floor(cycleCount / 2) }, { start: cycleCount - 1 }];
    const started = performance.now();
    const index = buildEventTableIndex(values, cycleCount);
    const buildMs = performance.now() - started;
    expect(index.ordered.map((value) => value.start)).toEqual([0, Math.floor(cycleCount / 2), cycleCount - 1]);
    expect(index.occupied.has(Math.floor(cycleCount / 2))).toBe(true);
    expect(index.firstFree()).toBe(1);
    expect(index.nextEnd(Math.floor(cycleCount / 2))).toBe(cycleCount - 1);
    expect(index.nextEnd(1)).toBe(Math.floor(cycleCount / 2));
    expect(buildMs).toBeLessThan(100);
  });

  it("resolves selected row bounds by selected keys, preserving contiguity checks", () => {
    const indexByKey = new Map(Array.from({ length: 100_000 }, (_, index) => [`transition-${index}`, index] as const));
    expect(selectedIndexRange(indexByKey, ["transition-42", "transition-43", "transition-44"])).toEqual({ count: 3, first: 42, last: 44 });
    const nonContiguous = selectedIndexRange(indexByKey, ["transition-42", "transition-44"]);
    expect(nonContiguous.count).toBeGreaterThan(0);
    expect(nonContiguous.count).not.toBe(nonContiguous.last - nonContiguous.first + 1);
    expect(selectedIndexRange(indexByKey, ["deleted-transition"])).toEqual({ count: 0, first: -1, last: -1 });
  });

  it("looks up only selected identities instead of traversing the ordered transition domain", () => {
    let lookups = 0;
    const indexedRows: ReadonlyMap<string, number> = {
      get(key) { lookups += 1; return key === "transition-500000" ? 500_000 : undefined; },
      has() { throw new Error("selected range must not scan the index"); },
      entries() { throw new Error("selected range must not enumerate the index"); },
      keys() { throw new Error("selected range must not enumerate the index"); },
      values() { throw new Error("selected range must not enumerate the index"); },
      forEach() { throw new Error("selected range must not enumerate the index"); },
      get size() { throw new Error("selected range must not inspect the index size"); },
      [Symbol.iterator]() { throw new Error("selected range must not enumerate the index"); },
    };

    expect(selectedIndexRange(indexedRows, ["transition-500000"])).toEqual({ count: 1, first: 500_000, last: 500_000 });
    expect(lookups).toBe(1);
  });
});
