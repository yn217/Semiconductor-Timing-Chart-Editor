import { describe, expect, it } from "vitest";
import { migrateThroughRegistry, migrateV1, type MigrationStep } from "../../packages/schema/src/migration.js";
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
  it("applies registered migrations sequentially and records lossy-step warnings", () => {
    const order: string[] = [];
    const registry: MigrationStep[] = [
      { fromVersion: 1, toVersion: 2, lossy: false, warningPolicy: "warn", migrate: (input) => { order.push("1->2"); return { value: { ...(input as object), formatVersion: 2 }, warnings: [] }; } },
      { fromVersion: 2, toVersion: 3, lossy: true, warningPolicy: "warn", migrate: (input) => { order.push("2->3"); return { value: { ...(input as object), formatVersion: 3 }, warnings: [{ code: "MIGRATION_TEST_LOSSY", path: "$.test", message: "Synthetic lossy migration." }] }; } },
    ];
    const result = migrateThroughRegistry({ formatVersion: 1, payload: "fixture" }, 3, registry);
    expect(result).toMatchObject({ appliedSteps: ["1->2", "2->3"], value: { formatVersion: 3 } });
    expect(order).toEqual(["1->2", "2->3"]);
    expect(result?.warnings).toHaveLength(1);
  });

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

  it("rounds a fractional V1 change point to an integer cycle and warns, instead of passing it through to a canonical document validation would silently accept but WaveDrom/geometry cannot render", () => {
    const source = v1Document({
      signals: [{ id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }, { start: 4.5, value: 1 }, { start: 7, value: 0 }] }],
    });
    const { document, warnings } = migrateV1(source);
    const values = document.signals[0]!.type !== "commentRow" && document.signals[0]!.type !== "clock" ? document.signals[0]!.values : [];
    expect(values.map((change) => change.start)).toEqual([0, 5, 7]);
    expect(values.every((change) => Number.isInteger(change.start))).toBe(true);
    expect(warnings.some((warning) => warning.code === "MIGRATION_FRACTIONAL_CYCLE_ROUNDED")).toBe(true);
    expect(validateCanonicalDocument(document)).toHaveLength(0);
  });

  it("deterministically merges a sub-cycle pulse that collapses onto an adjacent integer cycle after rounding, keeping strictly-sorted change points", () => {
    // 13:0 -> 13.5:1 (a half-cycle blip) -> 14:0; rounding 13.5 to 14 collides with the existing
    // 14:0 entry. The later value must win so the result stays strictly increasing and valid.
    const source = v1Document({
      signals: [{ id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }, { start: 13, value: 0 }, { start: 13.5, value: 1 }, { start: 14, value: 0 }] }],
      timeline: { cycleCount: 20 },
    });
    const { document, warnings } = migrateV1(source);
    const values = document.signals[0]!.type !== "commentRow" && document.signals[0]!.type !== "clock" ? document.signals[0]!.values : [];
    expect(values.map((change) => ({ start: change.start, value: change.value }))).toEqual([{ start: 0, value: 0 }, { start: 13, value: 0 }, { start: 14, value: 0 }]);
    expect(warnings.some((warning) => warning.code === "MIGRATION_SUB_CYCLE_CHANGE_MERGED")).toBe(true);
    expect(validateCanonicalDocument(document)).toHaveLength(0);
  });

  it("normalizes legacy fractional clock geometry to the V2 integer/half-cycle contract with explicit warnings", () => {
    const source = v1Document({
      signals: [{ id: "sig_clk", name: "CLK", type: "clock", role: "input", generator: { start: 0, period: 1.5, duty: 0.5, phase: 0.25, initial: 0, polarity: "positive" } }],
    });
    const { document, warnings } = migrateV1(source);
    const clock = document.signals[0]!;
    expect(clock.type).toBe("clock");
    if (clock.type !== "clock") return;
    expect(clock.generator.period).toBe(2);
    expect(clock.generator.phase).toBe(0.5);
    expect(warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      "MIGRATION_FRACTIONAL_CLOCK_PERIOD_ROUNDED",
      "MIGRATION_SUB_HALF_CYCLE_ROUNDED",
    ]));
    expect(validateCanonicalDocument(document)).toHaveLength(0);
  });

  it("round-trips a valid Signal Split pane assignment and silently drops a garbage one (#200)", () => {
    const source = v1Document({
      signals: [
        { id: "sig_upper", name: "UPPER", type: "binary", role: "input", display: { name: "UPPER", splitPane: "upper" }, values: [{ start: 0, value: 0 }] },
        { id: "sig_garbage", name: "GARBAGE", type: "binary", role: "input", display: { name: "GARBAGE", splitPane: "middle" }, values: [{ start: 0, value: 0 }] },
      ],
    });
    const { document } = migrateV1(source);
    expect(document.signals[0]!.display.splitPane).toBe("upper");
    expect(document.signals[1]!.display.splitPane).toBeUndefined();
    expect(validateCanonicalDocument(document)).toHaveLength(0);
  });

  it("allocates fallback IDs against one document-wide explicit-ID set", () => {
    const source = v1Document({
      signals: [{ name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }] }],
      annotations: [{ id: "signal_001", type: "text", label: "collision", anchor: { cycle: 0, point: "cycle-start" } }],
      transactions: [{ name: "Read", start: 0, end: 2 }],
      transactionGroups: [{ id: "transaction_001", name: "Collision Group", order: 0 }],
    });
    const first = migrateV1(source).document;
    const second = migrateV1(source).document;
    const ids = [
      ...first.signals.map((item) => item.id), ...first.signalGroups.map((item) => item.id),
      ...first.annotations.map((item) => item.id), ...first.transactions.map((item) => item.id),
      ...(first.transactionGroups ?? []).map((item) => item.id), ...first.bookmarks.map((item) => item.id),
      ...first.timeGroups.map((item) => item.id), ...first.constraints.map((item) => item.id),
      ...first.timeline.labelAnchors.map((item) => item.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.signals[0]!.id).not.toBe("signal_001");
    expect(first.transactions[0]!.id).not.toBe("transaction_001");
    expect(first).toEqual(second);
    expect(validateCanonicalDocument(first)).toHaveLength(0);
  });

  it("repairs duplicate value-change IDs during migration", () => {
    const document = migrateV1(v1Document({ signals: [{ id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ id: "change_same", start: 0, value: 0 }, { id: "change_same", start: 3, value: 1 }] }] })).document;
    const values = (document.signals[0] as { values: readonly { id?: string }[] }).values;
    expect(values.map((change) => change.id)).toHaveLength(2);
    expect(new Set(values.map((change) => change.id)).size).toBe(2);
    expect(migrateV1(v1Document({ signals: [{ id: "sig_data", name: "DATA", type: "binary", role: "input", values: [{ id: "change_same", start: 0, value: 0 }, { id: "change_same", start: 3, value: 1 }] }] })).warnings.some((warning) => warning.code === "MIGRATION_DUPLICATE_CHANGE_ID_REPAIRED")).toBe(true);
  });
});
