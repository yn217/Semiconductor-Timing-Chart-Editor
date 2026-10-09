import { useEffect } from "react";
import type { AnnotationId, BookmarkId, CanonicalDocument, GroupId, SignalId, TransactionId } from "@timing-chart-v2/schema";
import type { BottomPinnedSelection } from "./use-workspace-ui-state.js";

type PinnedSelection = BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId, BookmarkId>;

/** Bottom pin lifetime follows canonical identity and active context, not DOM mounts. */
export function useBottomPinLifecycle(options: {
  document: CanonicalDocument;
  revision: number;
  documentEpoch: number;
  projectionGeneration: number;
  pinnedBottomSelection: PinnedSelection | undefined;
  bottomPinned: boolean;
  followSelection: boolean;
  setBottomPinned: (value: boolean) => void;
  setFollowSelection: (value: boolean) => void;
  setPinnedBottomSelection: (value: PinnedSelection | undefined) => void;
  clearContextMenu: () => void;
}) {
  const { document, revision, documentEpoch, projectionGeneration, pinnedBottomSelection, bottomPinned, followSelection,
    setBottomPinned, setFollowSelection, setPinnedBottomSelection, clearContextMenu } = options;
  useEffect(() => {
    if (!pinnedBottomSelection) return;
    const targetExists = (pinnedBottomSelection.signalId === undefined || document.signals.some((item) => item.id === pinnedBottomSelection.signalId))
      && (pinnedBottomSelection.groupId === undefined || document.signalGroups.some((item) => item.id === pinnedBottomSelection.groupId))
      && (pinnedBottomSelection.annotationId === undefined || document.annotations.some((item) => item.id === pinnedBottomSelection.annotationId))
      && (pinnedBottomSelection.transactionId === undefined || document.transactions.some((item) => item.id === pinnedBottomSelection.transactionId))
      && (pinnedBottomSelection.bookmarkId === undefined || document.bookmarks.some((item) => item.id === pinnedBottomSelection.bookmarkId));
    if (!targetExists) {
      if (bottomPinned) setBottomPinned(false);
      if (!followSelection) setFollowSelection(true);
      setPinnedBottomSelection(undefined);
    }
  }, [bottomPinned, followSelection, pinnedBottomSelection, revision]);
  useEffect(() => {
    setPinnedBottomSelection(undefined);
    if (bottomPinned) setBottomPinned(false);
    if (!followSelection) setFollowSelection(true);
    clearContextMenu();
  }, [documentEpoch, projectionGeneration]);
}
