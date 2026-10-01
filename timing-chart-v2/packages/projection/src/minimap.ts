import type { CanonicalDocument, RowId, Signal, SignalId, SignalValueChange, Transaction, TransactionGroup } from "@timing-chart-v2/schema";
import { transactionLaneIdentityKey } from "./transaction-lane-identity.js";

export type MiniMapTone = "low" | "high" | "clock" | "comment";

export interface MiniMapSegment {
  readonly start: number;
  readonly end: number;
  readonly tone: MiniMapTone;
}

export interface MiniMapOverviewRow {
  readonly rowId: RowId;
  readonly rowIndex: number;
  readonly segments: readonly MiniMapSegment[];
}

export interface MiniMapOverview {
  readonly cycleCount: number;
  readonly rows: readonly MiniMapOverviewRow[];
  /** Number of stable row-to-signal lookups performed while deriving this model. */
  readonly signalLookups: number;
  readonly rowsRebuilt: number;
  readonly rowsReused: number;
  readonly valueChangesVisited: number;
}

function valueSegments(values: readonly SignalValueChange[], cycleCount: number): readonly MiniMapSegment[] {
  return values.map((change, index) => ({
    start: change.start,
    end: values[index + 1]?.start ?? cycleCount,
    tone: String(change.value).toLowerCase() === "0" ? "low" : "high",
  }));
}

const constantSegmentCache = new Map<string, readonly MiniMapSegment[]>();
function constantSegments(tone: "comment" | "clock", cycleCount: number): readonly MiniMapSegment[] {
  const key = `${tone}:${cycleCount}`;
  let segments = constantSegmentCache.get(key);
  if (!segments) { segments = [{ start: 0, end: cycleCount, tone }]; if (constantSegmentCache.size > 64) constantSegmentCache.clear(); constantSegmentCache.set(key, segments); }
  return segments;
}

function segmentsForSignal(signal: Signal | undefined, cycleCount: number, work: { valueChangesVisited: number }): readonly MiniMapSegment[] {
  if (!signal || signal.type === "commentRow") return constantSegments("comment", cycleCount);
  if (signal.type === "clock") return constantSegments("clock", cycleCount);
  // #869: segments depend only on the (immutable) values array and cycleCount, so an edit to one Signal recomputes only that Signal.
  const cached = valueSegmentCache.get(signal.values);
  if (cached && cached.cycleCount === cycleCount) return cached.segments;
  work.valueChangesVisited += signal.values.length;
  const segments = valueSegments(signal.values, cycleCount);
  valueSegmentCache.set(signal.values, { cycleCount, segments });
  return segments;
}
const valueSegmentCache = new WeakMap<object, { readonly cycleCount: number; readonly segments: readonly MiniMapSegment[] }>();
const signalOverviewIndexes = new WeakMap<MiniMapOverview, Readonly<{ groups: CanonicalDocument["signalGroups"]; rowBySignalId: ReadonlyMap<SignalId, number>; signalIndexById: ReadonlyMap<SignalId, number> }>>();

function indexSignalOverview(overview: MiniMapOverview, document: Pick<CanonicalDocument, "signalGroups" | "signals">): void {
  const rowBySignalId = new Map<SignalId, number>();
  overview.rows.forEach((row, index) => rowBySignalId.set(row.rowId as SignalId, index));
  const signalIndexById = new Map<SignalId, number>();
  document.signals.forEach((signal, index) => signalIndexById.set(signal.id, index));
  signalOverviewIndexes.set(overview, { groups: document.signalGroups, rowBySignalId, signalIndexById });
}

/**
 * Derive the static MiniMap overview from CanonicalDocument once per document
 * identity. The renderer can then update the viewport rectangle independently.
 */
export function buildMiniMapOverview(document: Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">): MiniMapOverview {
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  const signalById = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const rowIds = document.signalGroups.flatMap((group) => group.rows);
  const work = { valueChangesVisited: 0 };
  const rows = rowIds.map((rowId, rowIndex) => ({
    rowId,
    rowIndex,
    segments: segmentsForSignal(signalById.get(rowId), cycleCount, work),
  }));
  const overview = Object.freeze({ cycleCount, rows: Object.freeze(rows), signalLookups: rowIds.length, rowsRebuilt: rows.length, rowsReused: 0, valueChangesVisited: work.valueChangesVisited });
  indexSignalOverview(overview, document);
  return overview;
}

