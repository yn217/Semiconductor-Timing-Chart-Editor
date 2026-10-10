import { describe, expect, it } from "vitest";
import { planCommand, type SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import type { CanonicalDocument, CommandId, SignalId, SignalValueChange } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// Review fixes for signal type/width changes: converting a value signal to
// Bus (or changing a Bus width) must validate every existing value with the
// same literal and width rules as document validation, and reject in the
// planner with a message naming the cycle and value, not at commit time with
// a location-less INVALID_BUS_LITERAL.

const commandId = (value: string) => value as CommandId;

function withSignal(type: "state" | "logic", values: SignalValueChange[]): CanonicalDocument {
  const document = canonicalFixture();
  document.signals = [...document.signals, {
    id: "sig_x" as SignalId, name: "X", type, role: "internal",
    source: { instancePath: [], signalName: "X" }, display: { name: "X" }, values,
  } as CanonicalDocument["signals"][number]];
  document.signalGroups = document.signalGroups.map((group) => ({ ...group, rows: [...group.rows, "sig_x" as SignalId] }));
  return document;
}

const toBus = (signalId: string, width: number | undefined, signalType: "bus" = "bus") => ({
  id: commandId("to_bus"), type: "signal.updateProperties" as const, signalId: signalId as SignalId, name: "X", role: "internal" as const,
  signalType, ...(width === undefined ? {} : { width }), displayFormat: "hex" as const,
});

describe("state to bus conversion validates existing values", () => {
  it("rejects a non-literal value with the cycle and value named", () => {
    const document = withSignal("state", [{ start: 0, value: "IDLE" }, { start: 3, value: "ready-1" }]);
    const plan = planCommand(document, toBus("sig_x", 8));
    expect(plan).toMatchObject({
      ok: false,
      reason: "invalid",
      problems: [{ code: "UNSUPPORTED_SIGNAL_VALUE", path: "$.signalType", message: "Value 'ready-1' at cycle 3 is not a valid bus literal for width 8." }],
    });
  });

  it("rejects a literal that needs more bits than the requested width", () => {
    const document = withSignal("state", [{ start: 0, value: "IDLE" }, { start: 2, value: "1FF" }]);
    const plan = planCommand(document, toBus("sig_x", 8));
    expect(plan).toMatchObject({
      ok: false,
      reason: "invalid",
      problems: [{ code: "UNSUPPORTED_SIGNAL_VALUE", path: "$.signalType", message: "Value '1FF' at cycle 2 needs 9 bits but width is 8." }],
    });
  });

  it("accepts symbolic identifiers and literals that fit the width", () => {
    const document = withSignal("state", [{ start: 0, value: "IDLE" }, { start: 2, value: "A5" }, { start: 4, value: "0b1010" }]);
    const plan = planCommand(document, toBus("sig_x", 8));
    expect(plan.ok).toBe(true);
  });

  it("rejects the conversion without mutating the document or History", () => {
    const document = withSignal("state", [{ start: 0, value: "ready-1" }]);
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const result = session.execute(toBus("sig_x", 8));
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(session.getSnapshot().document).toEqual(before.document);
    expect(session.historyState()).toMatchObject({ undoDepth: 0, dirty: false });
  });
});

describe("bus width changes validate existing values", () => {
  it("rejects narrowing a bus below an existing value's bits", () => {
    const plan = planCommand(canonicalFixture(), { ...toBus("sig_data", 4), id: commandId("narrow") });
    expect(plan).toMatchObject({
      ok: false,
      reason: "invalid",
      problems: [{ code: "UNSUPPORTED_SIGNAL_VALUE", path: "$.signalType", message: "Value 'A5' at cycle 4 needs 8 bits but width is 4." }],
    });
  });

  it("still allows widening a bus", () => {
    const plan = planCommand(canonicalFixture(), { ...toBus("sig_data", 16), id: commandId("widen") });
    expect(plan.ok).toBe(true);
  });
});

describe("clock conversion reports every blocking annotation", () => {
  it("returns one problem per edge-anchored annotation so the Convert dialog can show all of them", () => {
    const document = canonicalFixture() as CanonicalDocument & { annotations: unknown[] };
    document.annotations = [
      { id: "ann_a", type: "text", label: "a", visible: true, anchor: { signalId: "sig_clk", cycle: 1, point: "rising-edge" } },
      { id: "ann_b", type: "text", label: "b", visible: true, anchor: { signalId: "sig_clk", cycle: 2, point: "falling-edge" } },
    ] as unknown as CanonicalDocument["annotations"];
    const session = new CommandHistorySession(document);
    const result = session.execute({ id: commandId("clock_to_bus"), type: "signal.convertClock", signalId: "sig_clk" as SignalId, targetType: "bus" });
    expect(result).toMatchObject({
      ok: false,
      reason: "invalid",
      problems: [
        { code: "INVALID_ANCHOR_POINT", entityId: "ann_a", message: "Point 'rising-edge' is not defined for bus signals." },
        { code: "INVALID_ANCHOR_POINT", entityId: "ann_b", message: "Point 'falling-edge' is not defined for bus signals." },
      ],
    });
  });
});
