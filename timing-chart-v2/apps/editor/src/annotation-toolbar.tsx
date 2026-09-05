import { useState } from "react";
import { MEASUREMENT_PROFILES, measurementProfilePair, type Annotation, type AnnotationType, type CanonicalDocument, type MeasurementProfile, type SignalId, type TransitionAnchorKind } from "@timing-chart-v2/schema";
import { createAnnotation, type MeasurementThresholdSpec } from "./create-annotation.js";

export function AnnotationToolbar({ document, range, signalId, onCreate, arrowPickStatus, onArmArrow }: { readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly signalId: SignalId | undefined; readonly onCreate: (annotation: Annotation) => void; readonly arrowPickStatus: "idle" | "from" | "to"; readonly onArmArrow: (annotationType: "arrow" | "dependency") => void }) {
  const [type, setType] = useState<AnnotationType>("text");
  const [measurementProfile, setMeasurementProfile] = useState<MeasurementProfile>("cycle");
  const [measurementKind, setMeasurementKind] = useState<TransitionAnchorKind>("threshold");
  const [customStart, setCustomStart] = useState("30");
  const [customEnd, setCustomEnd] = useState("70");
  const standardPair = measurementProfilePair(measurementProfile);
  const customPair = { start: Number(customStart) / 100, end: Number(customEnd) / 100 };
  const thresholdSpec: MeasurementThresholdSpec | undefined = type !== "measurement" || measurementProfile === "cycle" ? undefined : { profile: measurementProfile as Exclude<MeasurementProfile, "cycle">, anchorKind: measurementKind, ...(measurementProfile === "custom" ? customPair : standardPair!) };
  const customValid = measurementProfile !== "custom" || ([customPair.start, customPair.end].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) && customPair.start <= customPair.end);
  return <div className="annotation-toolbar" aria-label="Annotation tools" data-testid="annotation-toolbar">
    <strong>Annotation</strong>
    <select aria-label="Annotation type" value={type} onChange={(event) => setType(event.target.value as AnnotationType)}>
      {(["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace"] as const).map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    {type === "measurement" && <><label>Profile<select aria-label="Measurement threshold" data-testid="measurement-profile" value={measurementProfile} onChange={(event) => setMeasurementProfile(event.target.value as MeasurementProfile)}>{MEASUREMENT_PROFILES.map((profile) => <option key={profile} value={profile}>{profile === "cycle" ? "Cycle anchors" : profile === "50%" ? "50%" : profile === "custom" ? "Custom" : `${profile}%`}</option>)}</select></label>{measurementProfile !== "cycle" && <label>Meaning<select aria-label="Measurement anchor kind" value={measurementKind} onChange={(event) => setMeasurementKind(event.target.value as TransitionAnchorKind)}><option value="threshold">Transition threshold</option><option value="ratio">Transition ratio</option></select></label>}{measurementProfile === "custom" && <><label>Start %<input aria-label="Custom measurement start" type="number" min="0" max="100" step="1" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>End %<input aria-label="Custom measurement end" type="number" min="0" max="100" step="1" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></>}</>}
    <button type="button" disabled={!signalId || !customValid} title={signalId ? undefined : "No timing Signal is available in this document to anchor an Annotation."} onClick={() => signalId && onCreate(createAnnotation(type, signalId, range, document, thresholdSpec))}>Add annotation</button>
    {/* Picking real transition endpoints has always produced an "arrow"
        annotation regardless of the type dropdown above -- #375: it must
        also be able to produce a "dependency" (the other line-shaped type
        with real From/To semantic anchors) when that's the selected type,
        without changing this control's existing label/availability for
        every other type. */}
    <button type="button" className={arrowPickStatus === "idle" ? "" : "active"} onClick={() => onArmArrow(type === "dependency" ? "dependency" : "arrow")}>Pick arrow endpoints</button>
    {arrowPickStatus !== "idle" && <b data-testid="arrow-pick-status">Click {arrowPickStatus} transition</b>}
    <span>Uses selected Signal and Timeline range · drag handles snap to rendered geometry</span>
  </div>;
}
