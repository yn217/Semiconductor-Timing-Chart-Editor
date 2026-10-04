import { describe, expect, it } from "vitest";
import { transactionLaneBandHeights, transactionLaneBandsInVerticalWindow } from "../../apps/editor/src/runtime/transaction-lane-layout.js";

describe("Transaction Lane vertical layout", () => {
  it.each([1, 2, 10])("keeps the Lane label band aligned with %i packed track rows", (rowCount) => {
    const { labelHeight, trackHeight } = transactionLaneBandHeights(rowCount);
    expect(labelHeight).toBe(rowCount * 40);
    expect(labelHeight).toBe(trackHeight);
  });

  it("reserves one aligned row for an empty Lane", () => {
    expect(transactionLaneBandHeights(0)).toEqual({ labelHeight: 40, trackHeight: 40 });
  });

  it("selects visible vertical bands with logarithmic seek and pins an offscreen stable lane", () => {
    const bands = Array.from({ length: 10_000 }, (_, index) => ({ key: `lane-${index}`, trackTop: index * 64, trackHeight: 40, labelTop: index * 64, labelHeight: 40 }));
    const result = transactionLaneBandsInVerticalWindow(bands, 50_000, 50_240, bands[9_999]);

    expect(result.bands.map((band) => band.key)).toEqual(["lane-781", "lane-782", "lane-783", "lane-784", "lane-9999"]);
    expect(result.visits).toBeLessThan(32);
  });
});
