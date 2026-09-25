import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { PointerEvent } from "react";
import { effectiveLegendEntries, type CanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";

export function LegendView({ document, commands, selected = false, onSelect }: { readonly document: CanonicalDocument; readonly commands: Pick<EditorSurfaceCommandController, "updateLegend">; readonly selected?: boolean; readonly onSelect?: () => void }) {
  const [position, setPosition] = useState(document.legend.position);
  const dragRef = useRef<{ readonly offsetX: number; readonly offsetY: number; readonly pointerId: number } | undefined>(undefined);
  useEffect(() => setPosition(document.legend.position), [document.legend.position.x, document.legend.position.y]);
  if (!document.legend.show) return null;
  const entries = effectiveLegendEntries(document);
  const commitPosition = (next: { readonly x: number; readonly y: number }) => {
    if (next.x === document.legend.position.x && next.y === document.legend.position.y) return;
    const result = commands.updateLegend({ ...document.legend, position: next });
    setPosition(result.ok ? next : document.legend.position);
  };
  const cancelDrag = (currentTarget?: HTMLElement) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = undefined;
    setPosition(document.legend.position);
    if (currentTarget?.hasPointerCapture(drag.pointerId)) currentTarget.releasePointerCapture(drag.pointerId);
  };
  const nudge = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    const next = { x: position.x + dx, y: position.y + dy };
    commitPosition(next);
  };
  return <aside className={`editor-legend ${document.legend.orientation}`} data-testid="editor-legend" data-legend-id="document-legend" data-selected={selected} aria-label="Legend" aria-pressed={selected} role="button" tabIndex={0} data-legend-position-x={position.x} data-legend-position-y={position.y} style={{ left: `${position.x}px`, top: `${position.y}px` }} onFocus={() => { if (!selected) onSelect?.(); }} onPointerDown={(event) => { if (event.button !== 0) return; if (!selected) onSelect?.(); dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y, pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }} onKeyDown={(event) => { if (event.key === "Escape" && dragRef.current) { event.preventDefault(); event.stopPropagation(); cancelDrag(event.currentTarget); return; } if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(); return; } if (!selected) onSelect?.(); nudge(event); }} onPointerMove={(event) => { if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return; setPosition({ x: event.clientX - dragRef.current.offsetX, y: event.clientY - dragRef.current.offsetY }); }} onPointerUp={(event) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const next = { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }; dragRef.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (next.x === document.legend.position.x && next.y === document.legend.position.y) { setPosition(document.legend.position); return; } const result = commands.updateLegend({ ...document.legend, position: next }); if (result.ok) setPosition(next); else setPosition(document.legend.position); }} onPointerCancel={(event) => cancelDrag(event.currentTarget)}><strong>Legend</strong>{entries.map((entry) => <span key={entry.id} data-legend-id={entry.id} data-legend-role={entry.role}><i />{entry.label}</span>)}</aside>;
}
