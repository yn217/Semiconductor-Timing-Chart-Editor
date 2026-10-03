import type { MutableRefObject } from "react";
import type { CanonicalDocument, SignalId, TransactionId, AnnotationId } from "@timing-chart-v2/schema";
import type { SelectionOwner } from "./use-selection-owner.js";

export interface SelectionActionsInput {
  readonly document: CanonicalDocument;
  readonly selection: SelectionOwner;
  readonly hostRef: MutableRefObject<HTMLDivElement | null>;
  readonly selectedSignalId: SignalId | undefined;
}

export interface SelectionActions {
  readonly selectAnnotation: (id: AnnotationId) => void;
  readonly selectTransaction: (id: TransactionId, additive?: boolean) => void;
  readonly selectTransactions: (ids: ReadonlySet<TransactionId>, primary?: TransactionId) => void;
  readonly clearSelection: () => void;
  readonly selectAllSignals: () => void;
  readonly selectAllTransactions: () => void;
  /** #864: Select All in Annotation context (an Annotation is selected) selects every Annotation, for multi-Annotation clipboard. */
  readonly selectAllAnnotations: () => void;
  readonly selectHierarchySignal: (id: SignalId) => void;
  readonly revealSelectedInHierarchy: () => void;
}

/** Owns selection-only operations shared by Ribbon, tree, Inspector and Bottom routes. */
export function createSelectionActions(input: SelectionActionsInput): SelectionActions {
  const selectAnnotation = (id: AnnotationId) => input.selection.selectAnnotation(id);
  const selectTransaction = (id: TransactionId, additive = false) => input.selection.selectTransaction(id, additive);
  const selectTransactions = (ids: ReadonlySet<TransactionId>, primary?: TransactionId) => input.selection.selectTransactions(ids, primary);
  const clearSelection = () => input.selection.clear();
  const selectAllSignals = () => {
    const ids = input.document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
    input.selection.selectSignals(new Set(ids), ids[0]);
  };
  const selectAllTransactions = () => {
    const ids = input.document.transactions.filter((transaction) => transaction.visible !== false).map((transaction) => transaction.id);
    input.selection.selectTransactions(new Set(ids), ids[0]);
  };
  const selectAllAnnotations = () => {
    const ids = input.document.annotations.map((annotation) => annotation.id);
    input.selection.selectAnnotations(new Set(ids), ids[0]);
  };
  const selectHierarchySignal = (id: SignalId) => {
    if (input.document.signals.some((item) => item.id === id)) input.selection.selectSignal(id);
  };
  const revealSelectedInHierarchy = () => {
    const id = input.selectedSignalId;
    if (!id) return;
    input.selection.selectSignal(id);
    requestAnimationFrame(() => input.hostRef.current?.querySelector<HTMLElement>(`[data-role='left-tree-rows'] [data-row-id='${CSS.escape(id)}']`)?.scrollIntoView({ block: "nearest" }));
  };
  return { selectAnnotation, selectTransaction, selectTransactions, clearSelection, selectAllSignals, selectAllTransactions, selectAllAnnotations, selectHierarchySignal, revealSelectedInHierarchy };
}
