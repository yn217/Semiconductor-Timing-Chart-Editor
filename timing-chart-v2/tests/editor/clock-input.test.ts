import { describe, expect, it } from "vitest";
import { parseSuppressedPeriods } from "../../apps/editor/src/runtime/clock-input.js";

describe("clock input boundary", () => {
  it("normalizes valid slot lists", () => expect(parseSuppressedPeriods("4, 1 3")).toEqual([1, 3, 4]));
  it("rejects negative and duplicate slots", () => {
    expect(() => parseSuppressedPeriods("-1")).toThrow(/non-negative/);
    expect(() => parseSuppressedPeriods("2,2")).toThrow(/duplicates/);
  });
});
