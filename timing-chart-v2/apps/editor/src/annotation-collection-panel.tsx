import { useEffect, useRef, useState } from "react";
import { DOCUMENT_RESOURCE_BUDGET, parseJsonInput } from "@timing-chart-v2/schema";
import type { Annotation, AnnotationId, AnnotationType, CanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { AnnotationList } from "./annotation-list.js";
import { downloadText } from "./download-text.js";

const ANNOTATION_PRESETS: readonly { readonly label: string; readonly type: AnnotationType }[] = [
  { label: "Arrow (Duration)", type: "arrow" },
  { label: "Callout (Note)", type: "callout" },
  { label: "Measurement", type: "measurement" },
  { label: "Timing Region", type: "timingRegion" },
  { label: "Marker (Trigger)", type: "marker" },
  { label: "Text Note", type: "text" },
];

/** Stable Bottom collection surface. Detailed selected-Annotation editing
 * belongs to InspectorAnnotationEditor; this component owns list actions and
 * explicit create/import/export only, so row selection never changes its
 * layout or creates another property-draft owner. */
export function AnnotationCollectionPanel({ annotations, selectedId, document, documentEpoch, revision, onSelect, onCreate, onDuplicate, onDelete, commands, onImportDiagnostic }: {
  readonly annotations: readonly Annotation[];
  readonly selectedId: AnnotationId | undefined;
  readonly document: CanonicalDocument;
  readonly documentEpoch: number;
  readonly revision: number;
  readonly onSelect: (id: AnnotationId) => void;
  readonly onCreate: (type: AnnotationType) => void;
  readonly onDuplicate: (annotation: Annotation) => void;
  readonly onDelete: () => void;
  readonly commands: Pick<EditorSurfaceCommandController, "updateAnnotationProperties" | "replaceAnnotations">;
  readonly onImportDiagnostic: (message: string) => void;
}) {
  const [presetType, setPresetType] = useState<AnnotationType>("text");
  const [importStatus, setImportStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const mounted = useRef(false);
  const latest = useRef({ documentEpoch, revision, annotations, commands, onSelect, onImportDiagnostic });
  latest.current = { documentEpoch, revision, annotations, commands, onSelect, onImportDiagnostic };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current += 1; };
  }, []);
  const selected = selectedId === undefined ? undefined : annotations.find((annotation) => annotation.id === selectedId);
  const importAnnotations = async (file: File) => {
    const token = { documentEpoch, revision, target: "annotation-collection", requestId: ++requestId.current };
    try {
      if (file.size > DOCUMENT_RESOURCE_BUDGET.inputBytes) {
        setImportStatus(`Import rejected: file exceeds ${DOCUMENT_RESOURCE_BUDGET.inputBytes.toLocaleString()} bytes.`);
        return;
      }
      const text = await file.text();
      const current = latest.current;
      if (!mounted.current || requestId.current !== token.requestId || current.documentEpoch !== token.documentEpoch || current.revision !== token.revision || token.target !== "annotation-collection") {
        const message = "Annotation import cancelled because the document changed while the file was being read. Retry the import on the current document.";
        current.onImportDiagnostic(message);
        if (mounted.current) setImportStatus(message);
        return;
      }
      const parsedResult = parseJsonInput(text);
      if (!parsedResult.ok) {
        setImportStatus(parsedResult.problems[0]?.message ?? "Invalid annotations JSON");
        return;
      }
      const parsed: unknown = parsedResult.value;
      const items = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "annotations" in parsed ? (parsed as { annotations: unknown }).annotations : undefined;
      if (!Array.isArray(items) || items.some((item) => item === null || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string")) {
        setImportStatus("Expected an annotation array with stable IDs.");
        return;
      }
      const imported = items as Annotation[];
      const result = current.commands.replaceAnnotations(current.annotations.map((annotation) => annotation.id), imported);
      if (result === undefined) {
        setImportStatus(`Imported ${imported.length} annotations (no changes).`);
        return;
      }
      if (!result.ok) {
        setImportStatus(result.problems[0]?.message ?? "Annotation import was rejected.");
        return;
      }
      const firstId = imported[0]?.id;
      if (firstId !== undefined) current.onSelect(firstId);
      setImportStatus(`Imported ${imported.length} annotation${imported.length === 1 ? "" : "s"}`);
    } catch (error) {
      if (mounted.current) setImportStatus(error instanceof Error ? error.message : "Invalid annotations JSON");
    }
  };

  return <section className="annotation-collection" aria-label="Annotation Collection" data-testid="annotation-collection">
    <div className="annotation-collection-toolbar" role="toolbar" aria-label="Annotation collection actions">
      <label>Preset<select aria-label="Annotation preset" value={presetType} onChange={(event) => setPresetType(event.target.value as AnnotationType)}>{ANNOTATION_PRESETS.map((preset) => <option key={preset.type} value={preset.type}>{preset.label}</option>)}</select></label>
      <button type="button" onClick={() => onCreate(presetType)} data-testid="create-annotation-preset">Create</button>
      <button type="button" onClick={() => selected && onDuplicate(selected)} disabled={!selected}>Duplicate</button>
      <button type="button" className="danger" onClick={onDelete} disabled={!selected}>Delete</button>
      <span className="annotation-collection-spacer" />
      <button type="button" onClick={() => downloadText(JSON.stringify(annotations, null, 2), "annotations.json")}>Export</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Import...</button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import annotations" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importAnnotations(file); event.currentTarget.value = ""; }} />
    <output data-testid="annotation-collection-status" role="status">{importStatus}</output>
    </div>
    <div className="annotation-collection-heading">Annotations <span>({annotations.length})</span>{selected && <span className="annotation-collection-selection">Selected: {selected.label || selected.type}</span>}</div>
    {annotations.length === 0
      ? <div className="empty-editor">No annotations yet. Choose a preset and select Create to add one.</div>
      : <AnnotationList annotations={annotations} selectedId={selectedId} document={document} onSelect={onSelect} commands={commands} />}
  </section>;
}
