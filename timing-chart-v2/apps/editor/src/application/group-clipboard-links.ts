import type { SignalId, Transaction, TransactionId } from "@timing-chart-v2/schema";

export type GroupTransactionSignalLink = Readonly<{ transactionId: TransactionId; signalId: SignalId }>;

/** Capture the relationship closure for a Group in one pass over Transactions and links. */
export function captureGroupTransactionLinks(transactions: readonly Transaction[], containedSignalIds: ReadonlySet<SignalId>): readonly GroupTransactionSignalLink[] {
  const links: GroupTransactionSignalLink[] = [];
  const seen = new Set<string>();
  for (const transaction of transactions) {
    for (const signalId of transaction.linkedSignals ?? []) {
      if (!containedSignalIds.has(signalId)) continue;
      const key = `${transaction.id}\0${signalId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ transactionId: transaction.id, signalId });
    }
  }
  return links;
}

/** Remap captured links to newly allocated Signal IDs; never silently drop an unresolved target. */
export function remapGroupTransactionLinks(links: readonly GroupTransactionSignalLink[], newIdByOldId: ReadonlyMap<SignalId, SignalId>): Readonly<{ ok: true; links: readonly GroupTransactionSignalLink[] } | { ok: false; missingSignalIds: readonly SignalId[] }> {
  const mapped: GroupTransactionSignalLink[] = [];
  const missing = new Set<SignalId>();
  for (const link of links) {
    const signalId = newIdByOldId.get(link.signalId);
    if (signalId === undefined) missing.add(link.signalId);
    else mapped.push({ transactionId: link.transactionId, signalId });
  }
  return missing.size === 0 ? { ok: true, links: mapped } : { ok: false, missingSignalIds: [...missing] };
}
