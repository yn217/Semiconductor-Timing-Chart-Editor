import type { Transaction, TransactionId } from "@timing-chart-v2/schema";

type IndexedTransaction = Readonly<{ index: number; transaction: Transaction }>;
const indexes = new WeakMap<readonly Transaction[], ReadonlyMap<TransactionId, IndexedTransaction>>();

function indexTransactions(transactions: readonly Transaction[]): ReadonlyMap<TransactionId, IndexedTransaction> {
  let index = indexes.get(transactions);
  if (index) return index;
  const next = new Map<TransactionId, IndexedTransaction>();
  transactions.forEach((transaction, position) => next.set(transaction.id, { index: position, transaction }));
  index = next;
  indexes.set(transactions, index);
  return index;
}

/** Resolve one selected Transaction through the same immutable collection index. */
export function transactionById(transactions: readonly Transaction[], id: TransactionId): Transaction | undefined {
  return indexTransactions(transactions).get(id)?.transaction;
}

/** Resolve selected Transactions in canonical order while reusing the immutable collection index. */
export function selectedTransactionsInDocumentOrder(transactions: readonly Transaction[], selectedIds: ReadonlySet<TransactionId>): readonly Transaction[] {
  const index = indexTransactions(transactions);
  const selected: IndexedTransaction[] = [];
  for (const id of selectedIds) {
    const item = index.get(id);
    if (item) selected.push(item);
  }
  selected.sort((left, right) => left.index - right.index);
  return selected.map(({ transaction }) => transaction);
}
