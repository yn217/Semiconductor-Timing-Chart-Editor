import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { effectiveLegendEntries } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { clampLegendToVisibleSurface, legendLocalPointFromClient, readLegendSurfaceGeometry } from "./legend-geometry.js";

export function LegendView({ document, commands, selected = false, onSelect }: {
  readonly document: CanonicalDocument;
  readonly commands: Pick<EditorSurfaceCommandController, "updateLegend">;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
}) {
  const [position, setPosition] = useState(document.legend.position);
  const [contentOffset, setContentOffset] = useState({ left: 0, top: 0 });
  const legendRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ readonly offsetX: number; readonly offsetY: number; readonly pointerId: number; readonly content: HTMLElement } | undefined>(undefined);

  useLayoutEffect(() => {
    const content = legendRef.current?.parentElement;
    if (!content) return undefined;
    const update = () => {
      const geometry = readLegendSurfaceGeometry(content);
      const legend = legendRef.current;
      if (!geometry || !legend) return;
      setContentOffset((current) => current.left === geometry.contentLeft && current.top === geometry.contentTop
        ? current
        : { left: geometry.contentLeft, top: geometry.contentTop });
      if (dragRef.current) return;
      const bounds = legend.getBoundingClientRect();
      const visible = clampLegendToVisibleSurface(document.legend.position, { width: bounds.width, height: bounds.height }, geometry);
      setPosition((current) => current.x === visible.x && current.y === visible.y ? current : visible);
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
  const nudge = (event: KeyboardEvent<HTMLElement>, content: HTMLElement) => {
    if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const next = {
      x: position.x + (event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0),
      y: position.y + (event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0),
    };
    const bounds = event.currentTarget.getBoundingClientRect();
    const geometry = readLegendSurfaceGeometry(content);
    commitPosition(geometry ? clampLegendToVisibleSurface(next, { width: bounds.width, height: bounds.height }, geometry) : next);
  };

  return <aside
    ref={legendRef}
    className={`editor-legend ${document.legend.orientation}`}
    data-testid="editor-legend"
    data-legend-id="document-legend"
    data-selected={selected}
    aria-label={selected ? "Legend, selected" : "Legend"}
    role="button"
    tabIndex={0}
    data-legend-position-x={position.x}
    data-legend-position-y={position.y}
    style={{ left: `${contentOffset.left + position.x}px`, top: `${contentOffset.top + position.y}px` }}
    onFocus={() => { if (!selected) onSelect?.(); }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      const content = event.currentTarget.parentElement;
      const geometry = content ? readLegendSurfaceGeometry(content) : undefined;
      if (!content || !geometry) return;
      if (!selected) onSelect?.();
      const local = legendLocalPointFromClient({ x: event.clientX, y: event.clientY }, geometry);
      dragRef.current = { offsetX: local.x - position.x, offsetY: local.y - position.y, pointerId: event.pointerId, content };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && dragRef.current) {
        event.preventDefault();
        event.stopPropagation();
        const drag = dragRef.current;
        dragRef.current = undefined;
        setPosition(document.legend.position);
        if (event.currentTarget.hasPointerCapture(drag.pointerId)) event.currentTarget.releasePointerCapture(drag.pointerId);
        return;
      }
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(); return; }
      if (!selected) onSelect?.();
      const content = event.currentTarget.parentElement;
      if (content) nudge(event, content);
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const geometry = readLegendSurfaceGeometry(drag.content);
      if (!geometry) return;
      const local = legendLocalPointFromClient({ x: event.clientX, y: event.clientY }, geometry);
      const bounds = event.currentTarget.getBoundingClientRect();
      setPosition(clampLegendToVisibleSurface(
        { x: local.x - drag.offsetX, y: local.y - drag.offsetY },
        { width: bounds.width, height: bounds.height },
        geometry,
      ));
    }}
    onPointerUp={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const geometry = readLegendSurfaceGeometry(drag.content);
      const local = geometry ? legendLocalPointFromClient({ x: event.clientX, y: event.clientY }, geometry) : position;
      const bounds = event.currentTarget.getBoundingClientRect();
      const next = geometry ? clampLegendToVisibleSurface(
        { x: local.x - drag.offsetX, y: local.y - drag.offsetY },
        { width: bounds.width, height: bounds.height },
        geometry,
      ) : position;
      dragRef.current = undefined;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      commitPosition(next);
    }}
    onPointerCancel={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = undefined;
      setPosition(document.legend.position);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
  >
    <strong>Legend</strong>
    {entries.map((entry) => <span key={entry.id} data-legend-id={entry.id} data-legend-role={entry.role}><i />{entry.label}</span>)}
  </aside>;
}
