import { describe, expect, it } from "vitest";
import { DOCUMENT_RESOURCE_BUDGET, validateDocumentResourceBudget } from "../../packages/schema/src/resource-budget.js";
import { duplicateScenario, scenarioModelFromV2, validateScenarioDocumentModel } from "../../packages/schema/src/scenario-model.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("persistent nested resource budgets", () => {
  it.each([
    ["transactionLinkedSignals", "$.transactions[*].linkedSignals", DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount, (base: ReturnType<typeof canonicalFixture>, count: number) => ({ ...base, transactions: [{ ...base.transactions[0]!, linkedSignals: new Array(count) }] })],
    ["transactionPhases", "$.transactions[*].phases", DOCUMENT_RESOURCE_BUDGET.transactionPhaseCount, (base: ReturnType<typeof canonicalFixture>, count: number) => ({ ...base, transactions: [{ ...base.transactions[0]!, phases: new Array(count) }] })],
    ["clockSuppressedPeriods", "$.signals[*].generator.suppressedPeriods", DOCUMENT_RESOURCE_BUDGET.clockSuppressedPeriodCount, (base: ReturnType<typeof canonicalFixture>, count: number) => ({ ...base, signals: base.signals.map((signal) => signal.type === "clock" ? { ...signal, generator: { ...signal.generator, suppressedPeriods: new Array(count) } } : signal) })],
  ])("counts %s at its exact boundary and rejects the next item", (metric, path, limit, build) => {
    const base = canonicalFixture();
    expect(validateDocumentResourceBudget(build(base, limit)).some((problem) => problem.path === path)).toBe(false);
    expect(validateDocumentResourceBudget(build(base, limit + 1))).toContainEqual(expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path,
      value: limit + 1,
      detail: `resource-budget;metric=${metric};current=${limit + 1};limit=${limit}`,
    }));
  });

  it("bounds Scenario count before performing per-Scenario projections", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const scenario = model.scenarios[0]!;
    const overLimit = { ...model, scenarios: new Array(DOCUMENT_RESOURCE_BUDGET.scenarioCount + 1).fill(scenario) };
    expect(validateScenarioDocumentModel(overLimit)).toEqual([expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.scenarios",
      value: DOCUMENT_RESOURCE_BUDGET.scenarioCount + 1,
      detail: `resource-budget;metric=scenario.scenarios;current=${DOCUMENT_RESOURCE_BUDGET.scenarioCount + 1};limit=${DOCUMENT_RESOURCE_BUDGET.scenarioCount}`,
    })]);
  });

  it("rejects Scenario Duplicate at the projection-count limit without changing the source model", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const sourceId = initial.scenarios[0]!.id;
    let atLimit = initial;
    for (let index = 1; index < DOCUMENT_RESOURCE_BUDGET.scenarioCount; index += 1) {
      atLimit = duplicateScenario(atLimit, sourceId, `Scenario ${index + 1}`);
    }
    expect(atLimit.scenarios).toHaveLength(DOCUMENT_RESOURCE_BUDGET.scenarioCount);
    expect(() => duplicateScenario(atLimit, sourceId, "Over limit")).toThrow(/Scenario duplication produced an invalid model/);
    expect(atLimit.scenarios).toHaveLength(DOCUMENT_RESOURCE_BUDGET.scenarioCount);
  });

  it("aggregates nested Scenario relationships across all scenarios", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const scenario = model.scenarios[0]!;
    const linkedSignals = new Array(DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1).fill("sig_data");
    const overLimit = { ...model, scenarios: [{ ...scenario, transactions: [{ id: "transaction_nested_budget" as never, name: "Nested", start: 0, end: 1, linkedSignals }] }] };
    expect(validateScenarioDocumentModel(overLimit)).toContainEqual(expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.scenarios[*].transactions[*].linkedSignals",
      value: DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1,
      detail: `resource-budget;metric=scenario.transactions[*].linkedSignals;current=${DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1};limit=${DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount}`,
    }));
  });
});
