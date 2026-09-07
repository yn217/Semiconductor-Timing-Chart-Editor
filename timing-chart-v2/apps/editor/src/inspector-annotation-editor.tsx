import { useState } from "react";
import type { RefObject } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { MiniMap } from "./minimap.js";
import { StrokeFillToolbar } from "./stroke-fill-toolbar.js";
import { annotationCapabilityDisabledReason } from "./annotation-capability-matrix.js";
import { annotationPropertiesBase, buildAnnotationStyleCommand } from "./annotation-style-command.js";
import { InspectorSection, InspectorFooter, PropertyToggle } from "./inspector-section.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";

export function InspectorAnnotationEditor({ annotation, document, viewport, onCommand, onDelete, onCancel, onClose }: { readonly annotation: Annotation; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onDelete: () => void; readonly onCancel: () => void; readonly onClose: () => void }) {
  type AnchorField = "anchor" | "start" | "end" | "from" | "to";
  const anchorFields: readonly AnchorField[] = (["anchor", "start", "end", "from", "to"] as const).filter((field) => (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[field] !== undefined);
  const firstAnchorField = anchorFields[0] ?? "anchor";
  const { state: sections, toggle } = useInspectorAccordion("annotation", { general: true, geometry: true, style: false });
  // Section 1: a compact "what's selected" summary -- Cycle range read off
  // whichever anchor fields this Annotation type actually has (a Rectangle
  // has start/end, an arrow/dependency has from/to, a marker/text/callout
  // has just anchor) rather than a fixed pair of fields every type shares.
  const rangeAnchors = anchorFields.map((field) => (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[field]).filter((value): value is SemanticAnchor => value !== undefined);
  const rangeDetail = rangeAnchors.length >= 2
    ? `Cycle ${rangeAnchors[0]!.cycle}–${rangeAnchors[rangeAnchors.length - 1]!.cycle}`
    : rangeAnchors.length === 1 ? `Cycle ${rangeAnchors[0]!.cycle}` : undefined;
  const typeLabel = annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1);
  const [label, setLabel] = useState(annotation.label);
  const [color, setColor] = useState(annotation.color ?? "#d04a36");
  const [visible, setVisible] = useState(annotation.visible);
  const [lineType, setLineType] = useState<NonNullable<Annotation["lineType"]>>(annotation.lineType ?? "straight");
  const [arrowhead, setArrowhead] = useState<NonNullable<Annotation["arrowhead"]>>(annotation.arrowhead ?? "end");
  const [anchorField, setAnchorField] = useState<AnchorField>(firstAnchorField);
  const initialAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[firstAnchorField];
  const [anchorX, setAnchorX] = useState(initialAnchor?.offset?.x ?? 0);
  const [anchorY, setAnchorY] = useState(initialAnchor?.offset?.y ?? 0);
  const [anchorCycle, setAnchorCycle] = useState(initialAnchor?.cycle ?? 0);
  const [anchorSignalId, setAnchorSignalId] = useState<SignalId | undefined>(initialAnchor?.signalId);
  const [anchorPoint, setAnchorPoint] = useState<SemanticAnchor["point"]>(initialAnchor?.point ?? "cycle-start");
  const lineControlsEnabled = annotation.type === "arrow" || annotation.type === "dependency";
  const selectedAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[anchorField];
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
    onCommand({ id: nextCommandId("inspector_annotation_properties"), type: "annotation.updateProperties", annotationId: annotation.id, ...annotationPropertiesBase(annotation), label, visible, color, ...(lineControlsEnabled ? { lineType, arrowhead } : {}) });
  };
  return <aside className="inspector" data-testid="inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader kind="Annotation" title={label || typeLabel} detail={rangeDetail ? `${typeLabel} · ${rangeDetail}` : typeLabel} />
    <form className="inspector-annotation-properties" aria-label="Inspector Annotation" onSubmit={apply}>
      <InspectorSection sectionId="general" title="General" open={sections.general ?? true} onToggle={() => toggle("general")}><div className="property-row"><span>Type</span><b>{annotation.type}</b></div><label>Label<textarea aria-label="Inspector annotation label" rows={label.includes("\n") ? Math.min(6, label.split("\n").length + 1) : 2} value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Color<input aria-label="Inspector annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><PropertyToggle label="Visible" ariaLabel="Inspector annotation visible" checked={visible} onChange={setVisible} /></InspectorSection>
      <InspectorSection sectionId="geometry" title="Geometry / Anchor" open={sections.geometry ?? true} onToggle={() => toggle("geometry")}><div className="property-row"><span>Anchor</span><span>{selectedAnchor?.point ?? "—"}</span></div><div className="annotation-anchor-editor" aria-label="Inspector Annotation Anchor"><label>Endpoint<select aria-label="Inspector annotation endpoint" value={anchorField} onChange={(event) => { const nextField = event.target.value as AnchorField; const nextAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[nextField]; setAnchorField(nextField); setAnchorX(nextAnchor?.offset?.x ?? 0); setAnchorY(nextAnchor?.offset?.y ?? 0); setAnchorCycle(nextAnchor?.cycle ?? 0); setAnchorSignalId(nextAnchor?.signalId); setAnchorPoint(nextAnchor?.point ?? "cycle-start"); }}>{anchorFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label><label>Signal<select aria-label="Inspector annotation anchor signal" value={anchorSignalId ?? ""} onChange={(event) => setAnchorSignalId((event.target.value || undefined) as SignalId | undefined)}><option value="">(none)</option>{document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label><label>Cycle<input aria-label="Inspector annotation anchor cycle" type="number" min="0" max={document.timeline.cycleCount - 1} value={anchorCycle} onChange={(event) => setAnchorCycle(Number(event.target.value))} /></label><label>Point<select aria-label="Inspector annotation anchor point" value={anchorPoint} onChange={(event) => setAnchorPoint(event.target.value as SemanticAnchor["point"])}>{(["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"] as const).map((point) => <option key={point} value={point}>{point}</option>)}</select></label><label>X offset<input aria-label="Inspector annotation anchor X" type="number" value={anchorX} onChange={(event) => setAnchorX(Number(event.target.value))} /></label><label>Y offset<input aria-label="Inspector annotation anchor Y" type="number" value={anchorY} onChange={(event) => setAnchorY(Number(event.target.value))} /></label><button type="button" data-testid="apply-inspector-annotation-anchor" disabled={!selectedAnchor} onClick={() => { if (selectedAnchor) onCommand({ id: nextCommandId("inspector_annotation_anchor"), type: "annotation.setAnchor", annotationId: annotation.id, field: anchorField, anchor: { ...selectedAnchor, ...(anchorSignalId === undefined ? {} : { signalId: anchorSignalId }), cycle: anchorCycle, point: anchorPoint, offset: { x: anchorX, y: anchorY } } }); }}>Apply Anchor</button></div></InspectorSection>
      <InspectorSection sectionId="style" title="Style" open={sections.style ?? false} onToggle={() => toggle("style")}>
        <StrokeFillToolbar idPrefix="inspector-stroke-fill" style={annotation.style} onChange={(style) => onCommand(buildAnnotationStyleCommand(annotation, style, nextCommandId("inspector_annotation_stroke_fill")))} strokeDisabled={!!annotationCapabilityDisabledReason(annotation.type, "stroke")} strokeReason={annotationCapabilityDisabledReason(annotation.type, "stroke")} fillDisabled={!!annotationCapabilityDisabledReason(annotation.type, "fill")} fillReason={annotationCapabilityDisabledReason(annotation.type, "fill")} />
        {lineControlsEnabled && <><label>Line<select aria-label="Inspector annotation line type" value={lineType} onChange={(event) => setLineType(event.target.value as typeof lineType)}><option value="straight">Straight</option><option value="orthogonal">Orthogonal</option><option value="curve">Curve</option><option value="diagonal">Diagonal</option></select></label><label>Arrow<select aria-label="Inspector annotation arrowhead" value={arrowhead} onChange={(event) => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">End</option><option value="start">Start</option><option value="bidirectional">Both</option><option value="none">None</option></select></label></>}</InspectorSection>
      <section><button type="button" className="danger" onClick={onDelete}>Delete Annotation</button></section>
      <InspectorFooter onCancel={onCancel} onApply={apply} applyDisabled={false} applyTestId="apply-inspector-annotation" />
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}
