import { describe, expect, it } from "vitest";
import { ScenarioCommandHistorySession } from "../../packages/history/src/scenario-session.js";
import { createScenariosFromHandshakeSuggestions, projectScenarioAsV2, scenarioModelFromV2 } from "../../packages/schema/src/scenario-model.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("ScenarioCommandHistorySession", () => {
  it("switches projections without dirtying and undoes edits globally across Scenarios", () => {
    const base = scenarioModelFromV2(canonicalFixture());
    const first = base.scenarios[0]!;
    const second = {
      ...first,
      id: "scenario_alt" as typeof first.id,
      name: "Alternate",
      signalStates: {
        ...first.signalStates,
        sig_data: { kind: "values" as const, values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] },
      },
    };
    const inputModel = { ...base, scenarios: [first, second] };
    const session = new ScenarioCommandHistorySession(inputModel);
    expect(Object.isFrozen(inputModel)).toBe(false);
    expect(Object.isFrozen(session.scenarioModel())).toBe(true);
    const initialRevision = session.getSnapshot().revision;

    session.switchScenario(second.id);
    expect(session.getSnapshot().revision).toBe(initialRevision);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] });

    const edit = session.execute({ id: "cmd_scenario_edit" as never, type: "signal.updateValue", signalId: "sig_data" as never, start: 2, value: "EE" });
    expect(edit.ok).toBe(true);
    expect(session.historyState()).toMatchObject({ undoDepth: 1, dirty: true });
    session.switchScenario(first.id);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 4, value: "A5" }] });

    expect(session.undo().ok).toBe(true);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
    session.switchScenario(second.id);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] });
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 2, value: "EE" }] });

    const rename = session.execute({ id: "cmd_scenario_shared_rename" as never, type: "signal.rename", signalId: "sig_data" as never, name: "SHARED_DATA" });
    expect(rename.ok).toBe(true);
    expect(projectScenarioAsV2(session.scenarioModel(), first.id).signals.find((signal) => signal.id === "sig_data")?.name).toBe("SHARED_DATA");
    expect(session.historyState()).toMatchObject({ undoDepth: 2, dirty: true });
    session.switchScenario(first.id);
    expect(session.undo().ok).toBe(true);
    session.switchScenario(second.id);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "sig_data")?.name).toBe("DATA");
    expect(session.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 1, dirty: true });
  });

  it("records Scenario rename, duplicate, and delete as global Undo/Redo operations", () => {
    const model = scenarioModelFromV2({ ...canonicalFixture(), transactions: [{ id: "tx_phase_history" as never, name: "Transfer", start: 0, end: 8, phases: [{ id: "phase_history" as never, name: "Data", start: 0, end: 8 }] }] });
    const original = model.scenarios[0]!;
    const session = new ScenarioCommandHistorySession(model);

    session.renameScenario(original.id, "Baseline");
    expect(session.scenarioModel().scenarios[0]?.name).toBe("Baseline");
    expect(session.historyState()).toMatchObject({ undoDepth: 1, dirty: true });
    expect(session.undo().ok).toBe(true);
    expect(session.scenarioModel().scenarios[0]?.name).toBe(original.name);
    expect(session.redo().ok).toBe(true);
    expect(session.scenarioModel().scenarios[0]?.name).toBe("Baseline");

    const duplicateId = session.duplicateScenario(original.id);
    const duplicatedModel = session.scenarioModel();
    const copiedPhaseId = duplicatedModel.scenarios[1]!.transactions[0]!.phases![0]!.id;
    expect(copiedPhaseId).not.toBe("phase_history");
    expect(session.activeScenarioId()).toBe(duplicateId);
    expect(session.scenarioModel().scenarios).toHaveLength(2);
    expect(session.undo().ok).toBe(true);
    expect(session.scenarioModel().scenarios).toHaveLength(1);
    expect(session.activeScenarioId()).toBe(original.id);
    expect(session.redo().ok).toBe(true);
    expect(session.activeScenarioId()).toBe(duplicateId);
    expect(session.scenarioModel()).toEqual(duplicatedModel);
    expect(session.getSnapshot().document.transactions[0]!.phases![0]!.id).toBe(copiedPhaseId);
    const historyBeforeSwitch = session.historyState();
    session.switchScenario(original.id);
    expect(session.getSnapshot().document.transactions[0]!.phases![0]!.id).toBe("phase_history");
    session.switchScenario(duplicateId);
    expect(session.getSnapshot().document.transactions[0]!.phases![0]!.id).toBe(copiedPhaseId);
    expect(session.historyState()).toEqual(historyBeforeSwitch);

    session.deleteScenario(duplicateId);
    expect(session.scenarioModel().scenarios).toHaveLength(1);
    expect(session.activeScenarioId()).toBe(original.id);
    expect(session.undo().ok).toBe(true);
    expect(session.scenarioModel().scenarios).toHaveLength(2);
    expect(session.activeScenarioId()).toBe(duplicateId);
  });

  it("records a selected Handshake generation batch as one Undo/Redo unit", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    if (template.type !== "bus") throw new Error("fixture DATA must be a bus");
    const { width: _width, displayFormat: _displayFormat, ...binaryTemplate } = template;
    const request = { ...binaryTemplate, id: "sig_req" as typeof template.id, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    const acknowledge = { ...binaryTemplate, id: "sig_ack" as typeof template.id, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    const v2 = { ...source, timeline: { ...source.timeline, end: 12, cycleCount: 12 }, signals: [source.signals[0]!, request, acknowledge], signalGroups: [{ ...source.signalGroups[0]!, rows: [source.signals[0]!.id, request.id, acknowledge.id] }], constraints: [{ id: "constraint_handshake" as never, type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id } }] };
    const model = scenarioModelFromV2({ ...v2, transactions: [{
      id: "tx_generated_history" as never, name: "Transfer", start: 0, end: 8,
      phases: [{ id: "phase_generated_history" as never, name: "Data", start: 0, end: 8 }],
    }] });
    const active = model.scenarios[0]!;
    const generated = createScenariosFromHandshakeSuggestions(model, active.id, ["handshake:constraint_handshake:same-cycle", "handshake:constraint_handshake:backpressure"]);
    const session = new ScenarioCommandHistorySession(model);
    session.addGeneratedScenarios(generated.document, generated.createdScenarioIds);
    expect(session.scenarioModel().scenarios).toHaveLength(3);
    const phaseIds = session.scenarioModel().scenarios.map((scenario) => scenario.transactions[0]!.phases![0]!.id);
    expect(phaseIds[0]).toBe("phase_generated_history");
    expect(new Set(phaseIds).size).toBe(3);
    for (const scenario of session.scenarioModel().scenarios) {
      expect(Object.keys(scenario.signalStates)).toEqual(Object.keys(active.signalStates));
      expect(scenario.transactions[0]!.phases![0]).toMatchObject({ name: "Data", start: 0, end: 8 });
    }
    expect(session.activeScenarioId()).toBe(generated.createdScenarioIds[1]);
    expect(session.historyState()).toMatchObject({ undoDepth: 1, redoDepth: 0, dirty: true });

    expect(session.undo().ok).toBe(true);
    expect(session.scenarioModel()).toEqual(model);
    expect(session.activeScenarioId()).toBe(active.id);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, redoDepth: 1, dirty: false });
    expect(session.redo().ok).toBe(true);
    expect(session.scenarioModel()).toEqual(generated.document);
    expect(session.activeScenarioId()).toBe(generated.createdScenarioIds[1]);
    expect(session.scenarioModel().scenarios.map((scenario) => scenario.transactions[0]!.phases![0]!.id)).toEqual(phaseIds);
  });
});
