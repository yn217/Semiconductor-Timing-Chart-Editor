import type { CanonicalDocument, Transaction } from "@timing-chart-v2/schema";

/** #698: the neutral colour of a Transaction with neither its own colour nor a Group colour. */
export const DEFAULT_TRANSACTION_COLOR = "#8895a7";

/** Group colour a Transaction inherits, or undefined for Ungrouped (inheritance unavailable). */
export function groupColorFor(document: Pick<CanonicalDocument, "transactionGroups">, groupId: Transaction["groupId"] | string | undefined): string | undefined {
  if (groupId === undefined || groupId === "") return undefined;
  return document.transactionGroups?.find((group) => group.id === groupId)?.color;
}

/** One effective-colour resolution: own colour, else inherited Group colour, else the neutral default. */
export function resolveTransactionColor(document: Pick<CanonicalDocument, "transactionGroups">, transaction: Pick<Transaction, "color" | "groupId">): string {
  return transaction.color ?? groupColorFor(document, transaction.groupId) ?? DEFAULT_TRANSACTION_COLOR;
}
