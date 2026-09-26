import { describe, expect, it } from "vitest";
import { resolveValueEditorPolicy } from "../../apps/editor/src/runtime/value-editor-policy.js";
import type { ValueSignal } from "@timing-chart-v2/schema";

describe("State value editor enum options", () => {
  it("offers canonical enum labels while keeping selected option values semantic", () => {
    const signal = {
      id: "state.mode", name: "MODE", role: "internal", type: "state",
      source: { instancePath: [], signalName: "MODE" }, display: { name: "MODE" },
      values: [{ start: 0, value: 0 }, { start: 4, value: "CUSTOM" }], enumId: "enum.mode",
    } as const satisfies ValueSignal;
    const definition = { id: "enum.mode", name: "Mode", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "RUN" }] } as const;
    const policy = resolveValueEditorPolicy(signal, definition);
    expect(policy.kind).toBe("combo");
    if (policy.kind === "combo") expect(policy.options).toEqual(expect.arrayContaining([
      { value: "0", label: "IDLE" }, { value: "1", label: "RUN" }, { value: "CUSTOM", label: "CUSTOM" },
    ]));
  });
});
