import { describe, expect, it } from "vitest";
import { validateCanonicalDocument, type Annotation, type AnnotationId, type SemanticAnchor, type SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { anchorPointFitsSignalType } from "../../apps/editor/src/create-annotation.js";
import { measurementCycleSpan } from "../../apps/editor/src/runtime/annotation-overlays.js";

const POINTS: readonly SemanticAnchor["point"][] = ["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"];

describe("anchorPointFitsSignalType mirrors the anchor validator", () => {
  it("agrees with validateCanonicalDocument for every point on each real Signal type in the fixture", () => {
    // Only schema-valid documents reach the semantic anchor rules, so probe with the fixture's own Signals (not retyped copies).
    const source = canonicalFixture();
    const timing = source.signals.filter((signal) => signal.type !== "commentRow");
    const types = new Set(timing.map((signal) => signal.type));
    expect(types.has("clock") && types.has("bus")).toBe(true);
    for (const signal of timing) {
      for (const point of POINTS) {
        const annotation: Annotation = { id: "ann_probe" as AnnotationId, type: "marker", label: "probe", visible: true, anchor: { signalId: signal.id as SignalId, cycle: 1, point } };
        const problems = validateCanonicalDocument({ ...source, annotations: [annotation] });
        const rejected = problems.some((problem) => problem.code === "INVALID_ANCHOR_POINT");
        expect({ point, signalType: signal.type, fits: anchorPointFitsSignalType(point, signal.type) }).toEqual({ point, signalType: signal.type, fits: !rejected });
      }
    }
  });

  it("matches the validator's per-type rules for state, event, binary and logic Signals", () => {
    expect(anchorPointFitsSignalType("rising-edge", "state")).toBe(false);
    expect(anchorPointFitsSignalType("falling-edge", "event")).toBe(false);
    expect(anchorPointFitsSignalType("rising-edge", "binary")).toBe(true);
    expect(anchorPointFitsSignalType("rising-edge", "logic")).toBe(true);
    expect(anchorPointFitsSignalType("value-center", "event")).toBe(true);
    expect(anchorPointFitsSignalType("value-center", "clock")).toBe(false);
    expect(anchorPointFitsSignalType("row-center", "bus")).toBe(true);
  });

  it("with no Signal, only cycle and transition points can stand without a signalId", () => {
    expect(anchorPointFitsSignalType("cycle-start", undefined)).toBe(true);
    expect(anchorPointFitsSignalType("transition-center", undefined)).toBe(true);
    expect(anchorPointFitsSignalType("rising-edge", undefined)).toBe(false);
    expect(anchorPointFitsSignalType("value-start", undefined)).toBe(false);
  });

  it("refuses transition points on clocks, the Ribbon threshold Measurement case", () => {
    expect(anchorPointFitsSignalType("transition-center", "clock")).toBe(false);
    expect(anchorPointFitsSignalType("transition-center", "bus")).toBe(true);
  });
});

describe("measurementCycleSpan", () => {
  const cycleAnchor = (cycle: number, point: SemanticAnchor["point"]): SemanticAnchor => ({ signalId: "sig_data" as SignalId, cycle, point });
  const transitionAnchor = (cycle: number, value: number): SemanticAnchor => ({ signalId: "sig_data" as SignalId, cycle, point: "transition-center", transition: { kind: "threshold", value } });

  it("counts the right edge of a Ribbon-created one-cycle range as one cycle, not zero", () => {
    expect(measurementCycleSpan({ start: cycleAnchor(5, "cycle-start"), end: cycleAnchor(5, "cycle-end") })).toBe(1);
  });

  it("matches the drawn span for a multi-cycle Ribbon range", () => {
    expect(measurementCycleSpan({ start: cycleAnchor(5, "cycle-start"), end: cycleAnchor(7, "cycle-end") })).toBe(3);
  });

  it("leaves transition-picked measurements at their source cycle difference", () => {
    expect(measurementCycleSpan({ start: transitionAnchor(5, 0.3), end: transitionAnchor(9, 0.7) })).toBe(4);
    expect(measurementCycleSpan({ start: transitionAnchor(5, 0.3), end: transitionAnchor(5, 0.7) })).toBe(0);
  });

  it("does not apply the cycle-end edge offset to a threshold-resolved endpoint", () => {
    expect(measurementCycleSpan({ start: transitionAnchor(5, 0.3), end: { ...cycleAnchor(6, "cycle-end"), transition: { kind: "threshold", value: 0.7 } } })).toBe(1);
  });

  it("returns undefined when an endpoint is missing", () => {
    expect(measurementCycleSpan({ start: cycleAnchor(5, "cycle-start") } as never)).toBeUndefined();
  });
});
