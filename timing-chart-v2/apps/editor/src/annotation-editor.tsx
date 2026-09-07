import { useEffect, useRef, useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import { DEFAULT_MEASUREMENT_LAYOUT, MEASUREMENT_PROFILES, anchorTransitionFraction, measurementProfilePair, type Annotation, type AnnotationId, type AnnotationType, type CanonicalDocument, type JsonObject, type MeasurementLayout, type MeasurementProfile, type SemanticAnchor, type SignalId, type TransitionAnchorKind } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { downloadText } from "./download-text.js";
import { AnnotationList } from "./annotation-list.js";
import { FontStyleToolbar } from "./font-style-toolbar.js";
import { StrokeFillToolbar } from "./stroke-fill-toolbar.js";
import { annotationCapabilityDisabledReason } from "./annotation-capability-matrix.js";
import { annotationPropertiesBase, buildAnnotationStyleCommand } from "./annotation-style-command.js";

type AnchorFieldName = "anchor" | "start" | "end" | "from" | "to";

/** Visual/UX Closure pass (#426, #418/#421/#423/#424), Section 3: a
 * compact Start/End editor -- Signal + Cycle only (Point/offset stay
 * Inspector-only, which keeps its fuller Endpoint/Point/X/Y editor; this
 * is deliberately the *lighter* of the two, not a second copy of it) --
 * dispatching the exact same `annotation.setAnchor` command a Canvas
 * endpoint drag or Inspector's own "Apply Anchor" would. Its own component
 * (own hooks) rather than inline state in AnnotationEditor: which anchor
 * fields exist varies by AnnotationType, and this way that variability
 * never has to route through conditional hook calls -- a field simply
 * isn't rendered (and never mounts this component) when its
 * `SemanticAnchor` is undefined for the current Annotation. */
function AnchorMiniEditor({ label, annotation, field, document, onCommand }: { readonly label: string; readonly annotation: Annotation; readonly field: AnchorFieldName; readonly document: CanonicalDocument; readonly onCommand: (command: SemanticCommand) => void }) {
  const current = (annotation as Partial<Record<AnchorFieldName, SemanticAnchor>>)[field];
  const [cycle, setCycle] = useState(current?.cycle ?? 0);
  const [signalId, setSignalId] = useState<SignalId | undefined>(current?.signalId);
  if (!current) return null;
  const hasChanges = cycle !== current.cycle || signalId !== current.signalId;
  return <div className="annotation-anchor-mini">
    <span className="annotation-anchor-mini-label">{label}</span>
    <select aria-label={`Annotation ${label} signal`} value={signalId ?? ""} onChange={(event) => setSignalId((event.target.value || undefined) as SignalId | undefined)}>
      <option value="">(cycle only)</option>
      {document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}
    </select>
    <input aria-label={`Annotation ${label} cycle`} type="number" min="0" max={document.timeline.cycleCount - 1} value={cycle} onChange={(event) => setCycle(Number(event.target.value))} />
    <button type="button" aria-label={`Apply ${label} anchor`} disabled={!hasChanges} onClick={() => onCommand({ id: nextCommandId("annotation_anchor"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: { ...current, cycle, ...(signalId === undefined ? {} : { signalId }) } })}>Apply</button>
  </div>;
}

export function AnnotationEditor({ annotation, annotations, document, history, problem, onSelect, onCreate, onDuplicate, onCommand, onUndo, onRedo, onDelete, onCancel, onPreview }: { readonly annotation: Annotation; readonly annotations: readonly Annotation[]; readonly document: CanonicalDocument; readonly history: HistoryState; readonly problem: string; readonly onSelect: (id: AnnotationId) => void; readonly onCreate: (type: AnnotationType) => void; readonly onDuplicate: (annotation: Annotation) => void; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void; readonly onPreview: (draft: { readonly label?: string; readonly color?: string; readonly opacity?: number } | undefined) => void }) {
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
  // Visual/UX Closure pass, Section 4: open by default -- Style still
  // sits in its own clearly-demoted section *below* every semantic field
  // (Type/Label/Start/End/type-specific geometry/Color), which is what
  // actually fixes "Style outweighs semantic fields"; starting it closed
  // would additionally mean it re-closes after every single Apply (this
  // editor remounts on each committed revision, same as every other
  // Bottom tab's Draft-reset contract -- a real annoyance for anyone
  // making several style edits in a row, since Apply Annotation Undo/Redo/
  // Bold/etc. all commit a revision).
  const [styleOpen, setStyleOpen] = useState(true);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [importStatus, setImportStatus] = useState("Import annotations JSON");
  const fileInput = useRef<HTMLInputElement>(null);
  const lineControlsEnabled = annotation.type === "arrow" || annotation.type === "dependency";
  const importAnnotations = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "annotations" in parsed ? (parsed as { annotations: unknown }).annotations : undefined);
      if (!Array.isArray(items) || items.some((item) => item === null || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string")) throw new Error("Expected an annotation array with stable IDs.");
      const result = onCommand({ id: nextCommandId("annotation_import"), type: "document.replace", document: { ...document, annotations: items as Annotation[] } });
      if (!result.ok) {
        setImportStatus(result.problems[0]?.message ?? "Annotation import was rejected.");
        return;
      }
      const first = items[0] as { id?: unknown } | undefined;
      if (typeof first?.id === "string") onSelect(first.id as AnnotationId);
      setImportStatus(`Imported ${items.length} annotation${items.length === 1 ? "" : "s"}`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Invalid annotations JSON");
    }
  };
  // Font toggles apply immediately against the annotation's live (saved)
  // properties, not the unsaved draft fields below -- clicking Bold should
  // never accidentally commit an in-progress label/color edit.
  const applyFontStyle = (style: JsonObject) => onCommand(buildAnnotationStyleCommand(annotation, style, nextCommandId("annotation_font")));
  // Preview reflects the CURRENT draft Label/Color/Opacity on the real
  // renderer-owned overlay via a pure DOM-only path (see
  // refreshAnnotationPreview in runtime/use-editor-runtime-bridge.ts) --
  // Canonical/History/Dirty stay untouched; nothing here calls onCommand.
  // Distinct from Apply Annotation (which does commit): this button's own
  // label and the hint beside it say so explicitly (Section 8), rather
  // than leaving the two to be told apart only by trial and error.
  const applyPreview = () => onPreview({ label, color, ...((["timingRegion", "ghostTrace"] as const).includes(annotation.type as "timingRegion") ? { opacity } : {}) });
  useEffect(() => () => onPreview(undefined), [annotation.id, onPreview]);
  const standardMeasurementPair = measurementProfilePair(measurementProfile);
  const customMeasurementPair = { start: Number(measurementStart) / 100, end: Number(measurementEnd) / 100 };
  const measurementPair = measurementProfile === "custom" ? customMeasurementPair : standardMeasurementPair ?? { start: 0, end: 1 };
  const measurementDraftValid = measurementProfile !== "custom" || ([measurementPair.start, measurementPair.end].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) && measurementPair.start <= measurementPair.end);
  // Visual Reference pass (#426, #418/#421/#423/#424): Apply Annotation
  // must follow the same Draft/Apply contract every other Bottom tab's
  // primary Apply button already does (Signal Inspector's Apply Signal
  // Properties, the Signal tab's per-row Save) -- disabled while the Draft
  // is byte-for-byte identical to the committed Annotation, with a scoped
  // "● Unapplied changes" indicator, so a no-op submit can't manufacture an
  // empty History entry and the panel never implies there's something to
  // commit when there isn't. Only compares the fields THIS form actually
  // exposes a draft for (measurement and the anchor fields each have their
  // own separate Apply, matching their own already-existing separate
  // commands).
  const isOpacityType = (["timingRegion", "ghostTrace"] as const).includes(annotation.type as "timingRegion");
  const defaultOpacity = annotation.type === "ghostTrace" ? 0.55 : 0.16;
  const hasChanges = label !== annotation.label
    || color !== (annotation.color ?? "#d04a36")
    || visible !== annotation.visible
    || (lineControlsEnabled && (lineType !== (annotation.lineType ?? "straight") || arrowhead !== (annotation.arrowhead ?? "end")))
    || (isOpacityType && opacity !== (annotation.opacity ?? defaultOpacity))
    || (annotation.type === "ghostTrace" && traceOffsetCycles !== (annotation.traceOffsetCycles ?? 0));
  const applyAnnotationProperties = () => onCommand({ id: nextCommandId("annotation_style"), type: "annotation.updateProperties", annotationId: annotation.id, ...annotationPropertiesBase(annotation), label, visible, color, ...(lineControlsEnabled ? { lineType, arrowhead } : {}), ...(isOpacityType ? { opacity } : {}), ...(annotation.type === "ghostTrace" ? { sourceSignalId: annotation.sourceSignalId, traceOffsetCycles } : {}) });
  // Quick Presets (Section 10): draft-only field shortcuts, never a second
  // Canonical owner -- clicking one only calls the same setLabel/setColor/
  // etc draft setters the fields below already use, so Apply Annotation
  // (the one existing command dispatch) is still the only thing that ever
  // commits. Each preset name matches a real AnnotationType 1:1 (no
  // preset for a type this editor can't actually produce) and is
  // truthfully disabled (matching the existing #378 capability-matrix
  // convention) when the selected Annotation isn't that type.
  const presets: readonly { readonly label: string; readonly type: AnnotationType; readonly apply: () => void }[] = [
    { label: "Arrow (Duration)", type: "arrow", apply: () => { setLabel("Duration"); setLineType("straight"); setArrowhead("bidirectional"); } },
    { label: "Callout (Note)", type: "callout", apply: () => setLabel("Note") },
    { label: "Measurement", type: "measurement", apply: () => setLabel("Measurement") },
    { label: "Timing Region", type: "timingRegion", apply: () => { setLabel("Region"); setOpacity(0.16); } },
    { label: "Marker (Trigger)", type: "marker", apply: () => setLabel("Trigger") },
    { label: "Text Note", type: "text", apply: () => setLabel("Note") },
  ];
  const primaryAnchorField: AnchorFieldName | undefined = annotation.start !== undefined ? "start" : annotation.from !== undefined ? "from" : annotation.anchor !== undefined ? "anchor" : undefined;
  const secondaryAnchorField: AnchorFieldName | undefined = annotation.end !== undefined ? "end" : annotation.to !== undefined ? "to" : undefined;
  return <section className="signal-editor annotation-editor" aria-label="Annotation Editor" data-testid="annotation-editor" data-bottom-target-id={annotation.id} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <div className="editor-tabbar">
      <span className="editor-tab">Signal</span><span className="editor-tab active">Annotation</span>
      <span className="editor-selection">{annotation.label} · {annotation.type}</span>
      <span className="editor-tabbar-secondary">
        <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
        <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
      </span>
      <button type="button" className="danger" onClick={onDelete} data-testid="delete-annotation">Delete</button>
    </div>
    {/* Visual/UX Closure pass, Section 8: Preview's own name and hint now
        say plainly that it's a transient presentation-only refresh, never
        a commit -- distinct from Apply Annotation below. Export/Import
        (document-level, not List-management) stay here as secondary
        actions; Add/Duplicate/Delete (List management) move to the List
        panel's own header instead (Section 7). */}
    <div className="annotation-context-toolbar" role="toolbar" aria-label="Annotation operations" data-testid="annotation-context-toolbar">
      <button type="button" data-testid="annotation-preview-action" onClick={() => { setPreviewRevision((value) => value + 1); applyPreview(); }} title="Refresh the transient on-canvas preview from the current Draft -- canonical data stays unchanged until Apply Annotation.">⟳ Preview (draft only)</button>
      <button type="button" onClick={() => downloadText(JSON.stringify(annotations, null, 2), "annotations.json")}>Export</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Import</button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import annotations" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importAnnotations(file); event.currentTarget.value = ""; }} />
      <output data-testid="annotation-preview-status">{previewRevision > 0 ? `Previewing draft (updated ${previewRevision}) · canonical data unchanged` : "Preview ready"}</output>
      <output data-testid="annotation-import-status">{importStatus}</output>
    </div>
    {problem && <div className="editor-problem" role="alert">{problem}</div>}
    {/* Visual/UX Closure pass: List / Edit / Quick Presets side by side --
        selecting a List row edits that same stable Annotation ID here (never
        an array index or the display label), matching the Signal tab's own
        3-panel convention (Add/Edit Transition · Value Helper · Generate
        Waveform) rather than inventing a new layout shape. */}
    <div className="annotation-panels">
      <section className="annotation-list-panel" aria-label="Annotation List">
        <h2>Annotations <span>({annotations.length})</span></h2>
        {/* Section 7: List management (Add/Duplicate/Delete) sits right at
            the top of the List it manages, instead of a shared toolbar row
            far above spanning unrelated document-level actions too. */}
        <div className="annotation-list-actions" role="toolbar" aria-label="Annotation list actions">
          <button type="button" aria-label="Create context annotation" onClick={() => onCreate("text")}>+ Add</button>
          <button type="button" onClick={() => onDuplicate(annotation)}>Duplicate</button>
          <button type="button" className="danger" onClick={onDelete}>Delete</button>
        </div>
        <AnnotationList annotations={annotations} selectedId={annotation.id} onSelect={onSelect} onCommand={onCommand} />
      </section>
      <section className="annotation-edit-panel" aria-label="Edit Annotation">
        <h2>Edit Annotation</h2>
        <form className="annotation-properties" id="annotation-properties-form" onSubmit={(event) => { event.preventDefault(); if (hasChanges) applyAnnotationProperties(); }}>
          {/* Section 1: semantic identity first -- what this is, then what
              it says, then where it sits -- before any style control. */}
          <div className="property-row"><span>Type</span><span>{annotation.type}</span></div>
          {/* #377: Label is a plain textarea (not a single-line input) so
              Callout/any Annotation can hold real multi-line text -- the
              renderer (packages/renderer/src/stable-surface.ts) and export
              (packages/export/src/index.ts) both split on "\n" into separate
              visual lines to match. */}
          <label>Label<textarea aria-label="Annotation label" rows={label.includes("\n") ? Math.min(6, label.split("\n").length + 1) : 2} value={label} onChange={(event) => setLabel(event.target.value)} /></label>
          {/* Section 3: a real, compact Start/End (or single Anchor) editor
              -- Signal + Cycle, the same `annotation.setAnchor` command a
              Canvas endpoint drag or Inspector's fuller Endpoint/Point/
              offset editor both use. Only the fields THIS Annotation
              actually has render at all (a Marker/verticalLine/Callout/
              Text's single `anchor` shows one row, not two). */}
          {primaryAnchorField && <AnchorMiniEditor label={secondaryAnchorField ? "Start" : "Anchor"} annotation={annotation} field={primaryAnchorField} document={document} onCommand={onCommand} />}
          {secondaryAnchorField && <AnchorMiniEditor label="End" annotation={annotation} field={secondaryAnchorField} document={document} onCommand={onCommand} />}
          {/* Section 2: type-specific geometry, still ahead of style. */}
          {isOpacityType && <label>Opacity<input aria-label="Annotation opacity" type="number" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
          {annotation.type === "ghostTrace" && <><div className="property-row"><span>Source Signal</span><b data-testid="ghost-source-signal">{annotation.sourceSignalId ?? "Missing"}</b></div><label>Cycle Offset<input aria-label="Ghost Trace cycle offset" type="number" step="1" value={traceOffsetCycles} onChange={(event) => setTraceOffsetCycles(Number(event.target.value))} /></label></>}
          {lineControlsEnabled && <><label>Line<select aria-label="Annotation line type" value={lineType} onChange={(event) => setLineType(event.target.value as typeof lineType)}><option value="straight">Straight</option><option value="orthogonal">Orthogonal</option><option value="curve">Curve</option><option value="diagonal">Diagonal</option></select></label><label>Arrow<select aria-label="Annotation arrowhead" value={arrowhead} onChange={(event) => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">End</option><option value="start">Start</option><option value="bidirectional">Both</option><option value="none">None</option></select></label></>}
          {annotation.type === "measurement" && <section className="annotation-measurement-editor" aria-label="Measurement semantics"><strong>Transition measurement</strong><label>Profile<select aria-label="Measurement profile" value={measurementProfile} onChange={(event) => setMeasurementProfile(event.target.value as MeasurementProfile)}>{MEASUREMENT_PROFILES.map((profile) => <option key={profile} value={profile}>{profile === "cycle" ? "Cycle anchors" : profile === "custom" ? "Custom" : profile}</option>)}</select></label>{measurementProfile !== "cycle" && <label>Meaning<select aria-label="Measurement anchor kind" value={measurementKind} onChange={(event) => setMeasurementKind(event.target.value as TransitionAnchorKind)}><option value="threshold">Transition threshold</option><option value="ratio">Transition ratio</option></select></label>}{measurementProfile === "custom" && <><label>Start %<input aria-label="Custom measurement start" type="number" min="0" max="100" step="1" value={measurementStart} onChange={(event) => setMeasurementStart(event.target.value)} /></label><label>End %<input aria-label="Custom measurement end" type="number" min="0" max="100" step="1" value={measurementEnd} onChange={(event) => setMeasurementEnd(event.target.value)} /></label></>}<label>Start marker<select aria-label="Measurement start marker" value={measurementLayout.startMarker} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, startMarker: event.target.value as MeasurementLayout["startMarker"] }))}><option value="none">None</option><option value="bar">Bar</option><option value="arrow">Arrow</option></select></label><label>End marker<select aria-label="Measurement end marker" value={measurementLayout.endMarker} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, endMarker: event.target.value as MeasurementLayout["endMarker"] }))}><option value="none">None</option><option value="bar">Bar</option><option value="arrow">Arrow</option></select></label><label>Arrow layout<select aria-label="Measurement arrow layout" value={measurementLayout.arrowLayout} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, arrowLayout: event.target.value as MeasurementLayout["arrowLayout"] }))}><option value="auto">Auto</option><option value="inward">Inward</option><option value="outward">Outward</option></select></label><label>Extensions<select aria-label="Measurement extension lines" value={measurementLayout.extensionLines} onChange={(event) => setMeasurementLayout((layout) => ({ ...layout, extensionLines: event.target.value as MeasurementLayout["extensionLines"] }))}><option value="both">Both</option><option value="start">Start</option><option value="end">End</option><option value="none">None</option></select></label><label>Lane<input aria-label="Measurement lane" type="number" min="0" step="1" value={measurementLayout.lane ?? ""} onChange={(event) => setMeasurementLayout((layout) => { if (event.target.value === "") { const { lane: _lane, ...withoutLane } = layout; return withoutLane; } return { ...layout, lane: Number(event.target.value) }; })} /></label><button type="button" data-testid="apply-measurement-semantics" disabled={!measurementDraftValid} onClick={() => onCommand({ id: nextCommandId("annotation_measurement"), type: "annotation.updateMeasurement", annotationId: annotation.id, profile: measurementProfile, anchorKind: measurementKind, start: measurementPair.start, end: measurementPair.end, layout: measurementLayout })}>Apply measurement</button></section>}
          {annotation.type === "marker" && <div className="property-row"><span>Vertical span</span><span>{annotation.verticalSpan?.mode ?? "auto"}</span></div>}
          {/* Section 1/4: Color (and Line/Arrow above, for Arrow/Dependency)
              are the last *semantic-adjacent* presentation fields before
              the fuller Font/Stroke/Fill toolbars fold away below. */}
          <label>Color<input aria-label="Annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
          {/* Section 4: Font/Stroke/Fill collapse into one "▼ Style"
              disclosure instead of sitting unconditionally expanded above
              the semantic fields (which is what made Style outweigh
              Type/Label/Start/End in the reported screenshot) -- closed by
              default, same reasoning as Generate Waveform's own Advanced
              disclosure earlier in this Epic. */}
          <details className="annotation-style-section" open={styleOpen} onToggle={(event) => setStyleOpen(event.currentTarget.open)}>
            <summary>Style (Font, Stroke, Fill)</summary>
            <FontStyleToolbar idPrefix="annotation-font" style={annotation.style} onChange={applyFontStyle} />
            <StrokeFillToolbar idPrefix="annotation-stroke-fill" style={annotation.style} onChange={applyFontStyle} strokeDisabled={!!annotationCapabilityDisabledReason(annotation.type, "stroke")} strokeReason={annotationCapabilityDisabledReason(annotation.type, "stroke")} fillDisabled={!!annotationCapabilityDisabledReason(annotation.type, "fill")} fillReason={annotationCapabilityDisabledReason(annotation.type, "fill")} />
          </details>
          {/* Section 1: Visible last -- a state toggle, not the Annotation's
              identity or geometry. */}
          <label className="check-label"><input aria-label="Annotation visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />Visible</label>
        </form>
        <form className="annotation-properties annotation-label-offset-row" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("annotation_label_offset"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: labelX, y: labelY } }); }}>
          <strong>Label offset</strong>
          <label>X<input aria-label="Annotation label X" type="number" value={labelX} onChange={(event) => setLabelX(Number(event.target.value))} /></label>
          <label>Y<input aria-label="Annotation label Y" type="number" value={labelY} onChange={(event) => setLabelY(Number(event.target.value))} /></label>
          <button type="submit">Move label</button>
          <button type="button" onClick={() => onCommand({ id: nextCommandId("annotation_reset_offsets"), type: "annotation.resetOffsets", annotationId: annotation.id })}>Reset offsets</button>
          <span className="annotation-hint">Arrow keys nudge 1 px; Shift+Arrow nudges 10 px. Drag endpoints to snap.</span>
        </form>
      </section>
      <section className="annotation-presets-panel" aria-label="Quick Presets">
        <h2>Quick Presets</h2>
        <div className="annotation-quick-presets" role="group" aria-label="Annotation quick presets">
          {presets.map((preset) => <button type="button" key={preset.label} disabled={annotation.type !== preset.type} title={annotation.type === preset.type ? undefined : `Switch to a ${preset.type} Annotation first.`} onClick={preset.apply}>{preset.label}</button>)}
        </div>
        <span className="annotation-hint">Sets Label/Style fields only -- nothing commits until Apply Annotation.</span>
      </section>
    </div>
    {/* Section 9: Cancel and the one primary Apply action sit *together*
        at the right, not spread across the full bar width (Cancel far
        left, Apply far right) -- sticky regardless of how tall the List/
        Edit panels grow or how the Bottom Editor is resized. */}
    <div className="bottom-sticky-actions">
      {hasChanges && <output className="draft-unapplied-indicator" data-testid="annotation-properties-unapplied">● Unapplied changes</output>}
      <span className="bottom-sticky-buttons">
        <button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button>
        <button type="submit" form="annotation-properties-form" data-testid="apply-annotation-properties" disabled={!hasChanges}>Apply Annotation</button>
      </span>
    </div>
  </section>;
}
