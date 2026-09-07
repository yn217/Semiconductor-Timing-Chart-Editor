import type { MutableRefObject } from "react";
import type { CommandResult } from "@timing-chart-v2/commands";
import type { CommandId, CanonicalDocument, Annotation, AnnotationId, GroupId, SignalId, Transaction, TransactionId } from "@timing-chart-v2/schema";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { ClipboardActions } from "./clipboard-actions.js";
import type { SelectionOwner } from "./use-selection-owner.js";

export interface BottomEditorActionsInput {
  readonly application: EditorApplicationOwner;
  readonly editActions: ClipboardActions;
  readonly document: CanonicalDocument;
  readonly nextCommandId: (operation: string) => CommandId;
  readonly selection: SelectionOwner;
  readonly bottomSignal: SignalId | undefined;
  readonly bottomAnnotation: Annotation | undefined;
  readonly bottomTransaction: Transaction | undefined;
  readonly bottomPinnedRef: MutableRefObject<boolean>;
  readonly selectedSignalRef: MutableRefObject<SignalId | undefined>;
  readonly selectedAnnotationRef: MutableRefObject<AnnotationId | undefined>;
  readonly selectedTransactionRef: MutableRefObject<TransactionId | undefined>;
  readonly bottomPinned: boolean;
  readonly setBottomPinned: (value: boolean) => void;
  readonly setPinnedBottomSelection: (value: { readonly signalId?: SignalId; readonly groupId?: GroupId; readonly annotationId?: AnnotationId; readonly transactionId?: TransactionId } | undefined) => void;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly selectedAnnotationId: AnnotationId | undefined;
  readonly selectedTransactionId: TransactionId | undefined;
}

export interface BottomEditorActions {
  readonly deleteBottomSignal: () => void;
  readonly deleteBottomAnnotation: () => void;
  readonly deleteBottomTransaction: () => void;
  readonly toggleTransactionSignal: (transactionId: TransactionId, signalId: SignalId) => CommandResult;
  readonly toggleBottomPin: () => void;
}

/** Owns Bottom editor mutations and pin/follow coordination without JSX. */
export function createBottomEditorActions(input: BottomEditorActionsInput): BottomEditorActions {
  const deleteBottomSignal = () => {
    if (!input.bottomSignal) return;
    const result = input.editActions.deleteSignal(input.bottomSignal);
    if (result.ok && !input.bottomPinnedRef.current && input.selectedSignalRef.current === input.bottomSignal) input.selection.clear();
  };
  const deleteBottomAnnotation = () => {
    if (!input.bottomAnnotation) return;
    const result = input.editActions.deleteAnnotation(input.bottomAnnotation.id);
    if (result.ok && !input.bottomPinnedRef.current && input.selectedAnnotationRef.current === input.bottomAnnotation.id) input.selection.clear();
  };
  const deleteBottomTransaction = () => {
    if (!input.bottomTransaction) return;
    const result = input.editActions.deleteTransaction(input.bottomTransaction.id);
    if (result.ok && !input.bottomPinnedRef.current && input.selectedTransactionRef.current === input.bottomTransaction.id) input.selection.clear();
  };
  const toggleTransactionSignal = (transactionId: TransactionId, signalId: SignalId) => input.application.execute({
    id: input.nextCommandId("transaction_link"),
    type: input.document.transactions.find((item) => item.id === transactionId)?.linkedSignals?.includes(signalId) ? "transaction.unlinkSignal" : "transaction.linkSignal",
    transactionId,
    signalId,
  });
  const toggleBottomPin = () => {
    if (input.bottomPinned) {
      input.setBottomPinned(false);
      input.setPinnedBottomSelection(undefined);
      return;
    }
    input.setPinnedBottomSelection({
      ...(input.selectedSignalId === undefined ? {} : { signalId: input.selectedSignalId }),
      ...(input.selectedGroupId === undefined ? {} : { groupId: input.selectedGroupId }),
      ...(input.selectedAnnotationId === undefined ? {} : { annotationId: input.selectedAnnotationId }),
      ...(input.selectedTransactionId === undefined ? {} : { transactionId: input.selectedTransactionId }),
    });
    input.setBottomPinned(true);
  };
  return { deleteBottomSignal, deleteBottomAnnotation, deleteBottomTransaction, toggleTransactionSignal, toggleBottomPin };
}
