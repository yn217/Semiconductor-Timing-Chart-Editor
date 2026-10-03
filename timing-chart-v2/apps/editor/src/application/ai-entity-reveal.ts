import type { MutableRefObject } from "react";
import type { AnnotationId, BookmarkId, CanonicalDocument, GroupId, SignalId, TransactionId } from "@timing-chart-v2/schema";
import type { TimelineNavigationOwner } from "../runtime/use-timeline-navigation-owner.js";
import type { AISelectionEntityType } from "../ai-bridge-client.js";

type RevealAIEntityInput = Readonly<{
  document: CanonicalDocument;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  navigation: TimelineNavigationOwner;
  select: (target: Readonly<{ entityType: AISelectionEntityType; entityId: string }>) => void;
}>;

type SelectAIEntityInput = Readonly<{
  selectSignal: (id: SignalId) => void;
  selectGroup: (id: GroupId) => void;
  selectTransaction: (id: TransactionId) => void;
  selectAnnotation: (id: AnnotationId) => void;
  selectBookmark: (id: BookmarkId) => void;
}>;

export function createSelectAIEntityAction(input: SelectAIEntityInput) {
  return ({ entityType, entityId }: Readonly<{ entityType: AISelectionEntityType; entityId: string }>) => {
    if (entityType === "signal") input.selectSignal(entityId as SignalId);
    else if (entityType === "group") input.selectGroup(entityId as GroupId);
    else if (entityType === "transaction") input.selectTransaction(entityId as TransactionId);
    else if (entityType === "annotation") input.selectAnnotation(entityId as AnnotationId);
    else input.selectBookmark(entityId as BookmarkId);
  };
}

/** Selects a canonical entity, navigates to its source time, then reveals its stable-ID presentation. */
export function createRevealAIEntityAction(input: RevealAIEntityInput) {
  return ({ entityType, entityId }: Readonly<{ entityType: AISelectionEntityType; entityId: string }>) => {
    input.select({ entityType, entityId });
    let sourceCycle: number | undefined;
    let selector: string;
    if (entityType === "signal") selector = `[data-role='left-tree-rows'] [data-row-id='${CSS.escape(entityId)}']`;
    else if (entityType === "group") selector = `[data-role='left-group-header'][data-group-id='${CSS.escape(entityId)}'], [role='treeitem'][data-row-id='${CSS.escape(entityId)}:header'], [data-transaction-group-id='${CSS.escape(entityId)}']`;
    else if (entityType === "transaction") {
      sourceCycle = input.document.transactions.find((item) => item.id === entityId)?.start;
      selector = `[data-transaction-id='${CSS.escape(entityId)}'][data-selected], [data-transaction-tree-id='${CSS.escape(entityId)}']`;
    } else if (entityType === "bookmark") {
      sourceCycle = input.document.bookmarks.find((item) => item.id === entityId)?.start;
      selector = `[data-bookmark-id='${CSS.escape(entityId)}']`;
    } else {
      const annotation = input.document.annotations.find((item) => item.id === entityId);
      const anchors = [annotation?.anchor, annotation?.start, annotation?.end, annotation?.from, annotation?.to];
      sourceCycle = anchors.find((anchor) => anchor !== undefined && Number.isFinite(anchor.cycle))?.cycle;
      selector = `[data-role='annotation-owner'][data-annotation-id='${CSS.escape(entityId)}']`;
    }
    if (sourceCycle !== undefined) input.navigation.navigateToCycle(sourceCycle);
    const revealElement = () => input.hostRef.current?.querySelector<HTMLElement>(selector)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(revealElement));
    else revealElement();
  };
}
