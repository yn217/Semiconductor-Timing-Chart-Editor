import type { CanonicalDocument, RowId, Signal, SignalValueChange, Transaction } from "@timing-chart-v2/schema";

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
  /** Rows/values visited by the most recent build or incremental update. */
  readonly rowsRebuilt: number;
  readonly valueChangesVisited: number;
}

type SignalOverviewSource = Readonly<{ type: Signal["type"]; values: readonly SignalValueChange[] | undefined; rowIndex: number }>;
const signalSourcesByOverview = new WeakMap<MiniMapOverview, Map<RowId, SignalOverviewSource>>();

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

function segmentsForSignal(signal: Signal | undefined, cycleCount: number): readonly MiniMapSegment[] {
  if (!signal || signal.type === "commentRow") return constantSegments("comment", cycleCount);
  if (signal.type === "clock") return constantSegments("clock", cycleCount);
  // #869: segments depend only on the (immutable) values array and cycleCount, so an edit to one Signal recomputes only that Signal.
  const cached = valueSegmentCache.get(signal.values);
  if (cached && cached.cycleCount === cycleCount) return cached.segments;
  const segments = valueSegments(signal.values, cycleCount);
  valueSegmentCache.set(signal.values, { cycleCount, segments });
  return segments;
}
const valueSegmentCache = new WeakMap<object, { readonly cycleCount: number; readonly segments: readonly MiniMapSegment[] }>();

/**
 * Derive the static MiniMap overview from CanonicalDocument once per document
 * identity. The renderer can then update the viewport rectangle independently.
 */
export function buildMiniMapOverview(document: Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">): MiniMapOverview {
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  const signalById = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const rowIds = document.signalGroups.flatMap((group) => group.rows);
  let valueChangesVisited = 0;
  const sources = new Map<RowId, SignalOverviewSource>();
  const rows = rowIds.map((rowId, rowIndex) => {
    const signal = signalById.get(rowId);
    if (signal && signal.type !== "clock" && signal.type !== "commentRow") {
      valueChangesVisited += signal.values.length;
      sources.set(rowId, { type: signal.type, values: signal.values, rowIndex } as SignalOverviewSource);
    } else if (signal) sources.set(rowId, { type: signal.type, values: undefined, rowIndex } as SignalOverviewSource);
    return {
      rowId,
      rowIndex,
      segments: segmentsForSignal(signal, cycleCount),
    };
  });
  const overview = Object.freeze({ cycleCount, rows: Object.freeze(rows), signalLookups: rowIds.length, rowsRebuilt: rows.length, valueChangesVisited });
  signalSourcesByOverview.set(overview, sources);
  return overview;
}

/** Reuse stable rows when an immutable Signal collection changes. Group/row topology changes still use the full builder. */
export function updateMiniMapOverview(previous: MiniMapOverview, previousSignals: readonly Signal[], previousGroups: CanonicalDocument["signalGroups"], document: Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">, changedSignals?: readonly Signal[]): MiniMapOverview {
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  if (previousGroups !== document.signalGroups || previous.cycleCount !== cycleCount) return buildMiniMapOverview(document);
  if (previousSignals === document.signals) return previous;
  const previousSources = signalSourcesByOverview.get(previous);
  if (!previousSources) return buildMiniMapOverview(document);
  if (changedSignals?.length) {
    const sources = previousSources;
    const rows = [...previous.rows];
    let rowsRebuilt = 0;
    let valueChangesVisited = 0;
    for (const signal of changedSignals) {
      const source = sources.get(signal.id);
      if (!source) return buildMiniMapOverview(document);
      const nextValues = signal.type === "clock" || signal.type === "commentRow" ? undefined : signal.values;
      if (source.type !== signal.type || source.values !== nextValues) {
        rows[source.rowIndex] = { ...rows[source.rowIndex]!, segments: segmentsForSignal(signal, cycleCount) };
        rowsRebuilt += 1;
        if (nextValues) valueChangesVisited += nextValues.length;
      }
      sources.set(signal.id, { type: signal.type, values: nextValues, rowIndex: source.rowIndex });
    }
    const overview = Object.freeze({ cycleCount, rows: rowsRebuilt === 0 ? previous.rows : Object.freeze(rows), signalLookups: changedSignals.length, rowsRebuilt, valueChangesVisited });
    signalSourcesByOverview.set(overview, sources);
    return overview;
  }
  const signalById = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  let rowsRebuilt = 0;
  let valueChangesVisited = 0;
  const nextSources = new Map<RowId, SignalOverviewSource>();
  const rows = previous.rows.map((row) => {
    const signal = signalById.get(row.rowId);
    if (!signal) return undefined;
    const nextSource = signal.type === "clock" || signal.type === "commentRow"
      ? { type: signal.type, values: undefined, rowIndex: row.rowIndex } as SignalOverviewSource
      : { type: signal.type, values: signal.values, rowIndex: row.rowIndex } as SignalOverviewSource;
    nextSources.set(row.rowId, nextSource);
    const oldSource = previousSources.get(row.rowId);
    if (oldSource?.type === nextSource.type && oldSource.values === nextSource.values) return row;
    rowsRebuilt += 1;
    if (signal.type !== "clock" && signal.type !== "commentRow") valueChangesVisited += signal.values.length;
    return { ...row, segments: segmentsForSignal(signal, cycleCount) };
  });
  if (rows.some((row) => row === undefined)) return buildMiniMapOverview(document);
  const sameRows = rowsRebuilt === 0;
  const overview = Object.freeze({ cycleCount, rows: sameRows ? previous.rows : Object.freeze(rows as MiniMapOverviewRow[]), signalLookups: previous.rows.length, rowsRebuilt, valueChangesVisited });
  signalSourcesByOverview.set(overview, nextSources);
  return overview;
}

