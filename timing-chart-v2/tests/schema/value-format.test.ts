import { describe, expect, it } from "vitest";
import { formatBusValue, parseBusValue } from "@timing-chart-v2/schema";

describe("shared bus value parser/formatter", () => {
  it("normalizes approved literals across radix", () => {
    expect(formatBusValue("A5", "hex", 8)).toBe("0xA5");
    expect(formatBusValue("0xA5", "binary", 8)).toBe("0b10100101");
    expect(formatBusValue("8'hA5", "decimal", 8)).toBe("165");
  });
  it("applies HDL sized-literal width by truncating excess most-significant bits", () => {
    expect(parseBusValue("4'hFF")).toMatchObject({ kind: "numeric", value: 15n, width: 4 });
    expect(parseBusValue("8'h1FF")).toMatchObject({ kind: "numeric", value: 255n, width: 8 });
    expect(parseBusValue("4'd31")).toMatchObject({ kind: "numeric", value: 15n, width: 4 });
    expect(parseBusValue("4'b10000")).toMatchObject({ kind: "numeric", value: 0n, width: 4 });
    expect(formatBusValue("4'hFF", "hex", 8)).toBe("0x0F");
    expect(formatBusValue("4'hFF", "signed", 4)).toBe("-1");
  });
  it("rejects zero or non-safe declared widths", () => {
    expect(() => parseBusValue("0'h1")).toThrow(/positive safe integer/);
    expect(() => parseBusValue("9007199254740992'h1")).toThrow(/positive safe integer/);
    expect(() => parseBusValue("4'hG")).toThrow(/Invalid sized bus literal/);
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
