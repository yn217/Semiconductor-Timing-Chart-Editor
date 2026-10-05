import { describe, expect, it } from "vitest";
import { scenarioModelFromV2, projectScenarioAsV2, updateScenarioModelFromV2Projection, validateScenarioDocumentModel, renameScenario, deleteScenario, duplicateScenario, listHandshakeMissingCaseSuggestions, createScenariosFromHandshakeSuggestions } from "../../packages/schema/src/scenario-model.js";
import { compareScenarioSignalStreams } from "../../packages/schema/src/scenario-comparison.js";
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

  it("reconciles one v2 command projection without overwriting another scenario's value stream", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const first = initial.scenarios[0]!;
    const second = {
      ...first,
      id: "scenario_alt" as typeof first.id,
      name: "Alternate",
      signalStates: {
        ...first.signalStates,
        sig_data: { kind: "values" as const, values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] },
      },
    };
    const model = { ...initial, scenarios: [first, second] };
    const base = projectScenarioAsV2(model, first.id);
    const projection = {
      ...base,
      timeline: { ...base.timeline, physicalTimebase: { referenceFrequencyHz: 100_000_000, unit: "ns" as const } },
      signals: base.signals.map((signal) => signal.id === "sig_data"
        ? { ...signal, name: "RENAMED", values: [{ start: 0, value: "00" }, { start: 6, value: "B6" }] }
        : signal),
    };

    const next = updateScenarioModelFromV2Projection(model, first.id, projection);
    expect(next.signalDefinitions.find((signal) => signal.id === "sig_data")?.name).toBe("RENAMED");
    expect(next.scenarios[0]?.signalStates.sig_data).toMatchObject({ kind: "values", values: [{ start: 0, value: "00" }, { start: 6, value: "B6" }] });
    expect(next.scenarios[1]?.signalStates.sig_data).toMatchObject({ kind: "values", values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] });
    expect(projectScenarioAsV2(next, second.id).signals.find((signal) => signal.id === "sig_data")?.name).toBe("RENAMED");
    expect(next.physicalTimebase).toEqual({ referenceFrequencyHz: 100_000_000, unit: "ns" });
    expect(validateScenarioDocumentModel(next)).toEqual([]);
  });

  it("renames and deletes Scenarios by stable ID while preserving the final Scenario", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const first = initial.scenarios[0]!;
    const second = { ...first, id: "scenario_alt" as typeof first.id, name: "Alternate" };
    const model = { ...initial, scenarios: [first, second] };

    const renamed = renameScenario(model, second.id, "Stress");
    expect(renamed.scenarios.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: first.id, name: first.name },
      { id: second.id, name: "Stress" },
    ]);
    expect(renamed.scenarios[1]).toEqual({ ...second, name: "Stress" });
    expect(deleteScenario(renamed, first.id).scenarios).toEqual([{ ...second, name: "Stress" }]);
    expect(() => renameScenario(model, second.id, "  ")).toThrow("non-empty");
    expect(() => deleteScenario(initial, first.id)).toThrow("final Scenario");
    expect(validateScenarioDocumentModel(deleteScenario(renamed, first.id))).toEqual([]);
  });

  it("duplicates Scenario-owned identities and rewrites only their internal references", () => {
    const base = scenarioModelFromV2(canonicalFixture());
    const source = {
      ...base.scenarios[0]!,
      timeline: { ...base.scenarios[0]!.timeline, labelAnchors: [{ id: "anchor_resume" as never, source: 8, display: 2, ownerTimeGroupId: "time_group_parent" as never }] },
      bookmarks: [{ id: "bookmark_one" as never, name: "One", start: 2 }],
      timeGroups: [
        { id: "time_group_parent" as never, name: "Parent", start: 2, end: 8, presentation: { collapsed: true, foldStyle: "axis-break" as const, resumeLabelAnchorId: "anchor_resume" as never } },
        { id: "time_group_child" as never, parentId: "time_group_parent" as never, name: "Child", start: 3, end: 5 },
      ],
      annotations: [{ id: "annotation_one" as never, type: "measurement" as const, label: "M", visible: true, sourceSignalId: "sig_data" as never, start: { signalId: "sig_data" as never, cycle: 3, point: "transition-start" as const }, end: { signalId: "sig_data" as never, cycle: 5, point: "transition-end" as const } }],
      annotationGroups: [{ id: "annotation_group_one" as never, name: "Measurements", annotationIds: ["annotation_one" as never] }],
      transactionGroups: [{ id: "transaction_group_one" as never, name: "Bus", order: 0 }],
      transactions: [{ id: "transaction_one" as never, name: "Read", start: 2, end: 5, groupId: "transaction_group_one" as never, linkedSignals: ["sig_data" as never] }],
      constraints: [{ id: "constraint_one" as never, type: "latency", data: { signalId: "sig_data" } }],
    };
    const model = { ...base, scenarios: [source] };
    const duplicated = duplicateScenario(model, source.id, "Stress");
    const copy = duplicated.scenarios[1]!;

    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe("Stress");
    expect(copy.bookmarks[0]?.id).not.toBe(source.bookmarks[0]?.id);
    expect(copy.timeGroups[1]?.parentId).toBe(copy.timeGroups[0]?.id);
    expect(copy.timeline.labelAnchors[0]?.ownerTimeGroupId).toBe(copy.timeGroups[0]?.id);
    expect(copy.timeGroups[0]?.presentation?.resumeLabelAnchorId).toBe(copy.timeline.labelAnchors[0]?.id);
    expect(copy.annotationGroups[0]?.annotationIds[0]).toBe(copy.annotations[0]?.id);
    expect(copy.transactions[0]?.groupId).toBe(copy.transactionGroups?.[0]?.id);
    expect(copy.transactions[0]?.linkedSignals).toEqual(["sig_data"]);
    expect(copy.annotations[0]?.sourceSignalId).toBe("sig_data");
    expect(copy.constraints[0]?.data).toEqual({ signalId: "sig_data" });
    expect(validateScenarioDocumentModel(duplicated)).toEqual([]);
  });

  it("reports changed source-cycle ranges by shared Signal ID without scanning cycle extent", () => {
    const base = scenarioModelFromV2(canonicalFixture());
    const first = base.scenarios[0]!;
    const second = {
      ...first,
      id: "scenario_compare" as typeof first.id,
      name: "Compare",
      signalStates: { ...first.signalStates, sig_data: { kind: "values" as const, values: [{ start: 0, value: "00" }, { start: 2, value: "11" }, { start: 6, value: "A5" }] } },
    };
    const model = { ...base, scenarios: [first, second] };
    expect(compareScenarioSignalStreams(model, first.id, second.id)).toEqual([{ signalId: "sig_data", ranges: [{ start: 2, end: 6 }] }]);
    expect(compareScenarioSignalStreams(model, first.id, first.id)).toEqual([]);
  });

  it("generates only explicitly selected Handshake cases from constraint-owned stable IDs", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    if (template.type !== "bus") throw new Error("fixture DATA must be a bus");
    const { width: _width, displayFormat: _displayFormat, ...binaryTemplate } = template;
    const request = { ...binaryTemplate, id: "sig_req" as typeof template.id, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] };
    const acknowledge = { ...binaryTemplate, id: "sig_ack" as typeof template.id, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    const payload = { ...template, id: "sig_payload" as typeof template.id, name: "PAYLOAD", values: [{ start: 0, value: "00" }, { start: 5, value: "01" }] };
    const handshake = { id: "constraint_handshake" as never, type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, requestPolarity: "active-low", acknowledgePolarity: "active-low", stableSignalIds: [payload.id] } };
    const v2 = { ...source, timeline: { ...source.timeline, end: 12, cycleCount: 12 }, signals: [source.signals[0]!, request, acknowledge, payload], signalGroups: [{ ...source.signalGroups[0]!, rows: [source.signals[0]!.id, request.id, acknowledge.id, payload.id] }], constraints: [handshake] };
    const model = scenarioModelFromV2(v2);
    const sourceScenario = model.scenarios[0]!;
    const suggestions = listHandshakeMissingCaseSuggestions(model, sourceScenario.id);
    expect(suggestions.map((item) => item.kind)).toEqual(["ack-before-request", "request-before-ack", "same-cycle", "backpressure", "consecutive-transfer", "stable-data-while-stalled"]);

    const selected = suggestions.find((item) => item.kind === "same-cycle")!;
    const result = createScenariosFromHandshakeSuggestions(model, sourceScenario.id, [selected.key]);
    expect(model.scenarios).toHaveLength(1);
    expect(result.document.scenarios).toHaveLength(2);
    expect(result.createdScenarioIds).toHaveLength(1);
    expect(result.document.scenarios[1]?.constraints[0]?.id).not.toBe(sourceScenario.constraints[0]?.id);
    const generated = result.document.scenarios[1]!;
    const reqValues = generated.signalStates[request.id]!;
    const ackValues = generated.signalStates[acknowledge.id]!;
    expect(reqValues).toMatchObject({ kind: "values", values: expect.arrayContaining([{ start: 0, value: 0 }, { start: 1, value: 1 }]) });
    expect(ackValues).toMatchObject({ kind: "values", values: expect.arrayContaining([{ start: 0, value: 0 }, { start: 1, value: 1 }]) });
    expect(validateScenarioDocumentModel(result.document)).toEqual([]);
    expect(() => createScenariosFromHandshakeSuggestions(model, sourceScenario.id, ["unknown"])).toThrow("Unknown or unsupported");

    const logicRequest = { ...request, type: "logic" as const };
    const reset = { ...binaryTemplate, id: "sig_reset" as typeof template.id, name: "RESET", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    const extendedHandshake = { ...handshake, data: { ...handshake.data, resetSignalId: reset.id, resetPolarity: "active-low" } };
    const extendedV2 = { ...v2, signals: [source.signals[0]!, logicRequest, acknowledge, payload, reset], signalGroups: [{ ...source.signalGroups[0]!, rows: [source.signals[0]!.id, logicRequest.id, acknowledge.id, payload.id, reset.id] }], constraints: [extendedHandshake] };
    const extendedModel = scenarioModelFromV2(extendedV2);
    const extendedScenario = extendedModel.scenarios[0]!;
    const extendedSuggestions = listHandshakeMissingCaseSuggestions(extendedModel, extendedScenario.id);
    expect(extendedSuggestions.map((item) => item.kind)).toContain("reset-during-transaction");
    expect(extendedSuggestions.map((item) => item.kind)).toContain("x-propagation");
    const extendedGenerated = createScenariosFromHandshakeSuggestions(extendedModel, extendedScenario.id, ["handshake:constraint_handshake:x-propagation", "handshake:constraint_handshake:reset-during-transaction"]);
    const xScenario = extendedGenerated.document.scenarios[1]!;
    const resetScenario = extendedGenerated.document.scenarios[2]!;
    expect(xScenario.signalStates[logicRequest.id]).toMatchObject({ kind: "values", values: expect.arrayContaining([{ start: 1, value: "X" }]) });
    expect(resetScenario.signalStates[reset.id]).toMatchObject({ kind: "values", values: expect.arrayContaining([{ start: 2, value: 0 }, { start: 3, value: 1 }]) });
    expect(validateScenarioDocumentModel(extendedGenerated.document)).toEqual([]);
  });
});
