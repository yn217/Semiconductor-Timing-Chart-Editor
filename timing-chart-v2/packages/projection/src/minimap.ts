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
}

function valueSegments(values: readonly SignalValueChange[], cycleCount: number): readonly MiniMapSegment[] {
  return values.map((change, index) => ({
    start: change.start,
    end: values[index + 1]?.start ?? cycleCount,
    tone: String(change.value).toLowerCase() === "0" ? "low" : "high",
  }));
}

function segmentsForSignal(signal: Signal | undefined, cycleCount: number): readonly MiniMapSegment[] {
  if (!signal || signal.type === "commentRow") return [{ start: 0, end: cycleCount, tone: "comment" }];
  if (signal.type === "clock") return [{ start: 0, end: cycleCount, tone: "clock" }];
  return valueSegments(signal.values, cycleCount);
}

/**
 * Derive the static MiniMap overview from CanonicalDocument once per document
 * identity. The renderer can then update the viewport rectangle independently.
 */
export function buildMiniMapOverview(document: Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">): MiniMapOverview {
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  const signalById = new Map<string, Signal>(document.signals.map((signal) => [signal.id, signal]));
  const rowIds = document.signalGroups.flatMap((group) => group.rows);
  const rows = rowIds.map((rowId, rowIndex) => ({
    rowId,
    rowIndex,
    segments: segmentsForSignal(signalById.get(rowId), cycleCount),
  }));
  return Object.freeze({ cycleCount, rows: Object.freeze(rows), signalLookups: rowIds.length });
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
}

const DEFAULT_TRANSACTION_COLOR = "#8895a7";

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
  for (const transaction of document.transactions) {
    const laneId = transaction.laneId ?? "lane_0";
    const key = `${transaction.groupId ?? ""} ${laneId}`;
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
      .sort((left, right) => left.start - right.start);
    return { key: `${bucket.groupId ?? "ungrouped"}:${bucket.laneId}`, rowIndex, segments };
  });
  return Object.freeze({ cycleCount, rows: Object.freeze(rows) });
}

/**
 * Reuse a transaction overview when a semantic edit touches only existing
 * lanes. The caller must retain the previous transaction array and group
 * array; structural changes fall back to the canonical full builder.
 */
export function updateMiniMapTransactionOverview(previous: MiniMapTransactionOverview, previousTransactions: readonly Transaction[], previousGroups: CanonicalDocument["transactionGroups"], document: Pick<CanonicalDocument, "transactions" | "transactionGroups" | "timeline">): MiniMapTransactionOverview {
  if (previous.cycleCount !== Math.max(1, document.timeline.cycleCount) || previousGroups !== document.transactionGroups) return buildMiniMapTransactionOverview(document);
  const laneKey = (transaction: Transaction) => `${transaction.groupId ?? "ungrouped"}:${transaction.laneId ?? "lane_0"}`;
  const previousById = new Map(previousTransactions.map((transaction) => [transaction.id, transaction] as const));
  const nextById = new Map(document.transactions.map((transaction) => [transaction.id, transaction] as const));
  const changedLanes = new Set<string>();
  for (const transaction of previousTransactions) {
    const next = nextById.get(transaction.id);
    if (!next) changedLanes.add(laneKey(transaction));
  }
  for (const transaction of document.transactions) {
    const before = previousById.get(transaction.id);
    if (before !== transaction) {
      // A move invalidates both buckets: the old bucket must lose the
      // segment, while the new bucket must gain it.
      if (before) changedLanes.add(laneKey(before));
      changedLanes.add(laneKey(transaction));
    }
  }
  if (changedLanes.size === 0) return previous;
  const colorByGroupId = new Map((document.transactionGroups ?? []).map((group) => [group.id, group.color ?? DEFAULT_TRANSACTION_COLOR]));
  const buildRow = (key: string, rowIndex: number) => {
    const [, groupId, laneId] = key.match(/^([^:]+):(.*)$/) ?? [];
    const transactions = document.transactions.filter((transaction) => laneKey(transaction) === key);
    if (transactions.length === 0) return undefined;
    const groupColor = groupId === "ungrouped" ? undefined : colorByGroupId.get(groupId as NonNullable<CanonicalDocument["transactionGroups"]>[number]["id"]);
    return { key, rowIndex, segments: transactions.map((transaction) => ({ start: transaction.start, end: transaction.end, color: transaction.color ?? groupColor ?? DEFAULT_TRANSACTION_COLOR })).sort((left, right) => left.start - right.start) };
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
  return Object.freeze({ cycleCount: previous.cycleCount, rows: Object.freeze(rows) });
}
