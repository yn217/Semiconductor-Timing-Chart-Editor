import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { CanonicalDocument, Transaction, TransactionId } from "@timing-chart-v2/schema";
import type { TransactionLaneCommandActions } from "../application/editor-surface-command-controller.js";
import { InlineNameInput } from "../inline-name-input.js";

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
type GroupHeaderBand = { readonly key: string; readonly top: number; readonly label: string; readonly color: string | undefined; readonly count: number; readonly groupId: string | undefined; readonly collapsed: boolean };

type TransactionDragEdge = "body" | "start" | "end";
type TransactionPreview = Readonly<{ start: number; end: number }>;

function previewTransaction(transaction: Transaction, edge: TransactionDragEdge, value: number, cycleCount: number): TransactionPreview {
  if (edge === "body") {
    const duration = transaction.end - transaction.start;
    const start = Math.max(0, Math.min(cycleCount - duration, value));
    return { start, end: start + duration };
  }
  return edge === "start"
    ? { start: Math.max(0, Math.min(value, transaction.end - 1)), end: transaction.end }
    : { start: transaction.start, end: Math.min(cycleCount, Math.max(value, transaction.start + 1)) };
}

function previewPhases(transaction: Transaction, preview: TransactionPreview, edge: TransactionDragEdge): readonly NonNullable<Transaction["phases"]>[number][] | undefined {
  if (!transaction.phases) return undefined;
  if (edge === "body") {
    const delta = preview.start - transaction.start;
    return transaction.phases.map((phase) => ({ ...phase, start: phase.start + delta, end: phase.end + delta }));
  }
  return transaction.phases.map((phase) => ({ ...phase, start: Math.max(preview.start, phase.start), end: Math.min(preview.end, phase.end) })).filter((phase) => phase.start < phase.end);
}

function TransactionBar({ transaction, row, color, selected, cycleCount, getBoundaryX, onSnap, onSelect, commands, onContextMenu }: {
  readonly transaction: Transaction;
  readonly row: number;
  readonly color: string | undefined;
  readonly selected: boolean;
  readonly cycleCount: number;
  readonly getBoundaryX: (cycle: number) => number | undefined;
  readonly onSnap: (clientX: number) => number | undefined;
  readonly onSelect: (id: TransactionId) => void;
  readonly commands: Pick<TransactionLaneCommandActions, "move" | "resize">;
  readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void;
}) {
  const [drag, setDrag] = useState<{ edge: TransactionDragEdge }>();
  const [preview, setPreview] = useState<TransactionPreview>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = preview ?? { start: transaction.start, end: transaction.end };
  const startX = getBoundaryX(current.start);
  const endX = getBoundaryX(current.end);
  const phases = preview === undefined ? transaction.phases : previewPhases(transaction, preview, drag?.edge ?? "body");

  useEffect(() => {
    if (!drag) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrag(undefined);
        setPreview(undefined);
      }
    };
    window.document.addEventListener("keydown", onKeyDown);
    return () => window.document.removeEventListener("keydown", onKeyDown);
  }, [drag]);

  if (startX === undefined || endX === undefined) return null;
  const updatePreview = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const cycle = onSnap(event.clientX);
    if (cycle === undefined) return;
    setPreview(previewTransaction(transaction, drag.edge, cycle, cycleCount));
  };
  const begin = (event: ReactPointerEvent<HTMLElement>, edge: TransactionDragEdge) => {
    event.preventDefault();
    event.stopPropagation();
    buttonRef.current?.setPointerCapture(event.pointerId);
    setDrag({ edge });
    setPreview({ start: transaction.start, end: transaction.end });
  };
  const cancel = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    setDrag(undefined);
    setPreview(undefined);
  };
  const finish = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    event.preventDefault();
    const cycle = onSnap(event.clientX);
    const final = cycle === undefined ? preview : previewTransaction(transaction, drag.edge, cycle, cycleCount);
    setDrag(undefined);
    setPreview(undefined);
    if (!final || (final.start === transaction.start && final.end === transaction.end)) return;
    if (drag.edge === "body") commands.move(transaction.id, final.start);
    else commands.resize(transaction.id, drag.edge, drag.edge === "start" ? final.start : final.end);
  };

  return <button ref={buttonRef} type="button" data-transaction-id={transaction.id} data-selected={String(selected)} data-drag-preview={String(preview !== undefined)} style={{ left: startX, width: endX - startX, top: 4 + row * LANE_ROW_HEIGHT, ...(color ? { "--transaction-color": color } as CSSProperties : {}) }} onClick={() => onSelect(transaction.id)} onContextMenu={(event) => { event.preventDefault(); onSelect(transaction.id); onContextMenu?.(event, transaction.id); }} onPointerMove={updatePreview} onPointerUp={finish} onPointerCancel={cancel}><i data-edge="start" onPointerDown={(event) => begin(event, "start")} /><span onPointerDown={(event) => begin(event, "body")}>{transaction.name}</span><div className="transaction-phases" aria-hidden="true">{phases?.map((phase) => { const from = getBoundaryX(phase.start); const to = getBoundaryX(phase.end); if (from === undefined || to === undefined || endX <= startX) return null; return <small key={`${phase.start}:${phase.end}:${phase.name}`} title={`${phase.name}: ${phase.start}–${phase.end}`} style={{ left: `${100 * (from - startX) / (endX - startX)}%`, width: `${100 * (to - from) / (endX - startX)}%` }}>{phase.name}</small>; })}</div><i data-edge="end" onPointerDown={(event) => begin(event, "end")} /></button>;
}

