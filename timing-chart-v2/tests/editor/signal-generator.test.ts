import { describe, expect, it } from "vitest";
import { generateSignalPulseValues } from "../../apps/editor/src/runtime/signal-generator.js";

describe("Signal Generator (#400)", () => {
  it("generates a single pulse", () => {
    expect(generateSignalPulseValues({ start: 3, initial: 0, active: 1, width: 2, period: 100, repeat: 1, phase: 0, suppressedPeriods: [], cycleCount: 20 }))
      .toEqual([{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 5, value: 0 }]);
  });

  it("generates a finite repeat count of pulses", () => {
    expect(generateSignalPulseValues({ start: 2, initial: 0, active: 1, width: 1, period: 4, repeat: 3, phase: 0, suppressedPeriods: [], cycleCount: 20 }))
      .toEqual([
        { start: 0, value: 0 }, { start: 2, value: 1 }, { start: 3, value: 0 },
        { start: 6, value: 1 }, { start: 7, value: 0 },
        { start: 10, value: 1 }, { start: 11, value: 0 },
      ]);
  });

  it("generates an infinite periodic pulse train up to the document's cycle count", () => {
    const result = generateSignalPulseValues({ start: 0, initial: 0, active: 1, width: 1, period: 4, repeat: "infinite", phase: 0, suppressedPeriods: [], cycleCount: 12 });
    // Pulse starts at 0 immediately overrides the initial=0 entry at cycle 0
    // (last write wins), so cycle 0 is high, not a spurious extra low entry.
    expect(result).toEqual([
      { start: 0, value: 1 }, { start: 1, value: 0 },
      { start: 4, value: 1 }, { start: 5, value: 0 },
      { start: 8, value: 1 }, { start: 9, value: 0 },
    ]);
  });

  it("honors suppressed period indices, skipping only the named pulses", () => {
    const result = generateSignalPulseValues({ start: 1, initial: 0, active: 1, width: 1, period: 3, repeat: 4, phase: 0, suppressedPeriods: [1], cycleCount: 20 });
    // Index 0 -> pulse at 1; index 1 (suppressed) -> nothing at 4; index 2 ->
    // pulse at 7; index 3 -> pulse at 10.
    expect(result.map((change) => change.start)).toEqual([0, 1, 2, 7, 8, 10, 11]);
  });

  it("applies phase as an additional cycle offset on top of Start", () => {
    const result = generateSignalPulseValues({ start: 2, initial: 0, active: 1, width: 1, period: 5, repeat: 1, phase: 3, suppressedPeriods: [], cycleCount: 20 });
    expect(result).toEqual([{ start: 0, value: 0 }, { start: 5, value: 1 }, { start: 6, value: 0 }]);
  });

  it("truncates a pulse that would extend past the document's end without an extra change point", () => {
    const result = generateSignalPulseValues({ start: 8, initial: 0, active: 1, width: 4, period: 100, repeat: 1, phase: 0, suppressedPeriods: [], cycleCount: 10 });
    expect(result).toEqual([{ start: 0, value: 0 }, { start: 8, value: 1 }]);
  });

  it("rejects a Width that is not smaller than Period", () => {
    expect(() => generateSignalPulseValues({ start: 0, initial: 0, active: 1, width: 4, period: 4, repeat: 1, phase: 0, suppressedPeriods: [], cycleCount: 20 })).toThrow(/Width/);
    expect(() => generateSignalPulseValues({ start: 0, initial: 0, active: 1, width: 5, period: 4, repeat: 1, phase: 0, suppressedPeriods: [], cycleCount: 20 })).toThrow(/Width/);
  });

  it("rejects a non-positive Period, Repeat, or a non-integer Start/Phase", () => {
    expect(() => generateSignalPulseValues({ start: 0, initial: 0, active: 1, width: 1, period: 0, repeat: 1, phase: 0, suppressedPeriods: [], cycleCount: 20 })).toThrow(/Period/);
    expect(() => generateSignalPulseValues({ start: 0, initial: 0, active: 1, width: 1, period: 4, repeat: 0, phase: 0, suppressedPeriods: [], cycleCount: 20 })).toThrow(/Repeat/);
    expect(() => generateSignalPulseValues({ start: 1.5, initial: 0, active: 1, width: 1, period: 4, repeat: 1, phase: 0, suppressedPeriods: [], cycleCount: 20 })).toThrow(/Start/);
  });
});
