import { describe, expect, it } from "vitest";
import type { SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { formatAnnotationAnchor } from "../../apps/editor/src/annotation-anchor-format.js";

describe("annotation semantic anchor labels", () => {
  const signalNames = new Map<SignalId, string>([["sig_penable" as SignalId, "PENABLE"]]);

  it("uses the canonical signal display name, cycle, and edge meaning", () => {
    const anchor: SemanticAnchor = { signalId: "sig_penable" as SignalId, cycle: 22, point: "rising-edge" };
    expect(formatAnnotationAnchor(anchor, signalNames)).toBe("PENABLE @ 22 ↑");
  });

  it("falls back to stable signal ID and formats cycle-only anchors", () => {
    expect(formatAnnotationAnchor({ signalId: "missing_signal" as SignalId, cycle: 128, point: "value-center" }, signalNames)).toBe("missing_signal @ 128 · value center");
    expect(formatAnnotationAnchor({ cycle: 84, point: "cycle-start" }, signalNames)).toBe("Cycle 84");
  });

  it("uses an intentional em dash when an anchor is absent", () => {
    expect(formatAnnotationAnchor(undefined, signalNames)).toBe("—");
  });
});
