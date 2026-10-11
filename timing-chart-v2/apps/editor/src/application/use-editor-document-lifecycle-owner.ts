import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { downloadText } from "../download-text.js";
import { TransactionBottomDraftStore } from "../runtime/transaction-bottom-draft-store.js";
import { useEditorApplicationOwner } from "./use-editor-application-owner.js";
import { useDocumentLifecycle } from "./use-document-lifecycle.js";

/** Owns document state, its transient Transaction drafts, and file lifecycle actions together. */
export function useEditorDocumentLifecycleOwner(initialDocument: CanonicalDocument, productTemplate: CanonicalDocument) {
  const application = useEditorApplicationOwner(initialDocument);
  const storeRef = useRef<TransactionBottomDraftStore | null>(null);
  if (storeRef.current === null) storeRef.current = new TransactionBottomDraftStore();
  const transactionDraftStore = storeRef.current;
  const pending = useSyncExternalStore(transactionDraftStore.subscribe, transactionDraftStore.hasUnappliedDrafts, transactionDraftStore.hasUnappliedDrafts);
  const transactions = application.snapshot.document.transactions;
  useEffect(() => {
    transactionDraftStore.removeMissingTransactions(new Set(transactions.map((transaction) => transaction.id)));
  }, [transactions, transactionDraftStore]);
  const documentLifecycle = useDocumentLifecycle({ application, productTemplate, persistText: downloadText, transactionDrafts: transactionDraftStore });
  return { application, transactionDraftStore, pending, documentLifecycle } as const;
}
