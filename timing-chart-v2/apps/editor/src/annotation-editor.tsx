import { useEffect, useRef, useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import type { Annotation, AnnotationId, AnnotationType, CanonicalDocument, JsonObject } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { downloadText } from "./download-text.js";
import { AnnotationList } from "./annotation-list.js";
import { FontStyleToolbar } from "./font-style-toolbar.js";
import { annotationPropertiesBase, buildAnnotationStyleCommand } from "./annotation-style-command.js";

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
  const [previewRevision, setPreviewRevision] = useState(0);
  const [importStatus, setImportStatus] = useState("Import annotations JSON");
  const fileInput = useRef<HTMLInputElement>(null);
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
  // Preview Update reflects the CURRENT draft Label/Color/Opacity on the
  // real renderer-owned overlay via a pure DOM-only path (see
  // refreshAnnotationPreview in runtime/use-editor-runtime-bridge.ts) --
  // Canonical/History/Dirty stay untouched; nothing here calls onCommand.
  // Selecting a different annotation (or unmounting this editor for any
  // other reason -- Cancel, Delete, closing the Bottom panel) always
  // reverts the preview back to the real Canonical rendering, the same
  // contract Group Style preview already follows.
  const applyPreview = () => onPreview({ label, color, ...((["timingRegion", "ghostTrace"] as const).includes(annotation.type as "timingRegion") ? { opacity } : {}) });
  useEffect(() => () => onPreview(undefined), [annotation.id, onPreview]);
  return <section className="signal-editor annotation-editor" aria-label="Annotation Editor" data-testid="annotation-editor" data-bottom-target-id={annotation.id} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <div className="editor-tabbar">
      <span className="editor-tab">Signal</span><span className="editor-tab active">Annotation</span>
      <span className="editor-selection">{annotation.label} · {annotation.type}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button>
      <button type="button" onClick={onDelete} data-testid="delete-annotation">Delete</button>
    </div>
    <div className="annotation-context-toolbar" role="toolbar" aria-label="Annotation operations" data-testid="annotation-context-toolbar">
      <button type="button" aria-label="Create context annotation" onClick={() => onCreate("text")}>＋ Add Annotation</button>
      <button type="button" onClick={() => onDuplicate(annotation)}>Duplicate</button>
      <button type="button" onClick={onDelete}>Delete</button>
      <button type="button" onClick={() => { setPreviewRevision((value) => value + 1); applyPreview(); }}>⟳ Preview Update</button>
      <button type="button" onClick={() => downloadText(JSON.stringify(annotations, null, 2), "annotations.json")}>Export</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Import</button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import annotations" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importAnnotations(file); event.currentTarget.value = ""; }} />
      <output data-testid="annotation-preview-status">{previewRevision > 0 ? `Previewing draft (updated ${previewRevision}) · canonical data unchanged` : "Preview ready"}</output>
      <output data-testid="annotation-import-status">{importStatus}</output>
    </div>
    <AnnotationList annotations={annotations} selectedId={annotation.id} onSelect={onSelect} onCommand={onCommand} />
    <FontStyleToolbar idPrefix="annotation-font" style={annotation.style} onChange={applyFontStyle} />
    {problem && <div className="editor-problem" role="alert">{problem}</div>}
    <form className="annotation-properties" onSubmit={(event) => {
      event.preventDefault();
      // Spread the shared preserve-everything base FIRST, then override only
      // the fields this form actually exposes a draft for -- so submitting
      // (e.g. just to rename) never drops a currently-saved lineType/
      // arrowhead/opacity/sourceSignalId/traceOffsetCycles/style that this
      // particular annotation type doesn't happen to show an editor for.
      onCommand({ id: nextCommandId("annotation_style"), type: "annotation.updateProperties", annotationId: annotation.id, ...annotationPropertiesBase(annotation), label, visible, color, ...(annotation.type === "arrow" ? { lineType, arrowhead } : {}), ...(["timingRegion", "ghostTrace"].includes(annotation.type) ? { opacity } : {}), ...(annotation.type === "ghostTrace" ? { sourceSignalId: annotation.sourceSignalId, traceOffsetCycles } : {}) });
    }}>
      <label>Label<input aria-label="Annotation label" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
      <label>Color<input aria-label="Annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label className="check-label"><input aria-label="Annotation visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />Visible</label>
      {(["timingRegion", "ghostTrace"] as const).includes(annotation.type as "timingRegion") && <label>Opacity<input aria-label="Annotation opacity" type="number" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
      {annotation.type === "ghostTrace" && <><div className="property-row"><span>Source Signal</span><b data-testid="ghost-source-signal">{annotation.sourceSignalId ?? "Missing"}</b></div><label>Cycle Offset<input aria-label="Ghost Trace cycle offset" type="number" step="1" value={traceOffsetCycles} onChange={(event) => setTraceOffsetCycles(Number(event.target.value))} /></label></>}
      {annotation.type === "arrow" && <><label>Line<select aria-label="Annotation line type" value={lineType} onChange={(event) => setLineType(event.target.value as typeof lineType)}><option value="straight">Straight</option><option value="orthogonal">Orthogonal</option><option value="curve">Curve</option><option value="diagonal">Diagonal</option></select></label><label>Arrow<select aria-label="Annotation arrowhead" value={arrowhead} onChange={(event) => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">End</option><option value="start">Start</option><option value="bidirectional">Both</option><option value="none">None</option></select></label></>}
      <button type="submit" data-testid="apply-annotation-properties">Apply</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("annotation_reset_offsets"), type: "annotation.resetOffsets", annotationId: annotation.id })}>Reset offsets</button>
    </form>
    <form className="annotation-properties" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("annotation_label_offset"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: labelX, y: labelY } }); }}>
      <strong>Label offset</strong>
      <label>X<input aria-label="Annotation label X" type="number" value={labelX} onChange={(event) => setLabelX(Number(event.target.value))} /></label>
      <label>Y<input aria-label="Annotation label Y" type="number" value={labelY} onChange={(event) => setLabelY(Number(event.target.value))} /></label>
      <button type="submit">Move label</button>
      <span className="annotation-hint">Arrow keys nudge 1 px; Shift+Arrow nudges 10 px. Drag endpoints to snap.</span>
    </form>
  </section>;
}
