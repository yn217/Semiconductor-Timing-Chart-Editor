import type { Transaction, TransactionGroup } from "@timing-chart-v2/schema";

export type GroupedTransactionTreeModel = Readonly<{
  transactionsByGroup: ReadonlyMap<TransactionGroup["id"] | undefined, readonly Transaction[]>;
  totalVisibleCount: number;
}>;

const compareTransactionOrder = (left: Transaction, right: Transaction) =>
  left.start - right.start || left.id.localeCompare(right.id);

/** Build the semantic tree rows once per transaction/group/filter input, not once per viewport render. */
export function buildGroupedTransactionTreeModel(
  transactions: readonly Transaction[],
  groups: readonly TransactionGroup[],
  matches: (transaction: Transaction) => boolean,
): GroupedTransactionTreeModel {
  const transactionsByGroup = new Map<TransactionGroup["id"] | undefined, Transaction[]>();
  for (const group of groups) transactionsByGroup.set(group.id, []);
  transactionsByGroup.set(undefined, []);

  for (const transaction of transactions) {
    const bucket = transactionsByGroup.get(transaction.groupId);
    if (bucket === undefined || !matches(transaction)) continue;
    bucket.push(transaction);
  }

  let totalVisibleCount = 0;
  for (const bucket of transactionsByGroup.values()) {
    bucket.sort(compareTransactionOrder);
    totalVisibleCount += bucket.length;
  }

  return { transactionsByGroup, totalVisibleCount };
}
