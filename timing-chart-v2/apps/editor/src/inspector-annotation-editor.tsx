import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { DEFAULT_MEASUREMENT_LAYOUT, MEASUREMENT_PROFILES, anchorTransitionFraction, measurementProfilePair } from "@timing-chart-v2/schema";
import type { Annotation, AnnotationId, CanonicalDocument, MeasurementLayout, MeasurementProfile, SemanticAnchor, SignalId, TransitionAnchorKind } from "@timing-chart-v2/schema";
import { MiniMap } from "./minimap.js";
import { StrokeFillToolbar } from "./stroke-fill-toolbar.js";
import { AnnotationLabelLayoutToolbar } from "./annotation-label-layout-toolbar.js";
import { annotationCapabilityDisabledReason } from "./annotation-capability-matrix.js";
import { annotationPropertiesBase } from "./annotation-style-command.js";
import { InspectorSection, InspectorFooter, PropertyToggle } from "./inspector-section.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { formatAnnotationAnchor } from "./annotation-anchor-format.js";

export function InspectorAnnotationEditor({ annotation, document, viewport, commands, onDelete, onCancel, onClose, onPreview }: { readonly annotation: Annotation; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly commands: EditorSurfaceCommandController; readonly onDelete: () => void; readonly onCancel: () => void; readonly onClose: () => void; readonly onPreview?: (annotationId: AnnotationId, draft: { readonly label?: string; readonly color?: string; readonly opacity?: number } | undefined) => void }) {
  type AnchorField = "anchor" | "start" | "end" | "from" | "to";
  const anchorFields: readonly AnchorField[] = (["anchor", "start", "end", "from", "to"] as const).filter((field) => (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[field] !== undefined);
  const firstAnchorField = anchorFields[0] ?? "anchor";
  const { state: sections, toggle } = useInspectorAccordion("annotation", { general: true, geometry: true, style: false });
  // Section 1: a compact "what's selected" summary -- Cycle range read off
  // whichever anchor fields this Annotation type actually has (a Rectangle
  // has start/end, an arrow/dependency has from/to, a marker/text/callout
  // has just anchor) rather than a fixed pair of fields every type shares.
  const rangeAnchors = anchorFields.map((field) => (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[field]).filter((value): value is SemanticAnchor => value !== undefined);
  const signalNames = new Map(document.signals.map((signal) => [signal.id, signal.display.name]));
  const rangeDetail = rangeAnchors.length >= 2
    ? `${formatAnnotationAnchor(rangeAnchors[0], signalNames)} – ${formatAnnotationAnchor(rangeAnchors[rangeAnchors.length - 1], signalNames)}`
    : rangeAnchors.length === 1 ? formatAnnotationAnchor(rangeAnchors[0], signalNames) : undefined;
  const typeLabel = annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1);
  const [label, setLabel] = useState(annotation.label);
  const [color, setColor] = useState(annotation.color ?? "#d04a36");
  const [visible, setVisible] = useState(annotation.visible);
  const [lineType, setLineType] = useState<NonNullable<Annotation["lineType"]>>(annotation.lineType ?? "straight");
  const [arrowhead, setArrowhead] = useState<NonNullable<Annotation["arrowhead"]>>(annotation.arrowhead ?? "end");
  const [labelX, setLabelX] = useState(annotation.labelOffset?.x ?? 0);
  const [labelY, setLabelY] = useState(annotation.labelOffset?.y ?? -14);
  const [opacity, setOpacity] = useState(annotation.opacity ?? (annotation.type === "ghostTrace" ? 0.55 : 0.16));
  const [traceOffsetCycles, setTraceOffsetCycles] = useState(annotation.traceOffsetCycles ?? 0);
  const [measurementProfile, setMeasurementProfile] = useState<MeasurementProfile>(annotation.measurement?.profile ?? "cycle");
  const [measurementKind, setMeasurementKind] = useState<TransitionAnchorKind>(annotation.measurement?.anchorKind ?? "threshold");
  const [measurementStart, setMeasurementStart] = useState(String(Math.round((anchorTransitionFraction(annotation.start) ?? 0.3) * 100)));
  const [measurementEnd, setMeasurementEnd] = useState(String(Math.round((anchorTransitionFraction(annotation.end) ?? 0.7) * 100)));
  const [measurementLayout, setMeasurementLayout] = useState<MeasurementLayout>(annotation.measurementLayout ?? DEFAULT_MEASUREMENT_LAYOUT);
  const [verticalSpanMode, setVerticalSpanMode] = useState<NonNullable<Annotation["verticalSpan"]>["mode"]>(annotation.verticalSpan?.mode ?? "auto");
  const [verticalSpanStartRowId, setVerticalSpanStartRowId] = useState<SignalId | undefined>(annotation.verticalSpan?.startRowId);
  const [verticalSpanEndRowId, setVerticalSpanEndRowId] = useState<SignalId | undefined>(annotation.verticalSpan?.endRowId);
  const [verticalSpanStartOffset, setVerticalSpanStartOffset] = useState(annotation.verticalSpan?.startOffset ?? 0);
  const [verticalSpanEndOffset, setVerticalSpanEndOffset] = useState(annotation.verticalSpan?.endOffset ?? 0);
  const [positionModeStatus, setPositionModeStatus] = useState("");
  const [previewRevision, setPreviewRevision] = useState(0);
  const [styleDraft, setStyleDraft] = useState(annotation.style);
  const canonicalDraftKey = JSON.stringify(annotation);
  const [anchorField, setAnchorField] = useState<AnchorField>(firstAnchorField);
  const initialAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[firstAnchorField];
  const [anchorX, setAnchorX] = useState(initialAnchor?.offset?.x ?? 0);
  const [anchorY, setAnchorY] = useState(initialAnchor?.offset?.y ?? 0);
  const [anchorCycle, setAnchorCycle] = useState(initialAnchor?.cycle ?? 0);
  const [anchorSignalId, setAnchorSignalId] = useState<SignalId | undefined>(initialAnchor?.signalId);
  const [anchorPoint, setAnchorPoint] = useState<SemanticAnchor["point"]>(initialAnchor?.point ?? "cycle-start");
  const lineControlsEnabled = annotation.type === "arrow" || annotation.type === "dependency";
  const isOpacityType = annotation.type === "timingRegion" || annotation.type === "ghostTrace";
  const defaultOpacity = annotation.type === "ghostTrace" ? 0.55 : 0.16;
  const measurementPairBase = measurementProfilePair(measurementProfile);
  const measurementPair = measurementProfile === "custom"
    ? { start: Number(measurementStart) / 100, end: Number(measurementEnd) / 100 }
    : measurementPairBase ?? { start: 0, end: 1 };
  const measurementDraftValid = measurementProfile !== "custom" || ([measurementPair.start, measurementPair.end].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) && measurementPair.start <= measurementPair.end);
  const verticalSpanDraft = { mode: verticalSpanMode, ...(verticalSpanMode === "rows" ? { startRowId: verticalSpanStartRowId, endRowId: verticalSpanEndRowId } : {}), ...(verticalSpanMode === "custom" ? { startOffset: verticalSpanStartOffset, endOffset: verticalSpanEndOffset } : {}) };
  const verticalSpanHasChanges = JSON.stringify(verticalSpanDraft) !== JSON.stringify(annotation.verticalSpan ?? { mode: "auto" });
  const verticalSpanValid = verticalSpanMode !== "rows" || (!!verticalSpanStartRowId && !!verticalSpanEndRowId);
  const setPositionMode = (mode: "cycle-snap" | "free") => {
    const result = commands.setAnnotationPositionMode(annotation.id, mode);
    setPositionModeStatus(result.ok || result.reason === "no-op" ? "" : result.problems[0]?.message ?? "Could not change position mode.");
  };
  const selectedAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[anchorField];
  const hasChanges = label !== annotation.label
    || color !== (annotation.color ?? "#d04a36")
    || visible !== annotation.visible
    || (lineControlsEnabled && (lineType !== (annotation.lineType ?? "straight") || arrowhead !== (annotation.arrowhead ?? "end")))
    || (isOpacityType && opacity !== (annotation.opacity ?? defaultOpacity))
    || (annotation.type === "ghostTrace" && traceOffsetCycles !== (annotation.traceOffsetCycles ?? 0))
    || labelX !== (annotation.labelOffset?.x ?? 0)
    || labelY !== (annotation.labelOffset?.y ?? -14)
    || JSON.stringify(styleDraft) !== JSON.stringify(annotation.style ?? {});
  // Spread the shared preserve-everything base FIRST -- this form only
  // exposes drafts for label/color/visible/lineType/arrowhead, so without
  // it, applying on a Timing Region/Ghost Trace/Comment-styled annotation
  // would silently drop its opacity/sourceSignalId/traceOffsetCycles/style
  // (this form has no draft for those, so it never overrides them -- only
  // the base's preserved value remains). One function used by both the
  // form's own onSubmit (Enter-to-apply from a text field) and the shared
  // InspectorFooter's Apply button, so there is still exactly one
  // mutation path, not two.
  const apply = (event?: React.FormEvent) => {
    event?.preventDefault();
    commands.updateAnnotationProperties({ annotationId: annotation.id, ...annotationPropertiesBase(annotation), label, visible, color, ...(lineControlsEnabled ? { lineType, arrowhead } : {}), ...(isOpacityType ? { opacity } : {}), ...(annotation.type === "ghostTrace" ? { sourceSignalId: annotation.sourceSignalId, traceOffsetCycles } : {}), labelOffset: { x: labelX, y: labelY }, style: styleDraft });
  };
  // #775: this one effect used to reload EVERY local draft field whenever ANY canonical field of this Annotation changed, so applying
  // one independent sub-editor (Anchor, Vertical Span, Measurement, Position Mode...) silently discarded an unrelated unapplied
  // General/Style draft. It now tracks each field's own last-synced canonical value in `baseRef`; on a same-Annotation canonical
  // change it only resyncs a field whose canonical value actually changed AND whose local draft is still clean (still equal to what
  // it was last synced from) -- a dirty field is left alone, exactly the "merge untouched fields" policy the Issue allows. Switching
  // to a different Annotation (a real entity change, not a partial commit) still does the full reset it always did.
  const baseRef = useRef<{
    id: AnnotationId; label: string; color: string; visible: boolean; lineType: NonNullable<Annotation["lineType"]>; arrowhead: NonNullable<Annotation["arrowhead"]>;
    labelX: number; labelY: number; opacity: number; traceOffsetCycles: number; measurementProfile: MeasurementProfile; measurementKind: TransitionAnchorKind;
    measurementStart: string; measurementEnd: string; measurementLayout: MeasurementLayout; verticalSpanMode: NonNullable<Annotation["verticalSpan"]>["mode"];
    verticalSpanStartRowId: SignalId | undefined; verticalSpanEndRowId: SignalId | undefined; verticalSpanStartOffset: number; verticalSpanEndOffset: number;
    styleDraft: Annotation["style"]; anchorField: AnchorField; anchorX: number; anchorY: number; anchorCycle: number; anchorSignalId: SignalId | undefined; anchorPoint: SemanticAnchor["point"];
  } | undefined>(undefined);
  useEffect(() => {
    const anchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[firstAnchorField];
    const next = {
      id: annotation.id, label: annotation.label, color: annotation.color ?? "#d04a36", visible: annotation.visible,
      lineType: annotation.lineType ?? "straight", arrowhead: annotation.arrowhead ?? "end",
      labelX: annotation.labelOffset?.x ?? 0, labelY: annotation.labelOffset?.y ?? -14,
      opacity: annotation.opacity ?? (annotation.type === "ghostTrace" ? 0.55 : 0.16), traceOffsetCycles: annotation.traceOffsetCycles ?? 0,
      measurementProfile: annotation.measurement?.profile ?? "cycle", measurementKind: annotation.measurement?.anchorKind ?? "threshold",
      measurementStart: String(Math.round((anchorTransitionFraction(annotation.start) ?? 0.3) * 100)),
      measurementEnd: String(Math.round((anchorTransitionFraction(annotation.end) ?? 0.7) * 100)),
      measurementLayout: annotation.measurementLayout ?? DEFAULT_MEASUREMENT_LAYOUT,
      verticalSpanMode: annotation.verticalSpan?.mode ?? "auto", verticalSpanStartRowId: annotation.verticalSpan?.startRowId, verticalSpanEndRowId: annotation.verticalSpan?.endRowId,
      verticalSpanStartOffset: annotation.verticalSpan?.startOffset ?? 0, verticalSpanEndOffset: annotation.verticalSpan?.endOffset ?? 0,
      styleDraft: annotation.style, anchorField: firstAnchorField, anchorX: anchor?.offset?.x ?? 0, anchorY: anchor?.offset?.y ?? 0,
      anchorCycle: anchor?.cycle ?? 0, anchorSignalId: anchor?.signalId, anchorPoint: anchor?.point ?? "cycle-start",
    };
    const prev = baseRef.current;
    const sameEntity = prev !== undefined && prev.id === annotation.id;
    /** Resync one field only when ITS canonical value changed and the local draft was clean (still equal to the OLD canonical). A
     * dirty (still-being-edited) field is preserved -- its baseline still advances so `hasChanges` compares against current Canonical. */
    const merge = <K extends keyof typeof next>(key: K, current: (typeof next)[K], setLocal: (value: (typeof next)[K]) => void, eq: (a: (typeof next)[K], b: (typeof next)[K]) => boolean = (a, b) => a === b) => {
      if (!sameEntity) { setLocal(next[key]); return; }
      const changed = !eq(prev![key], next[key]);
      const clean = eq(current, prev![key]);
      if (changed && clean) setLocal(next[key]);
    };
    const jsonEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    merge("label", label, setLabel);
    merge("color", color, setColor);
    merge("visible", visible, setVisible);
    merge("lineType", lineType, setLineType);
    merge("arrowhead", arrowhead, setArrowhead);
    merge("labelX", labelX, setLabelX);
    merge("labelY", labelY, setLabelY);
    merge("opacity", opacity, setOpacity);
    merge("traceOffsetCycles", traceOffsetCycles, setTraceOffsetCycles);
    merge("measurementProfile", measurementProfile, setMeasurementProfile);
    merge("measurementKind", measurementKind, setMeasurementKind);
    merge("measurementStart", measurementStart, setMeasurementStart);
    merge("measurementEnd", measurementEnd, setMeasurementEnd);
    merge("measurementLayout", measurementLayout, setMeasurementLayout, jsonEq);
    merge("verticalSpanMode", verticalSpanMode, setVerticalSpanMode);
    merge("verticalSpanStartRowId", verticalSpanStartRowId, setVerticalSpanStartRowId);
    merge("verticalSpanEndRowId", verticalSpanEndRowId, setVerticalSpanEndRowId);
    merge("verticalSpanStartOffset", verticalSpanStartOffset, setVerticalSpanStartOffset);
    merge("verticalSpanEndOffset", verticalSpanEndOffset, setVerticalSpanEndOffset);
    merge("styleDraft", styleDraft, setStyleDraft, jsonEq);
    merge("anchorField", anchorField, setAnchorField);
    merge("anchorX", anchorX, setAnchorX);
    merge("anchorY", anchorY, setAnchorY);
    merge("anchorCycle", anchorCycle, setAnchorCycle);
    merge("anchorSignalId", anchorSignalId, setAnchorSignalId);
    merge("anchorPoint", anchorPoint, setAnchorPoint);
    baseRef.current = next;
    if (!sameEntity) { setPositionModeStatus(""); setPreviewRevision(0); }
    onPreview?.(annotation.id, undefined);
    return () => onPreview?.(annotation.id, undefined);
  }, [annotation.id, canonicalDraftKey, firstAnchorField, onPreview]);
  return <aside className="inspector" data-testid="inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
      <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader kind="Annotation" title={label || typeLabel} detail={rangeDetail ? `${typeLabel} · ${rangeDetail}` : typeLabel} />
    <form className="inspector-annotation-properties" aria-label="Inspector Annotation" data-testid="annotation-editor" data-annotation-id={annotation.id} onSubmit={apply}>
      <InspectorSection sectionId="general" title="General" open={sections.general ?? true} onToggle={() => toggle("general")}><div className="property-row"><span>Type</span><b>{annotation.type}</b></div><label>Label<textarea aria-label="Annotation label" rows={label.includes("\n") ? Math.min(6, label.split("\n").length + 1) : 2} value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Color<input aria-label="Annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><PropertyToggle label="Visible" ariaLabel="Annotation visible" checked={visible} onChange={setVisible} /></InspectorSection>
      <InspectorSection sectionId="annotation-specific" title="Type-specific / Label Layout" open={sections["annotation-specific"] ?? true} onToggle={() => toggle("annotation-specific")}>
        {isOpacityType && <label>Opacity<input aria-label="Annotation opacity" type="number" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
        {annotation.type === "ghostTrace" && <><div className="property-row"><span>Source Signal</span><b>{document.signals.find((signal) => signal.id === annotation.sourceSignalId)?.display.name ?? annotation.sourceSignalId ?? "Missing"}</b></div><label>Cycle Offset<input aria-label="Ghost Trace cycle offset" type="number" step="1" value={traceOffsetCycles} onChange={(event) => setTraceOffsetCycles(Number(event.target.value))} /></label></>}
        <label>Label X offset<input aria-label="Annotation label X" type="number" value={labelX} onChange={(event) => setLabelX(Number(event.target.value))} /></label>
        <label>Label Y offset<input aria-label="Annotation label Y" type="number" value={labelY} onChange={(event) => setLabelY(Number(event.target.value))} /></label>
        <button type="button" onClick={() => { commands.resetAnnotationOffsets(annotation.id); setLabelX(0); setLabelY(-14); setAnchorX(0); setAnchorY(0); }}>Reset offsets</button>
        {annotation.type === "measurement" && <section className="annotation-measurement-editor" aria-label="Measurement semantics"><strong>Transition measurement</strong><label>Profile<select aria-label="Measurement profile" value={measurementProfile} onChange={(event) => setMeasurementProfile(event.target.value as MeasurementProfile)}>{MEASUREMENT_PROFILES.map((profile) => <option key={profile} value={profile}>{profile === "cycle" ? "Cycle anchors" : profile === "custom" ? "Custom" : profile}</option>)}</select></label>{measurementProfile !== "cycle" && <label>Meaning<select aria-label="Measurement anchor kind" value={measurementKind} onChange={(event) => setMeasurementKind(event.target.value as TransitionAnchorKind)}><option value="threshold">Transition threshold</option><option value="ratio">Transition ratio</option></select></label>}{measurementProfile === "custom" && <><label>Start %<input aria-label="Custom measurement start" type="number" min="0" max="100" step="1" value={measurementStart} onChange={(event) => setMeasurementStart(event.target.value)} /></label><label>End %<input aria-label="Custom measurement end" type="number" min="0" max="100" step="1" value={measurementEnd} onChange={(event) => setMeasurementEnd(event.target.value)} /></label></>}<label>Start marker<select aria-label="Measurement start marker" value={measurementLayout.startMarker} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, startMarker: event.target.value as MeasurementLayout["startMarker"] }))}><option value="none">None</option><option value="bar">Bar</option><option value="arrow">Arrow</option></select></label><label>End marker<select aria-label="Measurement end marker" value={measurementLayout.endMarker} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, endMarker: event.target.value as MeasurementLayout["endMarker"] }))}><option value="none">None</option><option value="bar">Bar</option><option value="arrow">Arrow</option></select></label><label>Arrow layout<select aria-label="Measurement arrow layout" value={measurementLayout.arrowLayout} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, arrowLayout: event.target.value as MeasurementLayout["arrowLayout"] }))}><option value="auto">Auto</option><option value="inward">Inward</option><option value="outward">Outward</option></select></label><label>Extensions<select aria-label="Measurement extension lines" value={measurementLayout.extensionLines} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, extensionLines: event.target.value as MeasurementLayout["extensionLines"] }))}><option value="both">Both</option><option value="start">Start</option><option value="end">End</option><option value="none">None</option></select></label><label>Lane<input aria-label="Measurement lane" type="number" min="0" step="1" value={measurementLayout.lane ?? ""} onChange={(event) => setMeasurementLayout((layout) => { if (event.target.value === "") { const { lane: _lane, ...withoutLane } = layout; return withoutLane; } return { ...layout, lane: Number(event.target.value) }; })} /></label><button type="button" data-testid="apply-measurement-semantics" disabled={!measurementDraftValid} onClick={() => commands.updateAnnotationMeasurement({ annotationId: annotation.id, profile: measurementProfile, anchorKind: measurementKind, start: measurementPair.start, end: measurementPair.end, layout: measurementLayout })}>Apply measurement</button></section>}
        {annotation.type === "highlight" && <section className="annotation-position-mode-editor" aria-label="Highlight position mode section"><strong>Position Mode</strong><label>Mode<select aria-label="Highlight position mode" value={annotation.positionMode ?? "cycle-snap"} onChange={(event) => setPositionMode(event.target.value as "cycle-snap" | "free")}><option value="cycle-snap">Cycle Snap</option><option value="free">Free</option></select></label>{positionModeStatus && <p role="alert">{positionModeStatus}</p>}</section>}
        {annotation.type === "marker" && <section className="annotation-vertical-span-editor" aria-label="Marker vertical span"><strong>Vertical span</strong><label>Mode<select aria-label="Marker vertical span mode" value={verticalSpanMode} onChange={(event) => setVerticalSpanMode(event.target.value as typeof verticalSpanMode)}><option value="auto">Auto (full height)</option><option value="rows">Rows</option><option value="custom">Custom offsets</option></select></label>{verticalSpanMode === "rows" && <><label>Start Row<select aria-label="Marker vertical span start row" value={verticalSpanStartRowId ?? ""} onChange={(event) => setVerticalSpanStartRowId((event.target.value || undefined) as SignalId | undefined)}><option value="">Select a Signal…</option>{document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label><label>End Row<select aria-label="Marker vertical span end row" value={verticalSpanEndRowId ?? ""} onChange={(event) => setVerticalSpanEndRowId((event.target.value || undefined) as SignalId | undefined)}><option value="">Select a Signal…</option>{document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label></>}{verticalSpanMode === "custom" && <><label>Start Offset<input aria-label="Marker vertical span start offset" type="number" value={verticalSpanStartOffset} onChange={(event) => setVerticalSpanStartOffset(Number(event.target.value))} /></label><label>End Offset<input aria-label="Marker vertical span end offset" type="number" value={verticalSpanEndOffset} onChange={(event) => setVerticalSpanEndOffset(Number(event.target.value))} /></label></>}<button type="button" data-testid="apply-marker-vertical-span" disabled={!verticalSpanHasChanges || !verticalSpanValid} onClick={() => commands.updateAnnotationVerticalSpan({ annotationId: annotation.id, verticalSpan: verticalSpanDraft as NonNullable<Annotation["verticalSpan"]> })}>Apply vertical span</button></section>}
      </InspectorSection>
      <InspectorSection sectionId="geometry" title="Geometry / Anchor" open={sections.geometry ?? true} onToggle={() => toggle("geometry")}><div className="property-row"><span>Anchor</span><span>{selectedAnchor?.point ?? "—"}</span></div><div className="annotation-anchor-editor" aria-label="Inspector Annotation Anchor"><label>Endpoint<select aria-label="Inspector annotation endpoint" value={anchorField} onChange={(event) => { const nextField = event.target.value as AnchorField; const nextAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[nextField]; setAnchorField(nextField); setAnchorX(nextAnchor?.offset?.x ?? 0); setAnchorY(nextAnchor?.offset?.y ?? 0); setAnchorCycle(nextAnchor?.cycle ?? 0); setAnchorSignalId(nextAnchor?.signalId); setAnchorPoint(nextAnchor?.point ?? "cycle-start"); }}>{anchorFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label><label>Signal<select aria-label="Inspector annotation anchor signal" value={anchorSignalId ?? ""} onChange={(event) => setAnchorSignalId((event.target.value || undefined) as SignalId | undefined)}><option value="">(none)</option>{document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label><label>Cycle<input aria-label="Inspector annotation anchor cycle" type="number" min="0" max={document.timeline.cycleCount - 1} step={annotation.type === "highlight" && annotation.positionMode === "free" ? "0.01" : "1"} value={anchorCycle} onChange={(event) => setAnchorCycle(Number(event.target.value))} /></label><label>Point<select aria-label="Inspector annotation anchor point" value={anchorPoint} onChange={(event) => setAnchorPoint(event.target.value as SemanticAnchor["point"])}>{(["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"] as const).map((point) => <option key={point} value={point}>{point}</option>)}</select></label><label>X offset<input aria-label="Inspector annotation anchor X" type="number" value={anchorX} onChange={(event) => setAnchorX(Number(event.target.value))} /></label><label>Y offset<input aria-label="Inspector annotation anchor Y" type="number" value={anchorY} onChange={(event) => setAnchorY(Number(event.target.value))} /></label><button type="button" data-testid="apply-inspector-annotation-anchor" disabled={!selectedAnchor} onClick={() => { if (selectedAnchor) commands.setAnnotationAnchor(annotation.id, anchorField, { ...selectedAnchor, ...(anchorSignalId === undefined ? {} : { signalId: anchorSignalId }), cycle: anchorCycle, point: anchorPoint, offset: { x: anchorX, y: anchorY } }); }}>Apply Anchor</button></div></InspectorSection>
      <InspectorSection sectionId="style" title="Style" open={sections.style ?? false} onToggle={() => toggle("style")}>
        <StrokeFillToolbar idPrefix="inspector-stroke-fill" style={styleDraft} onChange={setStyleDraft} strokeDisabled={!!annotationCapabilityDisabledReason(annotation.type, "stroke")} strokeReason={annotationCapabilityDisabledReason(annotation.type, "stroke")} fillDisabled={!!annotationCapabilityDisabledReason(annotation.type, "fill")} fillReason={annotationCapabilityDisabledReason(annotation.type, "fill")} />
        <AnnotationLabelLayoutToolbar idPrefix="inspector-annotation-label-layout" style={styleDraft} onChange={setStyleDraft} />
        {lineControlsEnabled && <><label>Line<select aria-label="Annotation line type" value={lineType} onChange={(event) => setLineType(event.target.value as typeof lineType)}><option value="straight">Straight</option><option value="orthogonal">Orthogonal</option><option value="curve">Curve</option><option value="diagonal">Diagonal</option></select></label><label>Arrow<select aria-label="Annotation arrowhead" value={arrowhead} onChange={(event) => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">End</option><option value="start">Start</option><option value="bidirectional">Both</option><option value="none">None</option></select></label></>}</InspectorSection>
      <section className="inspector-annotation-preview"><button type="button" data-testid="annotation-preview-action" onClick={() => { setPreviewRevision((value) => value + 1); onPreview?.(annotation.id, { label, color, ...(isOpacityType ? { opacity } : {}) }); }}>Preview draft only</button><output data-testid="annotation-preview-status">{previewRevision === 0 ? "Preview ready" : `Previewing draft (updated ${previewRevision}) · canonical data unchanged`}</output></section>
      <section><button type="button" className="danger" onClick={onDelete}>Delete Annotation</button></section>
      <InspectorFooter onCancel={onCancel} onApply={apply} applyDisabled={!hasChanges} applyTestId="apply-annotation-properties" />
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}
