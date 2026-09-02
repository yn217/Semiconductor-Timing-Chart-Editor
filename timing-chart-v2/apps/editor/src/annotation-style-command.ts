import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, CommandId, JsonObject } from "@timing-chart-v2/schema";

/** Builds an annotation.updateProperties command that changes only `style`,
 * carrying every other currently-saved property through unchanged.
 * annotation.updateProperties replaces the full property set (any field
 * omitted here is dropped, not left alone) -- one place computing this
 * type-conditional field set so the Bottom Editor's Font toolbar and the
 * Ribbon's Font group can't drift apart on which fields they send. */
export function buildAnnotationStyleCommand(annotation: Annotation, style: JsonObject, id: CommandId): SemanticCommand {
  return {
    id,
    type: "annotation.updateProperties",
    annotationId: annotation.id,
    label: annotation.label,
    visible: annotation.visible,
    ...(annotation.color === undefined ? {} : { color: annotation.color }),
    ...(annotation.type === "arrow" ? { lineType: annotation.lineType ?? "straight", arrowhead: annotation.arrowhead ?? "end" } : {}),
    ...(["timingRegion", "ghostTrace"].includes(annotation.type) ? { opacity: annotation.opacity ?? 0.16 } : {}),
    ...(annotation.type === "ghostTrace" ? { sourceSignalId: annotation.sourceSignalId, traceOffsetCycles: annotation.traceOffsetCycles ?? 0 } : {}),
    style,
  };
}
