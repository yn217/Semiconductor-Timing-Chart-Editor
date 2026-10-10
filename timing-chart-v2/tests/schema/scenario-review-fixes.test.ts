import { describe, expect, it } from "vitest";
import { createScenariosFromHandshakeSuggestions, duplicateScenario, listHandshakeMissingCaseSuggestions, scenarioModelFromV2, validateScenarioDocumentModel } from "../../packages/schema/src/scenario-model.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Scenario review fixes", () => {
  it("remaps a Clock edge counter's marker anchor when a Scenario is duplicated", () => {
    const base = canonicalFixture();
    const clock = base.signals[0]!;
    if (clock.type !== "clock") throw new Error("fixture CLK must be a clock");
    const v2 = {
      ...base,
      bookmarks: [{ id: "bm_edge" as never, name: "Start", start: 2 }],
      signals: [{ ...clock, edgeCounter: { ...clock.edgeCounter, show: true, countFrom: "marker" as const, anchorId: "bm_edge" } }, ...base.signals.slice(1)],
    };
    const model = scenarioModelFromV2(v2);
    const source = model.scenarios[0]!;
    const duplicated = duplicateScenario(model, source.id);
    const copy = duplicated.scenarios[1]!;
    const copiedBookmark = copy.bookmarks[0]!;
    expect(copiedBookmark.id).not.toBe("bm_edge");
    const copiedClock = copy.signalStates[clock.id];
    expect(copiedClock).toMatchObject({ kind: "clock", edgeCounter: { anchorId: copiedBookmark.id, countFrom: "marker" } });
    expect(validateScenarioDocumentModel(duplicated)).toEqual([]);
  });

  it("names a generated Handshake Scenario with the suffix exactly once", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    if (template.type !== "bus") throw new Error("fixture DATA must be a bus");
    const { width: _width, displayFormat: _displayFormat, ...binaryTemplate } = template;
    const request = { ...binaryTemplate, id: "sig_req" as typeof template.id, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] };
    const acknowledge = { ...binaryTemplate, id: "sig_ack" as typeof template.id, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    const handshake = { id: "constraint_handshake" as never, type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, requestPolarity: "active-low", acknowledgePolarity: "active-low" } };
    const v2 = { ...source, timeline: { ...source.timeline, end: 12, cycleCount: 12 }, signals: [source.signals[0]!, request, acknowledge], signalGroups: [{ ...source.signalGroups[0]!, rows: [source.signals[0]!.id, request.id, acknowledge.id] }], constraints: [handshake] };
    const model = scenarioModelFromV2({ ...v2, transactions: [{ id: "tx_handshake" as never, name: "Transfer", start: 0, end: 8, phases: [{ id: "phase_handshake" as never, name: "Data", start: 0, end: 8 }] }] });
    const sourceScenario = model.scenarios[0]!;
    const selected = listHandshakeMissingCaseSuggestions(model, sourceScenario.id).find((item) => item.kind === "same-cycle")!;
    const result = createScenariosFromHandshakeSuggestions(model, sourceScenario.id, [selected.key]);
    const generated = result.document.scenarios[1]!;
    expect(generated.name).toBe(`${sourceScenario.name} · ${selected.title}`);
    expect(validateScenarioDocumentModel(result.document)).toEqual([]);
  });
});
