import { describe, expect, it } from "vitest";
import { scenarioModelFromV2, projectScenarioAsV2 } from "../../packages/schema/src/scenario-model.js";
import { validateCanonicalDocument } from "../../packages/schema/src/validation.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Scenario canonical model adapter", () => {
  it("moves v2 timing ownership into one Scenario and projects the exact v2 semantics back", () => {
    const source = canonicalFixture();
    const model = scenarioModelFromV2(source);
    const scenario = model.scenarios[0]!;

    expect(model.formatVersion).toBe(3);
    expect(model.scenarios).toHaveLength(1);
    expect(scenario.name).toBe("Scenario 1");
    expect(model.signalDefinitions).toHaveLength(source.signals.length);
    expect(model.signalDefinitions.find((signal) => signal.id === "sig_data")).not.toHaveProperty("values");
    expect(scenario.signalStates.sig_data).toMatchObject({ kind: "values", values: source.signals[1]!.type === "bus" ? source.signals[1]!.values : [] });
    expect(scenario).toHaveProperty("transactions", source.transactions);
    expect(model).not.toHaveProperty("transactions");
    expect(model).not.toHaveProperty("timeline");

    const projected = projectScenarioAsV2(model, scenario.id);
    expect(projected).toEqual(source);
    expect(validateCanonicalDocument(projected)).toEqual([]);
  });

  it("keeps Document physical timebase and optional semantic collections lossless", () => {
    const source = canonicalFixture();
    const document = {
      ...source,
      timeline: { ...source.timeline, physicalTimebase: { referenceFrequencyHz: 125_000_000, unit: "ns" as const } },
      enumDefinitions: [{ id: "enum_state", name: "State", entries: [{ value: 0, label: "IDLE" }] }],
      transactionGroups: [{ id: "txg_main" as const, name: "Main", order: 0 }],
      transactionTimeScale: { clockCyclesPerTransactionCycle: 10, majorInterval: 2, minorInterval: 1 },
    };
    const migrated = scenarioModelFromV2(document);
    expect(migrated.physicalTimebase).toEqual(document.timeline.physicalTimebase);
    expect(projectScenarioAsV2(migrated, migrated.scenarios[0]!.id)).toEqual(document);
  });

  it("rejects a Scenario projection when a shared timing Signal has no Scenario state", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const scenario = model.scenarios[0]!;
    const malformed = {
      ...model,
      scenarios: [{ ...scenario, signalStates: { sig_clk: scenario.signalStates.sig_clk } }],
    };
    expect(() => projectScenarioAsV2(malformed, scenario.id)).toThrow("missing value state for 'sig_data'");
  });
});
