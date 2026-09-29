import type { Annotation, AnnotationId, CanonicalDocument, GroupId, Signal, SignalId, SignalGroup, Transaction, TransactionId } from "@timing-chart-v2/schema";

export type ClipboardDocumentIndex = Readonly<{
  signalsById: ReadonlyMap<SignalId, Readonly<{ signal: Signal; index: number }>>;
  signalLocationById: ReadonlyMap<SignalId, Readonly<{ group: SignalGroup; index: number }>>;
  groupsById: ReadonlyMap<GroupId, Readonly<{ group: SignalGroup; index: number }>>;
  annotationsById: ReadonlyMap<AnnotationId, Annotation>;
  transactionsById: ReadonlyMap<TransactionId, Readonly<{ transaction: Transaction; index: number }>>;
}>;

const indexesByDocument = new WeakMap<CanonicalDocument, ClipboardDocumentIndex>();

/** Reuse stable-ID lookup maps for repeated clipboard actions on one immutable document snapshot. */
export function clipboardDocumentIndex(document: CanonicalDocument): ClipboardDocumentIndex {
  const cached = indexesByDocument.get(document);
  if (cached) return cached;

  const signalsById = new Map<SignalId, { signal: Signal; index: number }>();
  document.signals.forEach((signal, index) => signalsById.set(signal.id, { signal, index }));
  const signalLocationById = new Map<SignalId, { group: SignalGroup; index: number }>();
  const groupsById = new Map<GroupId, { group: SignalGroup; index: number }>();
  document.signalGroups.forEach((group, groupIndex) => {
    groupsById.set(group.id, { group, index: groupIndex });
    group.rows.forEach((rowId, rowIndex) => {
      if (signalsById.has(rowId as SignalId)) signalLocationById.set(rowId as SignalId, { group, index: rowIndex });
    });
  });
  const annotationsById = new Map(document.annotations.map((annotation) => [annotation.id, annotation] as const));
  const transactionsById = new Map(document.transactions.map((transaction, index) => [transaction.id, { transaction, index }] as const));
  const index = { signalsById, signalLocationById, groupsById, annotationsById, transactionsById };
  indexesByDocument.set(document, index);
  return index;
}
