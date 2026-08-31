import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";

export function LegendView({ document, onCommand }: { readonly document: CanonicalDocument; readonly onCommand: (command: SemanticCommand) => void }) {
  const [position, setPosition] = useState(document.legend.position);
  const dragRef = useRef<{ readonly offsetX: number; readonly offsetY: number } | undefined>(undefined);
  useEffect(() => setPosition(document.legend.position), [document.legend.position.x, document.legend.position.y]);
  if (!document.legend.show) return null;
  const defaultRoles = document.legend.usedRolesOnly ? [...new Set(document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.role))] : ["input", "output", "internal"];
  const entries = document.legend.items?.length ? [...document.legend.items].filter((entry) => entry.visible).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)).map((entry) => ({ id: entry.id, role: entry.role, label: entry.label })) : defaultRoles.map((role) => ({ id: `legend_${role}`, role, label: role }));
  const commitPosition = (next: { readonly x: number; readonly y: number }) => {
    if (next.x === document.legend.position.x && next.y === document.legend.position.y) return;
    onCommand({ id: nextCommandId("legend_position"), type: "legend.update", legend: { ...document.legend, position: next } });
  };
  const nudge = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    const next = { x: position.x + dx, y: position.y + dy };
    setPosition(next);
    commitPosition(next);
  };
  return <aside className={`editor-legend ${document.legend.orientation}`} data-testid="editor-legend" aria-label="Legend" tabIndex={0} data-legend-position-x={position.x} data-legend-position-y={position.y} style={{ left: `${position.x}px`, top: `${position.y}px` }} onKeyDown={nudge} onPointerDown={(event) => { if (event.button !== 0) return; dragRef.current = { offsetX: event.clientX - position.x, offsetY: event.clientY - position.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!dragRef.current) return; setPosition({ x: event.clientX - dragRef.current.offsetX, y: event.clientY - dragRef.current.offsetY }); }} onPointerUp={(event) => { if (!dragRef.current) return; const next = { x: event.clientX - dragRef.current.offsetX, y: event.clientY - dragRef.current.offsetY }; dragRef.current = undefined; setPosition(next); event.currentTarget.releasePointerCapture(event.pointerId); commitPosition(next); }} onPointerCancel={() => { dragRef.current = undefined; }}><strong>Legend</strong>{entries.map((entry) => <span key={entry.id} data-legend-id={entry.id} data-legend-role={entry.role}><i />{entry.label}</span>)}</aside>;
}
