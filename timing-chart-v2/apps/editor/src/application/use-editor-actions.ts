import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, AnnotationId, AnnotationType, Bookmark, BookmarkId, CanonicalDocument, CommandId, DocumentProblem, GroupId, Signal, SignalId, SpacerId, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import type { TimelineNavigationOwner } from "../runtime/use-timeline-navigation-owner.js";
import type { BottomTab } from "../workspace/use-workspace-ui-state.js";
import type { SelectionOwner } from "./use-selection-owner.js";
import type { ClipboardActions } from "./use-clipboard-actions.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { DocumentLifecycleOwner } from "./use-document-lifecycle.js";
import { groupId, signalId, valueSignal } from "../minimal-cycle-view-fixture-helpers.js";
import { nextEntityId } from "../entity-id.js";
import { resolveGroupInsertionIndex, resolveInsertionTarget } from "../insertion-target.js";
import { parseBulkSignalDefinitions } from "../bulk-signal-parser.js";
import { createAnnotation } from "../create-annotation.js";
import type { CommandHistorySession } from "@timing-chart-v2/history";

export interface EditorActionsInput {
  readonly document: CanonicalDocument;
  readonly commandRegistry: MutableRefObject<UiCommandRegistry>;
  readonly navigation: TimelineNavigationOwner;
  readonly rulerRef: MutableRefObject<HTMLDivElement | null>;
  readonly setBottomTab: (tab: BottomTab) => void;
  readonly setBottomVisible: (visible: boolean) => void;
  readonly createBookmarkId: () => BookmarkId;
  readonly nextCommandId: (operation: string) => CommandId;
  readonly selection: SelectionOwner;
  readonly diagnostics: readonly DocumentProblem[];
  readonly selectedCycleRef: MutableRefObject<number>;
  readonly setSelectedCycle: (cycle: number) => void;
  readonly hostRef: MutableRefObject<HTMLDivElement | null>;
  readonly viewportRef: MutableRefObject<HTMLDivElement | null>;
  readonly application: EditorApplicationOwner;
  readonly editActions: ClipboardActions;
  readonly bottomSignal: SignalId | undefined;
  readonly bottomAnnotation: Annotation | undefined;
  readonly bottomTransaction: Transaction | undefined;
  readonly bottomPinnedRef: MutableRefObject<boolean>;
  readonly selectedSignalRef: MutableRefObject<SignalId | undefined>;
  readonly selectedAnnotationRef: MutableRefObject<AnnotationId | undefined>;
  readonly selectedTransactionRef: MutableRefObject<TransactionId | undefined>;
  readonly selectAllRef: MutableRefObject<() => void>;
  readonly selectedSignal: Signal | undefined;
  readonly selectedGroup: { readonly id: GroupId; readonly name: string } | undefined;
  readonly selectedTransactionName: string | undefined;
  readonly annotationTargetSignalId: SignalId | undefined;
  readonly timelineRange: Readonly<{ readonly start: number; readonly end: number }>;
  readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
  readonly renameDialogOriginRef: MutableRefObject<HTMLElement | null>;
  readonly setRenameDraft: (value: string) => void;
  readonly setRenameError: (value: string) => void;
  readonly setRenameDialogOpen: (value: boolean) => void;
  readonly renameDraft: string;
  readonly bottomPinned: boolean;
  readonly setBottomPinned: (value: boolean) => void;
  readonly setPinnedBottomSelection: (value: { readonly signalId?: SignalId; readonly groupId?: GroupId; readonly annotationId?: AnnotationId; readonly transactionId?: TransactionId } | undefined) => void;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly selectedAnnotationId: AnnotationId | undefined;
  readonly selectedTransactionId: TransactionId | undefined;
  readonly bulkRegistrationText: string;
  readonly bulkRegistrationGroupId: GroupId | undefined;
  readonly bulkRegistrationPreview: ({ readonly sourceText: string } & ReturnType<typeof parseBulkSignalDefinitions>) | undefined;
  readonly setBulkRegistrationStatus: (value: string) => void;
  readonly setBulkRegistrationPreview: (value: ({ readonly sourceText: string } & ReturnType<typeof parseBulkSignalDefinitions>) | undefined) => void;
  readonly setBulkRegistrationVisible: (value: boolean) => void;
  readonly documentLifecycle: DocumentLifecycleOwner;
  readonly pendingFileOriginRef: MutableRefObject<HTMLElement | null>;
  readonly documentTitle: string;
}

