import { describe, expect, it } from "vitest";
import { cycleUnitWord } from "../../apps/editor/src/transaction-tc.js";

describe("cycleUnitWord (#766)", () => {
  it("is singular only for exactly 1", () => {
    expect(cycleUnitWord(1)).toBe("cycle");
    for (const count of [0, 2, 4, 10, 50, 1.5]) expect(cycleUnitWord(count)).toBe("cycles");
  });
});
