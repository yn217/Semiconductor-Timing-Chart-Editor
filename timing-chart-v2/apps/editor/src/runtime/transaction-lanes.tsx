import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { CanonicalDocument, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { EditorIcon } from "../editor-icon.js";
import type { TransactionLaneCommandActions } from "../application/editor-surface-command-controller.js";
import { InlineNameInput } from "../inline-name-input.js";

const LANE_ROW_HEIGHT = 40;
const GROUP_HEADER_HEIGHT = 24;
let transactionLanesMountSerial = 0;
const EMPTY_TRANSACTION_GROUPS: NonNullable<CanonicalDocument["transactionGroups"]> = [];

// #452: within one lane, Transactions whose [start,end) ranges overlap must
// stack into separate rows rather than fully occluding each other -- a
// standard greedy interval-scheduling pass (sorted by start, each item
// takes the first row whose last-placed end is already <= its own start)
// gives a deterministic, minimal-row assignment with no dependency on
// document/array order beyond that sort.
function assignStackRows(transactions: readonly Transaction[]): { readonly rowOf: ReadonlyMap<TransactionId, number>; readonly rowCount: number } {
  const sorted = [...transactions].sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
  // A linear scan of every existing row made dense lanes quadratic. Keep the
  // next available row in a min-heap keyed by its end cycle instead.
  const available: Array<{ end: number; row: number }> = [];
  const push = (item: { end: number; row: number }) => {
    available.push(item);
    let index = available.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const current = available[index]!;
      const parentItem = available[parent]!;
      if (parentItem.end < current.end || (parentItem.end === current.end && parentItem.row <= current.row)) break;
      available[index] = parentItem;
      available[parent] = current;
      index = parent;
    }
  };
  const pop = () => {
    const result = available[0];
    const last = available.pop();
    if (last && available.length > 0) {
      available[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < available.length && (available[left]!.end < available[smallest]!.end || (available[left]!.end === available[smallest]!.end && available[left]!.row < available[smallest]!.row))) smallest = left;
        if (right < available.length && (available[right]!.end < available[smallest]!.end || (available[right]!.end === available[smallest]!.end && available[right]!.row < available[smallest]!.row))) smallest = right;
        if (smallest === index) break;
        const current = available[index]!;
        available[index] = available[smallest]!;
        available[smallest] = current;
        index = smallest;
      }
    }
    return result!;
  };
  const rowOf = new Map<TransactionId, number>();
  let rowCount = 0;
  for (const transaction of sorted) {
    const reusable = available[0] !== undefined && available[0].end <= transaction.start ? pop() : undefined;
    const row = reusable?.row ?? rowCount++;
    rowOf.set(transaction.id, row);
    push({ end: transaction.end, row });
  }
  return { rowOf, rowCount: Math.max(1, rowCount) };
}

type LaneBand = { readonly key: string; readonly laneId: string; readonly groupId: string | undefined; readonly labelTop: number; readonly trackTop: number; readonly labelHeight: number; readonly trackHeight: number; readonly rowOf: ReadonlyMap<TransactionId, number>; readonly treeRowOf: ReadonlyMap<TransactionId, number> };
type GroupHeaderBand = { readonly key: string; readonly labelTop: number; readonly trackTop: number; readonly label: string; readonly color: string | undefined; readonly count: number; readonly groupId: string | undefined; readonly collapsed: boolean };

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

