import { describe, expect, it } from "vitest";
import { isActiveProjectionContextFresh } from "../../apps/editor/src/runtime/active-projection-context.js";
import { EditorSessionController } from "../../apps/editor/src/runtime/editor-session-controller.js";
import { scenarioModelFromV2 } from "../../packages/schema/src/index.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("active projection work freshness", () => {
  const context = { documentEpoch: 7, projectionGeneration: 2, revision: 3 };
  it("accepts only the exact document, projection generation and revision", () => {
    expect(isActiveProjectionContextFresh(context, { ...context })).toBe(true);
    for (const key of ["documentEpoch", "projectionGeneration", "revision"] as const) {
      expect(isActiveProjectionContextFresh(context, { ...context, [key]: context[key] + 1 })).toBe(false);
    }
  });

  it("rejects delayed A work in B and after returning to A with unchanged revision and shared IDs", async () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const source = initial.scenarios[0]!;
    const alternate = { ...source, id: "scenario_alt" as typeof source.id, name: "Alternate" };
    const controller = new EditorSessionController(canonicalFixture());
    controller.replaceScenarioModel({ ...initial, scenarios: [source, alternate] });
    const current = () => ({ documentEpoch: 7, projectionGeneration: controller.projectionGeneration(), revision: controller.snapshot().revision });
    const captured = current();
    const targetId = controller.snapshot().document.signals[0]!.id;
    let resolveRead!: () => void;
    const delayedRead = new Promise<void>((resolve) => { resolveRead = resolve; });
    let commits = 0;
    const completion = delayedRead.then(() => {
      if (isActiveProjectionContextFresh(captured, current())) commits += 1;
    });
    controller.switchScenario(alternate.id);
    expect(controller.snapshot().document.signals[0]!.id).toBe(targetId);
    expect(current().revision).toBe(captured.revision);
    expect(isActiveProjectionContextFresh(captured, current())).toBe(false);
    controller.switchScenario(source.id);
    expect(isActiveProjectionContextFresh(captured, current())).toBe(false);
    resolveRead();
    await completion;
    expect(commits).toBe(0);
    expect(controller.current().historyState()).toMatchObject({ dirty: false, undoDepth: 0 });
  });
});
