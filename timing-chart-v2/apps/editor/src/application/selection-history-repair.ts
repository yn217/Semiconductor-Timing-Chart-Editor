import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { SelectionState } from "./use-selection-owner.js";

function retainExisting<T>(selected: ReadonlySet<T>, existing: ReadonlySet<T>): ReadonlySet<T> {
  for (const id of selected) if (!existing.has(id)) return new Set([...selected].filter((candidate) => existing.has(candidate)));
  return selected;
}

function sameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left === right || (left.size === right.size && [...left].every((value) => right.has(value)));
}

/** Remove only transient selection references that no longer exist after History restores a Canonical snapshot. */
export function repairSelectionAgainstDocument(selection: SelectionState, document: CanonicalDocument): SelectionState {
  const signalIds = selection.signalId !== undefined || selection.signalIds.size > 0
    ? new Set(document.signals.map((signal) => signal.id))
    : undefined;
  const nextSignalIds = signalIds === undefined ? selection.signalIds : retainExisting(selection.signalIds, signalIds);
  const signalId = selection.signalId !== undefined && signalIds?.has(selection.signalId)
    ? selection.signalId
    : nextSignalIds.values().next().value;
  const normalizedSignalIds = signalId !== undefined && !nextSignalIds.has(signalId)
    ? new Set([...nextSignalIds, signalId])
    : nextSignalIds;

  const selectedGroup = selection.groupId === undefined ? undefined : document.signalGroups.find((group) => group.id === selection.groupId);
  const groupId = selectedGroup?.id;
  const spacerId = groupId !== undefined && selection.spacerId !== undefined && selectedGroup?.spacers?.some((spacer) => spacer.id === selection.spacerId)
    ? selection.spacerId
    : undefined;

  const annotationIds = selection.annotationId !== undefined || selection.annotationIds.size > 0
    ? new Set(document.annotations.map((annotation) => annotation.id))
    : undefined;
  const nextAnnotationIds = annotationIds === undefined ? selection.annotationIds : retainExisting(selection.annotationIds, annotationIds);
  const annotationId = selection.annotationId !== undefined && annotationIds?.has(selection.annotationId)
    ? selection.annotationId
    : nextAnnotationIds.values().next().value;
  const normalizedAnnotationIds = annotationId !== undefined && !nextAnnotationIds.has(annotationId)
    ? new Set([...nextAnnotationIds, annotationId])
    : nextAnnotationIds;

  const needsTransactionLookup = selection.transactionId !== undefined || selection.transactionIds.size > 0;
  const transactions = needsTransactionLookup
    ? new Map(document.transactions.map((transaction) => [transaction.id, transaction]))
    : undefined;
  const nextTransactionIds = transactions === undefined ? selection.transactionIds : retainExisting(selection.transactionIds, new Set(transactions.keys()));
  const transactionId = selection.transactionId !== undefined && transactions?.has(selection.transactionId)
    ? selection.transactionId
    : nextTransactionIds.values().next().value;
  const normalizedTransactionIds = transactionId !== undefined && !nextTransactionIds.has(transactionId)
    ? new Set([...nextTransactionIds, transactionId])
    : nextTransactionIds;
  const transactionPhaseId = transactionId !== undefined
    && transactionId === selection.transactionId
    && selection.transactionPhaseId !== undefined
    && transactions?.get(transactionId)?.phases?.some((phase) => phase.id === selection.transactionPhaseId)
    ? selection.transactionPhaseId
    : undefined;

  const repaired: SelectionState = {
    ...selection,
    signalId,
    signalIds: normalizedSignalIds,
    groupId,
    spacerId,
    annotationId,
    annotationIds: normalizedAnnotationIds,
    transactionId,
    transactionIds: normalizedTransactionIds,
    transactionPhaseId,
  };
  if (repaired.signalId === selection.signalId
    && sameSet(repaired.signalIds, selection.signalIds)
    && repaired.groupId === selection.groupId
    && repaired.spacerId === selection.spacerId
    && repaired.annotationId === selection.annotationId
    && sameSet(repaired.annotationIds, selection.annotationIds)
    && repaired.transactionId === selection.transactionId
    && sameSet(repaired.transactionIds, selection.transactionIds)
    && repaired.transactionPhaseId === selection.transactionPhaseId) return selection;
  return repaired;
}
