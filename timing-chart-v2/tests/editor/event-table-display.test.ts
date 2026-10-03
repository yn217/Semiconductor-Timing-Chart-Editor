import { describe, expect, it } from "vitest";
import { formatEventRowValue } from "../../apps/editor/src/event-table-components.js";
import { formatBusValueAtCycle } from "../../apps/editor/src/signal-value-presentation.js";

describe("Event Table read-only value presentation", () => {
  it("uses the shared bus formatter for the signal's selected radix", () => {
    expect(formatEventRowValue({ type: "bus", displayFormat: "decimal", width: 8 }, { value: "0xFF" })).toBe("255");
    expect(formatEventRowValue({ type: "bus", displayFormat: "binary", width: 8 }, { value: "A5" })).toBe("0b10100101");
    expect(formatEventRowValue({ type: "bus", displayFormat: "signed", width: 8 }, { value: "0xFF" })).toBe("-1");
  });

  it("preserves explicit display labels and leaves non-bus values unchanged", () => {
    expect(formatEventRowValue({ type: "bus", displayFormat: "decimal", width: 8 }, { value: "0xFF", displayLabel: "Ready" })).toBe("Ready");
    expect(formatEventRowValue({ type: "logic" }, { value: "X" })).toBe("X");
  });

  it("projects the value active at the selected cycle with the same radix formatter", () => {
    const signal = { type: "bus", width: 8, displayFormat: "hex", values: [{ start: 0, value: "00" }, { start: 4, value: "A5" }, { start: 9, value: "0F" }] } as const;
    expect(formatBusValueAtCycle(signal, 3)).toBe("0x00");
    expect(formatBusValueAtCycle(signal, 4)).toBe("0xA5");
    expect(formatBusValueAtCycle(signal, 8, "decimal")).toBe("165");
    expect(formatBusValueAtCycle(signal, 9, "binary")).toBe("0b00001111");
    expect(formatBusValueAtCycle({ ...signal, values: [{ start: 2, value: "01" }] }, 1)).toBeUndefined();
  });
});
