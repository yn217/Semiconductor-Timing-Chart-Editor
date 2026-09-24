import { describe, expect, it } from "vitest";
import { ANNOTATION_LABEL_MAX_WIDTH, wrapAnnotationLabel } from "@timing-chart-v2/schema";

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
});