export interface MiniMapTransactionSegment {
  readonly start: number;
  readonly end: number;
  readonly color: string;
}

export interface MiniMapTransactionRow {
  readonly key: string;
  readonly rowIndex: number;
  readonly segments: readonly MiniMapTransactionSegment[];
}

export interface MiniMapTransactionOverview {
  readonly cycleCount: number;
  readonly rows: readonly MiniMapTransactionRow[];
  readonly transactionsVisited: number;
  readonly laneBucketsRebuilt: number;
  readonly updateKind: "full" | "incremental" | "reused";
}

const DEFAULT_TRANSACTION_COLOR = "#8895a7";
type TransactionLaneBucket = ReadonlyMap<string, Transaction>;
type TransactionOverviewSource = Readonly<{
  transactions: Map<string, Transaction>;
  buckets: ReadonlyMap<string, TransactionLaneBucket>;
}>;
const transactionSourcesByOverview = new WeakMap<MiniMapTransactionOverview, TransactionOverviewSource>();

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
  const groups = document.transactionGroups ?? [];
  const colorByGroupId = new Map(groups.map((group) => [group.id, group.color ?? DEFAULT_TRANSACTION_COLOR]));
  const orderByGroupId = new Map(groups.map((group) => [group.id, group.order]));
  type LaneBucket = { readonly groupId: Transaction["groupId"]; readonly laneId: string; readonly transactions: Transaction[] };
  const byLane = new Map<string, LaneBucket>();
  const transactionsById = new Map<string, Transaction>();
  for (const transaction of document.transactions) {
    transactionsById.set(transaction.id, transaction);
    if (transaction.visible === false) continue;
    const laneId = transaction.laneId ?? "lane_0";
    // Keep the builder's row identity identical to the incremental updater.
    // A mismatch here makes every first incremental update reconstruct rows
    // under keys that do not exist in the initial overview.
    const key = `${transaction.groupId ?? "ungrouped"}:${laneId}`;
    const bucket = byLane.get(key);
    if (bucket) bucket.transactions.push(transaction);
    else byLane.set(key, { groupId: transaction.groupId, laneId, transactions: [transaction] });
  }
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
    return { key: `${bucket.groupId ?? "ungrouped"}:${bucket.laneId}`, rowIndex, segments };
  });
  const buckets = new Map<string, ReadonlyMap<string, Transaction>>();
  for (const [key, bucket] of byLane) buckets.set(key, new Map(bucket.transactions.map((transaction) => [transaction.id, transaction])));
  const overview = Object.freeze({ cycleCount, rows: Object.freeze(rows), transactionsVisited: document.transactions.length, laneBucketsRebuilt: byLane.size, updateKind: "full" as const });
  transactionSourcesByOverview.set(overview, { transactions: transactionsById, buckets });
  return overview;
}

/**
 * Reuse a transaction overview when a semantic edit touches only existing
 * lanes. The caller must retain the previous transaction array and group
 * array; structural changes fall back to the canonical full builder.
 */
