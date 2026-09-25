import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { PointerEvent } from "react";
import { effectiveLegendEntries, type CanonicalDocument } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { clampLegendToVisibleViewport, legendLocalPointFromClient, readLegendSurfaceGeometry } from "./legend-geometry.js";

export function LegendView({ document, commands, selected = false, onSelect }: { readonly document: CanonicalDocument; readonly commands: Pick<EditorSurfaceCommandController, "updateLegend">; readonly selected?: boolean; readonly onSelect?: () => void }) {
  const [position, setPosition] = useState(document.legend.position);
  const legendRef = useRef<HTMLElement>(null);
  const [contentOffset, setContentOffset] = useState({ left: 0, top: 0 });
  const dragRef = useRef<{ readonly offsetX: number; readonly offsetY: number; readonly pointerId: number; readonly content: HTMLElement } | undefined>(undefined);
  useEffect(() => setPosition(document.legend.position), [document.legend.position.x, document.legend.position.y]);
  useLayoutEffect(() => {
    const content = legendRef.current?.parentElement;
    if (!content) return undefined;
    const update = () => {
      const geometry = readLegendSurfaceGeometry(content);
      if (geometry) setContentOffset((current) => current.left === geometry.contentLeft && current.top === geometry.contentTop ? current : { left: geometry.contentLeft, top: geometry.contentTop });
      if (geometry && !dragRef.current && legendRef.current) {
        const bounds = legendRef.current.getBoundingClientRect();
        setPosition((current) => {
          const visible = clampLegendToVisibleViewport(document.legend.position, { width: bounds.width, height: bounds.height }, geometry);
          return current.x === visible.x && current.y === visible.y ? current : visible;
        });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(content);
    const viewport = content.closest<HTMLElement>(".cycle-viewport");
    const ruler = content.querySelector<HTMLElement>(".cycle-ruler");
    const rail = content.ownerDocument.querySelector<HTMLElement>(".left-workspace-rail");
    if (viewport) observer.observe(viewport);
    if (ruler) observer.observe(ruler);
    if (rail) observer.observe(rail);
    const ownerDocument = content.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    ownerDocument.addEventListener("scroll", update, true);
    ownerWindow?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      ownerDocument.removeEventListener("scroll", update, true);
      ownerWindow?.removeEventListener("resize", update);
    };
  }, [document.legend.show, document.legend.position.x, document.legend.position.y]);
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
  const nudge = (event: KeyboardEvent<HTMLElement>, content: HTMLElement, currentTarget: HTMLElement) => {
    if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    commitPosition(clampToSurface({ x: position.x + dx, y: position.y + dy }, currentTarget, content));
  };
  const clampToSurface = (next: { readonly x: number; readonly y: number }, currentTarget: HTMLElement, content: HTMLElement) => {
    const legendBounds = currentTarget.getBoundingClientRect();
    const geometry = readLegendSurfaceGeometry(content);
    return geometry ? clampLegendToVisibleViewport(next, { width: legendBounds.width, height: legendBounds.height }, geometry) : next;
  };
  return <aside ref={legendRef} className={`editor-legend ${document.legend.orientation}`} data-testid="editor-legend" data-legend-id="document-legend" data-selected={selected} aria-label="Legend" aria-pressed={selected} role="button" tabIndex={0} data-legend-position-x={position.x} data-legend-position-y={position.y} style={{ left: `${contentOffset.left + position.x}px`, top: `${contentOffset.top + position.y}px` }} onFocus={() => { if (!selected) onSelect?.(); }} onPointerDown={(event) => { if (event.button !== 0) return; const content = event.currentTarget.parentElement; const geometry = content ? readLegendSurfaceGeometry(content) : undefined; if (!content || !geometry) return; if (!selected) onSelect?.(); const local = legendLocalPointFromClient({ x: event.clientX, y: event.clientY }, geometry); dragRef.current = { offsetX: local.x - position.x, offsetY: local.y - position.y, pointerId: event.pointerId, content }; event.currentTarget.setPointerCapture(event.pointerId); }} onKeyDown={(event) => { if (event.key === "Escape" && dragRef.current) { event.preventDefault(); event.stopPropagation(); cancelDrag(event.currentTarget); return; } if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(); return; } if (!selected) onSelect?.(); const content = event.currentTarget.parentElement; if (content) nudge(event, content, event.currentTarget); }} onPointerMove={(event) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const geometry = readLegendSurfaceGeometry(drag.content); if (!geometry) return; const local = legendLocalPointFromClient({ x: event.clientX, y: event.clientY }, geometry); setPosition(clampToSurface({ x: local.x - drag.offsetX, y: local.y - drag.offsetY }, event.currentTarget, drag.content)); }} onPointerUp={(event) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const geometry = readLegendSurfaceGeometry(drag.content); const local = geometry ? legendLocalPointFromClient({ x: event.clientX, y: event.clientY }, geometry) : position; const next = clampToSurface({ x: local.x - drag.offsetX, y: local.y - drag.offsetY }, event.currentTarget, drag.content); dragRef.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (next.x === document.legend.position.x && next.y === document.legend.position.y) { setPosition(document.legend.position); return; } const result = commands.updateLegend({ ...document.legend, position: next }); if (result.ok) setPosition(next); else setPosition(document.legend.position); }} onPointerCancel={(event) => cancelDrag(event.currentTarget)}><strong>Legend</strong>{entries.map((entry) => <span key={entry.id} data-legend-id={entry.id} data-legend-role={entry.role}><i />{entry.label}</span>)}</aside>;
}
