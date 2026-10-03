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

/** The overview is ~280 px wide: more than this many segments per row are sub-pixel and only cost DOM/paint (#856: 20k segments made every scroll frame ~40 ms). */
const MAX_EXACT_SEGMENTS = 1_024;
const OVERVIEW_BUCKETS = 1_024;

function valueSegments(values: readonly SignalValueChange[], cycleCount: number): readonly MiniMapSegment[] {
  const toneOf = (value: SignalValueChange["value"]): MiniMapTone => String(value).toLowerCase() === "0" ? "low" : "high";
  if (values.length <= MAX_EXACT_SEGMENTS) {
    return values.map((change, index) => ({ start: change.start, end: values[index + 1]?.start ?? cycleCount, tone: toneOf(change.value) }));
  }
  // Dense rows: reduce to <= OVERVIEW_BUCKETS pixel-scale buckets, each carrying the duration-dominant tone, then merge equal neighbours.
  const bucketWidth = Math.max(1, cycleCount / OVERVIEW_BUCKETS);
  const lowDuration = new Float64Array(OVERVIEW_BUCKETS);
  const highDuration = new Float64Array(OVERVIEW_BUCKETS);
  for (let index = 0; index < values.length; index += 1) {
    const change = values[index]!;
    const tone = toneOf(change.value);
    const end = values[index + 1]?.start ?? cycleCount;
    let cursor = Math.max(0, change.start);
    while (cursor < end) {
      const bucket = Math.min(OVERVIEW_BUCKETS - 1, Math.floor(cursor / bucketWidth));
      const bucketEnd = Math.min(end, (bucket + 1) * bucketWidth);
      const span = Math.max(bucketEnd - cursor, 0);
      if (tone === "low") lowDuration[bucket] = (lowDuration[bucket] ?? 0) + span; else highDuration[bucket] = (highDuration[bucket] ?? 0) + span;
      if (bucketEnd <= cursor) break;
      cursor = bucketEnd;
    }
  }
  const segments: MiniMapSegment[] = [];
  for (let bucket = 0; bucket < OVERVIEW_BUCKETS; bucket += 1) {
    const covered = (lowDuration[bucket] ?? 0) + (highDuration[bucket] ?? 0);
    if (covered === 0) continue;
    const tone: MiniMapTone = (highDuration[bucket] ?? 0) >= (lowDuration[bucket] ?? 0) ? "high" : "low";
    const start = Math.round(bucket * bucketWidth);
    const end = Math.min(cycleCount, Math.round((bucket + 1) * bucketWidth));
    const previous = segments[segments.length - 1];
    if (previous && previous.tone === tone && previous.end === start) segments[segments.length - 1] = { ...previous, end };
    else segments.push({ start, end, tone });
  }
  return segments;
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
const MAX_TRANSACTION_MINIMAP_SEGMENTS = 1_024;

function sortTransactionSegments(left: MiniMapTransactionSegment, right: MiniMapTransactionSegment): number {
  return left.start - right.start || left.end - right.end || (left.color < right.color ? -1 : left.color > right.color ? 1 : 0);
}

/** Keep dense lane overviews pixel-bounded while preserving occupancy and a deterministic representative color per time bucket. */
function transactionSegments(transactions: readonly Transaction[], groupColor: string | undefined, cycleCount: number): readonly MiniMapTransactionSegment[] {
  if (transactions.length <= MAX_TRANSACTION_MINIMAP_SEGMENTS) {
    return transactions.map((transaction) => ({ start: transaction.start, end: transaction.end, color: transaction.color ?? groupColor ?? DEFAULT_TRANSACTION_COLOR })).sort(sortTransactionSegments);
  }
  const bucketWidth = cycleCount / MAX_TRANSACTION_MINIMAP_SEGMENTS;
  const bestCoverage = new Float64Array(MAX_TRANSACTION_MINIMAP_SEGMENTS);
  const edgeColors: (string | undefined)[] = Array.from({ length: MAX_TRANSACTION_MINIMAP_SEGMENTS });
  const fullRangeColors: (string | undefined)[] = Array.from({ length: MAX_TRANSACTION_MINIMAP_SEGMENTS * 4 });
  const updateFullRange = (node: number, left: number, right: number, from: number, to: number, color: string): void => {
    if (from > right || to < left) return;
    if (from <= left && right <= to) {
      const current = fullRangeColors[node];
      if (current === undefined || color < current) fullRangeColors[node] = color;
      return;
    }
    const middle = Math.floor((left + right) / 2);
    updateFullRange(node * 2, left, middle, from, to, color);
    updateFullRange(node * 2 + 1, middle + 1, right, from, to, color);
  };
  const fullRangeColorAt = (bucket: number): string | undefined => {
    let node = 1;
    let left = 0;
    let right = MAX_TRANSACTION_MINIMAP_SEGMENTS - 1;
    let color: string | undefined;
    while (left <= right) {
      const candidate = fullRangeColors[node];
      if (candidate !== undefined && (color === undefined || candidate < color)) color = candidate;
      if (left === right) break;
      const middle = Math.floor((left + right) / 2);
      if (bucket <= middle) { node *= 2; right = middle; }
      else { node = node * 2 + 1; left = middle + 1; }
    }
    return color;
  };
  const recordEdge = (bucket: number, coverage: number, color: string): void => {
    if (coverage > bestCoverage[bucket]! || (coverage === bestCoverage[bucket] && color < (edgeColors[bucket] ?? "\uffff"))) {
      bestCoverage[bucket] = coverage;
      edgeColors[bucket] = color;
    }
  };
  for (const transaction of transactions) {
    const start = Math.max(0, Math.min(cycleCount, transaction.start));
    const end = Math.max(start, Math.min(cycleCount, transaction.end));
    if (end <= start) continue;
    const firstBucket = Math.min(MAX_TRANSACTION_MINIMAP_SEGMENTS - 1, Math.floor(start / bucketWidth));
    const lastBucket = Math.min(MAX_TRANSACTION_MINIMAP_SEGMENTS - 1, Math.ceil(end / bucketWidth) - 1);
    const color = transaction.color ?? groupColor ?? DEFAULT_TRANSACTION_COLOR;
    if (firstBucket === lastBucket) {
      recordEdge(firstBucket, end - start, color);
    } else {
      const firstCoverage = Math.min(end, (firstBucket + 1) * bucketWidth) - start;
      const lastCoverage = end - lastBucket * bucketWidth;
      if (firstCoverage >= bucketWidth - Number.EPSILON * cycleCount) updateFullRange(1, 0, MAX_TRANSACTION_MINIMAP_SEGMENTS - 1, firstBucket, firstBucket, color);
      else recordEdge(firstBucket, firstCoverage, color);
      if (lastCoverage >= bucketWidth - Number.EPSILON * cycleCount) updateFullRange(1, 0, MAX_TRANSACTION_MINIMAP_SEGMENTS - 1, lastBucket, lastBucket, color);
      else recordEdge(lastBucket, lastCoverage, color);
      if (lastBucket > firstBucket + 1) updateFullRange(1, 0, MAX_TRANSACTION_MINIMAP_SEGMENTS - 1, firstBucket + 1, lastBucket - 1, color);
    }
  }
  const segments: MiniMapTransactionSegment[] = [];
  for (let bucket = 0; bucket < MAX_TRANSACTION_MINIMAP_SEGMENTS; bucket += 1) {
    const fullColor = fullRangeColorAt(bucket);
    const edgeColor = edgeColors[bucket];
    const color = fullColor !== undefined && (bestCoverage[bucket]! < bucketWidth || edgeColor === undefined || fullColor <= edgeColor)
      ? fullColor
      : edgeColor;
    if (!color) continue;
    const start = Math.max(0, Math.round(bucket * bucketWidth));
    const end = Math.min(cycleCount, Math.round((bucket + 1) * bucketWidth));
    const previous = segments.at(-1);
    if (previous?.color === color && previous.end === start) segments[segments.length - 1] = { ...previous, end };
    else segments.push({ start, end, color });
  }
  return segments;
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
    const segments = transactionSegments(bucket.transactions, groupColor, cycleCount);
    return { key: transactionLaneIdentityKey(bucket.groupId, bucket.laneId), groupId: bucket.groupId, laneId: bucket.laneId, rowIndex, segments };
  });
  const overview = Object.freeze({ cycleCount, rows: Object.freeze(rows), transactionsVisited: document.transactions.length, laneBucketsRebuilt: rows.length });
  transactionOverviewRowIndexes.set(overview, new Map(rows.map((row, index) => [row.key, index] as const)));
  return overview;
}