export interface EditorActions {
  readonly selectedBookmarkId: BookmarkId | undefined;
  readonly selectedBookmark: Bookmark | undefined;
  readonly selectBookmark: (id: BookmarkId) => void;
  readonly addBookmarkAtCycle: (cycle: number) => void;
  readonly revealBookmark: (start: number) => void;
  readonly deleteBottomBookmark: () => void;
  readonly navigateToBookmark: (cycle: number, bookmarkId?: BookmarkId) => void;
  readonly navigateProblem: (path: string) => void;
  readonly createSelectedAnnotation: (annotation: Annotation) => void;
  readonly createSelectedAnnotationForType: (type: AnnotationType) => void;
  readonly selectAnnotation: (id: AnnotationId) => void;
  readonly deleteBottomSignal: () => void;
  readonly deleteBottomAnnotation: () => void;
  readonly deleteBottomTransaction: () => void;
  readonly selectTransaction: (id: TransactionId) => void;
  readonly toggleTransactionSignal: (transactionId: TransactionId, signalId: SignalId) => CommandResult;
  readonly createTransaction: () => void;
  readonly duplicateAnnotation: (annotation: Annotation) => void;
  readonly clearSelection: () => void;
  readonly selectAllSignals: () => void;
  readonly renameSelection: () => void;
  readonly applyRename: () => void;
  readonly toggleBottomPin: () => void;
  readonly selectHierarchySignal: (id: SignalId) => void;
  readonly revealSelectedInHierarchy: () => void;
  readonly createSignalGroup: () => void;
  readonly addTreeEntity: (kind: "signal" | "clock" | "bus" | "state" | "logic" | "event" | "pulse" | "group" | "spacer" | "commentRow") => void;
  readonly moveTreeItemToGroup: (kind: "signal" | "group", id: string, targetGroupId: GroupId) => void;
  readonly registerBulkSignals: () => void;
  readonly previewBulkSignals: () => void;
  readonly copySelectedSignal: ClipboardActions["copy"];
  readonly cutSelectedSignal: ClipboardActions["cut"];
  readonly pasteSelectedEntity: ClipboardActions["paste"];
  readonly duplicateSelectedEntity: ClipboardActions["duplicate"];
  readonly createCopiedSignals: ClipboardActions["createSignals"];
  readonly setSelectionVisibility: ClipboardActions["setVisibility"];
  readonly moveSelection: ClipboardActions["move"];
  readonly restorePendingFileFocus: () => void;
  readonly capturePendingFileOrigin: () => void;
  readonly cancelPendingFileAction: () => void;
  readonly continuePendingFileAction: () => void;
  readonly saveAndContinuePendingFileAction: () => void;
  readonly requestNewDocument: () => void;
}

