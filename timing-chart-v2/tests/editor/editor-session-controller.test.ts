import { describe, expect, it } from "vitest";
import { EditorSessionController } from "../../apps/editor/src/runtime/editor-session-controller.js";
import { duplicateScenario, parseScenarioDocumentModel, scenarioModelFromV2 } from "../../packages/schema/src/index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("EditorSessionController Scenario storage", () => {
  it("invalidates every context transition including A -> B -> A without semantic mutations", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const source = initial.scenarios[0]!;
    const alternate = { ...source, id: "scenario_alt" as typeof source.id, name: "Alternate" };
    const controller = new EditorSessionController(canonicalFixture());
    controller.replaceScenarioModel({ ...initial, scenarios: [source, alternate] });
    const generation = controller.projectionGeneration();
    const revision = controller.snapshot().revision;
    const history = controller.current().historyState();
    const signalIds = controller.snapshot().document.signals.map((signal) => signal.id);

    controller.switchScenario(source.id);
    expect(controller.projectionGeneration()).toBe(generation);
    controller.switchScenario(alternate.id);
    expect(controller.projectionGeneration()).toBe(generation + 1);
    controller.switchScenario(source.id);
    expect(controller.projectionGeneration()).toBe(generation + 2);
    expect(controller.snapshot().revision).toBe(revision);
    expect(controller.current().historyState()).toEqual(history);
    expect(controller.snapshot().document.signals.map((signal) => signal.id)).toEqual(signalIds);
    expect(() => controller.switchScenario("missing" as typeof source.id)).toThrow();
    expect(controller.projectionGeneration()).toBe(generation + 2);
  });

  it("tracks duplicate, active delete and Scenario-aware Undo/Redo but not rename", () => {
    const controller = new EditorSessionController(canonicalFixture());
    const initial = scenarioModelFromV2(canonicalFixture());
    const source = initial.scenarios[0]!;
    controller.replaceScenarioModel(initial);
    const generation = controller.projectionGeneration();
    controller.renameScenario(source.id, "Renamed");
    expect(controller.projectionGeneration()).toBe(generation);
    const duplicateId = controller.duplicateScenario(source.id);
    expect(controller.projectionGeneration()).toBe(generation + 1);
    expect(controller.activeScenarioId()).toBe(duplicateId);
    expect(controller.undo().ok).toBe(true);
    expect(controller.activeScenarioId()).toBe(source.id);
    expect(controller.projectionGeneration()).toBe(generation + 2);
    expect(controller.redo().ok).toBe(true);
    expect(controller.projectionGeneration()).toBe(generation + 3);
    controller.deleteScenario(duplicateId);
    expect(controller.activeScenarioId()).toBe(source.id);
    expect(controller.projectionGeneration()).toBe(generation + 4);
    expect(controller.undo().ok).toBe(true);
    expect(controller.activeScenarioId()).toBe(duplicateId);
    expect(controller.projectionGeneration()).toBe(generation + 5);
  });

  it("tracks generated Scenario activation and document replacement", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const controller = new EditorSessionController(canonicalFixture());
    expect(controller.projectionGeneration()).toBe(0);
    controller.replaceScenarioModel(initial);
    const generated = duplicateScenario(initial, initial.scenarios[0]!.id, "Generated");
    const created = generated.scenarios.find((scenario) => scenario.id !== initial.scenarios[0]!.id)!;
    controller.addGeneratedScenarios(generated, [created.id]);
    expect(controller.projectionGeneration()).toBe(2);
    expect(controller.activeScenarioId()).toBe(created.id);
    controller.replace(canonicalFixture());
    expect(controller.projectionGeneration()).toBe(3);
    expect(controller.activeScenarioId()).toBeUndefined();
    expect(controller.undo().ok).toBe(false);
    expect(controller.projectionGeneration()).toBe(3);
  });

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
