import { describe, expect, it } from "vitest";
import { deriveTimingDiagnostics, TIMING_DIAGNOSTIC_RULES } from "@timing-chart-v2/core";
import type { CanonicalDocument, Constraint, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

function withSignals(document: CanonicalDocument, signals: CanonicalDocument["signals"], constraints: readonly Constraint[] = document.constraints): CanonicalDocument {
  return {
    ...document,
    signals,
    constraints,
    signalGroups: document.signalGroups.map((group) => ({ ...group, rows: signals.map((signal) => signal.id) })),
    timeline: { ...document.timeline, referenceClock: signals.find((signal) => signal.type === "clock")?.id },
  };
}

describe("derived timing diagnostics", () => {
  it("evaluates through a shared rule registry with stable semantic keys", () => {
    expect(TIMING_DIAGNOSTIC_RULES.map((rule) => rule.id)).toEqual(["timing.unknown-value", "timing.handshake"]);
    const source = canonicalFixture();
    const signal = { ...source.signals[1]!, values: [{ start: 1, value: "X" }] };
    const diagnostic = deriveTimingDiagnostics(withSignals(source, [source.signals[0]!, signal]))[0]!;
    expect(diagnostic.ruleId).toBe("timing.unknown-value");
    expect(diagnostic.stableKey).toContain(diagnostic.path);
  });
  it("reports explicit and implicit unknown values without changing the canonical validator contract", () => {
    const source = canonicalFixture();
    const data = source.signals[1]!;
    if (data.type !== "bus") throw new Error("fixture DATA must be a bus");
    const document = withSignals(source, [source.signals[0]!, { ...data, values: [{ start: 2, value: "0xX1" }, { start: 4, value: "A5" }] }]);
    const diagnostics = deriveTimingDiagnostics(document);
    expect(diagnostics.map((item) => item.code)).toEqual(["UNINITIALIZED_SIGNAL_VALUE", "UNKNOWN_SIGNAL_VALUE"]);
    expect(diagnostics[1]).toMatchObject({ path: "$.signals[1].values[0].value", objectId: data.id, severity: "warning", source: "validation", stage: "validate" });
    expect(diagnostics[0]?.path).toBe("$.signals[1].values[0].start");
  });

  it("detects a missing acknowledge and data changes before acknowledge", () => {
    const source = canonicalFixture();
    const request = { ...source.signals[1]!, id: "sig_req" as SignalId, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const acknowledge = { ...source.signals[1]!, id: "sig_ack" as SignalId, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 5, value: 1 }] };
    const payload = { ...source.signals[1]!, id: "sig_payload" as SignalId, name: "PAYLOAD", values: [{ start: 0, value: "00" }, { start: 3, value: "01" }] };
    const constraint: Constraint = { id: "constraint_handshake", type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, stableSignalIds: [payload.id] } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge, payload], [constraint]);
    const diagnostics = deriveTimingDiagnostics(document);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "HANDSHAKE_DATA_UNSTABLE", path: "$.signals[3].values[1].start", objectId: payload.id });
    expect(deriveTimingDiagnostics({ ...document, signals: document.signals.map((signal) => signal.id === acknowledge.id ? { ...signal, values: [{ start: 0, value: 0 }] } : signal) })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "HANDSHAKE_NO_ACK", objectId: constraint.id })]));
  });

  it("is deterministic and honors category selection", () => {
    const source = canonicalFixture();
    const signal = { ...source.signals[1]!, values: [{ start: 1, value: "X" }] };
    const document = withSignals(source, [source.signals[0]!, signal]);
    const reversed = { ...document, signals: [...document.signals].reverse() };
    expect(deriveTimingDiagnostics(document)).toEqual(deriveTimingDiagnostics(document));
    expect(deriveTimingDiagnostics(document, { enabledCategories: ["protocol"] })).toEqual([]);
    expect(deriveTimingDiagnostics(reversed, { enabledCategories: ["unknown-value"] }).map((item) => item.code)).toEqual(["UNINITIALIZED_SIGNAL_VALUE", "UNKNOWN_SIGNAL_VALUE"]);
  });
});
