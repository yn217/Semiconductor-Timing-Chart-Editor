import { describe, expect, it } from "vitest";
import { buildEventTableIndex } from "../apps/editor/src/runtime/event-table-index.js";

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
});
