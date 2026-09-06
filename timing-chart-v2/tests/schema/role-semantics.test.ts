import { describe, expect, it } from "vitest";
import { clockTiming, resetSemantics, validateClockTiming } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("shared role semantic selectors", () => {
  it("reads existing clock generator without a second owner", () => {
    const clock = canonicalFixture().signals[0]!; expect(clockTiming(clock)?.period).toBe(1); expect(validateClockTiming(clock)).toBeUndefined();
  });
  it("reads reset metadata from value signals", () => {
    const signal = { ...canonicalFixture().signals[1]!, resetSemantics: { polarity: "active-low", synchronization: "synchronous" } as const };
    expect(resetSemantics(signal)?.polarity).toBe("active-low");
  });
});
