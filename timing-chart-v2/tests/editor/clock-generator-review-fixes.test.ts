import { describe, expect, it } from "vitest";
import { parseSuppressedPeriods } from "../../apps/editor/src/runtime/clock-input.js";
import { generateSignalPulseValues } from "../../apps/editor/src/runtime/signal-generator.js";

describe("suppressed periods separators", () => {
  it("ignores a trailing comma instead of reading it as slot 0", () => expect(parseSuppressedPeriods("1, 3,")).toEqual([1, 3]));
  it("ignores a leading comma instead of reading it as slot 0", () => expect(parseSuppressedPeriods(", 2")).toEqual([2]));
  it("still rejects a non-integer token", () => expect(() => parseSuppressedPeriods("1, x")).toThrow(/non-negative/));
});

describe("signal generator pulses starting before cycle 0", () => {
  it("clips a negative-phase pulse at cycle 0 instead of dropping it", () => {
    const result = generateSignalPulseValues({ start: 0, initial: 0, active: 1, width: 4, period: 8, repeat: 2, phase: -2, suppressedPeriods: [], cycleCount: 10 });
    // High at cycles 0-1, low 2-5, then the second pulse high at 6-9.
    expect(result).toEqual([{ start: 0, value: 1 }, { start: 2, value: 0 }, { start: 6, value: 1 }]);
  });
  it("drops a pulse that lies entirely before cycle 0", () => {
    const result = generateSignalPulseValues({ start: 0, initial: 0, active: 1, width: 2, period: 8, repeat: 2, phase: -3, suppressedPeriods: [], cycleCount: 10 });
    expect(result).toEqual([{ start: 0, value: 0 }, { start: 5, value: 1 }, { start: 7, value: 0 }]);
  });
});
