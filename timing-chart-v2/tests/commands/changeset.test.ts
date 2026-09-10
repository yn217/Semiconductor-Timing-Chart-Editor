import { describe, expect, it } from "vitest";
import { mergeChangeSets } from "@timing-chart-v2/commands";

describe("ChangeSet merge contract", () => {
  it("deduplicates affected entity IDs while preserving first-seen order", () => {
    expect(mergeChangeSets([
      { rowOrder: ["sig_a", "sig_b"], geometryScreenY: ["sig_b"] },
      { rowOrder: ["sig_b", "sig_c"], geometryScreenY: ["sig_a", "sig_b"] },
    ])).toEqual({ rowOrder: ["sig_a", "sig_b", "sig_c"], geometryScreenY: ["sig_b", "sig_a"] });
  });

  it("OR-merges global invalidation flags without inventing unrelated domains", () => {
    expect(mergeChangeSets([
      { transactionSemantics: ["txn_a"] },
      { minimapOverview: true, geometryScreenX: true },
    ])).toEqual({ transactionSemantics: ["txn_a"], geometryScreenX: true, minimapOverview: true });
  });
});
