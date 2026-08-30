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
});
