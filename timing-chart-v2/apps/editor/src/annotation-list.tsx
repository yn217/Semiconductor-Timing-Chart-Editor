import type { Annotation, AnnotationId, SemanticAnchor } from "@timing-chart-v2/schema";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { RibbonIcon } from "./ribbon-icon.js";
import { buildAnnotationVisibilityCommand } from "./annotation-style-command.js";
import { nextCommandId } from "./command-id.js";

/** Doubles as the "selection pane" PowerPoint offers for objects: every
 * Annotation, with a visibility toggle per row, in the same table this
 * Bottom Editor already uses for select-by-row -- no separate panel added. */
export function AnnotationList({ annotations, selectedId, onSelect, onCommand }: { readonly annotations: readonly Annotation[]; readonly selectedId: AnnotationId | undefined; readonly onSelect: (id: AnnotationId) => void; readonly onCommand: (command: SemanticCommand) => void }) {
  const anchorText = (anchor: SemanticAnchor | undefined) => anchor ? `${anchor.signalId ?? "cycle"} @ ${anchor.cycle}` : "—";
  return <div className="annotation-list" role="table" aria-label="Annotations" data-testid="annotation-list">
    <div className="annotation-list-row annotation-list-header" role="row"><span /><span>#</span><span>Type</span><span>Start</span><span>End</span><span>Label / Text</span><span>Target</span><span>X</span><span>Y</span></div>
    {annotations.map((item, index) => <div className="annotation-list-row" role="row" key={item.id} data-annotation-list-id={item.id} data-annotation-row={item.id} data-selected={String(item.id === selectedId)} aria-label={`Select annotation ${item.label || item.type}`} onClick={() => onSelect(item.id)}>
      <button type="button" className="annotation-list-visibility" aria-label={item.visible ? `Hide ${item.label || item.type}` : `Show ${item.label || item.type}`} aria-pressed={item.visible} data-testid={`annotation-list-visibility-${item.id}`} onClick={(event) => { event.stopPropagation(); onCommand(buildAnnotationVisibilityCommand(item, !item.visible, nextCommandId("annotation_list_visibility"))); }}><RibbonIcon name={item.visible ? "i-eye" : "i-eye-off"} /></button>
      <span className="annotation-list-index">{index + 1}</span>
      <span className="annotation-list-type">{item.type}</span>
      <span>{anchorText(item.start ?? item.from ?? item.anchor)}</span>
      <span>{anchorText(item.end ?? item.to)}</span>
      <span className="annotation-list-label">{item.label || "(untitled)"}</span>
      <span>canvas</span>
      <span>{item.labelOffset?.x ?? 0}</span>
      <span>{item.labelOffset?.y ?? 0}</span>
    </div>)}
  </div>;
}
