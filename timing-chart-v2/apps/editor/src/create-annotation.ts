import { DEFAULT_MEASUREMENT_LAYOUT, type Annotation, type AnnotationId, type AnnotationType, type CanonicalDocument, type MeasurementProfile, type SemanticAnchor, type Signal, type SignalId, type TransitionAnchorKind } from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";

export interface MeasurementThresholdSpec { readonly profile: Exclude<MeasurementProfile, "cycle">; readonly anchorKind: TransitionAnchorKind; readonly start: number; readonly end: number }

/** Editor-side mirror of the anchor point/signal rules enforced by `validateAnchor` in packages/schema/src/validation.ts, so
 * the Inspector only offers points that commit and the Ribbon can refuse a combination before it is created. Keep in sync
 * with that validator (the commit path is still the authority). `signalType` is the target Signal's type, or `undefined`
 * when the anchor has no signalId. */
export function anchorPointFitsSignalType(point: SemanticAnchor["point"], signalType: Signal["type"] | undefined): boolean {
  if (signalType === "commentRow") return false;
  if (signalType === undefined) return !["rising-edge", "falling-edge", "value-start", "value-center", "row-center"].includes(point);
  if ((point === "value-start" || point === "value-center") && signalType === "clock") return false;
  if ((point === "rising-edge" || point === "falling-edge") && (signalType === "bus" || signalType === "state" || signalType === "event")) return false;
  if ((point === "transition-start" || point === "transition-center" || point === "transition-end") && signalType === "clock") return false;
  return true;
}

export function createAnnotation(type: AnnotationType, signalId: SignalId, range: { readonly start: number; readonly end: number }, document: CanonicalDocument, thresholdSpec?: MeasurementThresholdSpec, arrowheadOverride?: Annotation["arrowhead"]): Annotation {
  const id = nextEntityId("annotation", document) as AnnotationId;
  const first: SemanticAnchor = { signalId, cycle: range.start, point: thresholdSpec ? "transition-center" : "cycle-start", ...(thresholdSpec ? { transition: { kind: thresholdSpec.anchorKind, value: thresholdSpec.start } } : {}) };
  const second: SemanticAnchor = { signalId, cycle: Math.max(range.start, range.end - 1), point: thresholdSpec ? "transition-center" : "cycle-end", ...(thresholdSpec ? { transition: { kind: thresholdSpec.anchorKind, value: thresholdSpec.end } } : {}) };
  const base = { id, type, label: `${type} ${range.start}`, visible: true, color: type === "ghostTrace" ? "#64748b" : "#d04a36", ...(type === "timingRegion" ? { opacity: 0.16 } : {}), ...(type === "ghostTrace" ? { sourceSignalId: signalId, traceOffsetCycles: 0, opacity: 0.55 } : {}), ...(type === "measurement" ? { measurementLayout: DEFAULT_MEASUREMENT_LAYOUT, ...(thresholdSpec ? { measurement: { profile: thresholdSpec.profile, anchorKind: thresholdSpec.anchorKind } } : {}) } : {}) } as const;
  if (type === "arrow" || type === "dependency" || type === "connector") return { ...base, from: first, to: second, lineType: "straight", arrowhead: arrowheadOverride ?? (type === "connector" ? "none" : "end") };
  if (["range", "bracket", "highlight", "measurement", "timingRegion", "ghostTrace", "rectangle", "ellipse"].includes(type)) return { ...base, start: first, end: second };
  return { ...base, anchor: first };
}
