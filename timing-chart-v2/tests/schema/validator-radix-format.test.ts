import { describe, expect, it } from "vitest";
import { formatBusValue, parseBusValue, validateCanonicalDocument, type CanonicalDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("canonical bus width validation uses shared literal radix semantics", () => {
  it("treats a bare decimal value consistently in a decimal Bus", () => {
    const document = structuredClone(canonicalFixture()) as CanonicalDocument;
    const signalIndex = document.signals.findIndex((signal) => signal.id === "sig_data");
    const signal = document.signals[signalIndex];
    if (!signal || signal.type !== "bus") throw new Error("fixture must contain its Bus signal");
    const decimalBus = { ...signal, width: 4, displayFormat: "decimal" as const, values: [{ start: 0, value: "15" }, { start: 4, value: "16" }] };
    document.signals = document.signals.map((entry, index) => index === signalIndex ? decimalBus : entry);

    expect(parseBusValue("15")).toMatchObject({ kind: "numeric", value: 15n });
    expect(formatBusValue("15", "decimal", 4)).toBe("15");
    const problems = validateCanonicalDocument(document).filter((problem) => problem.code === "BUS_WIDTH_OVERFLOW");
    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe("$.signals[1].values[1].value");
  });

  it("keeps explicit radix prefixes and parses HDL-sized values through the shared policy", () => {
    expect(parseBusValue("0b1111")).toMatchObject({ kind: "numeric", value: 15n });
    expect(parseBusValue("8'h0F")).toMatchObject({ kind: "numeric", value: 15n, width: 8 });

    const document = structuredClone(canonicalFixture()) as CanonicalDocument;
    const signalIndex = document.signals.findIndex((signal) => signal.id === "sig_data");
    const signal = document.signals[signalIndex];
    if (!signal || signal.type !== "bus") throw new Error("fixture must contain its Bus signal");
    const smallBus = { ...signal, width: 4, values: [{ start: 0, value: "8'h0F" }] };
    document.signals = document.signals.map((entry, index) => index === signalIndex ? smallBus : entry);
    expect(validateCanonicalDocument(document).some((problem) => problem.code === "INVALID_BUS_LITERAL" || problem.code === "BUS_WIDTH_OVERFLOW")).toBe(false);
  });

  it("still rejects malformed numeric-like values instead of treating them as symbols", () => {
    const document = structuredClone(canonicalFixture()) as CanonicalDocument;
    const signalIndex = document.signals.findIndex((signal) => signal.id === "sig_data");
    const signal = document.signals[signalIndex];
    if (!signal || signal.type !== "bus") throw new Error("fixture must contain its Bus signal");
    const invalidBus = { ...signal, values: [{ start: 0, value: "12G" }] };
    document.signals = document.signals.map((entry, index) => index === signalIndex ? invalidBus : entry);
    expect(validateCanonicalDocument(document).some((problem) => problem.code === "INVALID_BUS_LITERAL")).toBe(true);
  });
});
