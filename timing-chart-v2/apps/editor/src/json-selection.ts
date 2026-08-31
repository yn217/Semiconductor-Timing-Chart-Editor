import type { Annotation, CanonicalDocument, Signal, SignalGroup, Transaction } from "@timing-chart-v2/schema";

export function replaceSelectedJsonObject(document: CanonicalDocument, value: object, selectedSignal: Signal | undefined, selectedGroup: SignalGroup | undefined, selectedAnnotation: Annotation | undefined, selectedTransaction: Transaction | undefined): CanonicalDocument {
  if (selectedSignal) return { ...document, signals: document.signals.map((item) => item.id === selectedSignal.id ? value as Signal : item) };
  if (selectedAnnotation) return { ...document, annotations: document.annotations.map((item) => item.id === selectedAnnotation.id ? value as Annotation : item) };
  if (selectedGroup) return { ...document, signalGroups: document.signalGroups.map((item) => item.id === selectedGroup.id ? value as SignalGroup : item) };
  return { ...document, transactions: document.transactions.map((item) => item.id === selectedTransaction?.id ? value as Transaction : item) };
}