/**
 * Reuse a transaction overview when a semantic edit touches a bounded set of
 * lanes. Lane creation/removal reorders the lane-row model without rescanning
 * the document-wide Transaction collection.
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
    const addLaneChange = (key: string, id: Transaction["id"]) => {
      const ids = affectedLaneIds.get(key) ?? new Set<Transaction["id"]>();
      ids.add(id);
      affectedLaneIds.set(key, ids);
    };
    for (const id of changedIds) {
      const position = previousIndex.indexById.get(id);
      if (position === undefined) return buildMiniMapTransactionOverview(document);
      const before = previousTransactions[position];
      const after = document.transactions[position];
      if (!before || !after || after.id !== id) return buildMiniMapTransactionOverview(document);
      changes.push({ before, after });
      if (before.visible !== false) addLaneChange(laneKey(before), id);
      if (after.visible !== false) {
        const key = laneKey(after);
        addLaneChange(key, id);
        const movedIn = movedInByLane.get(key) ?? [];
        movedIn.push(after);
        movedInByLane.set(key, movedIn);
      }
    }
    if (changes.length === 0) return previous;
    if (affectedLaneIds.size === 0) return previous;
    const { colorById: colorByGroupId } = transactionGroupPresentationIndex(document.transactionGroups);
    const nextBuckets = new Map(previousIndex.byLane);
    const rowsByKey = new Map(previous.rows.map((row) => [row.key, row] as const));
    let transactionsVisited = changes.length;
    for (const [key, ids] of affectedLaneIds) {
      const oldBucket = previousIndex.byLane.get(key);
      const retained = oldBucket?.transactions.filter((transaction) => !ids.has(transaction.id)) ?? [];
      const movedIn = movedInByLane.get(key) ?? [];
      const bucketTransactions = [...retained, ...movedIn];
      transactionsVisited += (oldBucket?.transactions.length ?? 0) + bucketTransactions.length;
      if (bucketTransactions.length === 0) {
        nextBuckets.delete(key);
        rowsByKey.delete(key);
        continue;
      }
      const representative = bucketTransactions[0]!;
      const bucket: TransactionLaneBucket = { groupId: oldBucket?.groupId ?? representative.groupId, laneId: oldBucket?.laneId ?? representative.laneId ?? "lane_0", transactions: bucketTransactions };
      nextBuckets.set(key, bucket);
      const rowIndex = rowIndexes.get(key);
      const groupColor = bucket.groupId ? colorByGroupId.get(bucket.groupId) : undefined;
      const segments = transactionSegments(bucketTransactions, groupColor, previous.cycleCount);
      rowsByKey.set(key, { key, groupId: bucket.groupId, laneId: bucket.laneId, rowIndex: rowIndex ?? 0, segments });
    }
    const { orderById: orderByGroupId } = transactionGroupPresentationIndex(document.transactionGroups);
    const rows = [...rowsByKey.values()].sort((left, right) => {
      const leftOrder = left.groupId === undefined ? Number.MAX_SAFE_INTEGER : orderByGroupId.get(left.groupId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.groupId === undefined ? Number.MAX_SAFE_INTEGER : orderByGroupId.get(right.groupId) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.laneId.localeCompare(right.laneId);
    }).map((row, rowIndex) => row.rowIndex === rowIndex ? row : ({ ...row, rowIndex }));
    const overview = Object.freeze({ cycleCount: previous.cycleCount, rows: Object.freeze(rows), transactionsVisited, laneBucketsRebuilt: affectedLaneIds.size });
    transactionOverviewRowIndexes.set(overview, new Map(rows.map((row, index) => [row.key, index] as const)));
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
    return { key: transactionLaneIdentityKey(resolvedGroupId, bucket.laneId), groupId: resolvedGroupId, laneId: bucket.laneId, rowIndex, segments: transactionSegments(bucket.transactions, groupColor, previous.cycleCount) };
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
