import { describe, expect, it } from "vitest";
import { formatEventRowValue } from "../../apps/editor/src/event-table-components.js";

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
});
