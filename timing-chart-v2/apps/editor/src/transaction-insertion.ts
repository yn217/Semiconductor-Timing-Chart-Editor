import type { CanonicalDocument, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";

export interface TransactionInsertion {
  /** Group/Lane the new Transaction takes over from the selected one (Lane falls back to `lane_0`). */
  readonly fields: { readonly laneId: string; readonly groupId?: TransactionGroup["id"] };
  /** Document-order anchor: the new Transaction is inserted directly after this one. */
  readonly afterTransactionId?: TransactionId;
  /** The selected Transaction's start: callers that do not take their time range from elsewhere start there so tree order (by start) keeps the new row right below. */
  readonly startCycle?: number;
}

/**
 * Where "Add Transaction" puts a new Transaction: directly below the selected one, in the same Group and Lane, so the user does
 * not have to move it out of Ungrouped every time. An explicit `groupId` (Group row menu) wins and appends; with nothing selected
 * the Transaction is appended to Ungrouped as before.
 */
export function transactionInsertion(document: CanonicalDocument, selectedId: TransactionId | undefined, groupId?: TransactionGroup["id"]): TransactionInsertion {
  if (groupId !== undefined) return { fields: { laneId: "lane_0", groupId } };
  const selected = selectedId === undefined ? undefined : document.transactions.find((item) => item.id === selectedId);
  if (!selected) return { fields: { laneId: "lane_0" } };
  return { fields: { laneId: selected.laneId ?? "lane_0", ...(selected.groupId === undefined ? {} : { groupId: selected.groupId }) }, afterTransactionId: selected.id, startCycle: selected.start };
}
