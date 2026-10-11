import { describe, expect, it } from "vitest";
import { compareAuthoredTransitions } from "../../apps/editor/src/simulation/transition-comparison.js";
import type { VcdValueChange } from "../../apps/editor/src/simulation/vcd-text-parser.js";

const identity = { signalId: "signal-clock", vcdCode: "!" } as const;
const ns = { magnitude: 1n, unit: "ns" as const };
const timebase = { referenceFrequencyHz: 1_000_000_000 };

function change(timestamp: bigint, value: string): VcdValueChange {
  return { timestamp, code: "!", kind: "scalar", value };
}

function vectorChange(timestamp: bigint, value: string): VcdValueChange {
  return { timestamp, code: "!", kind: "vector", value };
}

function compare(authored: readonly { cycle: number; value: string | number }[], changes: readonly VcdValueChange[]) {
  return compareAuthoredTransitions(identity, authored, changes, ns, timebase);
}

describe("compareAuthoredTransitions", () => {
  it("passes exact cycle/value sequences", () => {
    expect(compare([{ cycle: 0, value: 0 }, { cycle: 3, value: 1 }], [change(0n, "0"), change(3n, "1")])).toMatchObject({
      signalId: "signal-clock", equal: true, differences: [],
    });
  });

  it("preserves exact distinctions between X and Z while normalizing their case", () => {
    expect(compare([{ cycle: 0, value: "X" }, { cycle: 1, value: "Z" }], [change(0n, "x"), change(1n, "z")]).equal).toBe(true);
    expect(compare([{ cycle: 0, value: "X" }], [change(0n, "z")]).differences[0]?.kind).toBe("value-mismatch");
  });

  it("reports fractional-cycle displacement as a zero-tolerance timing mismatch", () => {
    const result = compareAuthoredTransitions(identity, [{ cycle: 1, value: "1" }], [change(1n, "1")],
      { magnitude: 3n, unit: "ps" }, timebase);
    expect(result.differences).toEqual([expect.objectContaining({
      kind: "timing-mismatch",
      authoredCycle: { numerator: 1n, denominator: 1n },
      vcdCycle: { numerator: 3n, denominator: 1000n },
    })]);
  });

  it("distinguishes missing and extra transitions", () => {
    expect(compare([{ cycle: 0, value: "0" }, { cycle: 2, value: "1" }], [change(0n, "0")]).differences.map((item) => item.kind))
      .toEqual(["missing-event"]);
    expect(compare([{ cycle: 0, value: "0" }], [change(0n, "0"), change(2n, "1")]).differences.map((item) => item.kind))
      .toEqual(["extra-event"]);
  });

  it("reports a same-cycle value mismatch", () => {
    expect(compare([{ cycle: 2, value: "0" }], [change(2n, "1")]).differences[0]).toMatchObject({
      kind: "value-mismatch", authoredValue: "0", vcdValue: "1",
    });
  });

  it("fails closed for unsupported authored values without coercion", () => {
    for (const value of [2, 0.5, "false", " 1", "X "] as const) {
      expect(compare([{ cycle: 0, value }], [change(0n, "0")]).differences[0]?.kind).toBe("unsupported-value");
    }
  });

  it("compares four-state bus vectors exactly and pads authored numeric values to declared width", () => {
    const vectorIdentity = { signalId: "signal-bus", vcdCode: "!" };
    const vectorResult = compareAuthoredTransitions(
      vectorIdentity,
      [{ cycle: 0, value: "0b10xz" }, { cycle: 1, value: 1 }],
      [vectorChange(0n, "10xz"), vectorChange(1n, "0001")],
      ns,
      timebase,
      { width: 4, displayFormat: "binary" },
    );
    expect(vectorResult).toMatchObject({ equal: true, differences: [] });
    const differentZ = compareAuthoredTransitions(
      vectorIdentity,
      [{ cycle: 0, value: "0b10xz" }],
      [vectorChange(0n, "10xx")],
      ns,
      timebase,
      { width: 4, displayFormat: "binary" },
    );
    expect(differentZ.differences[0]?.kind).toBe("value-mismatch");
  });

  it("matches canonical hexadecimal bus values against equal-width VCD bits", () => {
    const result = compareAuthoredTransitions(
      { signalId: "signal-data", vcdCode: "!" },
      [{ cycle: 0, value: "00" }, { cycle: 4, value: "A5" }],
      [vectorChange(0n, "00000000"), vectorChange(4n, "10100101")],
      ns,
      timebase,
      { width: 8, displayFormat: "hex" },
    );
    expect(result).toMatchObject({ equal: true, differences: [] });
  });
});