/** Reuse unchanged MiniMap row models when an immutable Signal collection changes. */
export function updateMiniMapOverview(previous: MiniMapOverview, document: Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">, changedSignalIds?: readonly SignalId[]): MiniMapOverview {
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  if (previous.cycleCount !== cycleCount) return buildMiniMapOverview(document);
  if (changedSignalIds !== undefined) {
    const index = signalOverviewIndexes.get(previous);
    if (!index || index.groups !== document.signalGroups) return buildMiniMapOverview(document);
    const rows = [...previous.rows];
    const work = { valueChangesVisited: 0 };
    let rowsRebuilt = 0;
    for (const id of new Set(changedSignalIds)) {
      const rowIndex = index.rowBySignalId.get(id);
      const signalIndex = index.signalIndexById.get(id);
      if (rowIndex === undefined || signalIndex === undefined || document.signals[signalIndex]?.id !== id) return buildMiniMapOverview(document);
      const signal = document.signals[signalIndex];
      const segments = segmentsForSignal(signal, cycleCount, work);
      if (rows[rowIndex]?.segments === segments) continue;
      rows[rowIndex] = { rowId: id, rowIndex, segments };
      rowsRebuilt += 1;
    }
    const overview = Object.freeze({ cycleCount, rows: Object.freeze(rows), signalLookups: new Set(changedSignalIds).size, rowsRebuilt, rowsReused: rows.length - rowsRebuilt, valueChangesVisited: work.valueChangesVisited });
    signalOverviewIndexes.set(overview, index);
    return overview;
  }
  const signalById = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const rowIds = document.signalGroups.flatMap((group) => group.rows);
  const work = { valueChangesVisited: 0 };
  let rowsRebuilt = 0;
  let rowsReused = 0;
  const rows = rowIds.map((rowId, rowIndex) => {
    const segments = segmentsForSignal(signalById.get(rowId), cycleCount, work);
    const oldRow = previous.rows[rowIndex];
    if (oldRow?.rowId === rowId && oldRow.segments === segments) {
      rowsReused += 1;
      return oldRow;
    }
    rowsRebuilt += 1;
    return { rowId, rowIndex, segments };
  });
  const overview = Object.freeze({ cycleCount, rows: Object.freeze(rows), signalLookups: rowIds.length, rowsRebuilt, rowsReused, valueChangesVisited: work.valueChangesVisited });
  indexSignalOverview(overview, document);
  return overview;
}

export interface MiniMapTransactionSegment {
  readonly start: number;
  readonly end: number;
  readonly color: string;
}

export interface MiniMapTransactionRow {
  readonly key: string;
  readonly groupId: Transaction["groupId"];
  readonly laneId: string;
  readonly rowIndex: number;
  readonly segments: readonly MiniMapTransactionSegment[];
}

export interface MiniMapTransactionOverview {
  readonly cycleCount: number;
  readonly rows: readonly MiniMapTransactionRow[];
  readonly transactionsVisited: number;
  readonly laneBucketsRebuilt: number;
}

type TransactionLaneBucket = { readonly groupId: Transaction["groupId"]; readonly laneId: string; readonly transactions: Transaction[] };
type TransactionIndex = Readonly<{ byId?: ReadonlyMap<Transaction["id"], Transaction>; indexById: ReadonlyMap<Transaction["id"], number>; byLane: ReadonlyMap<string, TransactionLaneBucket> }>;
type TransactionGroupPresentationIndex = Readonly<{ colorById: ReadonlyMap<TransactionGroup["id"], string>; orderById: ReadonlyMap<TransactionGroup["id"], number> }>;
const emptyTransactionGroups: readonly TransactionGroup[] = Object.freeze([]);
const transactionGroupPresentationIndexes = new WeakMap<readonly TransactionGroup[], TransactionGroupPresentationIndex>();

