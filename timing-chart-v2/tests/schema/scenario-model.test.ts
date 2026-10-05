import { describe, expect, it } from "vitest";
import { scenarioModelFromV2, projectScenarioAsV2, validateScenarioDocumentModel } from "../../packages/schema/src/scenario-model.js";
import { validateCanonicalDocument } from "../../packages/schema/src/validation.js";
import { parseDocument, parseScenarioDocumentModel, serializeScenarioDocumentModel } from "../../packages/schema/src/serialization.js";
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

  it("validates every scenario against shared signal definitions and the canonical contract", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    expect(validateScenarioDocumentModel(model)).toEqual([]);

    const scenario = model.scenarios[0]!;
    const missing = { ...model, scenarios: [{ ...scenario, signalStates: { sig_clk: scenario.signalStates.sig_clk } }] };
    expect(validateScenarioDocumentModel(missing)).toContainEqual(expect.objectContaining({ code: "MISSING_SCENARIO_SIGNAL_STATE", path: "$.scenarios[0].signalStates.sig_data" }));

    const extra = { ...model, scenarios: [{ ...scenario, signalStates: { ...scenario.signalStates, orphan_signal: { kind: "values", values: [] } } }] };
    expect(validateScenarioDocumentModel(extra)).toContainEqual(expect.objectContaining({ code: "UNKNOWN_SCENARIO_SIGNAL_STATE", path: "$.scenarios[0].signalStates.orphan_signal" }));

    const duplicateTruth = { ...model, signalDefinitions: model.signalDefinitions.map((signal) => signal.id === "sig_data" ? { ...signal, values: [{ id: "duplicate_value", start: 0, value: 0 }] } : signal) };
    expect(validateScenarioDocumentModel(duplicateTruth)).toContainEqual(expect.objectContaining({ code: "SCENARIO_MODEL_UNKNOWN_FIELD", path: "$.signalDefinitions[1].values" }));
  });

  it("rejects duplicate scenario-owned stable IDs across scenarios", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const first = { ...model.scenarios[0]!, bookmarks: [{ id: "bookmark_shared", name: "Mark", start: 0 }] };
    const second = { ...first, id: "scenario_second" as typeof first.id, name: "Scenario 2" };
    const duplicateAcrossScenarios = { ...model, scenarios: [first, second] };
    expect(validateScenarioDocumentModel(duplicateAcrossScenarios)).toContainEqual(expect.objectContaining({ code: "DUPLICATE_ID", entityId: "bookmark_shared" }));
  });

  it("round-trips the opt-in v3 JSON boundary without changing the v2 parser contract", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const saved = serializeScenarioDocumentModel(model);
    expect(parseScenarioDocumentModel(saved)).toEqual({ ok: true, model, validated: true });
    expect(parseScenarioDocumentModel("{" )).toMatchObject({ ok: false, kind: "syntax" });
    expect(parseScenarioDocumentModel(JSON.stringify({ ...model, hiddenPayload: true }))).toMatchObject({ ok: false, kind: "validation", problems: [expect.objectContaining({ code: "SCENARIO_MODEL_UNKNOWN_FIELD" })] });
    expect(parseDocument(saved)).toMatchObject({ ok: false, kind: "unsupported-version", sourceFormatVersion: 3 });
  });
});
