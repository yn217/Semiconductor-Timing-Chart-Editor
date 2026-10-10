import { describe, expect, it } from "vitest";
import { ANNOTATION_LABEL_LINE_HEIGHT, ANNOTATION_LABEL_MAX_WIDTH, ANNOTATION_LABEL_PLACEMENTS, ANNOTATION_PRESENTATION_NUMERIC_RANGES, ANNOTATION_STROKE_OPACITY, validateCanonicalDocument, wrapAnnotationLabel, type AnnotationId, type SignalId } from "@timing-chart-v2/schema";
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

  it("shares and validates persisted Stroke/Fill numeric bounds", () => {
    const base = canonicalFixture();
    const annotation = { id: "ann_stroke_opacity" as AnnotationId, type: "marker" as const, label: "Clock edge", visible: true, anchor: { signalId: "sig_clk" as SignalId, cycle: 2, point: "cycle-start" as const } };
    expect(ANNOTATION_PRESENTATION_NUMERIC_RANGES).toEqual({
      strokeWidth: { min: 1, max: 8, default: 2 },
      strokeOpacity: { min: 0, max: 1, default: 1 },
      fillOpacity: { min: 0, max: 1, default: 0.12 },
    });
    expect(ANNOTATION_STROKE_OPACITY).toEqual({ min: 0, max: 1, default: 1 });
    const cases = [
      { field: "strokeWidth", min: 1, max: 8 },
      { field: "strokeOpacity", min: 0, max: 1 },
      { field: "fillOpacity", min: 0, max: 1 },
    ] as const;
    for (const { field, min, max } of cases) {
      for (const value of [min, (min + max) / 2, max]) expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, style: { [field]: value } }] })).toEqual([]);
      for (const value of [min - 0.01, max + 0.01]) expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, style: { [field]: value } }] })).toContainEqual(expect.objectContaining({ code: "INVALID_ANNOTATION_STYLE", path: `$.annotations[0].style.${field}` }));
      expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, style: { [field]: Number.NaN } }] })).toContainEqual(expect.objectContaining({ code: "NON_FINITE_NUMBER", path: `$.annotations[0].style.${field}` }));
    }
  });

  it("rejects Stroke/Fill style values the renderers cannot represent", () => {
    const base = canonicalFixture();
    const annotation = { id: "ann_discrete_presentation" as AnnotationId, type: "marker" as const, label: "Clock edge", visible: true, anchor: { signalId: "sig_clk" as SignalId, cycle: 2, point: "cycle-start" as const } };
    for (const strokeStyle of ["solid", "dashed", "dotted"]) {
      expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, style: { strokeStyle } }] })).toEqual([]);
    }
    for (const fillColor of ["none", "#abc", "#abcd", "#aabbcc", "#aabbccdd"]) {
      expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, style: { fillColor } }] })).toEqual([]);
    }
    for (const strokeStyle of ["wavy", "", 1, null]) {
      expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, style: { strokeStyle } }] })).toContainEqual(expect.objectContaining({ code: "INVALID_ANNOTATION_STYLE", path: "$.annotations[0].style.strokeStyle" }));
    }
    for (const fillColor of ["red", "#12", "#abcde", "#ggg", "url(javascript:alert(1))", 5, null]) {
      expect(validateCanonicalDocument({ ...base, annotations: [{ ...annotation, style: { fillColor } }] })).toContainEqual(expect.objectContaining({ code: "INVALID_ANNOTATION_STYLE", path: "$.annotations[0].style.fillColor" }));
    }
  });
});
