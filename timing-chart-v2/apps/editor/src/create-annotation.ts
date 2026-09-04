import type { Annotation, AnnotationId, AnnotationType, CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";

export function createAnnotation(type: AnnotationType, signalId: SignalId, range: { readonly start: number; readonly end: number }, document: CanonicalDocument, thresholdPair?: { readonly start: number; readonly end: number }, arrowheadOverride?: Annotation["arrowhead"]): Annotation {
  const id = nextEntityId("annotation", document) as AnnotationId;
  const first: SemanticAnchor = { signalId, cycle: range.start, point: thresholdPair ? "transition-center" : "cycle-start", ...(thresholdPair ? { threshold: thresholdPair.start } : {}) };
  const second: SemanticAnchor = { signalId, cycle: Math.max(range.start, range.end - 1), point: thresholdPair ? "transition-center" : "cycle-end", ...(thresholdPair ? { threshold: thresholdPair.end } : {}) };
  const base = { id, type, label: `${type} ${range.start}`, visible: true, color: type === "ghostTrace" ? "#64748b" : "#d04a36", ...(type === "timingRegion" ? { opacity: 0.16 } : {}), ...(type === "ghostTrace" ? { sourceSignalId: signalId, traceOffsetCycles: 0, opacity: 0.55 } : {}) } as const;
  if (type === "arrow" || type === "dependency" || type === "connector") return { ...base, from: first, to: second, lineType: "straight", arrowhead: arrowheadOverride ?? (type === "connector" ? "none" : "end") };
  if (["range", "bracket", "highlight", "measurement", "timingRegion", "ghostTrace", "rectangle", "ellipse"].includes(type)) return { ...base, start: first, end: second };
  return { ...base, anchor: first };
}