function transactionGroupPresentationIndex(groups: readonly TransactionGroup[] | undefined): TransactionGroupPresentationIndex {
  const owner = groups ?? emptyTransactionGroups;
  const cached = transactionGroupPresentationIndexes.get(owner);
  if (cached) return cached;
  const colorById = new Map<TransactionGroup["id"], string>();
  const orderById = new Map<TransactionGroup["id"], number>();
  for (const group of owner) {
    colorById.set(group.id, group.color ?? DEFAULT_TRANSACTION_COLOR);
    orderById.set(group.id, group.order);
  }
  const index = Object.freeze({ colorById, orderById });
  transactionGroupPresentationIndexes.set(owner, index);
  return index;
}
const transactionIndexes = new WeakMap<readonly Transaction[], TransactionIndex>();
const transactionOverviewRowIndexes = new WeakMap<MiniMapTransactionOverview, ReadonlyMap<string, number>>();

function transactionIndex(transactions: readonly Transaction[], requireById = false): TransactionIndex {
  const cached = transactionIndexes.get(transactions);
  if (cached && (!requireById || cached.byId)) return cached;
  const byId = new Map<Transaction["id"], Transaction>();
  const indexById = new Map<Transaction["id"], number>();
  const byLane = new Map<string, TransactionLaneBucket>();
  for (const [index, transaction] of transactions.entries()) {
    byId.set(transaction.id, transaction);
    indexById.set(transaction.id, index);
    if (transaction.visible === false) continue;
    const laneId = transaction.laneId ?? "lane_0";
    const key = transactionLaneIdentityKey(transaction.groupId, laneId);
    const bucket = byLane.get(key);
    if (bucket) bucket.transactions.push(transaction);
    else byLane.set(key, { groupId: transaction.groupId, laneId, transactions: [transaction] });
  }
  const index = { byId, indexById, byLane };
  transactionIndexes.set(transactions, index);
  return index;
}

const DEFAULT_TRANSACTION_COLOR = "#8895a7";

function sortTransactionSegments(left: MiniMapTransactionSegment, right: MiniMapTransactionSegment): number {
  return left.start - right.start || left.end - right.end || (left.color < right.color ? -1 : left.color > right.color ? 1 : 0);
}

/**
 * #429/#397 Transaction Mode Product Closure P1: the MiniMap had no
 * Transaction-aware overview at all -- `buildMiniMapOverview` above only
 * ever derives Signal-value segments, so Transaction Mode either showed
 * stale Signal content or (the stop-gap fix that shipped first) was hidden
 * outright. This derives one MiniMap row per (Group, Lane) pair actually in
 * use -- the same identity TransactionLanes itself groups by -- each
 * carrying its Transactions as colored segments (Transaction color, falling
 * back to its Group color, matching every other Transaction-color-resolving
 * surface this session already fixed under #429 P0-4). Ordered by Group
 * `order` (Ungrouped last, matching TransactionLanes' own section order),
 * then by Lane id within a Group.
 */
