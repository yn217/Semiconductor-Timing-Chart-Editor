import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { CanonicalDocument, Transaction, TransactionId } from "@timing-chart-v2/schema";
import type { TransactionLaneCommandActions } from "../application/editor-surface-command-controller.js";

const LANE_ROW_HEIGHT = 40;
const GROUP_HEADER_HEIGHT = 24;

// #452: within one lane, Transactions whose [start,end) ranges overlap must
// stack into separate rows rather than fully occluding each other -- a
// standard greedy interval-scheduling pass (sorted by start, each item
// takes the first row whose last-placed end is already <= its own start)
// gives a deterministic, minimal-row assignment with no dependency on
// document/array order beyond that sort.
function assignStackRows(transactions: readonly Transaction[]): { readonly rowOf: ReadonlyMap<TransactionId, number>; readonly rowCount: number } {
  const sorted = [...transactions].sort((left, right) => left.start - right.start);
  const rowEnds: number[] = [];
  const rowOf = new Map<TransactionId, number>();
  for (const transaction of sorted) {
    let row = rowEnds.findIndex((end) => end <= transaction.start);
    if (row === -1) { row = rowEnds.length; rowEnds.push(transaction.end); }
    else rowEnds[row] = transaction.end;
    rowOf.set(transaction.id, row);
  }
  return { rowOf, rowCount: Math.max(1, rowEnds.length) };
}

type LaneBand = { readonly key: string; readonly laneId: string; readonly groupId: string | undefined; readonly top: number; readonly height: number; readonly rowOf: ReadonlyMap<TransactionId, number>; readonly treeRowOf: ReadonlyMap<TransactionId, number> };
type GroupHeaderBand = { readonly key: string; readonly top: number; readonly label: string; readonly color: string | undefined };

