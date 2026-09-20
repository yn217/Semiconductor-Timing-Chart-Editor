import { describe, expect, it } from "vitest";
import { cyclesPerTc, cyclesToTc, tcFieldLabel, tcToCycles, tcUnitLabel } from "../../apps/editor/src/transaction-tc.js";

describe("Transaction TC presentation mapping (#750)", () => {
  it("reads cycles-per-TC from the document and defaults to 1", () => {
    expect(cyclesPerTc({})).toBe(1);
    expect(cyclesPerTc({ transactionTimeScale: { clockCyclesPerTransactionCycle: 10, majorInterval: 5, minorInterval: 1 } })).toBe(10);
    expect(cyclesPerTc({ transactionTimeScale: { clockCyclesPerTransactionCycle: 0, majorInterval: 5, minorInterval: 1 } })).toBe(1);
  });
  it("shows canonical cycles as TC without rewriting them (1.5 TC for cycle 15 at 10/TC)", () => {
    expect(cyclesToTc(100, 10)).toBe(10);
    expect(cyclesToTc(140, 10)).toBe(14);
    expect(cyclesToTc(100, 5)).toBe(20);
    expect(cyclesToTc(15, 10)).toBe(1.5);
    expect(cyclesToTc(7, 1)).toBe(7);
  });
  it("converts entered TC back to whole source cycles", () => {
    expect(tcToCycles(7, 10)).toBe(70);
    expect(tcToCycles(1.5, 10)).toBe(15);
    expect(tcToCycles(1.55, 10)).toBe(16);
    expect(tcToCycles(20, 5)).toBe(100);
  });
  it("round-trips whole cycles exactly for every preset", () => {
    for (const perTc of [1, 2, 4, 5, 10, 20, 50]) for (const cycles of [0, 1, 7, 15, 100, 4095]) expect(tcToCycles(cyclesToTc(cycles, perTc), perTc)).toBe(cycles);
  });
  it("labels carry an explicit unit", () => {
    expect(tcUnitLabel(1)).toBe("cycles");
    expect(tcUnitLabel(10)).toBe("TC");
    expect(tcFieldLabel("Start", 10)).toBe("Start (TC)");
    expect(tcFieldLabel("End", 1)).toBe("End (cycles)");
  });
});
