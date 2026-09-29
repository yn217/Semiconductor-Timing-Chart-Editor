import { describe, expect, it } from "vitest";
import { ANNOTATION_LABEL_LINE_HEIGHT, ANNOTATION_LABEL_MAX_WIDTH, ANNOTATION_LABEL_PLACEMENTS, validateCanonicalDocument, wrapAnnotationLabel, type AnnotationId, type SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("annotation label wrapping", () => {
  it("preserves authored line breaks and deterministically wraps long text", () => {
    const input = "Address phase with a long description\nsecond paragraph";
    const narrow = wrapAnnotationLabel(input, 48);
    expect(narrow.split("\n").length).toBeGreaterThan(2);
    expect(narrow).toContain("second");
    expect(wrapAnnotationLabel(input, 48)).toBe(narrow);
    expect(wrapAnnotationLabel(input, 1000)).toBe(input);
  });

  it("clamps invalid width/font inputs to safe deterministic defaults", () => {
    expect(ANNOTATION_LABEL_MAX_WIDTH).toEqual({ min: 24, max: 2000, default: 180 });
    expect(wrapAnnotationLabel("a reasonably long label", Number.NaN)).toBe(wrapAnnotationLabel("a reasonably long label", 180));
    expect(wrapAnnotationLabel("a reasonably long label", 24, Number.NaN)).toBe(wrapAnnotationLabel("a reasonably long label", 24, 10));
  });

  it("shares the annotation line-spacing bounds and default across editor and renderer owners", () => {
    expect(ANNOTATION_LABEL_LINE_HEIGHT).toEqual({ min: 1, max: 3, default: 1.4 });
    expect(ANNOTATION_LABEL_PLACEMENTS).toEqual(["start", "center", "end", "above", "below"]);
  });

  it("validates persisted label placement against the supported preset contract", () => {
    const base = canonicalFixture();
    const annotation = { id: "ann_placement" as AnnotationId, type: "marker" as const, label: "Clock edge", visible: true, anchor: { signalId: "sig_clk" as SignalId, cycle: 2, point: "cycle-start" as const } };
    for (const labelPlacement of ANNOTATION_LABEL_PLACEMENTS) {
      expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, labelPlacement }] })).toEqual([]);
    }
    expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, labelPlacement: "diagonal" }] })).toContainEqual(expect.objectContaining({ code: "SCHEMA_ENUM", path: "$/annotations/0/labelPlacement" }));
  });
});
