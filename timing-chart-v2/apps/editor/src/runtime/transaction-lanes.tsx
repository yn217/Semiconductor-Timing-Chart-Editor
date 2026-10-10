import { UNGROUPED_DISCLOSURE_KEY, type TransactionDisclosure } from "../workspace/use-transaction-disclosure.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Bookmark, BookmarkId, CanonicalDocument, Transaction, TransactionId, TransactionPhaseId } from "@timing-chart-v2/schema";
import { transactionLaneIdentityKey } from "@timing-chart-v2/projection";
import { resizeTransactionEdge, transactionResizeRange } from "@timing-chart-v2/commands";
import { EditorIcon } from "../editor-icon.js";
import { compareLaneIds } from "../application/transaction-group-naming.js";
import type { TransactionLaneCommandActions } from "../application/editor-surface-command-controller.js";
import { InlineNameInput } from "../inline-name-input.js";
import { registerActiveGestureCancel } from "./active-gesture-cancellation.js";
import { mergeTransactionFoldRanges, transactionFoldBoundariesInWindow, transactionFoldContainingCycle, transactionFoldContainingEndBoundary, transactionFoldRangesIntersecting, transactionVisibleSegments, type TransactionFoldRange } from "./transaction-fold-index.js";
import { bookmarksOutsideFolds, hiddenBookmarkFoldSummaries, indexTransactionIntervals, INITIAL_TRANSACTION_SOURCE_WINDOW, nextTransactionVerticalWindow, retainTransactionSourceWindow, transactionFoldRepresentativeIntervals, transactionGeometryGuidesInSourceWindow, transactionIntervalsOutsideFolds, type TransactionIntervalIndex, type TransactionSourceWindowState, type TransactionVerticalWindow } from "./transaction-virtual-index.js";
import { TRANSACTION_LANE_ROW_HEIGHT as LANE_ROW_HEIGHT, transactionGroupHeadersInVerticalWindow, transactionLaneBandHeights, transactionLaneBandsInVerticalWindow } from "./transaction-lane-layout.js";

const GROUP_HEADER_HEIGHT = 24;
let transactionLanesMountSerial = 0;
const EMPTY_TRANSACTION_GROUPS: NonNullable<CanonicalDocument["transactionGroups"]> = [];

// #452: within one lane, Transactions whose [start,end) ranges overlap must
// stack into separate rows rather than fully occluding each other -- a
// standard greedy interval-scheduling pass (sorted by start, each item
// takes the first row whose last-placed end is already <= its own start)
// gives a deterministic, minimal-row assignment with no dependency on
// document/array order beyond that sort.
function assignStackRows(transactions: readonly Transaction[], folds: readonly TransactionFoldRange[]): { readonly rowOf: ReadonlyMap<TransactionId, number>; readonly rowCount: number; readonly transactionsByRow: ReadonlyMap<number, readonly Transaction[]> } {
  // Fully fold-hidden Transactions have no visible interval to stack. Letting
  // them reserve rows inflated the lane/grid to tens of thousands of pixels,
  // even though the renderer mounts only bounded fold representatives.
  const visible = folds.length === 0 ? transactions : transactions.filter((transaction) => {
    const fold = transactionFoldContainingCycle(folds, transaction.start);
    return fold === undefined || transaction.end > fold[1];
  });
  const sorted = [...visible].sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
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
  const transactionsByRow = new Map<number, Transaction[]>();
  let rowCount = 0;
  for (const transaction of sorted) {
    const reusable = available[0] !== undefined && available[0].end <= transaction.start ? pop() : undefined;
    const row = reusable?.row ?? rowCount++;
    rowOf.set(transaction.id, row);
    const rowTransactions = transactionsByRow.get(row);
    if (rowTransactions) rowTransactions.push(transaction);
    else transactionsByRow.set(row, [transaction]);
    push({ end: transaction.end, row });
  }
  return { rowOf, rowCount: Math.max(1, rowCount), transactionsByRow };
}

function transactionsInStackRowWindow(ordered: readonly Transaction[], start: number, end: number): readonly Transaction[] {
  // Greedy stacking guarantees intervals assigned to one row never overlap,
  // so both their starts and ends are monotonically increasing. Two binary
  // searches return only the row's horizontal-window intersections.
  let low = 0; let high = ordered.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ordered[middle]!.end <= start) low = middle + 1;
    else high = middle;
  }
  const first = low;
  high = ordered.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ordered[middle]!.start < end) low = middle + 1;
    else high = middle;
  }
  return ordered.slice(first, low);
}

type LaneBand = { readonly key: string; readonly laneId: string; readonly groupId: string | undefined; readonly labelTop: number; readonly trackTop: number; readonly labelHeight: number; readonly trackHeight: number; readonly rowOf: ReadonlyMap<TransactionId, number>; readonly rowCount: number; readonly transactionsByRow: ReadonlyMap<number, readonly Transaction[]> };
type GroupHeaderBand = { readonly key: string; readonly labelTop: number; readonly trackTop: number; readonly label: string; readonly color: string | undefined; readonly count: number; readonly groupId: string | undefined; readonly collapsed: boolean };

type TransactionDragEdge = "body" | "start" | "end";
type TransactionPreview = Readonly<{ start: number; end: number }>;

// Edge drags clamp to the same range the planner accepts (shared helper in
// @timing-chart-v2/commands), so the preview always matches what commits.
function previewTransaction(transaction: Transaction, edge: TransactionDragEdge, value: number, cycleCount: number): TransactionPreview {
  if (edge === "body") {
    const duration = transaction.end - transaction.start;
    const start = Math.max(0, Math.min(cycleCount - duration, value));
    return { start, end: start + duration };
  }
  const range = transactionResizeRange(transaction, edge, cycleCount);
  const clamped = Math.round(Math.max(range.min, Math.min(range.max, value)));
  const resized = resizeTransactionEdge(transaction, edge, clamped, cycleCount);
  if (!resized.ok) return { start: transaction.start, end: transaction.end };
  return { start: resized.start, end: resized.end };
}

function previewPhases(transaction: Transaction, preview: TransactionPreview, edge: TransactionDragEdge, cycleCount: number): readonly NonNullable<Transaction["phases"]>[number][] | undefined {
  if (!transaction.phases) return undefined;
  if (edge === "body") {
    const delta = preview.start - transaction.start;
    return transaction.phases.map((phase) => ({ ...phase, start: phase.start + delta, end: phase.end + delta }));
  }
  // An edge-attached Phase follows its Transaction edge, exactly as the committed resize does.
  const resized = resizeTransactionEdge(transaction, edge, edge === "start" ? preview.start : preview.end, cycleCount);
  return resized.ok ? resized.phases : transaction.phases;
}

