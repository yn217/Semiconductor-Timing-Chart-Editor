import { describe, expect, it } from "vitest";
import type { AnnotationType } from "@timing-chart-v2/schema";
import { annotationCapabilityDisabledReason, annotationPresentationDefaults, hasAnnotationCapability } from "../../apps/editor/src/annotation-capability-matrix.js";

const ALL_TYPES: readonly AnnotationType[] = ["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace", "rectangle", "ellipse", "connector", "textbox"];

describe("Annotation Capability Matrix (#378)", () => {
  it("declares stroke/fill only for the CSS-border/background-driven area and line shapes", () => {
    expect(hasAnnotationCapability("range", "stroke")).toBe(true);
    expect(hasAnnotationCapability("highlight", "stroke")).toBe(true);
    expect(hasAnnotationCapability("verticalLine", "stroke")).toBe(true);
    expect(hasAnnotationCapability("rectangle", "stroke")).toBe(true);
    expect(hasAnnotationCapability("ellipse", "stroke")).toBe(true);
    expect(hasAnnotationCapability("dependency", "stroke")).toBe(true);
    expect(hasAnnotationCapability("bracket", "stroke")).toBe(true);
    expect(hasAnnotationCapability("marker", "stroke")).toBe(true);
    expect(hasAnnotationCapability("range", "fill")).toBe(true);
    expect(hasAnnotationCapability("callout", "fill")).toBe(true);
    expect(hasAnnotationCapability("callout", "stroke")).toBe(true);
    expect(hasAnnotationCapability("highlight", "fill")).toBe(true);
    expect(hasAnnotationCapability("rectangle", "fill")).toBe(true);
    expect(hasAnnotationCapability("ellipse", "fill")).toBe(true);
    // Text has no line semantics, while routed lines, Bracket, and Marker
    // expose real independently stylable strokes.
    expect(hasAnnotationCapability("text", "stroke")).toBe(false);
    expect(hasAnnotationCapability("marker", "fill")).toBe(false);
    expect(hasAnnotationCapability("arrow", "stroke")).toBe(true);
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

  it("shows the actual renderer defaults for each type-aware stroke and fill capability", () => {
    expect(annotationPresentationDefaults("range")).toMatchObject({ strokeWidth: 1, strokeOpacity: 1, fillOpacity: 0.12 });
    expect(annotationPresentationDefaults("highlight")).toMatchObject({ strokeWidth: 1, strokeOpacity: 1, fillOpacity: 0.32 });
    expect(annotationPresentationDefaults("marker")).toMatchObject({ strokeWidth: 3, strokeOpacity: 1 });
    expect(annotationPresentationDefaults("dependency")).toMatchObject({ strokeWidth: 2, strokeOpacity: 1 });
    expect(annotationPresentationDefaults("callout")).toMatchObject({ fillOpacity: 0.95 });
  });
});
