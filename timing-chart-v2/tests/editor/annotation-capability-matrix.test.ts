import { describe, expect, it } from "vitest";
import type { AnnotationType } from "@timing-chart-v2/schema";
import { annotationCapabilityDisabledReason, hasAnnotationCapability } from "../../apps/editor/src/annotation-capability-matrix.js";

const ALL_TYPES: readonly AnnotationType[] = ["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace", "rectangle", "ellipse", "connector", "textbox"];

describe("Annotation Capability Matrix (#378)", () => {
  it("declares stroke/fill only for the CSS-border/background-driven area and line shapes", () => {
    expect(hasAnnotationCapability("range", "stroke")).toBe(true);
    expect(hasAnnotationCapability("highlight", "stroke")).toBe(true);
    expect(hasAnnotationCapability("verticalLine", "stroke")).toBe(true);
    expect(hasAnnotationCapability("rectangle", "stroke")).toBe(true);
    expect(hasAnnotationCapability("ellipse", "stroke")).toBe(true);
    expect(hasAnnotationCapability("range", "fill")).toBe(true);
    expect(hasAnnotationCapability("highlight", "fill")).toBe(true);
    expect(hasAnnotationCapability("rectangle", "fill")).toBe(true);
    expect(hasAnnotationCapability("ellipse", "fill")).toBe(true);
    // Point-shaped/route-shaped types have no independently stylable line or
    // fillable area in the current renderer -- disabled, not silently
    // enabled with no effect.
    expect(hasAnnotationCapability("text", "stroke")).toBe(false);
    expect(hasAnnotationCapability("marker", "fill")).toBe(false);
    expect(hasAnnotationCapability("arrow", "stroke")).toBe(false);
    expect(hasAnnotationCapability("verticalLine", "fill")).toBe(false);
  });

  it("declares labelOffset/labelPlacement/zOrder/lock/visible/text universally applicable, matching the shared #171 machinery", () => {
    for (const type of ALL_TYPES) {
      expect(hasAnnotationCapability(type, "labelOffset")).toBe(true);
      expect(hasAnnotationCapability(type, "labelPlacement")).toBe(true);
      expect(hasAnnotationCapability(type, "zOrder")).toBe(true);
      expect(hasAnnotationCapability(type, "lock")).toBe(true);
      expect(hasAnnotationCapability(type, "visible")).toBe(true);
      expect(hasAnnotationCapability(type, "text")).toBe(true);
    }
  });

  it("gives a truthful reason exactly when a capability does not apply", () => {
    expect(annotationCapabilityDisabledReason("range", "stroke")).toBeUndefined();
    expect(annotationCapabilityDisabledReason("text", "stroke")).toContain("text");
    expect(annotationCapabilityDisabledReason("marker", "fill")).toContain("marker");
  });
});