function TransactionBar({ transaction, documentEpoch, row, color, selected, cycleCount, getBoundaryX, boundaryXByCycle, onSnap, onSelect, commands, onContextMenu }: {
  readonly transaction: Transaction;
  readonly documentEpoch: number;
  readonly row: number;
  readonly color: string | undefined;
  readonly selected: boolean;
  readonly cycleCount: number;
  readonly getBoundaryX: (cycle: number) => number | undefined;
  readonly boundaryXByCycle: ReadonlyMap<number, number>;
  readonly onSnap: (clientX: number) => number | undefined;
  readonly onSelect: (id: TransactionId) => void;
  readonly commands: Pick<TransactionLaneCommandActions, "move" | "resize">;
  readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void;
}) {
  const [drag, setDrag] = useState<{ edge: TransactionDragEdge; documentEpoch: number }>();
  const [preview, setPreview] = useState<TransactionPreview>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pendingPreviewClientX = useRef<number | undefined>(undefined);
  const previewFrame = useRef<number | undefined>(undefined);
  const current = preview ?? { start: transaction.start, end: transaction.end };
  const resolveBoundaryX = (cycle: number) => preview === undefined ? boundaryXByCycle.get(cycle) : getBoundaryX(cycle);
  const startX = resolveBoundaryX(current.start);
  const endX = resolveBoundaryX(current.end);
  const phases = preview === undefined ? transaction.phases : previewPhases(transaction, preview, drag?.edge ?? "body");

  useEffect(() => {
    return () => {
      if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current);
      previewFrame.current = undefined;
      pendingPreviewClientX.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!drag) return undefined;
    if (drag.documentEpoch !== documentEpoch) { setDrag(undefined); setPreview(undefined); return undefined; }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current);
        previewFrame.current = undefined;
        pendingPreviewClientX.current = undefined;
        setDrag(undefined);
        setPreview(undefined);
      }
    };
    window.document.addEventListener("keydown", onKeyDown);
    return () => window.document.removeEventListener("keydown", onKeyDown);
  }, [drag, documentEpoch]);

  if (startX === undefined || endX === undefined) return null;
  const updatePreview = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.documentEpoch !== documentEpoch) return;
    pendingPreviewClientX.current = event.clientX;
    if (previewFrame.current !== undefined) return;
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = undefined;
      const clientX = pendingPreviewClientX.current;
      pendingPreviewClientX.current = undefined;
      if (clientX === undefined || !drag || drag.documentEpoch !== documentEpoch) return;
      const cycle = onSnap(clientX);
      if (cycle === undefined) return;
      setPreview(previewTransaction(transaction, drag.edge, cycle, cycleCount));
    });
  };
  const begin = (event: ReactPointerEvent<HTMLElement>, edge: TransactionDragEdge) => {
    event.preventDefault();
    event.stopPropagation();
    buttonRef.current?.setPointerCapture(event.pointerId);
    setDrag({ edge, documentEpoch });
    setPreview({ start: transaction.start, end: transaction.end });
  };
  const cancel = (event?: ReactPointerEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current);
    previewFrame.current = undefined;
    pendingPreviewClientX.current = undefined;
    setDrag(undefined);
    setPreview(undefined);
  };
  const finish = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.documentEpoch !== documentEpoch) return;
    event.preventDefault();
    if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current);
    previewFrame.current = undefined;
    pendingPreviewClientX.current = undefined;
    const cycle = onSnap(event.clientX);
    const final = cycle === undefined ? preview : previewTransaction(transaction, drag.edge, cycle, cycleCount);
    setDrag(undefined);
    setPreview(undefined);
    if (!final || (final.start === transaction.start && final.end === transaction.end)) return;
    if (drag.edge === "body") commands.move(transaction.id, final.start);
    else commands.resize(transaction.id, drag.edge, drag.edge === "start" ? final.start : final.end);
  };

  return <button ref={buttonRef} type="button" data-transaction-id={transaction.id} data-selected={String(selected)} data-drag-preview={String(preview !== undefined)} style={{ left: startX, width: endX - startX, top: 4 + row * LANE_ROW_HEIGHT, ...(color ? { "--transaction-color": color } as CSSProperties : {}) }} onClick={() => onSelect(transaction.id)} onContextMenu={(event) => { event.preventDefault(); onSelect(transaction.id); onContextMenu?.(event, transaction.id); }} onPointerMove={updatePreview} onPointerUp={finish} onPointerCancel={cancel}><i data-edge="start" onPointerDown={(event) => begin(event, "start")} /><span onPointerDown={(event) => begin(event, "body")}>{transaction.name}</span><div className="transaction-phases" aria-hidden="true">{phases?.map((phase) => { const from = resolveBoundaryX(phase.start); const to = resolveBoundaryX(phase.end); if (from === undefined || to === undefined || endX <= startX) return null; return <small key={`${phase.start}:${phase.end}:${phase.name}`} title={`${phase.name}: ${phase.start}–${phase.end}`} style={{ left: `${100 * (from - startX) / (endX - startX)}%`, width: `${100 * (to - from) / (endX - startX)}%` }}>{phase.name}</small>; })}</div><i data-edge="end" onPointerDown={(event) => begin(event, "end")} /></button>;
}

