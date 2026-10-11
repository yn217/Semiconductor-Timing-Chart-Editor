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

async function compare(authored: readonly { cycle: number; value: string | number }[], changes: readonly VcdValueChange[]) {
  return compareAuthoredTransitions(identity, authored, changes, ns, timebase);
}

describe("compareAuthoredTransitions", () => {
  it("passes exact cycle/value sequences", async () => {
    expect(await compare([{ cycle: 0, value: 0 }, { cycle: 3, value: 1 }], [change(0n, "0"), change(3n, "1")])).toMatchObject({
      signalId: "signal-clock", equal: true, differences: [],
    });
  });

  it("preserves exact distinctions between X and Z while normalizing their case", async () => {
    expect((await compare([{ cycle: 0, value: "X" }, { cycle: 1, value: "Z" }], [change(0n, "x"), change(1n, "z")])).equal).toBe(true);
    expect((await compare([{ cycle: 0, value: "X" }], [change(0n, "z")])).differences[0]?.kind).toBe("value-mismatch");
  });

  it("reports fractional-cycle displacement as a zero-tolerance timing mismatch", async () => {
    const result = await compareAuthoredTransitions(identity, [{ cycle: 1, value: "1" }], [change(1n, "1")],
      { magnitude: 3n, unit: "ps" }, timebase);
    expect(result.differences).toEqual([expect.objectContaining({
      kind: "timing-mismatch",
      authoredCycle: { numerator: 1n, denominator: 1n },
      vcdCycle: { numerator: 3n, denominator: 1000n },
    })]);
  });

  it("distinguishes missing and extra transitions", async () => {
    expect((await compare([{ cycle: 0, value: "0" }, { cycle: 2, value: "1" }], [change(0n, "0")])).differences.map((item) => item.kind))
      .toEqual(["missing-event"]);
    expect((await compare([{ cycle: 0, value: "0" }], [change(0n, "0"), change(2n, "1")])).differences.map((item) => item.kind))
      .toEqual(["extra-event"]);
  });

  it("reports a same-cycle value mismatch", async () => {
    expect((await compare([{ cycle: 2, value: "0" }], [change(2n, "1")])).differences[0]).toMatchObject({
      kind: "value-mismatch", authoredValue: "0", vcdValue: "1",
    });
  });

  it("fails closed for unsupported authored values without coercion", async () => {
    for (const value of [2, 0.5, "false", " 1", "X "] as const) {
      expect((await compare([{ cycle: 0, value }], [change(0n, "0")])).differences[0]?.kind).toBe("unsupported-value");
    }
  });

  it("compares four-state bus vectors exactly and pads authored numeric values to declared width", async () => {
    const vectorIdentity = { signalId: "signal-bus", vcdCode: "!" };
    const vectorResult = await compareAuthoredTransitions(
      vectorIdentity,
      [{ cycle: 0, value: "0b10xz" }, { cycle: 1, value: 1 }],
      [vectorChange(0n, "10xz"), vectorChange(1n, "0001")],
      ns,
      timebase,
      { width: 4, displayFormat: "binary" },
    );
    expect(vectorResult).toMatchObject({ equal: true, differences: [] });
    const differentZ = await compareAuthoredTransitions(
      vectorIdentity,
      [{ cycle: 0, value: "0b10xz" }],
      [vectorChange(0n, "10xx")],
      ns,
      timebase,
      { width: 4, displayFormat: "binary" },
    );
    expect(differentZ.differences[0]?.kind).toBe("value-mismatch");
  });

  it("rejects canonical widths above the VCD comparison expansion budget", async () => {
    const result = await compareAuthoredTransitions(
      { signalId: "signal-bus", vcdCode: "!" },
      [{ cycle: 0, value: 0 }],
      [vectorChange(0n, "0")],
      ns,
      timebase,
      { width: Number.MAX_SAFE_INTEGER },
    );
    expect(result.differences[0]).toMatchObject({ kind: "unsupported-value", detail: expect.stringContaining("width") });
  });

  it("matches canonical hexadecimal bus values against equal-width VCD bits", async () => {
    const result = await compareAuthoredTransitions(
      { signalId: "signal-data", vcdCode: "!" },
      [{ cycle: 0, value: "00" }, { cycle: 4, value: "A5" }],
      [vectorChange(0n, "00000000"), vectorChange(4n, "10100101")],
      ns,
      timebase,
      { width: 8, displayFormat: "hex" },
    );
    expect(result).toMatchObject({ equal: true, differences: [] });
  });

  it("retains only the requested finding sample while preserving exact totals", async () => {
    const result = await compareAuthoredTransitions(
      identity,
      [],
      Array.from({ length: 200 }, (_, index) => change(BigInt(index), index % 2 ? "1" : "0")),
      ns,
      timebase,
      {},
      { maxRetainedDifferences: 7 },
    );
    expect(result.differences).toHaveLength(7);
    expect(result.totalDifferenceCount).toBe(200);
    expect(result.differenceCounts["extra-event"]).toBe(200);
    expect(result.equal).toBe(false);
    const countOnly = await compareAuthoredTransitions(
      identity,
      [],
      Array.from({ length: 200 }, (_, index) => change(BigInt(index), index % 2 ? "1" : "0")),
      ns,
      timebase,
      {},
      { maxRetainedDifferences: 0 },
    );
    expect(countOnly.differences).toEqual([]);
    expect(countOnly.totalDifferenceCount).toBe(200);
  });

  it("yields to another browser task and aborts during a large single-signal comparison", async () => {
    const controller = new AbortController();
    let browserTaskRan = false;
    globalThis.setTimeout(() => { browserTaskRan = true; controller.abort(); }, 0);
    const manyChanges = Array.from({ length: 20_000 }, (_, index) => change(BigInt(index), index % 2 ? "1" : "0"));
    await expect(compareAuthoredTransitions(identity, [], manyChanges, ns, timebase, {}, { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(browserTaskRan).toBe(true);
  });
});
