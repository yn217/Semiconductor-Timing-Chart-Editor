import { describe, expect, it } from "vitest";
import { compareExactSourceCycle, exactSourceCycleToNumber, vcdTimestampToSourceCycles } from "@timing-chart-v2/projection";

describe("VCD source-time mapping (#1093)", () => {
  const timebase = { referenceFrequencyHz: 100_000_000, unit: "ns" as const };

  it("maps each supported VCD SI timescale into exact authored source cycles", () => {
    const expected = ["s", "ms", "us", "ns", "ps", "fs"] as const;
    const cyclesExpected = [
      { numerator: 100_000_000n, denominator: 1n },
      { numerator: 100_000n, denominator: 1n },
      { numerator: 100n, denominator: 1n },
      { numerator: 1n, denominator: 10n },
      { numerator: 1n, denominator: 10_000n },
      { numerator: 1n, denominator: 10_000_000n },
    ];
    for (let index = 0; index < expected.length; index += 1) {
      const cycles = vcdTimestampToSourceCycles(1n, { magnitude: 1n, unit: expected[index]! }, timebase)!;
      expect(cycles).toEqual(cyclesExpected[index]);
    }
  });

  it("preserves fractional-cycle event times exactly for zero-tolerance comparison", () => {
    const halfCycle = vcdTimestampToSourceCycles(5n, { magnitude: 1n, unit: "ns" }, timebase)!;
    const cycleBoundary = vcdTimestampToSourceCycles(10n, { magnitude: 1n, unit: "ns" }, timebase)!;
    expect(halfCycle).toEqual({ numerator: 1n, denominator: 2n });
    expect(compareExactSourceCycle(halfCycle, { numerator: 1n, denominator: 2n })).toBe(0);
    expect(compareExactSourceCycle(halfCycle, cycleBoundary)).toBe(-1);
    expect(exactSourceCycleToNumber(halfCycle)).toBe(0.5);
  });

  it("supports decimal reference frequencies without converting timestamps to floating point", () => {
    const cycles = vcdTimestampToSourceCycles(3n, { magnitude: 1n, unit: "ns" }, { referenceFrequencyHz: 125_000_000, unit: "ps" })!;
    expect(cycles).toEqual({ numerator: 3n, denominator: 8n });
  });

  it("rejects missing timebase and invalid/negative timestamps", () => {
    expect(vcdTimestampToSourceCycles(1n, { magnitude: 1n, unit: "ns" }, undefined)).toBeUndefined();
    expect(vcdTimestampToSourceCycles(-1n, { magnitude: 1n, unit: "ns" }, timebase)).toBeUndefined();
    expect(vcdTimestampToSourceCycles(1n, { magnitude: 0n, unit: "ns" }, timebase)).toBeUndefined();
    expect(vcdTimestampToSourceCycles(1n, { magnitude: 1n, unit: "ns" }, { referenceFrequencyHz: Number.NaN, unit: "ns" })).toBeUndefined();
  });
});