export function TransactionLanes({ document: rawDocument, documentEpoch, presentationRevision, zoom, selectedId, filter = "", getBoundaryX, onSelect, onSnap, commands, onContextMenu }: { readonly document: CanonicalDocument; readonly documentEpoch: number; readonly presentationRevision?: number; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly filter?: string; readonly getBoundaryX: (cycle: number) => number | undefined; readonly onSelect: (id: TransactionId) => void; readonly onSnap: (clientX: number) => number | undefined; readonly commands: Pick<TransactionLaneCommandActions, "move" | "resize" | "renameTransactionGroup" | "deleteTransactionGroup">; readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void }) {
  const mountSerial = useRef(++transactionLanesMountSerial);
  const laneIndexBuilds = useRef(0);
  const stackRowBuilds = useRef(0);
  const treeRowBuilds = useRef(0);
  const stackRowsCache = useRef(new WeakMap<readonly Transaction[], ReturnType<typeof assignStackRows>>());
  const treeRowsCache = useRef(new WeakMap<readonly Transaction[], ReadonlyMap<TransactionId, number>>());
  const laneArrayCache = useRef<ReadonlyMap<string, readonly Transaction[]> | undefined>(undefined);
  const laneTransactionCache = useRef<ReadonlyMap<TransactionId, Transaction> | undefined>(undefined);
  const laneKeyCache = useRef<ReadonlyMap<TransactionId, string> | undefined>(undefined);
  const laneOrderCache = useRef<readonly TransactionId[] | undefined>(undefined);
  // #451: one shared filter narrows both the Tree rows (in the label
  // column below) and the central bars together -- searching never hides
  // a Transaction from one surface while leaving it selectable from the
  // other. A selected Transaction that the filter would hide stays
  // selectable/visible-elsewhere (Inspector/Bottom aren't filtered by this
  // box), matching how the Signal Tree's own text filter never touches
  // Inspector/Bottom's own current selection.
  const needle = filter.trim().toLocaleLowerCase();
  const transactionGroupById = useMemo(() => new Map<string, NonNullable<CanonicalDocument["transactionGroups"]>[number]>((rawDocument.transactionGroups ?? []).map((group) => [group.id, group])), [rawDocument.transactionGroups]);
  const groupNameById = useMemo(() => new Map([...transactionGroupById].map(([id, group]) => [id, group.name])), [transactionGroupById]);
  const document = useMemo<CanonicalDocument>(() => needle.length === 0 ? rawDocument : { ...rawDocument, transactions: rawDocument.transactions.filter((transaction) => transaction.id === selectedId || transaction.name.toLocaleLowerCase().includes(needle) || (transaction.groupId !== undefined && (groupNameById.get(transaction.groupId) ?? "").toLocaleLowerCase().includes(needle))) }, [groupNameById, needle, rawDocument, selectedId]);
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
  const { cycleXs, boundaryXByCycle } = useMemo(() => {
    const relevantCycles = [...new Set(document.transactions.flatMap((transaction) => [transaction.start, transaction.end, ...(transaction.phases ?? []).flatMap(phase => [phase.start, phase.end])]))].sort((left, right) => left - right);
    const cycleXs = relevantCycles.flatMap((cycle) => { const x = getBoundaryX(cycle); return x === undefined ? [] : [{ cycle, x }]; });
    return { cycleXs, boundaryXByCycle: new Map(cycleXs.map(({ cycle, x }) => [cycle, x] as const)) };
  }, [document.transactions, getBoundaryX, presentationRevision]);
  const x = (cycle: number) => boundaryXByCycle.get(cycle);

  // #452: Group headers only appear once real Groups are in use -- a
  // document with no `transactionGroups` (or none actually referenced)
  // renders the exact same flat lane list this component always has, so
  // existing single-group documents/tests see byte-for-byte unchanged
  // layout. Lanes are scoped to their own Group's section once grouped
    // (the same laneId string in two different Groups is two independent
  // tracks, not one shared one), matching the approved reference's
  // "Memory / Lane 0" vs "CPU / Lane 1" structure.
  const groups = document.transactionGroups ?? EMPTY_TRANSACTION_GROUPS;
  const laneKey = (groupId: string | undefined, laneId: string) => `${groupId ?? "ungrouped"}\u0000${laneId}`;
  const { laneTransactionsByKey, transactionCountByGroup } = useMemo(() => {
    laneIndexBuilds.current += 1;
    const previous = laneArrayCache.current;
    const previousTransactions = laneTransactionCache.current;
    const previousKeys = laneKeyCache.current;
    const changedKeys = new Set<string>();
    const transactionCountByGroup = new Map<string | undefined, number>();
    const currentTransactions = new Map<TransactionId, Transaction>();
    const currentKeys = new Map<TransactionId, string>();
    const currentOrder: TransactionId[] = [];
    for (const transaction of document.transactions) {
      const laneId = transaction.laneId ?? "lane_0";
      const key = laneKey(transaction.groupId, laneId);
      currentTransactions.set(transaction.id, transaction);
      currentKeys.set(transaction.id, key);
      currentOrder.push(transaction.id);
      const before = previousTransactions?.get(transaction.id);
      if (before !== transaction) {
        changedKeys.add(key);
        const previousKey = previousKeys?.get(transaction.id);
        if (previousKey !== undefined) changedKeys.add(previousKey);
      }
      transactionCountByGroup.set(transaction.groupId, (transactionCountByGroup.get(transaction.groupId) ?? 0) + 1);
    }
    if (previousTransactions) {
      if (laneOrderCache.current?.length !== currentOrder.length || laneOrderCache.current?.some((id, index) => id !== currentOrder[index])) {
        for (const key of previous?.keys() ?? []) changedKeys.add(key);
        for (const key of currentKeys.values()) changedKeys.add(key);
      }
      for (const [id, before] of previousTransactions) {
        if (!currentTransactions.has(id)) {
          const previousKey = previousKeys?.get(id);
          if (previousKey !== undefined) changedKeys.add(previousKey);
        }
        if (before !== currentTransactions.get(id)) {
          const previousKey = previousKeys?.get(id);
          if (previousKey !== undefined) changedKeys.add(previousKey);
        }
      }
    }
    const laneTransactionsByKey = new Map<string, readonly Transaction[]>(previous ?? []);
    for (const key of changedKeys) laneTransactionsByKey.delete(key);
    const changedBuckets = new Map<string, Transaction[]>();
    for (const transaction of document.transactions) {
      const key = currentKeys.get(transaction.id)!;
      if (!changedKeys.has(key)) continue;
      const bucket = changedBuckets.get(key);
      if (bucket) bucket.push(transaction); else changedBuckets.set(key, [transaction]);
    }
    for (const [key, bucket] of changedBuckets) laneTransactionsByKey.set(key, bucket);
    if (previous === undefined) {
      for (const transaction of document.transactions) {
        const key = currentKeys.get(transaction.id)!;
        if (!laneTransactionsByKey.has(key)) laneTransactionsByKey.set(key, [transaction]);
      }
    }
    laneArrayCache.current = laneTransactionsByKey;
    laneTransactionCache.current = currentTransactions;
    laneKeyCache.current = currentKeys;
    laneOrderCache.current = currentOrder;
    return { laneTransactionsByKey, transactionCountByGroup };
  }, [document.transactions]);
  // Transaction Mode GUI realignment: this used to also require "at least
  // one Transaction already references a Group" -- a freshly-created,
  // still-empty Group (the Tree's own "+" -> Add Transaction Group button)
  // produced a real History entry with zero visible change anywhere,
  // reading as "grouping doesn't work" even though the Group genuinely
  // existed in the document. A Group's existence alone is now enough to
  // switch into grouped layout, and an empty Group still gets its own
  // header row (0 count, no lanes under it) -- the same "you can see what
  // you just created" contract the flat/ungrouped layout already gives
  // every newly-created Transaction.
  const hasGroups = groups.length > 0;
  type Section = { readonly groupId: string | undefined; readonly label: string | undefined; readonly color: string | undefined; readonly lanes: readonly string[] };
  const sections: readonly Section[] = useMemo(() => hasGroups
    ? (() => {
        const lanesByGroup = new Map<string | undefined, Set<string>>();
        for (const transaction of document.transactions) {
          const key = transaction.groupId;
          const lane = transaction.laneId ?? "lane_0";
          if (!lanesByGroup.has(key)) lanesByGroup.set(key, new Set());
          lanesByGroup.get(key)!.add(lane);
        }
        const ordered = [...groups].sort((left, right) => left.order - right.order);
        const result: Section[] = ordered.map((group) => ({ groupId: group.id, label: group.name, color: group.color, lanes: [...(lanesByGroup.get(group.id) ?? [])].sort() }));
        const ungroupedLanes = [...(lanesByGroup.get(undefined) ?? [])].sort();
        if (ungroupedLanes.length > 0) result.push({ groupId: undefined, label: "Ungrouped", color: undefined, lanes: ungroupedLanes });
        return result;
      })()
    : [{ groupId: undefined, label: undefined, color: undefined, lanes: [...new Set(["lane_0", ...document.transactions.map((transaction) => transaction.laneId ?? "lane_0")])].sort() }], [document.transactions, groups, hasGroups]);

  const { groupHeaders, laneBands, totalHeight } = useMemo(() => {
    const groupHeaders: GroupHeaderBand[] = [];
    const laneBands: LaneBand[] = [];
    let labelCursor = 0;
    let trackCursor = 0;
    for (const section of sections) {
    const sectionKey = section.groupId ?? "ungrouped";
    const collapsed = section.label !== undefined && collapsedGroups.has(sectionKey);
    if (section.label !== undefined) {
      const count = transactionCountByGroup.get(section.groupId) ?? 0;
      groupHeaders.push({ key: `group:${sectionKey}`, labelTop: labelCursor, trackTop: trackCursor, label: section.label, color: section.color, count, groupId: section.groupId, collapsed });
      labelCursor += GROUP_HEADER_HEIGHT;
      trackCursor += GROUP_HEADER_HEIGHT;
    }
    // #397: a collapsed Group's Lanes contribute zero height and render
    // nothing -- Transactions inside stay fully intact in the document
    // (view-only), just not laid out while their Group is collapsed.
    if (collapsed) continue;
    for (const laneId of section.lanes) {
      const laneTransactions = laneTransactionsByKey.get(laneKey(section.groupId, laneId)) ?? [];
      let stackRows = stackRowsCache.current.get(laneTransactions);
      if (!stackRows) {
        stackRows = assignStackRows(laneTransactions);
        stackRowBuilds.current += 1;
        stackRowsCache.current.set(laneTransactions, stackRows);
      }
      const { rowOf, rowCount } = stackRows;
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
      let treeRowOf = treeRowsCache.current.get(laneTransactions);
      if (!treeRowOf) {
        treeRowOf = new Map([...laneTransactions].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)).map((transaction, index) => [transaction.id, index] as const));
        treeRowBuilds.current += 1;
        treeRowsCache.current.set(laneTransactions, treeRowOf);
      }
      // Transaction Mode's center label column represents the Lane only;
      // Transaction names live in the bar header, as in the approved
      // reference. Keep the label band to one compact Lane row even when
      // several non-overlapping Transactions share that lane.
      const labelHeight = LANE_ROW_HEIGHT;
      const trackHeight = Math.max(rowCount, 1) * LANE_ROW_HEIGHT;
      laneBands.push({ key: `lane:${section.groupId ?? "ungrouped"}:${laneId}`, laneId, groupId: section.groupId, labelTop: labelCursor, trackTop: trackCursor, labelHeight, trackHeight, rowOf, treeRowOf });
      labelCursor += labelHeight;
      trackCursor += trackHeight;
    }
    }
    return { groupHeaders, laneBands, totalHeight: Math.max(labelCursor, trackCursor, LANE_ROW_HEIGHT) };
  }, [collapsedGroups, laneTransactionsByKey, sections, transactionCountByGroup]);
  const [virtualWindow, setVirtualWindow] = useState({ top: 0, height: 900 });
  useEffect(() => {
    const laneRoot = owner.current;
    const viewport = laneRoot?.closest<HTMLElement>(".cycle-viewport");
    if (!viewport) return;
    const update = () => setVirtualWindow({ top: viewport.scrollTop, height: viewport.clientHeight || 900 });
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [documentEpoch, totalHeight, document.transactions.length, filter]);
  const virtualTop = Math.max(0, virtualWindow.top - 480);
  const virtualBottom = Math.min(totalHeight, virtualWindow.top + virtualWindow.height + 480);
  const isVisible = (top: number, height: number) => top < virtualBottom && top + height > virtualTop;
  const visibleGroupHeaders = groupHeaders.filter((header) => isVisible(header.labelTop, GROUP_HEADER_HEIGHT));
  const bandContainsSelected = (band: LaneBand) => selectedId !== undefined && (laneTransactionsByKey.get(laneKey(band.groupId, band.laneId)) ?? []).some((transaction) => transaction.id === selectedId);
  const visibleLaneBands = laneBands.filter((band) => isVisible(band.labelTop, band.labelHeight) || bandContainsSelected(band));
  const isTreeTransactionVisible = (band: LaneBand, transaction: Transaction) => {
    if (selectedId === transaction.id) return true;
    const row = band.treeRowOf.get(transaction.id) ?? 0;
    return isVisible(band.labelTop + 4 + row * LANE_ROW_HEIGHT, LANE_ROW_HEIGHT);
  };
  const isTrackTransactionVisible = (band: LaneBand, transaction: Transaction) => {
    if (selectedId === transaction.id) return true;
    const row = band.rowOf.get(transaction.id) ?? 0;
    return isVisible(band.trackTop + 4 + row * LANE_ROW_HEIGHT, LANE_ROW_HEIGHT);
  };

  return <section ref={owner} className="transaction-lanes" data-testid="transaction-lanes" data-mount-serial={mountSerial.current} data-lane-index-builds={laneIndexBuilds.current} data-stack-row-builds={stackRowBuilds.current} data-tree-row-builds={treeRowBuilds.current} style={{ "--transaction-zoom": zoom, height: totalHeight } as React.CSSProperties}>
    <div className="transaction-lane-labels">
      {visibleGroupHeaders.map((header) => {
        const group = header.groupId === undefined ? undefined : transactionGroupById.get(header.groupId);
        return <div key={header.key} className="transaction-group-header" data-testid="transaction-group-header" data-transaction-group-id={header.groupId ?? "ungrouped"} data-collapsed={String(header.collapsed)} style={{ top: header.labelTop, height: GROUP_HEADER_HEIGHT }}>
          <button type="button" className="transaction-group-header-chevron" aria-label={header.collapsed ? `Expand ${header.label}` : `Collapse ${header.label}`} aria-expanded={!header.collapsed} onClick={() => toggleGroupCollapsed(header.groupId ?? "ungrouped")}><EditorIcon name={header.collapsed ? "right" : "down"} /></button>
          {header.color && <i className="transaction-group-swatch" aria-hidden="true" style={{ background: header.color }} />}
          {/* #397 Transaction Mode GUI Closure: rename/delete had zero GUI
              entry point (commands already existed) -- "Ungrouped" is a
              view-only pseudo-section (no real Group behind it), so it
              keeps the plain label instead of gaining fake rename/delete
              controls. */}
          {group ? <InlineNameInput target={group} value={group.name} ariaLabel={`Rename Group ${group.name}`} onRename={(name) => commands.renameTransactionGroup(group.id, name)} /> : <span>{header.label}</span>}
          <span className="transaction-group-header-count">({header.count})</span>
          {group && <button type="button" className="transaction-group-header-delete" aria-label={`Ungroup ${group.name}`} title="Ungroup (deletes the Group, keeps its Transactions)" onClick={() => commands.deleteTransactionGroup(group.id)}><EditorIcon name="close" /></button>}
        </div>;
      })}
      {visibleLaneBands.map((band) => {
        // #451/#452 convergence: the same per-Transaction rows the central
        // bars occupy are also listed here, by name, in this sticky label
        // column -- this *is* Transaction Mode's left Tree content for the
        // Lane/Transaction level (Groups above, Transaction names here),
        // reading one shared `document.transactions` + `selectedId`/
        // `onSelect`, not a second selection-owning tree.
        const laneTransactions = laneTransactionsByKey.get(laneKey(band.groupId, band.laneId)) ?? [];
        return <span key={band.key} className="transaction-lane-label" data-testid="transaction-lane-label" data-lane-id={band.laneId} data-transaction-group-id={band.groupId ?? "ungrouped"} style={{ top: band.labelTop, height: band.labelHeight }}>
          <em className="transaction-lane-label-name">{band.laneId.replace(/^lane_(\d+)$/i, "Lane $1")}</em>
          {/* Transaction Mode GUI realignment ("長い名前は ellipsis +
              tooltip"): the CSS already truncates a long name with
              ellipsis (center-columns.css's overflow:hidden/text-overflow:
              ellipsis on this class), but nothing surfaced the full name
              once it was cut off. `title` is the same native-tooltip
              affordance the rest of the app already uses for truncated
              text, not a new pattern. */}
          {laneTransactions.filter((transaction) => isTreeTransactionVisible(band, transaction)).map((transaction) => <button type="button" key={transaction.id} className="transaction-lane-label-row" data-testid={`transaction-tree-row-${transaction.id}`} data-selected={String(selectedId === transaction.id)} title={transaction.name} style={{ top: 4 + (band.treeRowOf.get(transaction.id) ?? 0) * LANE_ROW_HEIGHT }} onClick={() => onSelect(transaction.id)}><i className="transaction-lane-label-swatch" aria-hidden="true" style={{ background: transaction.color ?? transactionGroupById.get(transaction.groupId ?? "")?.color ?? "#8895a7" }} />{transaction.name}</button>)}
        </span>;
      })}
    </div>
      <div className="transaction-track" data-transaction-track="true" style={{ height: totalHeight }}>
      <div className="transaction-geometry-guides" aria-hidden="true">{cycleXs.map((value) => <i className="transaction-geometry-line" key={`cycle-${value.cycle}`} data-cycle={value.cycle} style={{ left: value.x }} />)}</div>
      {visibleGroupHeaders.map((header) => <div key={header.key} className="transaction-group-header-band" aria-hidden="true" style={{ top: header.trackTop, height: GROUP_HEADER_HEIGHT }} />)}
      {visibleLaneBands.map((band) => <div className="transaction-lane" key={band.key} data-lane-id={band.laneId} style={{ top: band.trackTop, height: band.trackHeight }}>
        {(laneTransactionsByKey.get(laneKey(band.groupId, band.laneId)) ?? []).filter((transaction) => isTrackTransactionVisible(band, transaction)).map((transaction) => {
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
          return <TransactionBar key={transaction.id} transaction={transaction} documentEpoch={documentEpoch} row={row} color={resolvedColor} selected={selectedId === transaction.id} cycleCount={document.timeline.cycleCount} getBoundaryX={getBoundaryX} boundaryXByCycle={boundaryXByCycle} onSnap={onSnap} onSelect={onSelect} commands={commands} {...(onContextMenu === undefined ? {} : { onContextMenu })} />;
        })}
      </div>)}
    </div>
  </section>;
}
