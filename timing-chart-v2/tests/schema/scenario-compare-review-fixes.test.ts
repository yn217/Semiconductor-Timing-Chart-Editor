import { describe, expect, it } from "vitest";
import { compareScenarioSignalStreams } from "../../packages/schema/src/scenario-comparison.js";
import { createScenariosFromHandshakeSuggestions, duplicateScenario, listHandshakeMissingCaseSuggestions, renameScenario, scenarioModelFromV2, validateScenarioDocumentModel } from "../../packages/schema/src/scenario-model.js";
import { canonicalFixture } from "../fixtures/canonical.js";

function clockDocument() {
  const base = canonicalFixture();
  const clock = base.signals[0]!;
  if (clock.type !== "clock") throw new Error("fixture CLK must be a clock");
  const v2 = {
    ...base,
    timeline: { ...base.timeline, end: 12, cycleCount: 12 },
    bookmarks: [{ id: "bm_edge" as never, name: "Start", start: 2 }],
    signals: [{
      ...clock,
      enable: [{ id: "enable_a", start: 0, value: 1 }, { id: "enable_b", start: 8, value: 0 }],
      edgeCounter: { ...clock.edgeCounter, show: true, countFrom: "marker" as const, anchorId: "bm_edge" },
    } as never, ...base.signals.slice(1)],
  };
  return { model: scenarioModelFromV2(v2 as typeof base), clockId: clock.id };
}

function handshakeDocument() {
  const source = canonicalFixture();
  const template = source.signals[1]!;
  if (template.type !== "bus") throw new Error("fixture DATA must be a bus");
  const { width: _width, displayFormat: _displayFormat, ...binaryTemplate } = template;
  const request = { ...binaryTemplate, id: "sig_req" as typeof template.id, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] };
  const acknowledge = { ...binaryTemplate, id: "sig_ack" as typeof template.id, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }] };
  const data = { ...template, id: "sig_data" as typeof template.id, name: "DATA", values: [{ start: 0, value: "05" as never }, { start: 3, value: "07" as never }, { start: 6, value: "09" as never }] };
  const handshake = { id: "constraint_handshake" as never, type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, stableSignalIds: [data.id], requestPolarity: "active-low", acknowledgePolarity: "active-low" } };
  const v2 = { ...source, timeline: { ...source.timeline, end: 12, cycleCount: 12 }, signals: [source.signals[0]!, request, acknowledge, data], signalGroups: [{ ...source.signalGroups[0]!, rows: [source.signals[0]!.id, request.id, acknowledge.id, data.id] }], constraints: [handshake] };
  return scenarioModelFromV2(v2 as typeof source);
}

describe("Scenario compare and duplicate review fixes", () => {
  it("reports no clock difference for an unedited duplicate whose enable and anchor IDs were remapped", () => {
    const { model, clockId } = clockDocument();
    const duplicated = duplicateScenario(model, model.scenarios[0]!.id);
    const [left, right] = duplicated.scenarios;
    expect(left!.signalStates[clockId]).toMatchObject({ kind: "clock", enable: [{ id: "enable_a" }, { id: "enable_b" }] });
    expect(right!.signalStates[clockId]).toMatchObject({ kind: "clock", edgeCounter: { anchorId: expect.not.stringMatching("^bm_edge$") } });
    expect(compareScenarioSignalStreams(duplicated, left!.id, right!.id)).toEqual([]);
  });

  it("narrows a clock difference to the cycles where enable values actually differ", () => {
    const { model, clockId } = clockDocument();
    const duplicated = duplicateScenario(model, model.scenarios[0]!.id);
    const [left, right] = duplicated.scenarios;
    const edited = { ...duplicated, scenarios: duplicated.scenarios.map((scenario) => scenario.id !== right!.id ? scenario : {
      ...scenario,
      signalStates: { ...scenario.signalStates, [clockId]: { ...scenario.signalStates[clockId]!, enable: [{ id: "enable_c", start: 0, value: 1 }, { id: "enable_d", start: 8, value: 1 }] } },
    }) } as typeof duplicated;
    const differences = compareScenarioSignalStreams(edited, left!.id, right!.id);
    const clockDifference = differences.find((item) => item.signalId === clockId);
    expect(clockDifference?.ranges).toEqual([{ start: 8, end: left!.timeline.end }]);
  });

  it("restores the original value at the end of a generated stalled-data span", () => {
    const model = handshakeDocument();
    const source = model.scenarios[0]!;
    const key = listHandshakeMissingCaseSuggestions(model, source.id).find((item) => item.kind === "stable-data-while-stalled")!.key;
    const result = createScenariosFromHandshakeSuggestions(model, source.id, [key]);
    const generated = result.document.scenarios.find((scenario) => scenario.id === result.createdScenarioIds[0])!;
    expect(generated.signalStates.sig_data).toMatchObject({ kind: "values", values: [{ start: 0, value: "05" }, { start: 5, value: "07" }, { start: 6, value: "09" }] });
    expect(validateScenarioDocumentModel(result.document)).toEqual([]);
  });

  it("restores the original request level at the end of a generated request span", () => {
    const model = handshakeDocument();
    const source = model.scenarios[0]!;
    // The original REQ is asserted (0) for the whole timeline; the Backpressure case returns REQ to idle (1) at cycle 4 and ends its span at cycle 5.
    const originalRequest = source.signalStates.sig_req as { kind: "values"; values: unknown[] };
    const asserted = { ...source, signalStates: { ...source.signalStates, sig_req: { ...originalRequest, values: [{ start: 0, value: 0 }] } } };
    const assertedModel = { ...model, scenarios: model.scenarios.map((scenario) => scenario.id === source.id ? asserted : scenario) };
    const key = listHandshakeMissingCaseSuggestions(assertedModel, source.id).find((item) => item.kind === "backpressure")!.key;
    const result = createScenariosFromHandshakeSuggestions(assertedModel, source.id, [key]);
    const generated = result.document.scenarios.find((scenario) => scenario.id === result.createdScenarioIds[0])!;
    const request = generated.signalStates.sig_req as { kind: "values"; values: { start: number; value: unknown; id?: string }[] };
    expect(request.values.filter((change) => change.start <= 5).at(-1)).toEqual({ start: 5, value: 0, id: expect.any(String) });
    expect(validateScenarioDocumentModel(result.document)).toEqual([]);
  });

  it("rejects renaming a Scenario to the name of another Scenario but allows keeping its own name", () => {
    const model = handshakeDocument();
    const duplicated = duplicateScenario(model, model.scenarios[0]!.id, "Second");
    const [first, second] = duplicated.scenarios;
    expect(() => renameScenario(duplicated, second!.id, first!.name)).toThrow(/already used/);
    expect(() => renameScenario(duplicated, second!.id, " Second ")).not.toThrow();
    expect(renameScenario(duplicated, second!.id, second!.name)).toBe(duplicated);
  });

  it("still accepts an existing document that already contains duplicate Scenario names", () => {
    const model = handshakeDocument();
    const duplicated = duplicateScenario(model, model.scenarios[0]!.id, model.scenarios[0]!.name);
    expect(validateScenarioDocumentModel(duplicated)).toEqual([]);
  });
});
