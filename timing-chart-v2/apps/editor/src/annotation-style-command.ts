import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, CommandId, JsonObject } from "@timing-chart-v2/schema";

/** annotation.updateProperties replaces the full property set the command
 * carries (any of THESE fields omitted is dropped, not left alone) -- this
 * computes the complete "carry every currently-saved field through
 * unchanged" base every caller needs, so the Bottom Editor's Font toolbar,
 * the Ribbon's Font group, the Annotation list's visibility toggle, the
 * Bottom/Inspector full-properties forms, and any future caller can't drift
 * apart on which fields they send. Callers spread this and override just
 * the field(s) they're actually changing.
 *
 * Preserves whatever is CURRENTLY set on the annotation, rather than
 * gating by annotation.type -- lineType/arrowhead/opacity/sourceSignalId/
 * traceOffsetCycles are schema-generic optional fields (Annotation
 * interface), not restricted to one type, so a type-gated allowlist here
 * silently dropped them for any other type that happened to carry a value
 * (e.g. a Dependency or Connector annotation's arrowhead was deleted by an
 * unrelated Font edit, since the command's omitted field is overwritten
 * with `undefined` and then filtered out by the planner -- see
 * packages/commands/src/planner.ts's "annotation.updateProperties" case).
 * Does NOT inject a type-based default for a field that isn't already set;
 * a Font-only edit must never introduce a new value the annotation didn't
 * have before, only preserve or change what it did have. */
export function annotationPropertiesBase(annotation: Annotation) {
  return {
    label: annotation.label,
    visible: annotation.visible,
    ...(annotation.color === undefined ? {} : { color: annotation.color }),
    ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }),
    ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }),
    ...(annotation.sourceSignalId === undefined ? {} : { sourceSignalId: annotation.sourceSignalId }),
    ...(annotation.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: annotation.traceOffsetCycles }),
    ...(annotation.opacity === undefined ? {} : { opacity: annotation.opacity }),
    ...(annotation.style === undefined ? {} : { style: annotation.style }),
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
  return { id, type: "annotation.updateProperties", annotationId: annotation.id, ...annotationPropertiesBase(annotation), visible };
}
