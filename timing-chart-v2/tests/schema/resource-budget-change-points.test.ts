import { describe, expect, it } from "vitest";
import { DOCUMENT_RESOURCE_BUDGET, countSignalChangePoints, validateDocumentResourceBudget } from "../../packages/schema/src/resource-budget.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("canonical change-point resource budget", () => {
  it("counts Clock enable and value-Signal changes together at the exact shared limit", () => {
    const source = canonicalFixture();
    const valueCount = Math.floor(DOCUMENT_RESOURCE_BUDGET.valueChangeCount * 0.6);
    const enableCount = DOCUMENT_RESOURCE_BUDGET.valueChangeCount - valueCount;
    const signals = source.signals.map((signal) => {
      if (signal.type === "clock") return { ...signal, enable: new Array(enableCount) };
      if (signal.id === "sig_data" && "values" in signal) return { ...signal, values: new Array(valueCount) };
      return signal;
    });
    const exact = { ...source, signals };
    expect(countSignalChangePoints([
      { kind: "values", values: new Array(valueCount) },
      { kind: "clock", enable: new Array(enableCount) },
    ])).toBe(DOCUMENT_RESOURCE_BUDGET.valueChangeCount);
    expect(validateDocumentResourceBudget(exact).some((problem) => problem.detail?.startsWith("resource-budget;metric=valueChanges;"))).toBe(false);

    const overLimit = { ...exact, signals: signals.map((signal) => signal.type === "clock" ? { ...signal, enable: new Array(enableCount + 1) } : signal) };
    expect(validateDocumentResourceBudget(overLimit)).toContainEqual(expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.signals[*].values|$.signals[*].enable",
      value: DOCUMENT_RESOURCE_BUDGET.valueChangeCount + 1,
      detail: `resource-budget;metric=valueChanges;current=${DOCUMENT_RESOURCE_BUDGET.valueChangeCount + 1};limit=${DOCUMENT_RESOURCE_BUDGET.valueChangeCount}`,
    }));
  });
});