/** #750: under cyclesPerTC compression bars get narrow. Below these widths the inline label would be clipped/unreadable, so it is omitted
 * (the full name stays in title / aria-label / the Inspector); the font is never shrunk. */
const BAR_LABEL_MIN_PX = 56;
const PHASE_LABEL_MIN_PX = 40;
/** A press this close to a bar edge on a Phase hit target drags that edge (resize) instead of the body, so the handles work along the full bar height. */
const PHASE_PRESS_EDGE_PX = 8;
const TRANSACTION_DRAG_THRESHOLD_PX = 4;

function TransactionBar({ transaction, documentEpoch, viewMode, row, color, selected, selectedPhaseId, cycleCount, getBoundaryX, boundaryXByCycle, visibleBoundaryXs, foldRanges, onSnap, onSelect, onSelectPhase, commands, onContextMenu }: {
  readonly transaction: Transaction;
  readonly documentEpoch: number;
  readonly viewMode: "Cycle" | "Transaction" | "Split";
  readonly row: number;
  readonly color: string | undefined;
  readonly selected: boolean;
  readonly selectedPhaseId?: TransactionPhaseId | undefined;
  readonly cycleCount: number;
  readonly getBoundaryX: (cycle: number) => number | undefined;
  readonly boundaryXByCycle: ReadonlyMap<number, number>;
  readonly visibleBoundaryXs: readonly { readonly cycle: number; readonly x: number }[];
  readonly foldRanges: readonly TransactionFoldRange[];
  readonly onSnap: (clientX: number, surfaceLeft?: number, horizontalScroll?: number) => number | undefined;
  readonly onSelect: (id: TransactionId, additive?: boolean) => void;
  readonly onSelectPhase?: ((transactionId: TransactionId, phaseId: TransactionPhaseId) => void) | undefined;
  readonly commands: Pick<TransactionLaneCommandActions, "move" | "resize">;
  readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void;
}) {
  const [drag, setDrag] = useState<{ edge: TransactionDragEdge; documentEpoch: number; surfaceLeft: number | undefined; scrollViewport: HTMLElement | undefined; startClientX: number }>();
  const [preview, setPreview] = useState<TransactionPreview>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pendingPreviewClientX = useRef<number | undefined>(undefined);
  const previewFrame = useRef<number | undefined>(undefined);
  const previewBoundaryCache = useRef(new Map(boundaryXByCycle));
  const dragPointerMoves = useRef(0);
  const dragPreviewFrames = useRef(0);
  const dragPreviewUpdates = useRef(0);
  const dragSnapQueries = useRef(0);
  const dragThresholdCrossed = useRef(false);
  // A press on a Phase hit target selects that Phase on click, but dragging from it moves the Transaction like its body.
  const phasePress = useRef<{ readonly x: number; readonly edge: TransactionDragEdge } | undefined>(undefined);
  const current = preview ?? { start: transaction.start, end: transaction.end };
  const transactionFolds = transactionFoldRangesIntersecting(foldRanges, transaction.start, transaction.end);
  const startFold = transactionFoldContainingCycle(foldRanges, transaction.start);
  const containingFold = startFold && transaction.end <= startFold[1] ? startFold : undefined;
  const startHiddenFold = startFold && transaction.end > startFold[1] ? startFold : undefined;
  const endFold = transactionFoldContainingEndBoundary(foldRanges, transaction.end);
  const endHiddenFold = endFold && transaction.end > endFold[0] && transaction.start < endFold[0] ? endFold : undefined;
  const resolveCachedBoundaryX = (cycle: number) => {
    const cached = previewBoundaryCache.current.get(cycle);
    if (cached !== undefined) return cached;
    const resolved = getBoundaryX(cycle);
    if (resolved !== undefined) previewBoundaryCache.current.set(cycle, resolved);
    return resolved;
  };
  const resolveBoundaryX = (cycle: number) => {
    if (preview !== undefined) return resolveCachedBoundaryX(cycle);
    // The table is a render-time snapshot. A bounded/folded geometry refresh
    // can publish additional canonical boundaries after that snapshot was
    // created; ask the shared geometry owner for those missing boundaries so
    // fold segments do not disappear permanently.
    return boundaryXByCycle.get(cycle) ?? resolveCachedBoundaryX(cycle);
  };
  const resolveVisibleBoundary = (cycle: number, direction: -1 | 1) => {
    let low = 0; let high = visibleBoundaryXs.length;
    while (low < high) { const middle = low + Math.floor((high - low) / 2); if (visibleBoundaryXs[middle]!.cycle < cycle) low = middle + 1; else high = middle; }
    const index = direction < 0 ? low - 1 : low;
    return visibleBoundaryXs[Math.max(0, Math.min(visibleBoundaryXs.length - 1, index))]?.x;
  };
  const resolveSegmentBoundary = (cycle: number, direction: -1 | 1) => resolveBoundaryX(cycle) ?? resolveVisibleBoundary(cycle, direction);
  const startX = resolveBoundaryX(current.start) ?? (startHiddenFold ? resolveVisibleBoundary(startHiddenFold[1], 1) : undefined);
  const endX = resolveBoundaryX(current.end) ?? (endHiddenFold ? resolveVisibleBoundary(endHiddenFold[0], -1) : undefined);
  const phases = preview === undefined ? transaction.phases : previewPhases(transaction, preview, drag?.edge ?? "body", cycleCount);
  useEffect(() => {
    return () => {
      if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current);
      previewFrame.current = undefined;
      pendingPreviewClientX.current = undefined;
    };
  }, []);

  useEffect(() => { setDrag(undefined); setPreview(undefined); }, [viewMode]);
  useEffect(() => { previewBoundaryCache.current = new Map(boundaryXByCycle); }, [boundaryXByCycle]);

  useEffect(() => {
    if (!drag) return undefined;
    if (drag.documentEpoch !== documentEpoch) { setDrag(undefined); setPreview(undefined); return undefined; }
    return registerActiveGestureCancel(() => {
      if (previewFrame.current !== undefined) cancelAnimationFrame(previewFrame.current);
      previewFrame.current = undefined;
      pendingPreviewClientX.current = undefined;
      setDrag(undefined);
      setPreview(undefined);
    }, drag.edge === "body" ? "Move Transaction - drag horizontally; Esc cancels" : "Resize Transaction - drag the edge; Esc cancels");
  }, [drag, documentEpoch]);

  if (containingFold) {
    return <button type="button" className="transaction-hidden-in-fold" data-transaction-id={transaction.id} data-hidden-in-fold="true" data-selected={String(selected)} style={{ top: 4 + row * LANE_ROW_HEIGHT }} aria-label={`${transaction.name} inside collapsed TimeGroup`} onClick={() => onSelect(transaction.id)}>{transaction.name}<small>inside collapsed range</small></button>;
  }
  if (startX === undefined || endX === undefined) return null;
  const updatePreview = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.documentEpoch !== documentEpoch) return;
    if (!dragThresholdCrossed.current && Math.abs(event.clientX - drag.startClientX) < TRANSACTION_DRAG_THRESHOLD_PX) return;
    dragThresholdCrossed.current = true;
    dragPointerMoves.current += 1;
    event.currentTarget.dataset.dragPointerMoves = String(dragPointerMoves.current);
    pendingPreviewClientX.current = event.clientX;
    if (previewFrame.current !== undefined) return;
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = undefined;
      dragPreviewFrames.current += 1;
      buttonRef.current?.setAttribute("data-drag-preview-frames", String(dragPreviewFrames.current));
      const clientX = pendingPreviewClientX.current;
      pendingPreviewClientX.current = undefined;
      if (clientX === undefined || !drag || drag.documentEpoch !== documentEpoch) return;
      dragSnapQueries.current += 1;
      buttonRef.current?.setAttribute("data-drag-snap-queries", String(dragSnapQueries.current));
      const cycle = onSnap(clientX, drag.surfaceLeft, drag.scrollViewport?.scrollLeft ?? 0);
      if (cycle === undefined) return;
      const nextPreview = previewTransaction(transaction, drag.edge, cycle, cycleCount);
      setPreview((current) => {
        if (current !== undefined && current.start === nextPreview.start && current.end === nextPreview.end) return current;
        dragPreviewUpdates.current += 1;
        buttonRef.current?.setAttribute("data-drag-preview-updates", String(dragPreviewUpdates.current));
        return nextPreview;
      });
    });
  };
  const begin = (event: ReactPointerEvent<HTMLElement>, edge: TransactionDragEdge) => {
    event.preventDefault();
    event.stopPropagation();
    // Pin the active bar through horizontal viewport re-projection while the
    // captured pointer crosses the viewport boundary.
    // A Ctrl/Cmd press is an additive selection: leave it to the click handler, which toggles instead of replacing.
    if (!event.ctrlKey && !event.metaKey) onSelect(transaction.id);
    buttonRef.current?.setPointerCapture(event.pointerId);
    dragPointerMoves.current = 0;
    dragPreviewFrames.current = 0;
    dragPreviewUpdates.current = 0;
    dragSnapQueries.current = 0;
    const button = buttonRef.current;
    if (button) {
      button.dataset.dragPointerMoves = "0";
      button.dataset.dragPreviewFrames = "0";
      button.dataset.dragPreviewUpdates = "0";
      button.dataset.dragSnapQueries = "0";
      button.dataset.dragSnapDomQueries = "0";
      button.dataset.dragSnapLayoutReads = "0";
    }
    dragThresholdCrossed.current = false;
    const scrollViewport = buttonRef.current?.closest<HTMLElement>(".split-transaction-pane")?.querySelector<HTMLElement>("[data-role='transaction-track-viewport']") ?? buttonRef.current?.closest<HTMLElement>(".cycle-viewport") ?? undefined;
    setDrag({ edge, documentEpoch, startClientX: event.clientX, scrollViewport, surfaceLeft: scrollViewport?.getBoundingClientRect().left });
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
    const moved = dragThresholdCrossed.current || Math.abs(event.clientX - drag.startClientX) >= TRANSACTION_DRAG_THRESHOLD_PX;
    dragThresholdCrossed.current = false;
    if (!moved) {
      setDrag(undefined);
      setPreview(undefined);
      return;
    }
    const cycle = onSnap(event.clientX, drag.surfaceLeft, drag.scrollViewport?.scrollLeft ?? 0);
    const final = cycle === undefined ? preview : previewTransaction(transaction, drag.edge, cycle, cycleCount);
    setDrag(undefined);
    setPreview(undefined);
    if (!final || (final.start === transaction.start && final.end === transaction.end)) return;
    if (drag.edge === "body") commands.move(transaction.id, final.start);
    else commands.resize(transaction.id, drag.edge, drag.edge === "start" ? final.start : final.end);
  };

  const gaps = transactionFolds.flatMap(([fromCycle, toCycle]) => {
    if (fromCycle <= current.start || toCycle >= current.end) return [];
    const from = resolveVisibleBoundary(fromCycle, -1); const to = resolveVisibleBoundary(toCycle, 1);
    return from === undefined || to === undefined ? [] : [{ left: `${100 * (from - startX) / (endX - startX)}%`, width: `${100 * (to - from) / (endX - startX)}%` }];
  });
  // The shared DisplayTimeMapping makes boundaries inside a collapsed range
  // undefined. Keep the canonical bar interaction as one owner, but expose
  // the visible source intervals explicitly so a folded transaction is
  // rendered as two segments around the axis break.
  const visibleSegments = transactionVisibleSegments(current.start, current.end, transactionFoldRangesIntersecting(foldRanges, current.start, current.end));
  const phaseSegments = (phase: NonNullable<typeof phases>[number]) => {
    const phaseFolds = transactionFoldRangesIntersecting(foldRanges, phase.start, phase.end);
    return transactionVisibleSegments(phase.start, phase.end, phaseFolds);
  };
  const phaseButtons = onSelectPhase ? phases?.flatMap((phase) => phaseSegments(phase).map((segment) => {
    const from = resolveSegmentBoundary(segment.start, 1);
    const to = resolveSegmentBoundary(segment.end, -1);
    if (from === undefined || to === undefined || endX <= startX) return null;
    return <button key={`${phase.id}:${segment.start}:${segment.end}`} type="button" className="transaction-phase-hit-target" data-phase-transaction-id={transaction.id} data-phase-id={phase.id} data-selected={String(selectedPhaseId === phase.id)} aria-pressed={selectedPhaseId === phase.id} aria-label={`${transaction.name}, phase ${phase.name}, cycles ${phase.start} to ${phase.end}`} title={`${phase.name}: ${phase.start}–${phase.end}`} style={{ left: from, width: Math.min(endX - from, Math.max(8, to - from)), top: 19 + row * LANE_ROW_HEIGHT }} onPointerDown={(event) => { const bar = buttonRef.current?.getBoundingClientRect(); const edge: TransactionDragEdge = bar && event.clientX - bar.left < PHASE_PRESS_EDGE_PX ? "start" : bar && bar.right - event.clientX < PHASE_PRESS_EDGE_PX ? "end" : "body"; phasePress.current = { x: event.clientX, edge }; }} onPointerMove={(event) => { const press = phasePress.current; if (press !== undefined && event.buttons === 1 && Math.abs(event.clientX - press.x) >= TRANSACTION_DRAG_THRESHOLD_PX) { phasePress.current = undefined; begin(event, press.edge); } }} onPointerUp={() => { phasePress.current = undefined; }} onPointerCancel={() => { phasePress.current = undefined; }} onClick={(event) => { event.stopPropagation(); onSelectPhase(transaction.id, phase.id); }} />;
  })) : undefined;
  return <><button ref={buttonRef} type="button" data-transaction-id={transaction.id} data-selected={String(selected)} data-drag-preview={String(preview !== undefined)} title={transaction.name} aria-label={transaction.name} style={{ left: startX, width: endX - startX, top: 4 + row * LANE_ROW_HEIGHT, ...(color ? { "--transaction-color": color } as CSSProperties : {}) }} onClick={(event) => onSelect(transaction.id, event.ctrlKey || event.metaKey)} onContextMenu={(event) => { event.preventDefault(); onSelect(transaction.id); onContextMenu?.(event, transaction.id); }} onPointerMove={updatePreview} onPointerUp={finish} onPointerCancel={cancel}><i data-edge="start" onPointerDown={(event) => begin(event, "start")} />{startHiddenFold && <i className="transaction-fold-affordance" data-fold-affordance="start-hidden" title="Transaction starts inside collapsed range" aria-label="Transaction start hidden in collapsed range" /> }<span onPointerDown={(event) => begin(event, "body")} data-label-compact={String(endX - startX < BAR_LABEL_MIN_PX)}>{endX - startX < BAR_LABEL_MIN_PX ? "" : transaction.name}</span>{visibleSegments.length > 1 && visibleSegments.map((segment, index) => { const from = resolveSegmentBoundary(segment.start, 1); const to = resolveSegmentBoundary(segment.end, -1); return from === undefined || to === undefined ? null : <i key={`segment-${index}`} className="transaction-axis-segment" data-transaction-segment="true" aria-hidden="true" style={{ left: `${100 * (from - startX) / (endX - startX)}%`, width: `${100 * (to - from) / (endX - startX)}%` }} />; })}{gaps.map((gap, index) => <i key={`axis-break-${index}`} className="transaction-axis-break-gap" style={gap} aria-hidden="true" />)}<div className="transaction-phases" aria-hidden="true">{phases?.flatMap((phase) => phaseSegments(phase).map((segment, index) => { const from = resolveSegmentBoundary(segment.start, 1); const to = resolveSegmentBoundary(segment.end, -1); if (from === undefined || to === undefined || endX <= startX) return null; return <small key={`${phase.id}:${index}`} data-phase-id={phase.id} data-phase-segment="true" data-selected={String(selectedPhaseId === phase.id)} title={`${phase.name}: ${phase.start}–${phase.end}`} style={{ left: `${100 * (from - startX) / (endX - startX)}%`, width: `${100 * (to - from) / (endX - startX)}%` }}>{to - from < PHASE_LABEL_MIN_PX ? "" : phase.name}</small>; }))}</div>{endHiddenFold && <i className="transaction-fold-affordance" data-fold-affordance="end-hidden" title="Transaction ends inside collapsed range" aria-label="Transaction end hidden in collapsed range" /> }<i data-edge="end" onPointerDown={(event) => begin(event, "end")} /></button>{phaseButtons}</>;
}

