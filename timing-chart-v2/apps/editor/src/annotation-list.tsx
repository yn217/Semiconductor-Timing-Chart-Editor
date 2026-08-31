import type { Annotation, AnnotationId, SemanticAnchor } from "@timing-chart-v2/schema";

export function AnnotationList({ annotations, selectedId, onSelect }: { readonly annotations: readonly Annotation[]; readonly selectedId: AnnotationId | undefined; readonly onSelect: (id: AnnotationId) => void }) {
  const anchorText = (anchor: SemanticAnchor | undefined) => anchor ? `${anchor.signalId ?? "cycle"} @ ${anchor.cycle}` : "—";
  return <div className="annotation-list" role="table" aria-label="Annotations" data-testid="annotation-list">
    <div className="annotation-list-row annotation-list-header" role="row"><span>#</span><span>Type</span><span>Start</span><span>End</span><span>Label / Text</span><span>Target</span><span>X</span><span>Y</span></div>
    {annotations.map((item, index) => <button type="button" role="row" key={item.id} data-annotation-list-id={item.id} data-annotation-row={item.id} data-selected={String(item.id === selectedId)} aria-label={`Select annotation ${item.label || item.type}`} onClick={() => onSelect(item.id)}><span className="annotation-list-index">{index + 1}</span><span className="annotation-list-type">{item.type}</span><span>{anchorText(item.start ?? item.from ?? item.anchor)}</span><span>{anchorText(item.end ?? item.to)}</span><span className="annotation-list-label">{item.label || "(untitled)"}</span><span>canvas</span><span>{item.labelOffset?.x ?? 0}</span><span>{item.labelOffset?.y ?? 0}</span></button>)}
  </div>;
}
