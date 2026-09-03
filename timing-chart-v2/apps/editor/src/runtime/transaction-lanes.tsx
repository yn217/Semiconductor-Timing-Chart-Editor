import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";

export function TransactionLanes({ document, zoom, selectedId, getBoundaryX, onSelect, onSnap, onCommand, onContextMenu }: { readonly document: CanonicalDocument; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly getBoundaryX: (cycle: number) => number | undefined; readonly onSelect: (id: TransactionId) => void; readonly onSnap: (clientX: number) => number | undefined; readonly onCommand: (command: SemanticCommand) => void; readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void }) {
  const lanes = [...new Set(["lane_0", ...document.transactions.map((transaction) => transaction.laneId ?? "lane_0")])].sort();
  const [drag, setDrag] = useState<{ id: TransactionId; edge: "body" | "start" | "end"; startX: number }>();
  const owner = useRef<HTMLElement>(null);
  // Escape must cancel an in-progress drag without committing a semantic
  // command; the listener is only attached while a drag is active so it
  // never competes with unrelated Escape handling elsewhere in the app.
  useEffect(() => {
    if (!drag) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setDrag(undefined); };
    window.document.addEventListener("keydown", onKeyDown);
    return () => window.document.removeEventListener("keydown", onKeyDown);
  }, [drag]);
  const cancel = () => setDrag(undefined);
  const relevantCycles = [...new Set(document.transactions.flatMap((transaction) => [transaction.start, transaction.end]))].sort((left, right) => left - right);
  const cycleXs = relevantCycles.flatMap((cycle) => { const x = getBoundaryX(cycle); return x === undefined ? [] : [{ cycle, x }]; });
  const finish = (event: React.PointerEvent, transaction: Transaction) => {
    if (!drag || drag.id !== transaction.id) return;
    setDrag(undefined);
    if (event.clientX === drag.startX) return;
    const cycle = onSnap(event.clientX);
    if (cycle === undefined) return;
    if (drag.edge === "body") {
      const duration = transaction.end - transaction.start;
      const start = Math.max(0, Math.min(document.timeline.cycleCount - duration, cycle));
      if (start !== transaction.start) onCommand({ id: nextCommandId("transaction_snap_move"), type: "transaction.move", transactionId: transaction.id, start });
    } else {
      const value = drag.edge === "start" ? Math.min(cycle, transaction.end - 1) : Math.max(cycle, transaction.start + 1);
      if (value !== transaction[drag.edge]) onCommand({ id: nextCommandId("transaction_snap_resize"), type: "transaction.resize", transactionId: transaction.id, edge: drag.edge, value });
    }
  };
  const capture = (event: React.PointerEvent, next: { id: TransactionId; edge: "body" | "start" | "end" }) => { event.stopPropagation(); event.currentTarget.parentElement?.setPointerCapture(event.pointerId); setDrag({ ...next, startX: event.clientX }); };
  const x = (cycle: number) => cycleXs.find((value) => value.cycle === cycle)?.x;
  return <section ref={owner} className="transaction-lanes" data-testid="transaction-lanes" style={{ "--transaction-zoom": zoom } as React.CSSProperties}><div className="transaction-lane-labels">{lanes.map((lane) => <span key={lane}>{lane}</span>)}</div><div className="transaction-track">{lanes.map((lane, laneIndex) => <div className="transaction-lane" key={lane} style={{ top: laneIndex * 28 }}>{cycleXs.map((value) => <i className="transaction-geometry-line" aria-hidden="true" key={`cycle-${value.cycle}`} data-cycle={value.cycle} style={{ left: value.x }} />)}{document.transactions.filter((transaction) => (transaction.laneId ?? "lane_0") === lane).map((transaction) => { const startX = x(transaction.start); const endX = x(transaction.end); if (startX === undefined || endX === undefined) return null; return <button type="button" key={transaction.id} data-transaction-id={transaction.id} data-selected={String(selectedId === transaction.id)} style={{ left: startX, width: endX - startX }} onClick={() => onSelect(transaction.id)} onContextMenu={(event) => { event.preventDefault(); onSelect(transaction.id); onContextMenu?.(event, transaction.id); }} onPointerUp={(event) => finish(event, transaction)} onPointerCancel={cancel}><i data-edge="start" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "start" })} /><span onPointerDown={(event) => capture(event, { id: transaction.id, edge: "body" })}>{transaction.name}</span><i data-edge="end" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "end" })} /></button>; })}</div>)}</div></section>;
}
