import { describe, expect, it } from "vitest";
import { keyboardScope, mayRouteGlobalShortcut, resolveProblemTarget } from "@timing-chart-v2/ui";

describe("UI interaction ownership", () => {
  it("preserves native editing and IME before global semantic shortcuts", () => {
    expect(keyboardScope(null)).toBe("canvas");
    expect(keyboardScope(null, true)).toBe("gesture");
    expect(mayRouteGlobalShortcut({ target: null, isComposing: true })).toBe(false);
    expect(mayRouteGlobalShortcut({ target: null, isComposing: false })).toBe(true);
  });

  it("resolves derived problem paths to stable canonical targets", () => {
    const target = resolveProblemTarget("$.annotations[0].anchor.signalId", {
      signals: [{ id: "sig_a" }], signalGroups: [{ id: "grp_a" }], annotations: [{ id: "ann_a" }],
    });
    expect(target).toEqual({ kind: "annotation", id: "ann_a" });
  });

  it("prefers a diagnostic stable entity over an array position", () => {
    const target = resolveProblemTarget("$.signals[0].values[4].value", {
      signals: [{ id: "sig_a" }, { id: "sig_b" }], signalGroups: [], annotations: [],
    }, { entityId: "sig_b", objectType: "signal" });
    expect(target).toEqual({ kind: "signal", id: "sig_b" });
  });

  it("resolves runtime renderer diagnostics whose path is keyed by stable Signal ID", () => {
    const diagnostic = {
      code: "WAVE_RENDER_ERROR",
      path: "$.signals[sig_runtime_owner]",
      message: "Waveform render failed.",
      objectType: "signal",
      objectId: "sig_runtime_owner",
    };
    const document = {
      signals: [{ id: "sig_other" }, { id: "sig_runtime_owner" }],
      signalGroups: [],
      annotations: [],
    };

    expect(resolveProblemTarget(diagnostic.path, document, diagnostic)).toEqual({ kind: "signal", id: "sig_runtime_owner" });
    expect(resolveProblemTarget(diagnostic.path, document)).toEqual({ kind: "timeline" });
  });

  it("reveals a constraint problem through its stable related Signal and source cycle", () => {
    const document = {
      signals: [{ id: "sig_request" }, { id: "sig_ack" }],
      signalGroups: [], annotations: [], transactions: [],
      constraints: [{ id: "constraint_latency", type: "latency", data: { triggerSignalId: "sig_request", responseSignalId: "sig_ack" } }],
    };
    const diagnostic = { objectType: "constraint", objectId: "constraint_latency", entityId: "sig_ack", sourceCycle: 7 };

    expect(resolveProblemTarget("$.constraints[0].data", document, diagnostic)).toEqual({ kind: "signal", id: "sig_ack", cycle: 7 });
  });

  it("resolves malformed constraint diagnostics to a referenced stable Signal, not a row index", () => {
    const document = {
      signals: [{ id: "sig_request" }, { id: "sig_ack" }],
      signalGroups: [], annotations: [], transactions: [],
      constraints: [{ id: "constraint_invalid", type: "latency", data: { triggerSignalId: "sig_request", responseSignalId: "missing" } }],
    };

    expect(resolveProblemTarget("$.constraints[0].data", document, { objectType: "constraint", objectId: "constraint_invalid", entityId: "constraint_invalid" }))
      .toEqual({ kind: "signal", id: "sig_request" });
  });
});
