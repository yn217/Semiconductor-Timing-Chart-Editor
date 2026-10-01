import { useMemo } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

/** Document-identity-scoped indexes shared by editor selection and surface composition. */
export function useDocumentEntityIndexes(document: CanonicalDocument) {
  const signalById = useMemo(() => new Map(document.signals.map((signal) => [signal.id, signal] as const)), [document]);
  const groupById = useMemo(() => new Map(document.signalGroups.map((group) => [group.id, group] as const)), [document]);
  const annotationById = useMemo(() => new Map(document.annotations.map((annotation) => [annotation.id, annotation] as const)), [document]);
  const transactionById = useMemo(() => new Map(document.transactions.map((transaction) => [transaction.id, transaction] as const)), [document]);
  const bookmarkById = useMemo(() => new Map(document.bookmarks.map((bookmark) => [bookmark.id, bookmark] as const)), [document]);

  return { signalById, groupById, annotationById, transactionById, bookmarkById } as const;
}