export function TransactionLanes({ document: rawDocument, documentEpoch, zoom, selectedId, filter = "", getBoundaryX, onSelect, onSnap, commands, onContextMenu }: { readonly document: CanonicalDocument; readonly documentEpoch: number; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly filter?: string; readonly getBoundaryX: (cycle: number) => number | undefined; readonly onSelect: (id: TransactionId) => void; readonly onSnap: (clientX: number) => number | undefined; readonly commands: Pick<TransactionLaneCommandActions, "move" | "resize" | "renameTransactionGroup" | "deleteTransactionGroup">; readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void }) {
  // #451: one shared filter narrows both the Tree rows (in the label
  // column below) and the central bars together -- searching never hides
  // a Transaction from one surface while leaving it selectable from the
  // other. A selected Transaction that the filter would hide stays
  // selectable/visible-elsewhere (Inspector/Bottom aren't filtered by this
  // box), matching how the Signal Tree's own text filter never touches
  // Inspector/Bottom's own current selection.
  const needle = filter.trim().toLocaleLowerCase();
  const transactionGroupById = new Map<string, NonNullable<CanonicalDocument["transactionGroups"]>[number]>((rawDocument.transactionGroups ?? []).map((group) => [group.id, group]));
  const groupNameById = new Map([...transactionGroupById].map(([id, group]) => [id, group.name]));
  const document: CanonicalDocument = needle.length === 0 ? rawDocument : { ...rawDocument, transactions: rawDocument.transactions.filter((transaction) => transaction.id === selectedId || transaction.name.toLocaleLowerCase().includes(needle) || (transaction.groupId !== undefined && (groupNameById.get(transaction.groupId) ?? "").toLocaleLowerCase().includes(needle))) };
  // #397 Transaction Mode GUI Closure: Group collapse/expand -- purely
  // local, transient presentation state (never persisted, never touches
  // Canonical), same "view-only toggle" shape as the Signal Tree's own
  // Group collapse. Kept local to this component rather than lifted into
  // shared workspace state since nothing else needs to read it.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const previousDocumentEpoch = useRef(documentEpoch);
  useEffect(() => {
    if (previousDocumentEpoch.current === documentEpoch) return;
    previousDocumentEpoch.current = documentEpoch;
    setCollapsedGroups(new Set());
  }, [documentEpoch]);
  const toggleGroupCollapsed = (key: string) => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const owner = useRef<HTMLElement>(null);
  const relevantCycles = [...new Set(document.transactions.flatMap((transaction) => [transaction.start, transaction.end, ...(transaction.phases ?? []).flatMap(phase => [phase.start, phase.end])]))].sort((left, right) => left - right);
  const cycleXs = relevantCycles.flatMap((cycle) => { const x = getBoundaryX(cycle); return x === undefined ? [] : [{ cycle, x }]; });
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
  const laneKey = (groupId: string | undefined, laneId: string) => `${groupId ?? "ungrouped"}\u0000${laneId}`;
  const laneTransactionsByKey = new Map<string, Transaction[]>();
  for (const transaction of document.transactions) {
    const laneId = transaction.laneId ?? "lane_0";
    const key = laneKey(transaction.groupId, laneId);
    const laneTransactions = laneTransactionsByKey.get(key);
    if (laneTransactions) laneTransactions.push(transaction);
    else laneTransactionsByKey.set(key, [transaction]);
  }
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
    const sectionKey = section.groupId ?? "ungrouped";
    const collapsed = section.label !== undefined && collapsedGroups.has(sectionKey);
    if (section.label !== undefined) {
      const count = document.transactions.filter((transaction) => transaction.groupId === section.groupId).length;
      groupHeaders.push({ key: `group:${sectionKey}`, top: cursor, label: section.label, color: section.color, count, groupId: section.groupId, collapsed });
      cursor += GROUP_HEADER_HEIGHT;
    }
    // #397: a collapsed Group's Lanes contribute zero height and render
    // nothing -- Transactions inside stay fully intact in the document
    // (view-only), just not laid out while their Group is collapsed.
    if (collapsed) continue;
    for (const laneId of section.lanes) {
      const laneTransactions = laneTransactionsByKey.get(laneKey(section.groupId, laneId)) ?? [];
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
      {groupHeaders.map((header) => {
        const group = header.groupId === undefined ? undefined : transactionGroupById.get(header.groupId);
        return <div key={header.key} className="transaction-group-header" data-testid="transaction-group-header" data-collapsed={String(header.collapsed)} style={{ top: header.top, height: GROUP_HEADER_HEIGHT }}>
          <button type="button" className="transaction-group-header-chevron" aria-label={header.collapsed ? `Expand ${header.label}` : `Collapse ${header.label}`} aria-expanded={!header.collapsed} onClick={() => toggleGroupCollapsed(header.groupId ?? "ungrouped")}>{header.collapsed ? "▶" : "▼"}</button>
          {header.color && <i className="transaction-group-swatch" aria-hidden="true" style={{ background: header.color }} />}
          {/* #397 Transaction Mode GUI Closure: rename/delete had zero GUI
              entry point (commands already existed) -- "Ungrouped" is a
              view-only pseudo-section (no real Group behind it), so it
              keeps the plain label instead of gaining fake rename/delete
              controls. */}
          {group ? <InlineNameInput target={group} value={group.name} ariaLabel={`Rename Group ${group.name}`} onRename={(name) => commands.renameTransactionGroup(group.id, name)} /> : <span>{header.label}</span>}
          <span className="transaction-group-header-count">({header.count})</span>
          {group && <button type="button" className="transaction-group-header-delete" aria-label={`Ungroup ${group.name}`} title="Ungroup (deletes the Group, keeps its Transactions)" onClick={() => commands.deleteTransactionGroup(group.id)}>×</button>}
        </div>;
      })}
      {laneBands.map((band) => {
        // #451/#452 convergence: the same per-Transaction rows the central
        // bars occupy are also listed here, by name, in this sticky label
        // column -- this *is* Transaction Mode's left Tree content for the
        // Lane/Transaction level (Groups above, Transaction names here),
        // reading one shared `document.transactions` + `selectedId`/
        // `onSelect`, not a second selection-owning tree.
        const laneTransactions = laneTransactionsByKey.get(laneKey(band.groupId, band.laneId)) ?? [];
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
        {(laneTransactionsByKey.get(laneKey(band.groupId, band.laneId)) ?? []).map((transaction) => {
          const startX = x(transaction.start);
          const endX = x(transaction.end);
          if (startX === undefined || endX === undefined) return null;
          const row = band.rowOf.get(transaction.id) ?? 0;
          // #429/#397 Transaction Mode Product Closure P0-4: the bar's own
          // color/Group color was resolved and applied to the Tree row's
          // swatch (above) but never reached this actual canvas bar --
          // every Transaction rendered in the same static pale-blue CSS
          // default regardless of its real color. Set as a custom property
          // (not `background` directly) so the CSS selected-state rule
          // (`[data-selected="true"]`, higher specificity) still wins by
          // the normal cascade instead of being permanently shadowed by an
          // inline style -- the same interaction-priority bug already
          // fixed for Signal rows under #472.
          const resolvedColor = transaction.color ?? (transaction.groupId === undefined ? undefined : transactionGroupById.get(transaction.groupId)?.color);
          return <TransactionBar key={transaction.id} transaction={transaction} row={row} color={resolvedColor} selected={selectedId === transaction.id} cycleCount={document.timeline.cycleCount} getBoundaryX={getBoundaryX} onSnap={onSnap} onSelect={onSelect} commands={commands} {...(onContextMenu === undefined ? {} : { onContextMenu })} />;
        })}
      </div>)}
    </div>
  </section>;
}