export function updateMiniMapTransactionOverview(previous: MiniMapTransactionOverview, previousTransactions: readonly Transaction[], previousGroups: CanonicalDocument["transactionGroups"], document: Pick<CanonicalDocument, "transactions" | "transactionGroups" | "timeline">, changedTransactions?: readonly Transaction[]): MiniMapTransactionOverview {
  if (previous.cycleCount !== Math.max(1, document.timeline.cycleCount) || previousGroups !== document.transactionGroups) return buildMiniMapTransactionOverview(document);
  const laneKey = (transaction: Transaction) => `${transaction.groupId ?? "ungrouped"}:${transaction.laneId ?? "lane_0"}`;
  const source = transactionSourcesByOverview.get(previous);
  if (!source || previousTransactions.length !== document.transactions.length) return buildMiniMapTransactionOverview(document);
  // A single stable-ID pass identifies semantic changes. ID/order topology changes
  // still use the full builder; ordinary edits avoid document-wide lookup maps.
  const changed: Array<{ before: Transaction; after: Transaction }> = [];
  if (changedTransactions) {
    for (const after of changedTransactions) {
      const before = source.transactions.get(after.id);
      if (!before) return buildMiniMapTransactionOverview(document);
      if (before !== after && (before.start !== after.start || before.end !== after.end || before.laneId !== after.laneId || before.groupId !== after.groupId || before.visible !== after.visible || before.color !== after.color)) changed.push({ before, after });
      source.transactions.set(after.id, after);
    }
  } else {
    for (let index = 0; index < document.transactions.length; index += 1) {
      const before = previousTransactions[index]!;
      const after = document.transactions[index]!;
      if (before.id !== after.id) return buildMiniMapTransactionOverview(document);
      if (before !== after && (before.start !== after.start || before.end !== after.end || before.laneId !== after.laneId || before.groupId !== after.groupId || before.visible !== after.visible || before.color !== after.color)) changed.push({ before, after });
    }
  }
  if (changed.length === 0) {
    return previous;
  }
  const changedLanes = new Set<string>();
  for (const { before, after } of changed) {
    if (before.visible !== false) changedLanes.add(laneKey(before));
    if (after.visible !== false) changedLanes.add(laneKey(after));
  }
  const colorByGroupId = new Map((document.transactionGroups ?? []).map((group) => [group.id, group.color ?? DEFAULT_TRANSACTION_COLOR]));
  const nextBuckets = source.buckets as Map<string, TransactionLaneBucket>;
  const nextTransactions = source.transactions;
  for (const { after } of changed) nextTransactions.set(after.id, after);
  for (const key of changedLanes) {
    const bucket = new Map(nextBuckets.get(key) ?? []);
    for (const { before, after } of changed) {
      if (before.visible !== false && laneKey(before) === key) bucket.delete(before.id);
      if (after.visible !== false && laneKey(after) === key) bucket.set(after.id, after);
    }
    if (bucket.size) nextBuckets.set(key, bucket); else nextBuckets.delete(key);
  }
  const buildRow = (key: string, rowIndex: number) => {
    const [, groupId, laneId] = key.match(/^([^:]+):(.*)$/) ?? [];
    const transactions = [...(nextBuckets.get(key)?.values() ?? [])];
    if (transactions.length === 0) return undefined;
    const groupColor = groupId === "ungrouped" ? undefined : colorByGroupId.get(groupId as NonNullable<CanonicalDocument["transactionGroups"]>[number]["id"]);
    return { key, rowIndex, segments: transactions.map((transaction) => ({ start: transaction.start, end: transaction.end, color: transaction.color ?? groupColor ?? DEFAULT_TRANSACTION_COLOR })).sort(sortTransactionSegments) };
  };
  const rowsByKey = new Map(previous.rows.map((row) => [row.key, row] as const));
  for (const key of changedLanes) {
    const row = buildRow(key, 0);
    if (row) rowsByKey.set(key, row);
    else rowsByKey.delete(key);
  }
  const orderByGroupId = new Map((document.transactionGroups ?? []).map((group) => [group.id, group.order]));
  const rows = [...rowsByKey.values()].sort((left, right) => {
    const [, leftGroup, leftLane] = left.key.match(/^([^:]+):(.*)$/) ?? [];
    const [, rightGroup, rightLane] = right.key.match(/^([^:]+):(.*)$/) ?? [];
    const leftOrder = leftGroup === "ungrouped" ? Number.MAX_SAFE_INTEGER : orderByGroupId.get(leftGroup! as NonNullable<CanonicalDocument["transactionGroups"]>[number]["id"]) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = rightGroup === "ungrouped" ? Number.MAX_SAFE_INTEGER : orderByGroupId.get(rightGroup! as NonNullable<CanonicalDocument["transactionGroups"]>[number]["id"]) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || leftLane!.localeCompare(rightLane!);
  }).map((row, rowIndex) => row.rowIndex === rowIndex ? row : ({ ...row, rowIndex }));
  const overview = Object.freeze({ cycleCount: previous.cycleCount, rows: Object.freeze(rows), transactionsVisited: changedTransactions?.length ?? document.transactions.length, laneBucketsRebuilt: changedLanes.size, updateKind: "incremental" as const });
  transactionSourcesByOverview.set(overview, { transactions: nextTransactions, buckets: nextBuckets });
  return overview;
}
