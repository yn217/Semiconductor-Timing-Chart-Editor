import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, CommandId, JsonObject } from "@timing-chart-v2/schema";

/** annotation.updateProperties replaces the full property set (any field
 * omitted here is dropped, not left alone) -- this computes the
 * type-conditional field set every caller needs to carry through unchanged,
 * so the Bottom Editor's Font toolbar, the Ribbon's Font group, and the
 * Annotation list's visibility toggle can't drift apart on which fields
 * they send. Callers spread this and override just the field they're
 * actually changing. */
function annotationPropertiesBase(annotation: Annotation) {
  return {
    label: annotation.label,
    visible: annotation.visible,
    ...(annotation.color === undefined ? {} : { color: annotation.color }),
    ...(annotation.type === "arrow" ? { lineType: annotation.lineType ?? "straight", arrowhead: annotation.arrowhead ?? "end" } : {}),
    ...(["timingRegion", "ghostTrace"].includes(annotation.type) ? { opacity: annotation.opacity ?? 0.16 } : {}),
    ...(annotation.type === "ghostTrace" ? { sourceSignalId: annotation.sourceSignalId, traceOffsetCycles: annotation.traceOffsetCycles ?? 0 } : {}),
  } as const;
}

/** Builds an annotation.updateProperties command that changes only `style`,
 * carrying every other currently-saved property through unchanged. */
export function buildAnnotationStyleCommand(annotation: Annotation, style: JsonObject, id: CommandId): SemanticCommand {
  return { id, type: "annotation.updateProperties", annotationId: annotation.id, ...annotationPropertiesBase(annotation), style };
}

/** Builds an annotation.updateProperties command that flips only `visible`,
 * carrying every other currently-saved property (including `style`)
 * through unchanged. */
export function buildAnnotationVisibilityCommand(annotation: Annotation, visible: boolean, id: CommandId): SemanticCommand {
  return { id, type: "annotation.updateProperties", annotationId: annotation.id, ...annotationPropertiesBase(annotation), visible, ...(annotation.style === undefined ? {} : { style: annotation.style }) };
}
