import { describe, expect, it } from "vitest";
import { transactionLaneBandHeights } from "../../apps/editor/src/runtime/transaction-lane-layout.js";

describe("Transaction Lane vertical layout", () => {
  it.each([1, 2, 10])("keeps the Lane label band aligned with %i packed track rows", (rowCount) => {
    const { labelHeight, trackHeight } = transactionLaneBandHeights(rowCount);
    expect(labelHeight).toBe(rowCount * 40);
    expect(labelHeight).toBe(trackHeight);
  });

  it("reserves one aligned row for an empty Lane", () => {
    expect(transactionLaneBandHeights(0)).toEqual({ labelHeight: 40, trackHeight: 40 });
  });
});
