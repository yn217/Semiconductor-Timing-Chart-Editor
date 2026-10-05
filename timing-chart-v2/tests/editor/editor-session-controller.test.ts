import { describe, expect, it } from "vitest";
import { EditorSessionController } from "../../apps/editor/src/runtime/editor-session-controller.js";
import { parseScenarioDocumentModel, scenarioModelFromV2 } from "../../packages/schema/src/index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("EditorSessionController Scenario storage", () => {
  it("switches the active projection and saves the complete v3 model", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const source = initial.scenarios[0]!;
    const alternate = {
      ...source,
      id: "scenario_alt" as typeof source.id,
      name: "Alternate",
      signalStates: { ...source.signalStates, sig_data: { kind: "values" as const, values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] } },
    };
    const controller = new EditorSessionController(canonicalFixture());
    controller.replaceScenarioModel({ ...initial, scenarios: [source, alternate] });
    const revision = controller.snapshot().revision;
    controller.switchScenario(alternate.id);

    expect(controller.snapshot().revision).toBe(revision);
    expect(controller.snapshot().document.signals.find((signal) => signal.id === "sig_data")).toMatchObject({ values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] });
    const saved = parseScenarioDocumentModel(controller.serializeCurrentDocument());
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.model.scenarios).toEqual([source, alternate]);
  });
});
