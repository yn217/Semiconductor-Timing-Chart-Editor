import { useState } from "react";
import type { Annotation, AnnotationType, CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { createAnnotation } from "./create-annotation.js";

export function AnnotationToolbar({ document, range, signalId, onCreate, arrowPickStatus, onArmArrow }: { readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly signalId: SignalId | undefined; readonly onCreate: (annotation: Annotation) => void; readonly arrowPickStatus: "idle" | "from" | "to"; readonly onArmArrow: () => void }) {
  const [type, setType] = useState<AnnotationType>("text");
  const [measurementThreshold, setMeasurementThreshold] = useState<"none" | "30-70">("none");
  const thresholdPair = measurementThreshold === "30-70" ? { start: 0.3, end: 0.7 } : undefined;
  return <div className="annotation-toolbar" aria-label="Annotation tools" data-testid="annotation-toolbar">
    <strong>Annotation</strong>
    <select aria-label="Annotation type" value={type} onChange={(event) => setType(event.target.value as AnnotationType)}>
      {(["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace"] as const).map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    {type === "measurement" && <label>Threshold<select aria-label="Measurement threshold" value={measurementThreshold} onChange={(event) => setMeasurementThreshold(event.target.value as "none" | "30-70")}><option value="none">Cycle anchors</option><option value="30-70">30% → 70%</option></select></label>}
    <button type="button" disabled={!signalId} title={signalId ? undefined : "No timing Signal is available in this document to anchor an Annotation."} onClick={() => signalId && onCreate(createAnnotation(type, signalId, range, document, thresholdPair))}>Add annotation</button>
    <button type="button" className={arrowPickStatus === "idle" ? "" : "active"} onClick={onArmArrow}>Pick arrow endpoints</button>
    {arrowPickStatus !== "idle" && <b data-testid="arrow-pick-status">Click {arrowPickStatus} transition</b>}
    <span>Uses selected Signal and Timeline range · drag handles snap to rendered geometry</span>
  </div>;
}