export function TransactionLanes({ document: rawDocument, documentEpoch, viewMode, presentationRevision, zoom, selectedId, selectedIds, selectedBookmarkId, selectedPhaseId, filter = "", getBoundaryX, getVisibleSourceWindow, onSelect, onSelectPhase, onSnap, commands, onContextMenu, bookmarks = [], onNavigateBookmark, disclosure }: { /** #759: workspace-level Group disclosure owner shared with the Left Tree. */ readonly disclosure: TransactionDisclosure; readonly document: CanonicalDocument; readonly documentEpoch: number; readonly viewMode: "Cycle" | "Transaction" | "Split"; readonly presentationRevision?: number; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly selectedIds?: ReadonlySet<TransactionId>; readonly selectedBookmarkId?: BookmarkId; readonly selectedPhaseId?: TransactionPhaseId | undefined; readonly filter?: string; readonly getBoundaryX: (cycle: number) => number | undefined; readonly getVisibleSourceWindow: (viewport: HTMLElement) => Readonly<{ start: number; end: number }> | undefined; readonly onSelect: (id: TransactionId, additive?: boolean) => void; readonly onSelectPhase?: (transactionId: TransactionId, phaseId: TransactionPhaseId) => void; readonly onSnap: (clientX: number, surfaceLeft?: number, horizontalScroll?: number) => number | undefined; readonly commands: Pick<TransactionLaneCommandActions, "move" | "resize" | "renameTransactionGroup" | "deleteTransactionGroup">; readonly onContextMenu?: (event: MouseEvent<HTMLButtonElement>, id: TransactionId) => void; readonly bookmarks?: readonly Bookmark[]; readonly onNavigateBookmark?: (cycle: number, bookmarkId?: BookmarkId) => void }) {
  const isTransactionSelected = (id: TransactionId) => selectedId === id || selectedIds?.has(id) === true;
  const mountSerial = useRef(++transactionLanesMountSerial);
  const laneIndexBuilds = useRef(0);
  const stackRowBuilds = useRef(0);
  const transactionFilterBuilds = useRef(0);
  const stackRowsCache = useRef(new WeakMap<readonly Transaction[], WeakMap<readonly TransactionFoldRange[], ReturnType<typeof assignStackRows>>>());
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
  const visibleTransactions = useMemo(() => {
    transactionFilterBuilds.current += 1;
    const visible: Transaction[] = [];
    let hasHidden = false;
    for (const transaction of rawDocument.transactions) {
      if (transaction.visible === false) { hasHidden = true; continue; }
      if (needle.length > 0 && !transaction.name.toLocaleLowerCase().includes(needle)
        && !(transaction.groupId !== undefined && (groupNameById.get(transaction.groupId) ?? "").toLocaleLowerCase().includes(needle))) continue;
      visible.push(transaction);
    }
    return needle.length === 0 && !hasHidden ? rawDocument.transactions : visible;
  }, [groupNameById, needle, rawDocument.transactions]);
  // Selection and unrelated document edits do not change the filtered list.
  // Keep the canonical root current without rerunning the O(N) transaction scan.
  const document = useMemo<CanonicalDocument>(
    () => visibleTransactions === rawDocument.transactions ? rawDocument : { ...rawDocument, transactions: visibleTransactions },
    [rawDocument, visibleTransactions],
  );
  // #759: Group disclosure is a view-only presentation state owned once at the workspace level and shared with the Left Tree
  // (never persisted, never touches Canonical/History/Dirty).
  const collapsedGroups = disclosure.collapsed;
  const toggleGroupCollapsed = disclosure.toggle;
  const owner = useRef<HTMLElement>(null);
  // Selecting a Transaction from the fixed Tree must reveal its actual
  // projected bar in the shared horizontal viewport. Use the rendered bar's
  // geometry (owned by the shared TimeAxis projection) so folded display time,
  // zoom, and pane origins are already reflected; never invent a local cycle
  // mapper here. Keep a fully visible bar stationary and move only enough to
  // reveal an offscreen bar. A selected Transaction wholly inside a collapsed
  // fold has no visible bar to reveal.
  useLayoutEffect(() => {
    if (!selectedId || (viewMode !== "Transaction" && viewMode !== "Split")) return;
    const laneRoot = owner.current;
    const viewport = laneRoot?.querySelector<HTMLElement>("[data-role='transaction-track-viewport']") && laneRoot.closest(".split-transaction-pane") ? laneRoot.querySelector<HTMLElement>("[data-role='transaction-track-viewport']") : laneRoot?.closest<HTMLElement>(".cycle-viewport");
    const target = laneRoot?.querySelector<HTMLElement>(`[data-transaction-id="${CSS.escape(selectedId)}"]`);
    if (!viewport || !target || target.dataset.hiddenInFold === "true") return;
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const visibleLeft = viewportRect.left + viewport.clientLeft;
    const visibleRight = visibleLeft + viewport.clientWidth;
    let deltaX = 0;
    if (targetRect.width > visibleRight - visibleLeft) {
      deltaX = targetRect.left - visibleLeft;
    } else if (targetRect.left < visibleLeft) {
      deltaX = targetRect.left - visibleLeft;
    } else if (targetRect.right > visibleRight) {
      deltaX = targetRect.right - visibleRight;
    }
    if (Math.abs(deltaX) > 1) {
      viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, viewport.scrollLeft + deltaX));
    }
  }, [documentEpoch, selectedId, viewMode]);
  // #767: zoom re-lays the geometry out (X scaled here) instead of CSS-scaling the whole track, which stretched every glyph horizontally.
  const zoomFactor = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const getScaledBoundaryX = useCallback((cycle: number) => { const px = getBoundaryX(cycle); return px === undefined ? undefined : px * zoomFactor; }, [getBoundaryX, zoomFactor]);
  const [horizontalSourceWindow, setHorizontalSourceWindow] = useState<TransactionSourceWindowState>(INITIAL_TRANSACTION_SOURCE_WINDOW);
  useLayoutEffect(() => {
    const laneRoot = owner.current;
    const viewport = laneRoot?.closest<HTMLElement>(".cycle-viewport");
    if (!viewport) { setHorizontalSourceWindow(undefined); return; }
    // Combined: the clipped Track region follows the Signal pane's nested Timeline owner (scroll events do not bubble to `.cycle-viewport`).
    const scrollSource = laneRoot?.querySelector<HTMLElement>("[data-role='transaction-track-viewport']") ?? viewport;
    const update = () => {
      const next = getVisibleSourceWindow(viewport);
      // A temporarily unavailable geometry window is not permission to mount
      // the whole document. Keep the initial empty state (or last valid window)
      // until the shared geometry owner can publish a bounded range.
      if (next !== undefined) setHorizontalSourceWindow((current) => retainTransactionSourceWindow(current, next));
    };
    update();
    const refreshFrame = requestAnimationFrame(update);
    viewport.addEventListener("scroll", update, { passive: true });
    if (scrollSource !== viewport) scrollSource.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(refreshFrame);
      viewport.removeEventListener("scroll", update);
      if (scrollSource !== viewport) scrollSource.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [documentEpoch, document.timeline.cycleCount, getVisibleSourceWindow, presentationRevision, viewMode, zoom]);
  const horizontalDocumentIndex = useMemo(() => indexTransactionIntervals(document.transactions), [document.transactions]);
  const orderedBookmarks = useMemo(() => [...bookmarks].sort((left, right) => left.start - right.start || left.id.localeCompare(right.id)), [bookmarks]);
  const bookmarkById = useMemo(() => new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark] as const)), [bookmarks]);
  const collapsedFoldRanges = useMemo(() => mergeTransactionFoldRanges((rawDocument.timeGroups ?? []).filter((group) => group.presentation?.collapsed).map((group) => [group.start, group.end] as const)), [rawDocument.timeGroups]);
  const selectedBookmark = selectedBookmarkId === undefined ? undefined : bookmarkById.get(selectedBookmarkId);
  const visibleBookmarks = useMemo(() => bookmarksOutsideFolds(orderedBookmarks, collapsedFoldRanges, horizontalSourceWindow, selectedBookmark), [collapsedFoldRanges, horizontalSourceWindow, orderedBookmarks, selectedBookmark]);
  const hiddenBookmarkSummaries = useMemo(() => hiddenBookmarkFoldSummaries(orderedBookmarks, collapsedFoldRanges, horizontalSourceWindow), [collapsedFoldRanges, horizontalSourceWindow, orderedBookmarks]);
  const horizontalDocumentCandidates = useMemo(() => {
    // Keep only the active stable-ID selection mounted when it is hidden by a
    // fold. A multi-selection set must not turn fold rescue back into O(N) DOM.
    const pinned = selectedId === undefined ? undefined : new Set<string>([selectedId]);
    return transactionIntervalsOutsideFolds(horizontalDocumentIndex, collapsedFoldRanges, horizontalSourceWindow, pinned);
  }, [collapsedFoldRanges, horizontalDocumentIndex, horizontalSourceWindow, selectedId]);
  const foldRescueCandidates = useMemo(() => transactionFoldRepresentativeIntervals(horizontalDocumentIndex, collapsedFoldRanges, horizontalSourceWindow), [collapsedFoldRanges, horizontalDocumentIndex, horizontalSourceWindow]);
  const collapsedFoldBoundaries = useMemo(() => (rawDocument.timeGroups ?? [])
    .filter((group) => group.presentation?.collapsed)
    .flatMap((group) => [group.start, group.end])
    .sort((left, right) => left - right), [rawDocument.timeGroups]);
  const { cycleXs, boundaryXByCycle } = useMemo(() => {
    const foldBoundaryCycles = horizontalSourceWindow === null
      ? []
      : horizontalSourceWindow === undefined
        ? collapsedFoldBoundaries
        : transactionFoldBoundariesInWindow(collapsedFoldBoundaries, horizontalSourceWindow.start, horizontalSourceWindow.end);
    const sourceRange = horizontalSourceWindow;
    const transactionCycles = horizontalDocumentCandidates.flatMap((transaction) => [transaction.start, transaction.end, ...(transaction.phases ?? []).filter((phase) => sourceRange === undefined || (sourceRange !== null && phase.end >= sourceRange.start && phase.start <= sourceRange.end)).flatMap((phase) => [phase.start, phase.end])]);
    const relevantCycles = [...new Set([...transactionCycles, ...visibleBookmarks.map((bookmark) => bookmark.start), ...foldBoundaryCycles])].sort((left, right) => left - right);
    const cycleXs = relevantCycles.flatMap((cycle) => { const x = getScaledBoundaryX(cycle); return x === undefined ? [] : [{ cycle, x }]; });
    return { cycleXs, boundaryXByCycle: new Map(cycleXs.map(({ cycle, x }) => [cycle, x] as const)) };
  }, [collapsedFoldBoundaries, getScaledBoundaryX, horizontalDocumentCandidates, horizontalSourceWindow, presentationRevision, visibleBookmarks]);
  const visibleGuideXs = useMemo(() => horizontalSourceWindow === null
    ? []
    : horizontalSourceWindow === undefined
      ? cycleXs
      : transactionGeometryGuidesInSourceWindow(cycleXs, horizontalSourceWindow.start, horizontalSourceWindow.end), [cycleXs, horizontalSourceWindow]);
  const x = (cycle: number) => boundaryXByCycle.get(cycle);
  const foldRanges = useMemo<readonly TransactionFoldRange[]>(() => mergeTransactionFoldRanges(
    (rawDocument.timeGroups ?? []).filter((group) => group.presentation?.collapsed).map((group) => [group.start, group.end] as const),
  ), [rawDocument.timeGroups]);

  // #452: Group headers only appear once real Groups are in use -- a
  // document with no `transactionGroups` (or none actually referenced)
  // renders the exact same flat lane list this component always has, so
  // existing single-group documents/tests see byte-for-byte unchanged
  // layout. Lanes are scoped to their own Group's section once grouped
    // (the same laneId string in two different Groups is two independent
  // tracks, not one shared one), matching the approved reference's
  // "Memory / Lane 0" vs "CPU / Lane 1" structure.
  const groups = document.transactionGroups ?? EMPTY_TRANSACTION_GROUPS;
  const laneKey = transactionLaneIdentityKey;
  const { laneTransactionsByKey, transactionCountByGroup, currentKeys } = useMemo(() => {
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
    return { laneTransactionsByKey, transactionCountByGroup, currentKeys };
  }, [document.transactions]);
  const horizontalCandidatesByLane = useMemo(() => {
    const byLane = new Map<string, Transaction[]>();
    for (const transaction of horizontalDocumentCandidates) {
      const key = currentKeys.get(transaction.id);
      if (key === undefined) continue;
      const bucket = byLane.get(key);
      if (bucket) bucket.push(transaction); else byLane.set(key, [transaction]);
    }
    return byLane;
  }, [currentKeys, horizontalDocumentCandidates]);
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
        const result: Section[] = ordered.map((group) => ({ groupId: group.id, label: group.name, color: group.color, lanes: [...(lanesByGroup.get(group.id) ?? [])].sort(compareLaneIds) }));
        const ungroupedLanes = [...(lanesByGroup.get(undefined) ?? [])].sort(compareLaneIds);
        if (ungroupedLanes.length > 0) result.push({ groupId: undefined, label: "Ungrouped", color: undefined, lanes: ungroupedLanes });
        return result;
      })()
    : [{ groupId: undefined, label: undefined, color: undefined, lanes: [...new Set(["lane_0", ...document.transactions.map((transaction) => transaction.laneId ?? "lane_0")])].sort(compareLaneIds) }], [document.transactions, groups, hasGroups]);

  const { groupHeaders, laneBands, laneBandByKey, totalHeight } = useMemo(() => {
    const groupHeaders: GroupHeaderBand[] = [];
    const laneBands: LaneBand[] = [];
    const laneBandByKey = new Map<string, LaneBand>();
    let labelCursor = 0;
    let trackCursor = 0;
    for (const section of sections) {
    const sectionKey = section.groupId ?? UNGROUPED_DISCLOSURE_KEY;
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
      let rowsByFold = stackRowsCache.current.get(laneTransactions);
      if (!rowsByFold) { rowsByFold = new WeakMap(); stackRowsCache.current.set(laneTransactions, rowsByFold); }
      let stackRows = rowsByFold.get(foldRanges);
      if (!stackRows) {
        stackRows = assignStackRows(laneTransactions, foldRanges);
        stackRowBuilds.current += 1;
        rowsByFold.set(foldRanges, stackRows);
      }
      const { rowOf, rowCount, transactionsByRow } = stackRows;
      // The center label column is Lane-only. Transaction navigation and
      // names belong to the authoritative left Transaction Tree; mirroring
      // them here creates rows outside the single-row label band whenever
      // one lane contains multiple sequential Transactions.
      const { labelHeight, trackHeight } = transactionLaneBandHeights(rowCount);
      const band = { key: transactionLaneIdentityKey(section.groupId, laneId), laneId, groupId: section.groupId, labelTop: labelCursor, trackTop: trackCursor, labelHeight, trackHeight, rowOf, rowCount, transactionsByRow };
      laneBands.push(band);
      laneBandByKey.set(band.key, band);
      labelCursor += labelHeight;
      trackCursor += trackHeight;
    }
    }
    return { groupHeaders, laneBands, laneBandByKey, totalHeight: Math.max(labelCursor, trackCursor, LANE_ROW_HEIGHT) };
  }, [collapsedGroups, laneTransactionsByKey, sections, transactionCountByGroup]);
  const [virtualWindow, setVirtualWindow] = useState<TransactionVerticalWindow>({ top: 0, height: 900 });
  useEffect(() => {
    const laneRoot = owner.current;
    // Combined mode owns a nested vertical scroller for the transaction pane;
    // the outer cycle viewport only owns the shared horizontal surface there.
    // Keep the standalone Transaction mode fallback on its cycle viewport.
    const panel = laneRoot?.closest<HTMLElement>(".cycle-panel");
    // The standalone Transaction tree lists Transactions independently of the Lane surface (#748), so the lanes
    // virtualize against the cycle viewport that actually scrolls them, not against the tree's scroll offset.
    const viewport = laneRoot?.closest<HTMLElement>(".split-transaction-pane")
      ?? laneRoot?.closest<HTMLElement>(".cycle-viewport")
      ?? panel?.querySelector<HTMLElement>(".transaction-left-tree");
    if (!viewport) return;
    const update = () => setVirtualWindow((current) => nextTransactionVerticalWindow(current, viewport.scrollTop, viewport.clientHeight || 900, LANE_ROW_HEIGHT));
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [documentEpoch, totalHeight, document.transactions.length, filter, viewMode]);
  // Keep a small interaction cushion while bounding the number of mounted
  // Transaction rows. A 480px cushion mounted thousands of bars when many
  // lanes share the same viewport; 120px still covers several row heights
  // without making DOM size scale with the document.
  const virtualOverscan = 120;
  const virtualTop = Math.max(0, virtualWindow.top - virtualOverscan);
  const virtualBottom = Math.min(totalHeight, virtualWindow.top + virtualWindow.height + virtualOverscan);
  const isVisible = (top: number, height: number) => top < virtualBottom && top + height > virtualTop;
  const visibleGroupHeaders = transactionGroupHeadersInVerticalWindow(groupHeaders, virtualTop, virtualBottom, GROUP_HEADER_HEIGHT).headers;
  const selectedLaneKey = selectedId === undefined ? undefined : currentKeys.get(selectedId);
  const laneWindow = transactionLaneBandsInVerticalWindow(laneBands, virtualTop, virtualBottom, selectedLaneKey === undefined ? undefined : laneBandByKey.get(selectedLaneKey));
  const visibleLaneBands = laneWindow.bands;
  const { trackCandidatesByLane, trackCandidateVisits } = useMemo(() => {
    const byLane = new Map<string, Map<TransactionId, Transaction>>();
    let candidateVisits = 0;
    const append = (band: LaneBand, transaction: Transaction) => {
      const key = laneKey(band.groupId, band.laneId);
      let bucket = byLane.get(key);
      if (!bucket) { bucket = new Map(); byLane.set(key, bucket); }
      bucket.set(transaction.id, transaction);
    };
    const firstRow = (band: LaneBand) => Math.max(0, Math.floor((virtualTop - band.trackTop - 4) / LANE_ROW_HEIGHT));
    const lastRow = (band: LaneBand) => Math.min(band.rowCount - 1, Math.floor((virtualBottom - band.trackTop - 5) / LANE_ROW_HEIGHT));
    for (const band of visibleLaneBands) {
      const selectedInBand = selectedId !== undefined && currentKeys.get(selectedId) === laneKey(band.groupId, band.laneId);
      const selectedRow = selectedInBand ? band.rowOf.get(selectedId!) : undefined;
      const from = firstRow(band);
      const to = lastRow(band);
      const rows = new Set<number>();
      for (let row = from; row <= to; row += 1) rows.add(row);
      if (selectedRow !== undefined) rows.add(selectedRow);
      for (const row of rows) {
        const rowTransactions = band.transactionsByRow.get(row);
        if (!rowTransactions || horizontalSourceWindow === null) continue;
        const candidates = horizontalSourceWindow === undefined
          ? rowTransactions
          : transactionsInStackRowWindow(rowTransactions, horizontalSourceWindow.start, horizontalSourceWindow.end);
        candidateVisits += candidates.length;
        for (const transaction of candidates) append(band, transaction);
        if (selectedRow === row && selectedId !== undefined) {
          const selected = horizontalDocumentIndex.byId.get(selectedId);
          if (selected) { candidateVisits += 1; append(band, selected); }
        }
      }
      // Fold-hidden representatives and a selected, fully hidden Transaction
      // have no stacking row. Keep their bounded rescue path independent of
      // the ordinary visible-row index.
      const laneIdentity = laneKey(band.groupId, band.laneId);
      for (const transaction of foldRescueCandidates) {
        if (currentKeys.get(transaction.id) === laneIdentity && !band.rowOf.has(transaction.id)) {
          candidateVisits += 1;
          append(band, transaction);
        }
      }
      if (selectedInBand && selectedRow === undefined && selectedId !== undefined) {
        const selected = horizontalDocumentIndex.byId.get(selectedId);
        if (selected) { candidateVisits += 1; append(band, selected); }
      }
    }
    return { trackCandidatesByLane: new Map([...byLane].map(([key, bucket]) => [key, [...bucket.values()]])), trackCandidateVisits: candidateVisits };
  }, [currentKeys, foldRescueCandidates, horizontalDocumentIndex, horizontalSourceWindow, selectedId, virtualBottom, virtualTop, visibleLaneBands]);

  useLayoutEffect(() => {
    const element = owner.current;
    if (!element || element.dataset.transactionFirstReadyAt !== undefined) return;
    // Use a wall-clock epoch so the value remains comparable with the
    // navigation timestamp across a full browser reload (performance.now()
    // has a new origin for every document).
    element.dataset.transactionFirstReadyAt = String(Date.now());
  });

  // In standalone Transaction mode this absolute layer is inside the same
  // scrolling .cycle-viewport that drives virtualWindow. Keep its normal CSS
  // top (34px); applying -virtualWindow.top here would subtract the scroll
  // offset a second time and make offscreen lanes unreachable.
  return <section ref={owner} className="transaction-lanes" data-testid="transaction-lanes" data-mount-serial={mountSerial.current} data-total-transactions={document.transactions.length} data-horizontal-candidate-transactions={horizontalDocumentCandidates.length} data-track-candidate-visits={trackCandidateVisits} data-vertical-band-visits={laneWindow.visits} data-hidden-bookmark-fold-summaries={hiddenBookmarkSummaries.length} data-lane-index-builds={laneIndexBuilds.current} data-stack-row-builds={stackRowBuilds.current} data-transaction-filter-builds={transactionFilterBuilds.current} style={{ "--transaction-zoom": zoom, height: totalHeight } as React.CSSProperties}>
    <div className="transaction-lane-labels">
      {visibleGroupHeaders.map((header) => {
        const group = header.groupId === undefined ? undefined : transactionGroupById.get(header.groupId);
        return <div key={header.key} className="transaction-group-header" data-testid="transaction-group-header" data-transaction-group-id={header.groupId} data-ungrouped={String(header.groupId === undefined)} data-collapsed={String(header.collapsed)} style={{ top: header.labelTop, height: GROUP_HEADER_HEIGHT }}>
          {/* #764: label/controls are a sticky context layer pinned to the Timeline viewport's left edge, so horizontal scrolling never leaves half-cut glyphs. */}
          <div className="transaction-group-header-context">
          <button type="button" className="transaction-group-header-chevron" aria-label={header.collapsed ? `Expand ${header.label}` : `Collapse ${header.label}`} aria-expanded={!header.collapsed} onClick={() => toggleGroupCollapsed(header.groupId ?? UNGROUPED_DISCLOSURE_KEY)}><EditorIcon name={header.collapsed ? "right" : "down"} /></button>
          {header.color && <i className="transaction-group-swatch" aria-hidden="true" style={{ background: header.color }} />}
          {/* #397 Transaction Mode GUI Closure: rename/delete had zero GUI
              entry point (commands already existed) -- "Ungrouped" is a
              view-only pseudo-section (no real Group behind it), so it
              keeps the plain label instead of gaining fake rename/delete
              controls. */}
          {group ? <InlineNameInput target={group} value={group.name} ariaLabel={`Rename Group ${group.name}`} onRename={(name) => commands.renameTransactionGroup(group.id, name)} /> : <span>{header.label}</span>}
          <span className="transaction-group-header-count">({header.count})</span>
          {group && <button type="button" className="transaction-group-header-delete" aria-label={`Ungroup ${group.name}`} title="Ungroup (deletes the Group, keeps its Transactions)" onClick={() => commands.deleteTransactionGroup(group.id)}><EditorIcon name="close" /></button>}
          </div>
        </div>;
      })}
      {visibleLaneBands.map((band) => {
        // Keep the center label plane strictly to Lane identity. Transaction
        // names and selection live in the dedicated, virtualized left Tree.
        return <span key={band.key} className="transaction-lane-label" data-testid="transaction-lane-label" data-lane-id={band.laneId} data-transaction-group-id={band.groupId} data-ungrouped={String(band.groupId === undefined)} style={{ top: band.labelTop, height: band.labelHeight }}>
          <em className="transaction-lane-label-name">{band.laneId.replace(/^lane_(\d+)$/i, "Lane $1")}</em>
        </span>;
      })}
    </div>
      <div className="transaction-track-viewport" data-role="transaction-track-viewport"><div className="transaction-track" data-transaction-track="true" style={{ height: totalHeight }}>
      <div className="transaction-geometry-guides" data-total-guide-count={cycleXs.length} data-mounted-guide-count={visibleGuideXs.length} aria-hidden="true">{visibleGuideXs.map((value) => <i className="transaction-geometry-line" key={`cycle-${value.cycle}`} data-cycle={value.cycle} style={{ left: value.x }} />)}</div>
      <div className="transaction-bookmark-markers" aria-label="Transaction bookmarks">{visibleBookmarks.map((bookmark) => { const left = x(bookmark.start); if (left === undefined) return null; const containingFold = bookmark.id === selectedBookmarkId ? (rawDocument.timeGroups ?? []).find((group) => group.presentation?.collapsed && bookmark.start >= group.start && bookmark.start < group.end) : undefined; return <button type="button" key={bookmark.id} data-bookmark-id={bookmark.id} data-source-cycle={bookmark.start} data-selected={String(bookmark.id === selectedBookmarkId)} aria-pressed={bookmark.id === selectedBookmarkId} {...(containingFold === undefined ? {} : { "data-inside-collapsed": containingFold.name })} aria-label={`Go to bookmark ${bookmark.name}`} title={`${bookmark.name}: ${bookmark.start}`} style={{ left }} onClick={() => onNavigateBookmark?.(bookmark.start, bookmark.id)} />; })}{hiddenBookmarkSummaries.map((summary) => { const left = x(summary.end) ?? x(summary.start); return left === undefined ? null : <button type="button" key={`fold-bookmarks-${summary.start}-${summary.end}`} className="transaction-fold-bookmark-summary" data-hidden-bookmark-count={summary.count} data-fold-start={summary.start} data-fold-end={summary.end} aria-label={`${summary.count} bookmarks inside collapsed range`} title={`${summary.count} bookmarks inside collapsed range`} style={{ left }} onClick={() => onNavigateBookmark?.(summary.start)} />; })}</div>
      {visibleGroupHeaders.map((header) => <div key={header.key} className="transaction-group-header-band" aria-hidden="true" style={{ top: header.trackTop, height: GROUP_HEADER_HEIGHT }} />)}
      {visibleLaneBands.map((band) => <div className="transaction-lane" key={band.key} data-lane-id={band.laneId} style={{ top: band.trackTop, height: band.trackHeight }}>
        {(trackCandidatesByLane.get(laneKey(band.groupId, band.laneId)) ?? []).map((transaction) => {
          const startX = x(transaction.start);
          const endX = x(transaction.end);
          // A Transaction fully inside a collapsed TimeGroup has no rendered X, but must still mount its "hidden in fold" affordance
          // (selectable, aria-labelled); only Transactions that are neither positioned nor fold-hidden are skipped.
          const containingFold = transactionFoldContainingCycle(foldRanges, transaction.start);
          const hiddenInFold = containingFold !== undefined && transaction.end <= containingFold[1];
          if ((startX === undefined || endX === undefined) && !hiddenInFold) return null;
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
          return <TransactionBar key={transaction.id} transaction={transaction} documentEpoch={documentEpoch} viewMode={viewMode} row={row} color={resolvedColor} selected={isTransactionSelected(transaction.id)} selectedPhaseId={selectedPhaseId} cycleCount={document.timeline.cycleCount} getBoundaryX={getScaledBoundaryX} boundaryXByCycle={boundaryXByCycle} visibleBoundaryXs={cycleXs} foldRanges={foldRanges} onSnap={onSnap} onSelect={onSelect} onSelectPhase={onSelectPhase} commands={commands} {...(onContextMenu === undefined ? {} : { onContextMenu })} />;
        })}
      </div>)}
    </div></div>
  </section>;
}
