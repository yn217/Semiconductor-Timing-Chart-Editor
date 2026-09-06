import { describe, expect, it } from "vitest";
import { formatBusValue, parseBusValue } from "@timing-chart-v2/schema";

describe("shared bus value parser/formatter", () => {
  it("normalizes approved literals across radix", () => {
    expect(formatBusValue("A5", "hex", 8)).toBe("0xA5");
    expect(formatBusValue("0xA5", "binary", 8)).toBe("0b10100101");
    expect(formatBusValue("8'hA5", "decimal", 8)).toBe("165");
  });
  it("interprets signed values using the declared width", () => {
    expect(formatBusValue("0xFF", "signed", 8)).toBe("-1");
    expect(formatBusValue("0xFF", "unsigned", 8)).toBe("255");
  });
  it("preserves unknown and symbolic values without coercion", () => {
    expect(parseBusValue("8'b10XZ")).toMatchObject({ kind: "unknown", width: 8 });
    expect(formatBusValue("READY", "hex", 8)).toBe("READY");
  });
});
