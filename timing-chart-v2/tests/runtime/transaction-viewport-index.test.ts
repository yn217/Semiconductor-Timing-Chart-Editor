import { describe, expect, it } from "vitest";
import { buildSourceIntervalIndex, querySourceIntervalIndex, sourceCycleWindowForXRange } from "../../apps/editor/src/runtime/transaction-viewport-index.js";

describe("Transaction viewport indexes", () => {
  it("queries only overlapping intervals while retaining a long interval that began before the viewport", () => {
    const transactions = [
      { id: "early-long", start: 0, end: 90 },
      ...Array.from({ length: 1_000 }, (_, index) => ({ id: "outside-" + index, start: 1_000 + index * 2, end: 1_001 + index * 2 })),
      { id: "inside-a", start: 500, end: 510 },
      { id: "inside-b", start: 505, end: 515 },
      { id: "after", start: 10_000, end: 10_010 },
    ];
    const result = querySourceIntervalIndex(buildSourceIntervalIndex(transactions), 80, 520);
    expect(result.map((item) => item.id)).toEqual(["early-long", "inside-a", "inside-b"]);
  });

  it("inverts shared monotonic geometry and includes folded equal-X boundaries", () => {
    const boundaryX = (cycle: number) => cycle <= 4 ? cycle * 10 : cycle <= 8 ? 40 : (cycle - 4) * 10;
    expect(sourceCycleWindowForXRange(boundaryX, 12, 39, 51, 0)).toEqual({ start: 4, end: 10 });
  });

  it("returns undefined when shared geometry cannot resolve the full timeline range", () => {
    expect(sourceCycleWindowForXRange((cycle) => cycle <= 3 ? cycle * 10 : undefined, 10, 10, 20)).toBeUndefined();
  });
});
