import { ANNOTATION_PRESENTATION_NUMERIC_RANGES, type AnnotationType } from "@timing-chart-v2/schema";

/** #378: one shared, mechanical Annotation Capability Matrix -- every GUI
 * surface (Ribbon / Inspector / Bottom Editor) must consult THIS instead of
 * deciding per-callsite whether a presentation control applies to the
 * currently selected AnnotationType, so a control can never be enabled
 * somewhere it has no observable canonical + rendered effect (#378's
 * "truthfulness rule": every visible control is exactly one of enabled-and-
 * real, disabled-with-a-reason, or hidden-because-inapplicable).
 *
 * Reflects ACTUAL current renderer/export support, not an aspirational one:
 * - stroke/fill are the only genuinely type-varying capabilities here.
 * - labelOffset/labelPlacement/zOrder/lock/visible/text are universal -- every
 *   Annotation rides the same generic anchor/History/ExportScene machinery
 *   regardless of type (confirmed by #377's audit and this issue's own
 *   audit: annotation.updateLabelOffset, annotation.bringToFront/
 *   sendToBack, annotation.setLocked and annotation.updateProperties'
 *   `visible` all operate on every AnnotationType with no type gate in
 *   packages/commands/src/planner.ts).
 *
 * Stroke (independent width/style) is supported by border-driven shapes,
 * routed SVG lines, Bracket, and Marker tick. Measurement/GhostTrace/
 * TimingRegion retain their own type-specific line or opacity semantics;
 * Fill is limited to the background-driven area shapes below. */
const STROKE_CAPABLE = new Set<AnnotationType>(["callout", "verticalLine", "range", "highlight", "rectangle", "ellipse", "arrow", "dependency", "connector", "bracket", "marker", "measurement"]);
const FILL_CAPABLE = new Set<AnnotationType>(["callout", "range", "highlight", "rectangle", "ellipse"]);

export type AnnotationCapability = "stroke" | "fill" | "text" | "labelOffset" | "labelPlacement" | "zOrder" | "lock" | "visible";

/** Defaults shown by the shared Inspector must describe the renderer's actual
 * appearance when a canonical style field is absent. Keep these per-type
 * values beside the capability policy so the UI does not invent different
 * values for the same presentation contract. */
export function annotationPresentationDefaults(type: AnnotationType): { readonly strokeWidth: number; readonly strokeOpacity: number; readonly fillOpacity: number } {
  const strokeWidth = type === "marker" ? 3
    : type === "range" || type === "highlight" || type === "rectangle" || type === "ellipse" ? 1
    : ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeWidth.default;
  const fillOpacity = type === "callout" ? 0.95 : type === "highlight" ? 0.32 : ANNOTATION_PRESENTATION_NUMERIC_RANGES.fillOpacity.default;
  return { strokeWidth, strokeOpacity: ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeOpacity.default, fillOpacity };
}

export function hasAnnotationCapability(type: AnnotationType, capability: AnnotationCapability): boolean {
  switch (capability) {
    case "stroke": return STROKE_CAPABLE.has(type);
    case "fill": return FILL_CAPABLE.has(type);
    case "text": case "labelOffset": case "labelPlacement": case "zOrder": case "lock": case "visible": return true;
  }
}

/** A truthful reason to show alongside a disabled control, or undefined
 * when the capability actually applies (nothing to disable). */
export function annotationCapabilityDisabledReason(type: AnnotationType, capability: AnnotationCapability): string | undefined {
  if (hasAnnotationCapability(type, capability)) return undefined;
  if (capability === "stroke") return `${type} has no independently stylable line/border in the current renderer.`;
  if (capability === "fill") return `${type} has no fillable area in the current renderer.`;
  return `${type} does not support ${capability}.`;
}
