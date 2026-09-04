import type { Annotation, AnnotationId, AnnotationType, CanonicalDocument, MeasurementProfile, SemanticAnchor, SignalId, TransitionAnchorKind } from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";

export interface MeasurementThresholdSpec { readonly profile: Exclude<MeasurementProfile, "cycle">; readonly anchorKind: TransitionAnchorKind; readonly start: number; readonly end: number }

export function createAnnotation(type: AnnotationType, signalId: SignalId, range: { readonly start: number; readonly end: number }, document: CanonicalDocument, thresholdSpec?: MeasurementThresholdSpec, arrowheadOverride?: Annotation["arrowhead"]): Annotation {
  const id = nextEntityId("annotation", document) as AnnotationId;
  const first: SemanticAnchor = { signalId, cycle: range.start, point: thresholdSpec ? "transition-center" : "cycle-start", ...(thresholdSpec ? { transition: { kind: thresholdSpec.anchorKind, value: thresholdSpec.start } } : {}) };
  const second: SemanticAnchor = { signalId, cycle: Math.max(range.start, range.end - 1), point: thresholdSpec ? "transition-center" : "cycle-end", ...(thresholdSpec ? { transition: { kind: thresholdSpec.anchorKind, value: thresholdSpec.end } } : {}) };
  const base = { id, type, label: `${type} ${range.start}`, visible: true, color: type === "ghostTrace" ? "#64748b" : "#d04a36", ...(type === "timingRegion" ? { opacity: 0.16 } : {}), ...(type === "ghostTrace" ? { sourceSignalId: signalId, traceOffsetCycles: 0, opacity: 0.55 } : {}), ...(type === "measurement" && thresholdSpec ? { measurement: { profile: thresholdSpec.profile, anchorKind: thresholdSpec.anchorKind } } : {}) } as const;
  if (type === "arrow" || type === "dependency" || type === "connector") return { ...base, from: first, to: second, lineType: "straight", arrowhead: arrowheadOverride ?? (type === "connector" ? "none" : "end") };
  if (["range", "bracket", "highlight", "measurement", "timingRegion", "ghostTrace", "rectangle", "ellipse"].includes(type)) return { ...base, start: first, end: second };
  return { ...base, anchor: first };
}