export function useEditorActions(input: EditorActionsInput): EditorActions {
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<BookmarkId | undefined>(undefined);
  const bookmarksRef = useRef(input.document.bookmarks);
  bookmarksRef.current = input.document.bookmarks;

  const selectedBookmark = selectedBookmarkId === undefined
    ? undefined
    : input.document.bookmarks.find((item) => item.id === selectedBookmarkId);
  const selection = input.selection;
  const diagnostics = input.diagnostics;
  const snapshot = { document: input.document };
  const selectedCycleRef = input.selectedCycleRef;
  const setSelectedCycle = input.setSelectedCycle;
  const host = input.hostRef;
  const viewport = input.viewportRef;

  const selectBookmark = (id: BookmarkId) => setSelectedBookmarkId(id);
  const addBookmarkAtCycle = (cycle: number) => {
    const maxCycle = Math.max(0, input.document.timeline.cycleCount - 1);
    const start = Math.max(0, Math.min(maxCycle, Math.trunc(cycle)));
    const id = input.createBookmarkId();
    const result = input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", {
      id: input.nextCommandId("ruler_bookmark_create"),
      type: "bookmark.create",
      bookmark: { id, name: "Bookmark " + start, start },
    });
    if (result.ok) {
      setSelectedBookmarkId(id);
      input.setBottomTab("Bookmarks");
      input.setBottomVisible(true);
    }
  };
  const revealBookmark = (start: number) => input.navigation.navigateToCycle(start);
  const deleteBottomBookmark = () => {
    if (!selectedBookmark) return;
    const result = input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", {
      id: input.nextCommandId("bookmark_delete"),
      type: "bookmark.delete",
      bookmarkId: selectedBookmark.id,
    });
    if (result.ok) setSelectedBookmarkId(undefined);
  };
  const navigateToBookmark = (cycle: number, bookmarkId?: BookmarkId) => {
    input.navigation.navigateToCycle(cycle);
    if (bookmarkId) selectBookmark(bookmarkId);
  };
  const createSelectedAnnotation = (annotation: Annotation) => {
    const result = input.application.execute({
      id: input.nextCommandId("annotation_create"),
      type: "annotation.create",
      annotation,
    });
    if (result.ok) input.selection.selectAnnotation(annotation.id);
  };
  const createSelectedAnnotationForType = (type: AnnotationType) => {
    if (!input.annotationTargetSignalId) return;
    createSelectedAnnotation(createAnnotation(type, input.annotationTargetSignalId, input.timelineRange, input.document));
  };
  const selectAnnotation = (id: AnnotationId) => input.selection.selectAnnotation(id);
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
  const selectTransaction = (id: TransactionId) => input.selection.selectTransaction(id);
  const toggleTransactionSignal = (transactionId: TransactionId, signalId: SignalId) => input.application.execute({
    id: input.nextCommandId("transaction_link"),
    type: input.document.transactions.find((item) => item.id === transactionId)?.linkedSignals?.includes(signalId) ? "transaction.unlinkSignal" : "transaction.linkSignal",
    transactionId,
    signalId,
  });
  const createTransaction = () => {
    const id = nextEntityId("transaction", input.document) as TransactionId;
    const result = input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", {
      id: input.nextCommandId("tree_transaction_create"),
      type: "transaction.create",
      transaction: { id, name: `Transaction ${input.document.transactions.length + 1}`, start: 0, end: Math.min(4, input.document.timeline.cycleCount), laneId: "lane_0" },
    });
    if (result.ok) input.selection.selectTransaction(id);
  };
  const duplicateAnnotation = (source: Annotation) => {
    const duplicate = { ...source, id: nextEntityId("annotation", input.document) as AnnotationId };
    const result = input.application.execute({ id: input.nextCommandId("annotation_duplicate"), type: "annotation.create", annotation: duplicate });
    if (result.ok) input.selection.selectAnnotation(duplicate.id);
  };
  const clearSelection = () => input.selection.clear();
  const selectAllSignals = () => {
    const ids = input.document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
    input.selection.selectSignals(new Set(ids), ids[0]);
  };
  input.selectAllRef.current = selectAllSignals;
  const renameSelection = () => {
    const current = input.selectedSignal?.display.name ?? input.selectedGroup?.name ?? input.selectedTransactionName;
    if (current === undefined) return;
    const active = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
    const homeOverflowTrigger = active?.closest<HTMLElement>("[role='menu']")?.getAttribute("aria-label") === "More Home Commands"
      ? [...globalThis.document.querySelectorAll<HTMLButtonElement>("[data-testid='ribbon'] button")].find((button) => button.textContent?.trim() === "More") ?? null
      : null;
    input.renameDialogOriginRef.current = input.menuOriginRef.current ?? homeOverflowTrigger ?? active;
    input.setRenameDraft(current);
    input.setRenameError("");
    input.setRenameDialogOpen(true);
  };
  const applyRename = () => {
    const name = input.renameDraft.trim();
    if (!name) {
      input.setRenameError("Name is required.");
      return;
    }
    input.commandRegistry.current.execute("selection.rename", { name });
    input.setRenameDialogOpen(false);
    input.setRenameError("");
  };
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
  const selectHierarchySignal = (id: SignalId) => {
    if (input.document.signals.some((item) => item.id === id)) input.selection.selectSignal(id);
  };
  const revealSelectedInHierarchy = () => {
    const id = input.selectedSignal?.id;
    if (!id) return;
    input.selection.selectSignal(id);
    requestAnimationFrame(() => input.hostRef.current?.querySelector<HTMLElement>(`[data-role='left-tree-rows'] [data-row-id='${CSS.escape(id)}']`)?.scrollIntoView({ block: "nearest" }));
  };
  const createSignalGroup = () => {
    const id = groupId(nextEntityId("group", input.document));
    const result = input.application.execute({ id: input.nextCommandId("group_create_tree"), type: "group.create", group: { id, name: `Group ${input.document.signalGroups.length + 1}`, rows: [] }, index: input.document.signalGroups.length });
    if (result.ok) input.selection.selectGroup(id);
  };
  const addTreeEntity = (kind: "signal" | "clock" | "bus" | "state" | "logic" | "event" | "pulse" | "group" | "spacer" | "commentRow") => {
    if (kind === "group") {
      const id = groupId(nextEntityId("group", input.document));
      const index = resolveGroupInsertionIndex(input.document, input.selectedSignalId, input.selectedGroupId);
      const result = input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: input.nextCommandId("tree_add_group"), type: "group.create", group: { id, name: `Group ${input.document.signalGroups.length + 1}`, rows: [] }, index });
      if (result.ok) input.selection.selectGroup(id);
      return;
    }
    const target = resolveInsertionTarget(input.document, input.selectedSignalId, input.selectedGroupId);
    if (!target) return;
    const { group: targetGroup, index } = target;
    if (kind === "spacer") {
      const spacer = { id: nextEntityId("spacer", input.document) as SpacerId, height: 24 };
      const result = input.application.execute({ id: input.nextCommandId("tree_add_spacer"), type: "spacer.create", spacer, targetGroupId: targetGroup.id, index });
      if (result.ok) input.selection.selectSpacer(targetGroup.id, spacer.id);
      return;
    }
    const id = signalId(nextEntityId(kind === "commentRow" ? "commentRow" : "signal", input.document));
    if (kind === "commentRow") {
      const name = `Comment ${input.document.signals.length + 1}`;
      const result = input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: input.nextCommandId("tree_add_comment"), type: "commentRow.create", commentRow: { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" }, targetGroupId: targetGroup.id, index });
      if (result.ok) input.selection.selectSignal(id);
      return;
    }
    const name = `${kind === "clock" ? "CLOCK" : kind.toUpperCase()}_${input.document.signals.length + 1}`;
    const signal = kind === "clock"
      ? { id, name, type: "clock" as const, role: "internal" as const, source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0 as 0 | 1, polarity: "positive" as const }, edgeCounter: { show: false, mode: "both" as const, startNumber: 1, countFrom: "signal-start" as const, labelEvery: 1, position: "above" as const, offset: { x: 0, y: -6 } } }
      : valueSignal(id, name, "internal", [{ start: 0, value: kind === "state" ? "IDLE" : kind === "bus" ? "00" : kind === "event" ? "NONE" : 0 }], kind === "bus" ? { type: "bus", width: 8, displayFormat: "hex" } : { type: kind === "signal" ? "binary" : kind });
    const result = input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: input.nextCommandId("tree_add_signal"), type: "signal.create", signal, targetGroupId: targetGroup.id, index });
    if (result.ok) input.selection.selectSignal(id);
  };
  const registerBulkSignals = () => {
    const targetGroupId = input.bulkRegistrationGroupId ?? input.document.signalGroups.at(-1)?.id;
    if (!targetGroupId) return;
    if (!input.bulkRegistrationPreview || input.bulkRegistrationPreview.sourceText !== input.bulkRegistrationText) {
      input.setBulkRegistrationStatus("Preview the definitions before applying.");
      return;
    }
    if (input.bulkRegistrationPreview.errors.length > 0 || input.bulkRegistrationPreview.definitions.length === 0) {
      input.setBulkRegistrationStatus("Fix preview errors before applying.");
      return;
    }
    const signals: Signal[] = [];
    for (const [index, definition] of input.bulkRegistrationPreview.definitions.entries()) {
      const id = signalId(`${nextEntityId("signal", input.document)}_bulk_${index}`);
      if (definition.kind === "clock") {
        signals.push({ id, name: definition.signalName, type: "clock", role: "internal", source: { instancePath: definition.instancePath, signalName: definition.signalName }, display: { name: definition.signalName }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } });
      } else {
        const type = definition.kind;
        const initialValue = type === "state" ? "IDLE" : type === "bus" ? "0" : type === "event" ? "NONE" : 0;
        const signal = valueSignal(id, definition.signalName, "internal", [{ start: 0, value: initialValue }], type === "bus" ? { type, width: definition.width ?? 1, displayFormat: "hex" } : { type });
        signals.push({ ...signal, source: { ...signal.source, instancePath: definition.instancePath } });
      }
    }
    const result = input.commandRegistry.current.execute<SemanticCommand, ReturnType<CommandHistorySession["execute"]>>("semantic.execute", { id: input.nextCommandId("bulk_register_signals"), type: "signal.bulkCreate", signals, targetGroupId, index: input.document.signalGroups.find((group) => group.id === targetGroupId)?.rows.length ?? 0 });
    if (result.ok) { input.setBulkRegistrationStatus(`Registered ${signals.length} signal${signals.length === 1 ? "" : "s"} in one operation`); input.setBulkRegistrationPreview(undefined); input.setBulkRegistrationVisible(false); }
    else input.setBulkRegistrationStatus(result.problems.map((item) => item.message).join(" "));
  };
  const moveTreeItemToGroup = (kind: "signal" | "group", id: string, targetGroupId: GroupId) => {
    const targetGroup = input.document.signalGroups.find((group) => group.id === targetGroupId);
    if (!targetGroup) return;
    if (kind === "signal") {
      const sourceGroup = input.document.signalGroups.find((group) => group.rows.includes(id as SignalId));
      let index = targetGroup.rows.length;
      if (sourceGroup?.id === targetGroup.id) index = Math.max(0, index - 1);
      input.commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: input.nextCommandId("drop_group_target"), type: "signal.move", signalId: id as SignalId, targetGroupId, index });
      return;
    }
    const sourceIndex = input.document.signalGroups.findIndex((group) => group.id === id);
    const targetIndex = input.document.signalGroups.findIndex((group) => group.id === targetGroupId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    input.commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: input.nextCommandId("drop_group_target"), type: "group.move", groupId: id as GroupId, index: sourceIndex < targetIndex ? targetIndex - 1 : targetIndex });
  };
  const previewBulkSignals = () => {
    const preview = parseBulkSignalDefinitions(input.bulkRegistrationText, input.document);
    input.setBulkRegistrationPreview({ sourceText: input.bulkRegistrationText, ...preview });
    input.setBulkRegistrationStatus(preview.errors.length === 0 ? `Preview ready: ${preview.definitions.length} signal${preview.definitions.length === 1 ? "" : "s"}` : preview.errors.join(" "));
  };
  const restorePendingFileFocus = () => {
    const origin = input.pendingFileOriginRef.current;
    input.pendingFileOriginRef.current = null;
    if (origin?.isConnected) requestAnimationFrame(() => origin.focus());
  };
  const capturePendingFileOrigin = () => {
    if (input.pendingFileOriginRef.current === null) input.pendingFileOriginRef.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
  };
  const cancelPendingFileAction = () => { input.documentLifecycle.cancelPending(); restorePendingFileFocus(); };
  const continuePendingFileAction = () => { input.documentLifecycle.discardPending(); restorePendingFileFocus(); };
  const saveAndContinuePendingFileAction = () => {
    if (input.documentLifecycle.savePendingAndContinue(`${input.documentTitle || "timing-chart"}.tcd`)) restorePendingFileFocus();
  };
  const requestNewDocument = () => { capturePendingFileOrigin(); input.documentLifecycle.requestNew(); };

  useEffect(() => {
    const rulerElement = input.rulerRef.current;
    if (!rulerElement) return undefined;
    const markerAt = (event: MouseEvent) => event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-bookmark-id]")
      : null;
    const onRulerClick = (event: MouseEvent) => {
      const id = markerAt(event)?.dataset.bookmarkId;
      if (id) setSelectedBookmarkId(id as BookmarkId);
    };
    const onRulerDoubleClick = (event: MouseEvent) => {
      const id = markerAt(event)?.dataset.bookmarkId;
      if (!id) return;
      const bookmark = bookmarksRef.current.find((item) => item.id === id);
      if (bookmark) input.navigation.navigateToCycle(bookmark.start);
    };
    rulerElement.addEventListener("click", onRulerClick);
    rulerElement.addEventListener("dblclick", onRulerDoubleClick);
    return () => {
      rulerElement.removeEventListener("click", onRulerClick);
      rulerElement.removeEventListener("dblclick", onRulerDoubleClick);
    };
  }, []);

  const navigateProblem = (path: string) => {
    const problem = diagnostics.find((item) => item.path === path);
    const target = resolveProblemTarget(path, snapshot.document, problem);
    const targetSignal = target.kind === "signal" ? snapshot.document.signals.find((signal) => signal.id === target.id) : undefined;
    const valueIndex = /^\$\.signals\[\d+\]\.values\[(\d+)\]/.exec(path)?.[1];
    const semanticCycle = valueIndex !== undefined && targetSignal && targetSignal.type !== "clock" && targetSignal.type !== "commentRow"
      ? targetSignal.values[Number(valueIndex)]?.start
      : target.kind === "transaction" ? snapshot.document.transactions.find((item) => item.id === target.id)?.start
      : target.kind === "annotation" ? Object.values(snapshot.document.annotations.find((item) => item.id === target.id) ?? {}).find((value) => value && typeof value === "object" && "cycle" in value && typeof (value as { cycle?: unknown }).cycle === "number")?.cycle as number | undefined
      : undefined;
    const targetSignalId = target.kind === "signal" ? target.id as SignalId : undefined;
    selection.selectTarget({
      signalId: targetSignalId,
      signalIds: targetSignalId ? new Set([targetSignalId]) : new Set(),
      groupId: target.kind === "group" ? target.id as GroupId : undefined,
      annotationId: target.kind === "annotation" ? target.id as AnnotationId : undefined,
      transactionId: target.kind === "transaction" ? target.id as TransactionId : undefined,
    });
    if (semanticCycle !== undefined) {
      const cycle = Math.max(0, Math.min(snapshot.document.timeline.cycleCount, semanticCycle));
      selectedCycleRef.current = cycle;
      setSelectedCycle(cycle);
      if (host.current) host.current.dataset.selectedCycle = String(cycle);
    }
    if (target.kind === "timeline") viewport.current?.scrollTo({ left: 0, behavior: "smooth" });
  };
  return {
    selectedBookmarkId,
    selectedBookmark,
    selectBookmark,
    addBookmarkAtCycle,
    revealBookmark,
    deleteBottomBookmark,
    navigateToBookmark,
    navigateProblem,
    createSelectedAnnotation,
    createSelectedAnnotationForType,
    selectAnnotation,
    deleteBottomSignal,
    deleteBottomAnnotation,
    deleteBottomTransaction,
    selectTransaction,
    toggleTransactionSignal,
    createTransaction,
    duplicateAnnotation,
    clearSelection,
    selectAllSignals,
    renameSelection,
    applyRename,
    toggleBottomPin,
    selectHierarchySignal,
    revealSelectedInHierarchy,
    createSignalGroup,
    addTreeEntity,
    moveTreeItemToGroup,
    registerBulkSignals,
    previewBulkSignals,
    copySelectedSignal: input.editActions.copy,
    cutSelectedSignal: input.editActions.cut,
    pasteSelectedEntity: input.editActions.paste,
    duplicateSelectedEntity: input.editActions.duplicate,
    createCopiedSignals: input.editActions.createSignals,
    setSelectionVisibility: input.editActions.setVisibility,
    moveSelection: input.editActions.move,
    restorePendingFileFocus,
    capturePendingFileOrigin,
    cancelPendingFileAction,
    continuePendingFileAction,
    saveAndContinuePendingFileAction,
    requestNewDocument,
  };
}
