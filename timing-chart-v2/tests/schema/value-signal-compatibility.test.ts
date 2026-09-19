import { describe, expect, it } from "vitest";
import { planCommand } from "@timing-chart-v2/commands";
import { normalizeDocument, quickValueLiteral, quickValueOptions, valueSignalValueProblem, valuesCompatibleForType, type ValueSignal } from "@timing-chart-v2/schema";
import { toWaveJson } from "@timing-chart-v2/wavedrom-adapter";
import { canonicalFixture } from "../fixtures/canonical.js";

const signal = (type: ValueSignal["type"], value: string | number): ValueSignal => ({
  id: `sig_${type}` as ValueSignal["id"], name: type.toUpperCase(), type, role: "internal",
  source: { instancePath: [], signalName: type.toUpperCase() }, display: { name: type.toUpperCase() }, values: [{ start: 0, value }],
});

describe("ValueSignal render compatibility policy", () => {
  it("covers every Quick Value option with the same policy used by the adapter", () => {
    for (const type of ["binary", "logic", "event", "pulse", "bus", "state"] as const) {
      const values = quickValueOptions(type).map((option) => ({ start: 0, value: quickValueLiteral(type, option) }));
      expect(valuesCompatibleForType(type, values), type).toBeUndefined();
      for (const change of values) expect(() => toWaveJson({ signal: signal(type, change.value), cycleCount: 4 }), `${type}:${String(change.value)}`).not.toThrow();
    }
  });

  it("keeps Binary conservative while allowing weak-drive Logic", () => {
    expect(valueSignalValueProblem("binary", "D")).toContain("not supported");
    expect(valueSignalValueProblem("logic", "D")).toBeUndefined();
    expect(() => toWaveJson({ signal: signal("binary", "D"), cycleCount: 4 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_LOGIC_VALUE" }));
    expect(toWaveJson({ signal: signal("logic", "D"), cycleCount: 4 })).toEqual({ wave: "d..." });
  });

  it("rejects unsupported event markers before document normalization and adapter conversion", () => {
    expect(valueSignalValueProblem("event", "EDGE")).toContain("supported values are none, rise, fall");
    expect(() => toWaveJson({ signal: signal("event", "EDGE"), cycleCount: 4 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_EVENT_VALUE" }));

    const source = canonicalFixture();
    const event = signal("event", "EDGE");
    const document = { ...source, signals: [...source.signals, event], signalGroups: source.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, event.id] } : group) };
    const parsed = normalizeDocument(document);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_SIGNAL_VALUE" })]));
  });

  it("rejects incompatible type conversion without changing identity or values", () => {
    const source = canonicalFixture();
    const current = signal("state", "IDLE");
    const document = { ...source, signals: [...source.signals, current], signalGroups: source.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, current.id] } : group) };
    expect(current?.type).toBe("state");
    const result = planCommand(document, { id: "cmd_state_to_binary" as never, type: "signal.updateProperties", signalId: current.id, name: current.name, role: current.role, signalType: "binary" });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    if (!result.ok) expect(result.problems.some((problem) => problem.code === "UNSUPPORTED_SIGNAL_VALUE")).toBe(true);
  });

  it("allows a lossless logic-to-binary conversion", () => {
    const source = canonicalFixture();
    const logic = { ...source.signals[1]!, type: "logic" as const, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] } as ValueSignal;
    const document = { ...source, signals: [source.signals[0]!, logic] };
    const result = planCommand(document, { id: "cmd_logic_to_binary" as never, type: "signal.updateProperties", signalId: logic.id, name: logic.name, role: logic.role, signalType: "binary" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.signals[1]).toMatchObject({ id: logic.id, type: "binary", values: logic.values });
  });
});
