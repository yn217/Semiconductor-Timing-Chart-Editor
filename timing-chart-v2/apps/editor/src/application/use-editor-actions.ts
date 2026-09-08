import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, AnnotationId, AnnotationType, Bookmark, BookmarkId, CanonicalDocument, CommandId, DocumentProblem, GroupId, Signal, SignalId, SpacerId, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import { resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import type { TimelineNavigationOwner } from "../runtime/use-timeline-navigation-owner.js";
import type { BottomTab } from "../workspace/use-workspace-ui-state.js";
import type { SelectionOwner } from "./use-selection-owner.js";
import type { ClipboardActions } from "./clipboard-actions.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { DocumentLifecycleOwner } from "./use-document-lifecycle.js";
import { groupId, signalId, valueSignal } from "../minimal-cycle-view-fixture-helpers.js";
import { nextEntityId } from "../entity-id.js";
import { resolveGroupInsertionIndex, resolveInsertionTarget } from "../insertion-target.js";
import { parseBulkSignalDefinitions } from "../bulk-signal-parser.js";
import { createAnnotation } from "../create-annotation.js";
import type { CommandHistorySession } from "@timing-chart-v2/history";
import { createFileActionController } from "./file-action-controller.js";
import { createSelectionActions } from "./selection-actions.js";
import { createBottomEditorActions } from "./bottom-editor-actions.js";

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
  readonly followSelection: boolean;
  readonly pinnedBottomSelection: { readonly signalId?: SignalId; readonly groupId?: GroupId; readonly annotationId?: AnnotationId; readonly transactionId?: TransactionId } | undefined;
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
  readonly replaceDocument: (document: CanonicalDocument) => CommandResult;
  readonly selectAnnotation: (id: AnnotationId) => void;
  readonly deleteBottomSignal: () => void;
  readonly deleteBottomAnnotation: () => void;
  readonly deleteBottomTransaction: () => void;
  readonly selectTransaction: (id: TransactionId) => void;
  readonly toggleTransactionSignal: (transactionId: TransactionId, signalId: SignalId) => CommandResult;
  readonly createTransaction: () => void;
  readonly createTransactionGroup: () => void;
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
  readonly isolateSelection: ClipboardActions["isolateSelection"];
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
  const replaceDocument = (document: CanonicalDocument) => input.application.execute({
    id: input.nextCommandId("json_replace"),
    type: "document.replace",
    document,
  });
  const selectionActions = createSelectionActions({ document: input.document, selection: input.selection, hostRef: input.hostRef, selectedSignalId: input.selectedSignal?.id });
  const { selectAnnotation, selectTransaction, clearSelection, selectAllSignals, selectHierarchySignal, revealSelectedInHierarchy } = selectionActions;
  const bottomActions = createBottomEditorActions({
    application: input.application,
    editActions: input.editActions,
    document: input.document,
    nextCommandId: input.nextCommandId,
    selection: input.selection,
    bottomSignal: input.bottomSignal,
    bottomAnnotation: input.bottomAnnotation,
    bottomTransaction: input.bottomTransaction,
    bottomPinnedRef: input.bottomPinnedRef,
    selectedSignalRef: input.selectedSignalRef,
    selectedAnnotationRef: input.selectedAnnotationRef,
    selectedTransactionRef: input.selectedTransactionRef,
    bottomPinned: input.bottomPinned,
    setBottomPinned: input.setBottomPinned,
    followSelection: input.followSelection,
    pinnedBottomSelection: input.pinnedBottomSelection,
    setPinnedBottomSelection: input.setPinnedBottomSelection,
    selectedSignalId: input.selectedSignalId,
    selectedGroupId: input.selectedGroupId,
    selectedAnnotationId: input.selectedAnnotationId,
    selectedTransactionId: input.selectedTransactionId,
  });
  const { deleteBottomSignal, deleteBottomAnnotation, deleteBottomTransaction, toggleTransactionSignal, toggleBottomPin } = bottomActions;
  const createTransaction = () => {
    const id = nextEntityId("transaction", input.document) as TransactionId;
    const result = input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", {
      id: input.nextCommandId("tree_transaction_create"),
      type: "transaction.create",
      transaction: { id, name: `Transaction ${input.document.transactions.length + 1}`, start: 0, end: Math.min(4, input.document.timeline.cycleCount), laneId: "lane_0" },
    });
    if (result.ok) input.selection.selectTransaction(id);
  };
  // #397 Transaction Mode GUI Closure: `transactionGroup.create` already
  // existed at the command/planner layer (full create/rename/update/delete
  // CRUD) with zero GUI entry point -- users could never actually build the
  // Group hierarchy the Tree/Lane workspace already knows how to render.
  // Same shape as `createTransaction` above: default name, next order index,
  // one command, select nothing extra (Groups aren't a selectable entity).
  const createTransactionGroup = () => {
    const id = nextEntityId("transactionGroup", input.document) as TransactionGroup["id"];
    const order = input.document.transactionGroups?.length ?? 0;
    input.commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", {
      id: input.nextCommandId("tree_transaction_group_create"),
      type: "transactionGroup.create",
      group: { id, name: `Group ${order + 1}`, order },
    });
  };
  const duplicateAnnotation = (source: Annotation) => {
    const duplicate = { ...source, id: nextEntityId("annotation", input.document) as AnnotationId };
    const result = input.application.execute({ id: input.nextCommandId("annotation_duplicate"), type: "annotation.create", annotation: duplicate });
    if (result.ok) input.selection.selectAnnotation(duplicate.id);
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
  const fileActions = createFileActionController({ documentLifecycle: input.documentLifecycle, pendingFileOriginRef: input.pendingFileOriginRef, documentTitle: input.documentTitle });

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
    replaceDocument,
    selectAnnotation,
    deleteBottomSignal,
    deleteBottomAnnotation,
    deleteBottomTransaction,
    selectTransaction,
    toggleTransactionSignal,
    createTransaction,
    createTransactionGroup,
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
    isolateSelection: input.editActions.isolateSelection,
    moveSelection: input.editActions.move,
    ...fileActions,
  };
}
