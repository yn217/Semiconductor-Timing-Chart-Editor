import { describe, expect, it } from "vitest";
import { createTransactionTimeAxis } from "../../apps/editor/src/transaction-time-axis.js";

describe("#750 Transaction display-time axis", () => {
  it("compresses source time by cyclesPerTC (10 -> 50 shrinks the same span 5x) without touching source cycles", () => {
    const at10 = createTransactionTimeAxis({ cyclesPerTc: 10, pxPerTc: 40, zoom: 1, origin: 20 });
    const at50 = createTransactionTimeAxis({ cyclesPerTc: 50, pxPerTc: 40, zoom: 1, origin: 20 });
    const span = (axis: typeof at10) => axis.cycleToX(500) - axis.cycleToX(100);
    expect(span(at10) / span(at50)).toBeCloseTo(5, 10);
    expect(at10.cycleToX(10)).toBe(60); // 1 TC after the origin
    expect(at50.cycleToX(50)).toBe(60);
  });

  it("round-trips X <-> cycle (hit-test / drag inverse) and snaps to whole source cycles within the document", () => {
    const axis = createTransactionTimeAxis({ cyclesPerTc: 4, pxPerTc: 40, zoom: 2, origin: 20 });
    for (const cycle of [0, 1, 7, 128, 1000]) expect(axis.xToCycle(axis.cycleToX(cycle))).toBeCloseTo(cycle, 9);
    expect(axis.xToNearestCycle(axis.cycleToX(7) + 3, 1000)).toBe(7);
    expect(axis.xToNearestCycle(-500, 1000)).toBe(0);
    expect(axis.xToNearestCycle(1e9, 1000)).toBe(1000);
  });

  it("scroll extent shrinks with cyclesPerTC and grows with zoom; invalid inputs fall back to 1", () => {
    const base = createTransactionTimeAxis({ cyclesPerTc: 1, pxPerTc: 40, zoom: 1 });
    expect(createTransactionTimeAxis({ cyclesPerTc: 10, pxPerTc: 40, zoom: 1 }).extent(1000)).toBe(base.extent(1000) / 10);
    expect(createTransactionTimeAxis({ cyclesPerTc: 1, pxPerTc: 40, zoom: 2 }).extent(1000)).toBe(base.extent(1000) * 2);
    const fallback = createTransactionTimeAxis({ cyclesPerTc: 0, pxPerTc: Number.NaN, zoom: -1 });
    expect([fallback.cyclesPerTc, fallback.pxPerTc, fallback.zoom]).toEqual([1, 1, 1]);
  });
});

import { presentationCycles } from "../../apps/editor/src/presentation-cycles.js";
describe("#750 TC-aligned ruler thinning", () => {
  it("keeps only TC boundaries when the per-cycle pitch is tiny and strideMultiple is the TC size", () => {
    const cycles = presentationCycles(160, 4, Infinity, 10);
    expect(cycles.every((cycle) => cycle % 10 === 0 || cycle === 160)).toBe(true);
    expect(cycles.slice(0, 4)).toEqual([0, 10, 20, 30]);
    // Without the multiple the stride is not TC-aligned (the pre-fix defect: 0, 7, 14 ...).
    expect(presentationCycles(160, 4, Infinity, 1).slice(0, 3)).not.toEqual([0, 10, 20]);
  });
});
