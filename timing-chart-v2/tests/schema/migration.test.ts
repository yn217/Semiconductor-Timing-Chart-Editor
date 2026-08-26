import { describe, expect, it } from "vitest";
import { migrateV1 } from "../../packages/schema/src/migration.js";
import { validateCanonicalDocument } from "../../packages/schema/src/validation.js";

function v1Document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    document: { id: "v1-doc", title: "V1 Document" },
    timeline: { cycleCount: 10 },
    signals: [{ id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] }],
    ...overrides,
  };
}

describe("migrateV1", () => {
  it("preserves the value-center anchor point instead of losslessly-incorrectly remapping it to transition-center", () => {
    const source = v1Document({
      signals: [
        { id: "sig_clk", name: "CLK", type: "clock", generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } },
        { id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] },
      ],
      annotations: [{ id: "ann_1", type: "text", label: "note", anchor: { signalId: "sig_data", cycle: 0, point: "value-center" } }],
    });
    const { document } = migrateV1(source);
    expect(document.annotations[0]!.anchor!.point).toBe("value-center");
  });

  it("leaves referenceClock entirely absent for a clockless V1 document instead of defaulting it to a non-clock signal", () => {
    const source = v1Document(); // only a "binary" signal, no clock
    const { document } = migrateV1(source);
    expect(document.timeline.referenceClock).toBeUndefined();
    // this is the concrete bug: the migrated document must not fail validation
    // just because it has no clock to anchor a reference clock to.
    const problems = validateCanonicalDocument(document);
    expect(problems.filter((problem) => problem.code === "INVALID_REFERENCE_CLOCK")).toHaveLength(0);
    expect(problems).toHaveLength(0);
  });

  it("still defaults referenceClock to the first clock signal when one exists", () => {
    const source = v1Document({
      signals: [
        { id: "sig_clk", name: "CLK", type: "clock", generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } },
        { id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] },
      ],
    });
    const { document } = migrateV1(source);
    expect(document.timeline.referenceClock).toBe("sig_clk");
    expect(validateCanonicalDocument(document)).toHaveLength(0);
  });

  it("falls back to the real clock signal (with a warning) when the legacy referenceClock names a non-clock or missing ID", () => {
    const source = v1Document({
      timeline: { cycleCount: 10, referenceClock: "sig_data" }, // sig_data is a binary signal, not a clock
      signals: [
        { id: "sig_clk", name: "CLK", type: "clock", generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } },
        { id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] },
      ],
    });
    const { document, warnings } = migrateV1(source);
    expect(document.timeline.referenceClock).toBe("sig_clk");
    expect(validateCanonicalDocument(document)).toHaveLength(0);
    expect(warnings.some((warning) => warning.code === "INVALID_LEGACY_REFERENCE_CLOCK")).toBe(true);
  });

  it("preserves a legacy referenceClock that does validly identify a clock signal", () => {
    const source = v1Document({
      timeline: { cycleCount: 10, referenceClock: "sig_clk_b" },
      signals: [
        { id: "sig_clk_a", name: "CLK_A", type: "clock", generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } },
        { id: "sig_clk_b", name: "CLK_B", type: "clock", generator: { start: 0, period: 4, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } },
      ],
    });
    const { document, warnings } = migrateV1(source);
    expect(document.timeline.referenceClock).toBe("sig_clk_b");
    expect(warnings.some((warning) => warning.code === "INVALID_LEGACY_REFERENCE_CLOCK")).toBe(false);
  });
});
