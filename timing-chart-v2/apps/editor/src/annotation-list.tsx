import type { Annotation, AnnotationId, SemanticAnchor } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { RibbonIcon } from "./ribbon-icon.js";

/** Shared read-only anchor formatter -- used by both this list's Start/End
 * columns and the Bottom Annotation Editor's own Start/End summary (Visual
 * Reference pass, #426), so the two never drift into showing the same
 * anchor two different ways. */
export function annotationAnchorText(anchor: SemanticAnchor | undefined): string {
  return anchor ? `${anchor.signalId ?? "cycle"} @ ${anchor.cycle}` : "—";
}

/** Doubles as the "selection pane" PowerPoint offers for objects: every
 * Annotation, with a visibility toggle per row, in the same table this
 * Bottom Editor already uses for select-by-row -- no separate panel added.
 * Visual Reference pass (#426): columns trimmed to the reference's own
 * recommended set (ID/Type/Label/Start/End/Color/Visible) -- the previous
 * Target/X/Y columns are dropped (Target was always the hardcoded literal
 * "canvas"; X/Y duplicated the Label offset fields already editable in the
 * Edit panel) to fit this table into a narrower List column instead of
 * forcing an 880px-wide horizontal scroll inside it. */
export function AnnotationList({ annotations, selectedId, onSelect, commands }: { readonly annotations: readonly Annotation[]; readonly selectedId: AnnotationId | undefined; readonly onSelect: (id: AnnotationId) => void; readonly commands: Pick<EditorSurfaceCommandController, "updateAnnotationProperties"> }) {
  return <div className="annotation-list" role="table" aria-label="Annotations" data-testid="annotation-list">
    {/* Transaction Mode GUI realignment (Visual Quality pass): the last
        column is an 18px decorative swatch (`aria-hidden`, no text content
        of its own) -- the same fixed width is too narrow for the word
        "Color" as a header label, which was clipping to "C..." via the
        row's own ellipsis rule. Matches the leading visibility-toggle
        column's own empty header cell rather than forcing text into a
        column that was never meant to hold any. */}
    <div className="annotation-list-row annotation-list-header" role="row"><span /><span>#</span><span>Type</span><span>Label / Text</span><span>Start</span><span>End</span><span aria-hidden="true" /></div>
    {annotations.map((item, index) => <div className="annotation-list-row" role="row" tabIndex={0} key={item.id} data-annotation-list-id={item.id} data-annotation-row={item.id} data-selected={String(item.id === selectedId)} aria-selected={item.id === selectedId} aria-label={`Select annotation ${item.label || item.type}`} onClick={() => onSelect(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(item.id); return; } if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const rows = [...event.currentTarget.parentElement!.querySelectorAll<HTMLElement>("[data-annotation-row]")]; const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)]; const nextId = next?.dataset.annotationListId as AnnotationId | undefined; if (next && nextId) { onSelect(nextId); next.focus(); } } }}>
      <button type="button" className="annotation-list-visibility" aria-label={item.visible ? `Hide ${item.label || item.type}` : `Show ${item.label || item.type}`} aria-pressed={item.visible} data-testid={`annotation-list-visibility-${item.id}`} onClick={(event) => { event.stopPropagation(); commands.updateAnnotationProperties({ annotationId: item.id, label: item.label, visible: !item.visible, ...(item.color === undefined ? {} : { color: item.color }), ...(item.lineType === undefined ? {} : { lineType: item.lineType }), ...(item.arrowhead === undefined ? {} : { arrowhead: item.arrowhead }), ...(item.sourceSignalId === undefined ? {} : { sourceSignalId: item.sourceSignalId }), ...(item.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: item.traceOffsetCycles }), ...(item.opacity === undefined ? {} : { opacity: item.opacity }), ...(item.style === undefined ? {} : { style: item.style }), ...(item.measurement === undefined ? {} : { measurement: item.measurement }), ...(item.measurementLayout === undefined ? {} : { measurementLayout: item.measurementLayout }) }); }}><RibbonIcon name={item.visible ? "i-eye" : "i-eye-off"} /></button>
      <span className="annotation-list-index">{index + 1}</span>
      <span className="annotation-list-type">{item.type}</span>
      <span className="annotation-list-label">{item.label || "(untitled)"}</span>
      <span>{annotationAnchorText(item.start ?? item.from ?? item.anchor)}</span>
      <span>{annotationAnchorText(item.end ?? item.to)}</span>
      <span className="annotation-list-color" style={{ background: item.color ?? "transparent" }} aria-hidden="true" />
    </div>)}
  </div>;
}
