import { describe, expect, it } from "vitest";
import { ScenarioCommandHistorySession } from "../../packages/history/src/scenario-session.js";
import { projectScenarioAsV2, scenarioModelFromV2 } from "../../packages/schema/src/scenario-model.js";
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
});