export function TransactionLanes({ document: rawDocument, zoom, selectedId, filter = "", getBoundaryX, onSelect, onSnap, commands, onContextMenu }: { readonly document: CanonicalDocument; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly filter?: string; readonly getBoundaryX: (cycle: number) => number | undefined; readonly onSelect: (id: TransactionId) => void; readonly onSnap: (clientX: number) => number | undefined; readonly commands: Pick<TransactionLaneCommandActions, "move" | "resize">; readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void }) {
  // #451: one shared filter narrows both the Tree rows (in the label
  // column below) and the central bars together -- searching never hides
  // a Transaction from one surface while leaving it selectable from the
  // other. A selected Transaction that the filter would hide stays
  // selectable/visible-elsewhere (Inspector/Bottom aren't filtered by this
  // box), matching how the Signal Tree's own text filter never touches
  // Inspector/Bottom's own current selection.
  const needle = filter.trim().toLocaleLowerCase();
  const groupNameById = new Map((rawDocument.transactionGroups ?? []).map((group) => [group.id, group.name]));
  const document: CanonicalDocument = needle.length === 0 ? rawDocument : { ...rawDocument, transactions: rawDocument.transactions.filter((transaction) => transaction.id === selectedId || transaction.name.toLocaleLowerCase().includes(needle) || (transaction.groupId !== undefined && (groupNameById.get(transaction.groupId) ?? "").toLocaleLowerCase().includes(needle))) };
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
  const relevantCycles = [...new Set(document.transactions.flatMap((transaction) => [transaction.start, transaction.end, ...(transaction.phases ?? []).flatMap(phase => [phase.start, phase.end])]))].sort((left, right) => left - right);
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
      if (start !== transaction.start) commands.move(transaction.id, start);
    } else {
      const value = drag.edge === "start" ? Math.min(cycle, transaction.end - 1) : Math.max(cycle, transaction.start + 1);
      if (value !== transaction[drag.edge]) commands.resize(transaction.id, drag.edge, value);
    }
  };
  const capture = (event: React.PointerEvent, next: { id: TransactionId; edge: "body" | "start" | "end" }) => { event.stopPropagation(); event.currentTarget.parentElement?.setPointerCapture(event.pointerId); setDrag({ ...next, startX: event.clientX }); };
  const x = (cycle: number) => cycleXs.find((value) => value.cycle === cycle)?.x;

  // #452: Group headers only appear once real Groups are in use -- a
  // document with no `transactionGroups` (or none actually referenced)
  // renders the exact same flat lane list this component always has, so
  // existing single-group documents/tests see byte-for-byte unchanged
  // layout. Lanes are scoped to their own Group's section once grouped
  // (the same laneId string in two different Groups is two independent
  // tracks, not one shared one), matching the approved reference's
  // "Memory / Lane 0" vs "CPU / Lane 1" structure.
  const groups = document.transactionGroups ?? [];
  const hasGroups = groups.length > 0 && document.transactions.some((transaction) => transaction.groupId !== undefined);
  type Section = { readonly groupId: string | undefined; readonly label: string | undefined; readonly color: string | undefined; readonly lanes: readonly string[] };
  const sections: readonly Section[] = hasGroups
    ? (() => {
        const lanesByGroup = new Map<string | undefined, Set<string>>();
        for (const transaction of document.transactions) {
          const key = transaction.groupId;
          const lane = transaction.laneId ?? "lane_0";
          if (!lanesByGroup.has(key)) lanesByGroup.set(key, new Set());
          lanesByGroup.get(key)!.add(lane);
        }
        const ordered = [...groups].sort((left, right) => left.order - right.order);
        const result: Section[] = [];
        for (const group of ordered) {
          const lanes = [...(lanesByGroup.get(group.id) ?? [])].sort();
          if (lanes.length > 0) result.push({ groupId: group.id, label: group.name, color: group.color, lanes });
        }
        const ungroupedLanes = [...(lanesByGroup.get(undefined) ?? [])].sort();
        if (ungroupedLanes.length > 0) result.push({ groupId: undefined, label: "Ungrouped", color: undefined, lanes: ungroupedLanes });
        return result;
      })()
    : [{ groupId: undefined, label: undefined, color: undefined, lanes: [...new Set(["lane_0", ...document.transactions.map((transaction) => transaction.laneId ?? "lane_0")])].sort() }];

  const groupHeaders: GroupHeaderBand[] = [];
  const laneBands: LaneBand[] = [];
  let cursor = 0;
  for (const section of sections) {
    if (section.label !== undefined) {
      groupHeaders.push({ key: `group:${section.groupId ?? "ungrouped"}`, top: cursor, label: section.label, color: section.color });
      cursor += GROUP_HEADER_HEIGHT;
    }
    for (const laneId of section.lanes) {
      const laneTransactions = document.transactions.filter((transaction) => transaction.groupId === section.groupId && (transaction.laneId ?? "lane_0") === laneId);
      const { rowOf, rowCount } = assignStackRows(laneTransactions);
      // #451/#452: the Tree label list needs one row per Transaction
      // ALWAYS (two Transactions that don't overlap in time still need
      // two separate, independently-clickable list lines), whereas the
      // central bars only need a new row when two Transactions actually
      // overlap -- `rowOf` (time-based) is correct for bar placement but
      // wrong for the Tree: two sequential, non-overlapping Transactions
      // in one lane would both land on `rowOf=0` and render on top of
      // each other in the label column. `treeRowOf` is a separate,
      // always-one-row-per-Transaction sequence (stable start-then-id
      // order), and the lane's height is whichever of the two needs more
      // room, so neither the bars nor the Tree rows ever overlap.
      const treeRowOf = new Map([...laneTransactions].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)).map((transaction, index) => [transaction.id, index] as const));
      const height = Math.max(rowCount, laneTransactions.length, 1) * LANE_ROW_HEIGHT;
      laneBands.push({ key: `lane:${section.groupId ?? "ungrouped"}:${laneId}`, laneId, groupId: section.groupId, top: cursor, height, rowOf, treeRowOf });
      cursor += height;
    }
  }
  const totalHeight = Math.max(cursor, LANE_ROW_HEIGHT);

  return <section ref={owner} className="transaction-lanes" data-testid="transaction-lanes" style={{ "--transaction-zoom": zoom, height: totalHeight } as React.CSSProperties}>
    <div className="transaction-lane-labels">
      {groupHeaders.map((header) => <div key={header.key} className="transaction-group-header" data-testid="transaction-group-header" style={{ top: header.top, height: GROUP_HEADER_HEIGHT }}>{header.color && <i className="transaction-group-swatch" aria-hidden="true" style={{ background: header.color }} />}{header.label}</div>)}
      {laneBands.map((band) => {
        // #451/#452 convergence: the same per-Transaction rows the central
        // bars occupy are also listed here, by name, in this sticky label
        // column -- this *is* Transaction Mode's left Tree content for the
        // Lane/Transaction level (Groups above, Transaction names here),
        // reading one shared `document.transactions` + `selectedId`/
        // `onSelect`, not a second selection-owning tree.
        const laneTransactions = document.transactions.filter((transaction) => transaction.groupId === band.groupId && (transaction.laneId ?? "lane_0") === band.laneId);
        return <span key={band.key} className="transaction-lane-label" data-testid="transaction-lane-label" style={{ top: band.top, height: band.height }}>
          {laneTransactions.length === 0 && <em>{band.laneId.replace(/^lane_(\d+)$/i, "Lane $1")}</em>}
          {laneTransactions.map((transaction) => <button type="button" key={transaction.id} className="transaction-lane-label-row" data-testid={`transaction-tree-row-${transaction.id}`} data-selected={String(selectedId === transaction.id)} style={{ top: 4 + (band.treeRowOf.get(transaction.id) ?? 0) * LANE_ROW_HEIGHT }} onClick={() => onSelect(transaction.id)}><i className="transaction-lane-label-swatch" aria-hidden="true" style={{ background: transaction.color ?? groups.find((group) => group.id === transaction.groupId)?.color ?? "#8895a7" }} />{transaction.name}</button>)}
        </span>;
      })}
    </div>
    <div className="transaction-track" style={{ height: totalHeight }}>
      {groupHeaders.map((header) => <div key={header.key} className="transaction-group-header-band" aria-hidden="true" style={{ top: header.top, height: GROUP_HEADER_HEIGHT }} />)}
      {laneBands.map((band) => <div className="transaction-lane" key={band.key} data-lane-id={band.laneId} style={{ top: band.top, height: band.height }}>
        {cycleXs.map((value) => <i className="transaction-geometry-line" aria-hidden="true" key={`cycle-${value.cycle}`} data-cycle={value.cycle} style={{ left: value.x }} />)}
        {document.transactions.filter((transaction) => transaction.groupId === band.groupId && (transaction.laneId ?? "lane_0") === band.laneId).map((transaction) => {
          const startX = x(transaction.start);
          const endX = x(transaction.end);
          if (startX === undefined || endX === undefined) return null;
          const row = band.rowOf.get(transaction.id) ?? 0;
          return <button type="button" key={transaction.id} data-transaction-id={transaction.id} data-selected={String(selectedId === transaction.id)} style={{ left: startX, width: endX - startX, top: 4 + row * LANE_ROW_HEIGHT }} onClick={() => onSelect(transaction.id)} onContextMenu={(event) => { event.preventDefault(); onSelect(transaction.id); onContextMenu?.(event, transaction.id); }} onPointerUp={(event) => finish(event, transaction)} onPointerCancel={cancel}><i data-edge="start" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "start" })} /><span onPointerDown={(event) => capture(event, { id: transaction.id, edge: "body" })}>{transaction.name}</span><div className="transaction-phases" aria-hidden="true">{transaction.phases?.map((phase) => { const from = x(phase.start); const to = x(phase.end); if (from === undefined || to === undefined || endX <= startX) return null; return <small key={`${phase.start}:${phase.end}:${phase.name}`} title={`${phase.name}: ${phase.start}–${phase.end}`} style={{ left: `${100 * (from - startX) / (endX - startX)}%`, width: `${100 * (to - from) / (endX - startX)}%` }}>{phase.name}</small>; })}</div><i data-edge="end" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "end" })} /></button>;
        })}
      </div>)}
    </div>
  </section>;
}
