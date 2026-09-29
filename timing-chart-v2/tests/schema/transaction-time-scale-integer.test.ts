import { describe, expect, it } from "vitest";
import { parseDocument, validateCanonicalDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// #750 closure: the persisted clockCyclesPerTransactionCycle is a positive integer on every compatibility path.
const withScale = (value: number) => ({ ...canonicalFixture(), transactionTimeScale: { clockCyclesPerTransactionCycle: value, majorInterval: 5, minorInterval: 1 } });

describe("transactionTimeScale.clockCyclesPerTransactionCycle", () => {
  it.each([1, 3, 7, 25, 100])("accepts %s", (value) => {
    expect(parseDocument(withScale(value)).ok).toBe(true);
  });
  it.each([1.5, 0, -2, Number.NaN])("rejects %s at Open", (value) => {
    const result = parseDocument(withScale(value));
    expect(result.ok).toBe(false);
  });
  it("canonical validation rejects the fractional value (structural SCHEMA_TYPE and the semantic invariant agree)", () => {
    const problems = validateCanonicalDocument(withScale(1.5) as never);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.code === "SCHEMA_TYPE" || problem.code === "INVALID_TRANSACTION_TIME_SCALE")).toBe(true);
  });
});
