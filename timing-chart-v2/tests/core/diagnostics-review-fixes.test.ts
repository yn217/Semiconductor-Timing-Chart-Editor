import { describe, expect, it } from "vitest";
import { deriveTimingDiagnostics } from "@timing-chart-v2/core";
import type { CanonicalDocument, Constraint, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

function withSignals(document: CanonicalDocument, signals: CanonicalDocument["signals"], constraints: readonly Constraint[]): CanonicalDocument {
  return {
    ...document,
    signals,
    constraints,
    signalGroups: document.signalGroups.map((group) => ({ ...group, rows: signals.map((signal) => signal.id) })),
    timeline: { ...document.timeline, referenceClock: signals.find((signal) => signal.type === "clock")?.id },
  };
}

function fixtureSignals() {
  const source = canonicalFixture();
  const template = source.signals[1]!;
  const make = (id: string, name: string, values: Array<{ start: number; value: string | number }>, type: "binary" | "bus" = "binary") =>
    ({ ...template, id: id as SignalId, name, type, values }) as CanonicalDocument["signals"][number];
  return { source, make };
}

describe("Handshake stability findings are deduplicated per assertion edge", () => {
  it("reports a stable-signal change once when a request re-asserts before its acknowledge", () => {
    const { source, make } = fixtureSignals();
    // REQ high@2, low@4, high@6, ACK high@8; PAYLOAD changes at 7, inside both request windows.
    const request = make("sig_req_repeat", "REQ", [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 4, value: 0 }, { start: 6, value: 1 }]);
    const acknowledge = make("sig_ack_repeat", "ACK", [{ start: 0, value: 0 }, { start: 8, value: 1 }]);
    const payload = make("sig_payload_repeat", "PAYLOAD", [{ start: 0, value: "00" }, { start: 7, value: "01" }], "bus");
    const constraint: Constraint = { id: "constraint_repeat", type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, stableSignalIds: [payload.id] } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge, payload], [constraint]);

    const unstable = deriveTimingDiagnostics(document, { enabledCategories: ["stability"] }).filter((item) => item.code === "HANDSHAKE_DATA_UNSTABLE");
    expect(unstable).toHaveLength(1);
    expect(unstable[0]).toMatchObject({ path: "$.signals[3].values[1].start", entityId: payload.id });
  });

  it("reports a change once when one asserted request is split across value records", () => {
    const { source, make } = fixtureSignals();
    // REQ stays high across records at 2 and 5; the single handshake must not be double-counted.
    const request = make("sig_req_split", "REQ", [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 5, value: 1 }]);
    const acknowledge = make("sig_ack_split", "ACK", [{ start: 0, value: 0 }, { start: 8, value: 1 }]);
    const payload = make("sig_payload_split", "PAYLOAD", [{ start: 0, value: "00" }, { start: 6, value: "01" }], "bus");
    const constraint: Constraint = { id: "constraint_split", type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, stableSignalIds: [payload.id] } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge, payload], [constraint]);

    const unstable = deriveTimingDiagnostics(document, { enabledCategories: ["stability"] }).filter((item) => item.code === "HANDSHAKE_DATA_UNSTABLE");
    expect(unstable).toHaveLength(1);
    expect(unstable[0]).toMatchObject({ entityId: payload.id });
  });

  it("applies the same single-report rule to active-low handshakes", () => {
    const { source, make } = fixtureSignals();
    // Active-low REQ asserts (low) at 2 and again at 6 after a release at 4; ACK asserts low at 8.
    const request = make("sig_req_low", "REQ_N", [{ start: 0, value: 1 }, { start: 2, value: 0 }, { start: 4, value: 1 }, { start: 6, value: 0 }]);
    const acknowledge = make("sig_ack_low", "ACK_N", [{ start: 0, value: 1 }, { start: 8, value: 0 }]);
    const payload = make("sig_payload_low", "PAYLOAD", [{ start: 0, value: "00" }, { start: 7, value: "01" }], "bus");
    const constraint: Constraint = {
      id: "constraint_low",
      type: "handshake",
      data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, requestPolarity: "active-low", acknowledgePolarity: "active-low", stableSignalIds: [payload.id] },
    };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge, payload], [constraint]);

    const unstable = deriveTimingDiagnostics(document, { enabledCategories: ["stability"] }).filter((item) => item.code === "HANDSHAKE_DATA_UNSTABLE");
    expect(unstable).toHaveLength(1);
  });

  it("still reports one missing-acknowledge finding per distinct request assertion", () => {
    const { source, make } = fixtureSignals();
    const request = make("sig_req_noack", "REQ", [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 4, value: 0 }, { start: 6, value: 1 }]);
    const acknowledge = make("sig_ack_noack", "ACK", [{ start: 0, value: 0 }]);
    const constraint: Constraint = { id: "constraint_noack", type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge], [constraint]);

    const missing = deriveTimingDiagnostics(document, { enabledCategories: ["protocol"] }).filter((item) => item.code === "HANDSHAKE_NO_ACK");
    expect(missing.map((item) => item.sourceCycle).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([2, 6]);
  });
});
