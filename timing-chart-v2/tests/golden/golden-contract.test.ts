import { describe, expect, it } from "vitest";
import { assertGoldenSemanticContract, assertGoldenSvgContract, type GoldenContractMeta } from "./golden-contract.js";

const meta: GoldenContractMeta = { file: "negative.tcd.json", title: "Negative sample", cycles: 4, signalCount: 2, transactionCount: 1, coverage: ["waveform", "export"] };

describe("Golden contract gate", () => {
  it("fails when a declared canonical feature is missing", () => {
    expect(() => assertGoldenSemanticContract(meta, { cycles: 4, signals: 1, transactions: 1 })).toThrow(/expected 2 signals/);
  });

  it("fails when the export scene or declared objects are missing", () => {
    expect(() => assertGoldenSvgContract(meta, `<svg data-export-scene="v2"><text>Negative sample</text></svg>`)).toThrow(/signals/);
    expect(() => assertGoldenSvgContract(meta, `<svg><text>Negative sample</text></svg>`)).toThrow(/scene marker/);
  });

  it("accepts a complete semantic/export contract", () => {
    assertGoldenSemanticContract(meta, { cycles: 4, signals: 2, transactions: 1 });
    assertGoldenSvgContract(meta, `<svg data-export-scene="v2"><text>Negative sample</text><g data-signal-id="a"/><g data-signal-id="b"/><g data-transaction-id="t"/></svg>`);
  });
});
