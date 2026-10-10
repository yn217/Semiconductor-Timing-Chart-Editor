import { describe, expect, it } from "vitest";
import { deriveTimingDiagnostics, deriveTimingDiagnosticsIfInputsChanged } from "@timing-chart-v2/core";
import { planCommand } from "@timing-chart-v2/commands";
import { canonicalReferences, constraintReferences, parseDocument, serializeValidatedCanonicalDocument, type CanonicalDocument, type CommandId, type Constraint, type SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (id: string) => id as CommandId;

function withSignals(document: CanonicalDocument, signals: CanonicalDocument["signals"], constraints: readonly Constraint[] = document.constraints): CanonicalDocument {
  return {
    ...document,
    signals,
    constraints,
    signalGroups: document.signalGroups.map((group) => ({ ...group, rows: signals.map((signal) => signal.id) })),
    timeline: { ...document.timeline, referenceClock: signals.find((signal) => signal.type === "clock")?.id },
  };
}

function makeSignal(_template: CanonicalDocument["signals"][number], id: string, name: string, values: Array<{ start: number; value: number }>): CanonicalDocument["signals"][number] {
  return { id: id as SignalId, name, type: "binary", role: "input", source: { instancePath: [], signalName: name }, display: { name }, values } as CanonicalDocument["signals"][number];
}

describe("incremental constraint re-evaluation keeps constraint indexes", () => {
  it("rebases a re-evaluated Handshake path to its real constraint index, matching a full derive", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    // Constraint 0 is healthy; constraint 1 has a request with no acknowledge, so it reports a finding at constraints[1].
    const req0 = makeSignal(template, "sig_req_0", "REQ0", [{ start: 0, value: 0 }, { start: 2, value: 1 }]);
    const ack0 = makeSignal(template, "sig_ack_0", "ACK0", [{ start: 0, value: 0 }, { start: 4, value: 1 }]);
    const req1 = makeSignal(template, "sig_req_1", "REQ1", [{ start: 0, value: 0 }, { start: 2, value: 1 }]);
    const ack1 = makeSignal(template, "sig_ack_1", "ACK1", [{ start: 0, value: 0 }]);
    const constraints: Constraint[] = [
      { id: "constraint_ok", type: "handshake", data: { requestSignalId: req0.id, acknowledgeSignalId: ack0.id } },
      { id: "constraint_second", type: "handshake", data: { requestSignalId: req1.id, acknowledgeSignalId: ack1.id } },
    ];
    const previous = withSignals(source, [source.signals[0]!, req0, ack0, req1, ack1], constraints);
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    expect(previousDiagnostics.some((item) => item.objectId === "constraint_second" && item.path.startsWith("$.constraints[1]"))).toBe(true);

    // Change only the second constraint's request Signal values; the constraint array itself is shared.
    const changedReq1 = makeSignal(template, "sig_req_1", "REQ1", [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 5, value: 0 }]);
    const next = withSignals(previous, [source.signals[0]!, req0, ack0, changedReq1, ack1], constraints);
    const incremental = deriveTimingDiagnosticsIfInputsChanged(previous, next, previousDiagnostics);
    const full = deriveTimingDiagnostics(next);

    expect(incremental.recomputed).toBe(true);
    expect(incremental.diagnostics.some((item) => item.path.startsWith("$.constraints[0].data.acknowledgeSignalId") && item.objectId === "constraint_second")).toBe(false);
    expect(incremental.diagnostics).toEqual(full);
    expect(incremental.diagnostics.filter((item) => item.objectId === "constraint_second").every((item) => item.path.startsWith("$.constraints[1]"))).toBe(true);
  });
});

describe("updateCheckSettings preserves the absent-means-all-enabled default", () => {
  it("omits enabledCategories when an empty settings object is applied", () => {
    const source = canonicalFixture();
    const restricted = { ...source, checkSettings: { enabledCategories: ["protocol"] as const } } as CanonicalDocument;
    const result = planCommand(restricted, { id: commandId("cmd_check_empty"), type: "document.updateCheckSettings", checkSettings: {} } as never);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.document.checkSettings).toEqual({});
    const unknownValueFindings = deriveTimingDiagnostics({ ...result.document, signals: [{ ...source.signals[1]!, values: [{ start: 0, value: "X" }] }, ...source.signals.slice(2)] } as CanonicalDocument);
    expect(unknownValueFindings.some((item) => item.category === "unknown-value")).toBe(true);
  });
});

describe("Handshake reset Signals are registered constraint references", () => {
  function handshakeWithReset(resetSignalId: string) {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    const req = makeSignal(template, "sig_req_reset", "REQ", [{ start: 0, value: 0 }, { start: 2, value: 1 }]);
    const ack = makeSignal(template, "sig_ack_reset", "ACK", [{ start: 0, value: 0 }, { start: 4, value: 1 }]);
    const reset = makeSignal(template, "sig_rst", "RST", [{ start: 0, value: 0 }]);
    const constraint: Constraint = { id: "constraint_reset", type: "handshake", data: { requestSignalId: req.id, acknowledgeSignalId: ack.id, resetSignalId } };
    return { document: withSignals(source, [source.signals[0]!, req, ack, reset], [constraint]), reset };
  }

  it("reports the reset Signal as a constraint reference with a stable path", () => {
    const { document, reset } = handshakeWithReset("sig_rst");
    const references = constraintReferences(document.constraints).filter((reference) => reference.kind === "constraint.handshakeReset");
    expect(references).toEqual([expect.objectContaining({ ownerId: "constraint_reset", targetId: reset.id, path: "$.constraints[0].data.resetSignalId" })]);
    expect(canonicalReferences(document).some((reference) => reference.kind === "constraint.handshakeReset")).toBe(true);
  });

  it("blocks deleting a reset-only Signal with a message naming the constraint", () => {
    const { document, reset } = handshakeWithReset("sig_rst");
    const result = planCommand(document, { id: commandId("cmd_delete_reset"), type: "signal.delete", signalId: reset.id } as never);
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "SIGNAL_HAS_DEPENDENTS" })] });
  });

  it("still accepts a document whose handshake reset references an existing Signal", () => {
    const { document } = handshakeWithReset("sig_rst");
    const parsed = parseDocument(serializeValidatedCanonicalDocument(document));
    expect(parsed.ok).toBe(true);
  });
});

describe("blocked constraint dependent message", () => {
  it("names each constraint with its type and tells the user where to edit it", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    const trigger = makeSignal(template, "sig_trig", "TRIG", [{ start: 0, value: 0 }, { start: 2, value: 1 }]);
    const response = makeSignal(template, "sig_resp", "RESP", [{ start: 0, value: 0 }, { start: 4, value: 1 }]);
    const latency: Constraint = { id: "c_lat_77", type: "latency", data: { triggerSignalId: trigger.id, triggerEdge: "rising", responseSignalId: response.id, responseEdge: "rising", minCycles: 1, maxCycles: 3 } };
    const document = withSignals(source, [source.signals[0]!, trigger, response], [latency]);
    const result = planCommand(document, { id: commandId("cmd_delete_trigger"), type: "signal.delete", signalId: trigger.id } as never);
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "SIGNAL_HAS_DEPENDENTS", path: "$.signalId" })] });
    if (result.ok) return;
    expect(result.problems[0]!.message).toBe("Signal is used by constraint c_lat_77 (latency). Delete or edit the constraint first (Check tab).");
  });
});