export function buildMiniMapTransactionOverview(document: Pick<CanonicalDocument, "transactions" | "transactionGroups" | "timeline">): MiniMapTransactionOverview {
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  const { colorById: colorByGroupId, orderById: orderByGroupId } = transactionGroupPresentationIndex(document.transactionGroups);
  const byLane = transactionIndex(document.transactions).byLane;
  const orderedBuckets = [...byLane.values()].sort((left, right) => {
    const leftOrder = left.groupId ? orderByGroupId.get(left.groupId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const rightOrder = right.groupId ? orderByGroupId.get(right.groupId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.laneId.localeCompare(right.laneId);
  });
  const rows = orderedBuckets.map((bucket, rowIndex) => {
    const groupColor = bucket.groupId ? colorByGroupId.get(bucket.groupId) : undefined;
    const segments = bucket.transactions
      .map((transaction) => ({ start: transaction.start, end: transaction.end, color: transaction.color ?? groupColor ?? DEFAULT_TRANSACTION_COLOR }))
      .sort(sortTransactionSegments);
    return { key: transactionLaneIdentityKey(bucket.groupId, bucket.laneId), groupId: bucket.groupId, laneId: bucket.laneId, rowIndex, segments };
  });
  const overview = Object.freeze({ cycleCount, rows: Object.freeze(rows), transactionsVisited: document.transactions.length, laneBucketsRebuilt: rows.length });
  transactionOverviewRowIndexes.set(overview, new Map(rows.map((row, index) => [row.key, index] as const)));
  return overview;
}

/**
 * Reuse a transaction overview when a semantic edit touches only existing
 * lanes. The caller must retain the previous transaction array and group
 * array; structural changes fall back to the canonical full builder.
 */
export function updateMiniMapTransactionOverview(previous: MiniMapTransactionOverview, previousTransactions: readonly Transaction[], previousGroups: CanonicalDocument["transactionGroups"], document: Pick<CanonicalDocument, "transactions" | "transactionGroups" | "timeline">, changedTransactionIds?: readonly Transaction["id"][]): MiniMapTransactionOverview {
  if (previous.cycleCount !== Math.max(1, document.timeline.cycleCount) || previousGroups !== document.transactionGroups) return buildMiniMapTransactionOverview(document);
  const laneKey = (transaction: Transaction) => transactionLaneIdentityKey(transaction.groupId, transaction.laneId ?? "lane_0");
  if (changedTransactionIds !== undefined) {
    if (document.transactions.length !== previousTransactions.length) return buildMiniMapTransactionOverview(document);
    const previousIndex = transactionIndexes.get(previousTransactions) ?? transactionIndex(previousTransactions);
    const rowIndexes = transactionOverviewRowIndexes.get(previous);
    if (!rowIndexes) return buildMiniMapTransactionOverview(document);
    const changedIds = [...new Set(changedTransactionIds)];
    const changes: { before: Transaction; after: Transaction }[] = [];
    const affectedLaneIds = new Map<string, Set<Transaction["id"]>>();
    const movedInByLane = new Map<string, Transaction[]>();
    const laneCountDelta = new Map<string, number>();
    const addLaneChange = (key: string, id: Transaction["id"], delta: number) => {
      const ids = affectedLaneIds.get(key) ?? new Set<Transaction["id"]>();
      ids.add(id);
      affectedLaneIds.set(key, ids);
      laneCountDelta.set(key, (laneCountDelta.get(key) ?? 0) + delta);
    };
    for (const id of changedIds) {
      const position = previousIndex.indexById.get(id);
      if (position === undefined) return buildMiniMapTransactionOverview(document);
      const before = previousTransactions[position];
      const after = document.transactions[position];
      if (!before || !after || after.id !== id) return buildMiniMapTransactionOverview(document);
      changes.push({ before, after });
      if (before.visible !== false) addLaneChange(laneKey(before), id, -1);
      if (after.visible !== false) {
        const key = laneKey(after);
        addLaneChange(key, id, 1);
        const movedIn = movedInByLane.get(key) ?? [];
        movedIn.push(after);
        movedInByLane.set(key, movedIn);
      }
    }
    if (changes.length === 0) return previous;
    for (const [key, delta] of laneCountDelta) {
      const oldCount = previousIndex.byLane.get(key)?.transactions.length ?? 0;
      const nextCount = oldCount + delta;
      // Creating/removing a lane changes the row topology and its ordering;
      // retain the canonical full builder for that uncommon structural case.
      if (nextCount <= 0 || oldCount === 0) return buildMiniMapTransactionOverview(document);
    }
    const { colorById: colorByGroupId } = transactionGroupPresentationIndex(document.transactionGroups);
    const nextBuckets = new Map(previousIndex.byLane);
    const rows = [...previous.rows];
    let transactionsVisited = changes.length;
    for (const [key, ids] of affectedLaneIds) {
      const oldBucket = previousIndex.byLane.get(key);
      if (!oldBucket) return buildMiniMapTransactionOverview(document);
      const retained = oldBucket.transactions.filter((transaction) => !ids.has(transaction.id));
      const movedIn = movedInByLane.get(key) ?? [];
      const bucketTransactions = [...retained, ...movedIn];
      transactionsVisited += oldBucket.transactions.length + bucketTransactions.length;
      const bucket: TransactionLaneBucket = { groupId: oldBucket.groupId, laneId: oldBucket.laneId, transactions: bucketTransactions };
      nextBuckets.set(key, bucket);
      const rowIndex = rowIndexes.get(key);
      if (rowIndex === undefined) return buildMiniMapTransactionOverview(document);
      const groupColor = bucket.groupId ? colorByGroupId.get(bucket.groupId) : undefined;
      const segments = bucketTransactions.map((transaction) => ({ start: transaction.start, end: transaction.end, color: transaction.color ?? groupColor ?? DEFAULT_TRANSACTION_COLOR })).sort(sortTransactionSegments);
      rows[rowIndex] = { key, groupId: bucket.groupId, laneId: bucket.laneId, rowIndex, segments };
    }
    const overview = Object.freeze({ cycleCount: previous.cycleCount, rows: Object.freeze(rows), transactionsVisited, laneBucketsRebuilt: affectedLaneIds.size });
    transactionOverviewRowIndexes.set(overview, rowIndexes);
    transactionIndexes.set(document.transactions, { indexById: previousIndex.indexById, byLane: nextBuckets });
    return overview;
  }
  const previousIndex = transactionIndex(previousTransactions, true);
  const nextIndex = transactionIndex(document.transactions, true);
  if (!previousIndex.byId || !nextIndex.byId) return buildMiniMapTransactionOverview(document);
  const changedLanes = new Set<string>();
  for (const [id, before] of previousIndex.byId) {
    const next = nextIndex.byId.get(id);
    if (next !== before) {
      if (before.visible !== false) changedLanes.add(laneKey(before));
      if (next?.visible !== false && next) changedLanes.add(laneKey(next));
    }
  }
  for (const [id, next] of nextIndex.byId) {
    if (!previousIndex.byId.has(id) && next.visible !== false) changedLanes.add(laneKey(next));
  }
  if (changedLanes.size === 0) return previous;
  const { colorById: colorByGroupId, orderById: orderByGroupId } = transactionGroupPresentationIndex(document.transactionGroups);
  const buildRow = (key: string, rowIndex: number) => {
    const bucket = nextIndex.byLane.get(key);
    if (!bucket || bucket.transactions.length === 0) return undefined;
    const resolvedGroupId = bucket.groupId;
    const groupColor = resolvedGroupId ? colorByGroupId.get(resolvedGroupId) : undefined;
    return { key: transactionLaneIdentityKey(resolvedGroupId, bucket.laneId), groupId: resolvedGroupId, laneId: bucket.laneId, rowIndex, segments: bucket.transactions.map((transaction) => ({ start: transaction.start, end: transaction.end, color: transaction.color ?? groupColor ?? DEFAULT_TRANSACTION_COLOR })).sort(sortTransactionSegments) };
  };
  const rowsByKey = new Map(previous.rows.map((row) => [row.key, row] as const));
  for (const key of changedLanes) {
    const row = buildRow(key, 0);
    if (row) rowsByKey.set(key, row);
    else rowsByKey.delete(key);
  }
  const rows = [...rowsByKey.values()].sort((left, right) => {
    const leftOrder = left.groupId === undefined ? Number.MAX_SAFE_INTEGER : orderByGroupId.get(left.groupId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.groupId === undefined ? Number.MAX_SAFE_INTEGER : orderByGroupId.get(right.groupId) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.laneId.localeCompare(right.laneId);
  }).map((row, rowIndex) => row.rowIndex === rowIndex ? row : ({ ...row, rowIndex }));
  const overview = Object.freeze({ cycleCount: previous.cycleCount, rows: Object.freeze(rows), transactionsVisited: previousTransactions.length + document.transactions.length, laneBucketsRebuilt: changedLanes.size });
  transactionOverviewRowIndexes.set(overview, new Map(rows.map((row, index) => [row.key, index] as const)));
  return overview;
}
