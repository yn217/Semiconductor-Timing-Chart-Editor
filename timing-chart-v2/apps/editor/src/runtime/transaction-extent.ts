import type { Transaction } from "@timing-chart-v2/schema";

export type TransactionExtent = Readonly<{ readonly start: number; readonly end: number }>;

/** Derive the shared temporal extent once per canonical Transaction array. */
export function deriveTransactionExtent(transactions: readonly Transaction[]): TransactionExtent | undefined {
  const first = transactions[0];
  if (!first) return undefined;
  let start = first.start;
  let end = first.end;
  for (let index = 1; index < transactions.length; index += 1) {
    const transaction = transactions[index]!;
    start = Math.min(start, transaction.start);
    end = Math.max(end, transaction.end);
  }
  return { start, end };
}
