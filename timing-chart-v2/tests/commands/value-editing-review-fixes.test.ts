import { describe, expect, it } from "vitest";
import { planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { validateCanonicalDocument, type CanonicalDocument, type SignalId, type SignalValueChange } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// Review fixes for the value-editing commands: sized-literal overflow is
// rejected (not truncated), logic tokens compare by canonical token, and a
// non-integer change point is rejected by the planner itself.

const commandId = (id: string) => id as SemanticCommand["id"];

function withLogicSignal(values: SignalValueChange[]): CanonicalDocument {
  const document = canonicalFixture();
  document.signals = [...document.signals, {
    id: "sig_lg" as SignalId, name: "LG", type: "logic", role: "internal",
    source: { instancePath: [], signalName: "LG" }, display: { name: "LG" }, values,
  } as CanonicalDocument["signals"][number]];
  document.signalGroups = document.signalGroups.map((group) => ({ ...group, rows: [...group.rows, "sig_lg" as SignalId] }));
  return document;
}

function withState(values: SignalValueChange[]): CanonicalDocument {
  const document = canonicalFixture();
  document.signals = [...document.signals, {
    id: "sig_st" as SignalId, name: "ST", type: "state", role: "internal",
    source: { instancePath: [], signalName: "ST" }, display: { name: "ST" }, values,
  } as CanonicalDocument["signals"][number]];
  return document;
}

describe("logic tokens compare case-insensitively for no-op decisions", () => {
  const values = [{ start: 0, value: "x" }, { start: 3, value: "1" }];

  it("treats restating x as X at an existing change point as a no-op", () => {
    const plan = planCommand(withLogicSignal(values), { id: commandId("logic_case_update"), type: "signal.updateValue", signalId: "sig_lg" as SignalId, start: 0, value: "X" });
    expect(plan).toMatchObject({ ok: false, reason: "no-op" });
  });

  it("treats replacing x with X in place as a no-op", () => {
    const plan = planCommand(withLogicSignal(values), { id: commandId("logic_case_replace"), type: "signal.replaceValue", signalId: "sig_lg" as SignalId, fromStart: 0, start: 0, value: "X" });
    expect(plan).toMatchObject({ ok: false, reason: "no-op" });
  });

  it("still applies a genuinely different token", () => {
    const plan = planCommand(withLogicSignal(values), { id: commandId("logic_real_change"), type: "signal.updateValue", signalId: "sig_lg" as SignalId, start: 0, value: "Z" });
    expect(plan.ok).toBe(true);
  });

  it("keeps strict equality for state values (not a logic-token Signal)", () => {
    const document = withState([{ start: 0, value: "idle" }, { start: 3, value: "ACTIVE" }]);
    const plan = planCommand(document, { id: commandId("state_case"), type: "signal.updateValue", signalId: "sig_st" as SignalId, start: 0, value: "IDLE" });
    expect(plan.ok).toBe(true);
  });
});

describe("non-integer change points are rejected by the planner", () => {
  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])("updateValue rejects start %p with an integer-cycle problem", (start) => {
    const plan = planCommand(canonicalFixture(), { id: commandId("fractional_start"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start, value: "A5" });
    expect(plan).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "TIMELINE_OUT_OF_RANGE", path: "$.start", message: "Change point must be an integer cycle." }] });
  });

  it("replaceValue still rejects a non-integer target start", () => {
    const plan = planCommand(canonicalFixture(), { id: commandId("fractional_replace"), type: "signal.replaceValue", signalId: "sig_data" as SignalId, fromStart: 4, start: 2.5, value: "A5" });
    expect(plan).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("an integer start still plans normally", () => {
    const plan = planCommand(canonicalFixture(), { id: commandId("integer_start"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start: 2, value: "A5" });
    expect(plan.ok).toBe(true);
  });

  it.each([-1, canonicalFixture().timeline.cycleCount])("rejects integer change point %p outside the source timeline", (start) => {
    const plan = planCommand(canonicalFixture(), { id: commandId("out_of_range_start"), type: "signal.updateValue", signalId: "sig_data" as SignalId, start, value: "A5" });
    expect(plan).toMatchObject({ ok: false, reason: "invalid", problems: [{ code: "TIMELINE_OUT_OF_RANGE", path: "$.start", message: "Change point is outside the timeline." }] });
  });
});
