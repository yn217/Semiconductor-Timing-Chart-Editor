import { startTransition, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { CommandResult } from "@timing-chart-v2/commands";
import { type Point } from "@timing-chart-v2/geometry";
import { quickValueLiteral, quickValueOptions, type AnnotationId, type BookmarkId, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type GroupId, type SignalId, type TransactionGroup, type TransactionId } from "@timing-chart-v2/schema";
import { ViewMetricsOwner } from "./runtime/view-metrics.js";
import { ExportDialog } from "./export-dialog.js";
import { downloadText } from "./download-text.js";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { ContextMenuPanel, MinimalCycleViewTitleBar, RenameDialog, BulkRegistrationDialog } from "./minimal-cycle-view-panels.js";
import { MinimalCycleViewRibbonTabs, refreshTreeCollapsedMetadata, refreshTreeFilterPresentation, refreshTreeRovingFocus } from "./minimal-cycle-view-ui.js";
import { cycleDocument, transactionDemoDocument, v1ReferenceDocument } from "./fixtures-cycle-reference-documents.js";
import { signalId } from "./minimal-cycle-view-fixture-helpers.js";
import { useEditorDialogRuntime } from "./application/use-editor-dialog-runtime.js";
import { HardwareHierarchyBrowser } from "./hardware-hierarchy-browser.js";
import { SaveAsDialog } from "./save-as-dialog.js";
import { DocumentProperties } from "./document-properties.js";
import { useEditorApplicationOwner } from "./application/use-editor-application-owner.js";
import { useEditorCommandRouter } from "./application/use-editor-command-router.js";
import { useEditorActions } from "./application/use-editor-actions.js";
import { useEditorPresentationState } from "./application/use-editor-presentation-state.js";
import { useEditorResizeActions } from "./application/use-editor-resize-actions.js";
import { useEditorWorkspaceActions } from "./application/use-editor-workspace-actions.js";
import { EditorShellView } from "./editor-shell-view.js";
import { EditorDialogLayer } from "./editor-dialog-layer.js";
import { useDocumentLifecycle } from "./application/use-document-lifecycle.js";
import { deriveSelectionCapabilities, useSelectionOwner } from "./application/use-selection-owner.js";
import { useClipboardActions } from "./application/clipboard-actions.js";
import { useTimelineNavigationOwner } from "./runtime/use-timeline-navigation-owner.js";
import { useWorkspaceUiState } from "./workspace/use-workspace-ui-state.js";
import { useTimelinePresentationState } from "./workspace/use-timeline-presentation-state.js";
import { useDialogMenuState } from "./workspace/use-dialog-menu-state.js";
import { useTimelineSurfaceRuntime } from "./runtime/use-timeline-surface-runtime.js";
import { useEditorSecondarySurfaces } from "./editor-secondary-surfaces.js";
import { createEditorExportController } from "./application/editor-export-controller.js";
import type { TimelineViewportRuntime } from "./runtime/timeline-viewport-runtime.js";
import { attachMenuKeyboardNavigation } from "./runtime/interaction-controller.js";
import { refreshRendererOverlays } from "./runtime/render-coordinator.js";
import { applyRendererHostSizing } from "./runtime/renderer-host-sizing.js";
import { refreshRulerRangeSelection, refreshTransactionLinkedRows } from "./runtime/editor-dom-bridge.js";
export function MinimalCycleView() {
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : undefined;
  const visualReference = searchParams?.has("visual-reference") === true;
  const initialDocument = visualReference ? v1ReferenceDocument : transactionDemoDocument;
  const application = useEditorApplicationOwner(initialDocument);
  const documentLifecycle = useDocumentLifecycle({ application, productTemplate: cycleDocument, persistText: downloadText });
  const exportController = useMemo(() => createEditorExportController(), []);
  const { snapshot, history, problem, validationDiagnostics, runtimeDiagnostics, setProblem, setRuntimeDiagnostics } = application;
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const gridLayer = useRef<HTMLDivElement>(null);
  // Signal Split View (#200) PR 3/4: a second, independently-scrollable
  // viewport for the Lower pane. It has its own sticky ruler (matching the
  // Upper pane's `.cycle-ruler { position: sticky }`, so vertical pinning
  // is native CSS, not a relocated shared element) kept in horizontal sync
  // with Upper via viewportLower/upper's own scroll handlers below. It is
  // an empty placeholder in this PR -- no renderer/projection mounts into
  // it yet; real per-pane content routing is PR 4.
  const viewportLower = useRef<HTMLDivElement>(null);
  const rulerLower = useRef<HTMLDivElement>(null);
  const hostLower = useRef<HTMLDivElement>(null);
  const gridLayerLower = useRef<HTMLDivElement>(null);
  // Signal Split View (#200) PR 4: the Lower pane's own renderer/adapter/
  // geometry/projection pipeline, owned by the non-React split-surface
  // controller invoked by the hook below (keyed on signalSplitEnabled) and
  // consumed by the primary surface controller's document-
  // change handlers so both panes reproject on every canonical change from
  // one single source of truth. `null` whenever Split is off -- every
  // existing document-change path is then a no-op for Lower, unchanged from
  // pre-#200 behavior.
  const signalSplitRuntimeRef = useRef<null | { onDocumentChanged: (result: { readonly snapshot: Extract<CommandResult, { readonly ok: true }>["snapshot"]; readonly changeSet: Extract<CommandResult, { readonly ok: true }>["changeSet"] }) => void; onDocumentReplaced: () => void; onViewportResize: () => void; getTotalHeight: () => number; dispose: () => void }>(null);
  // Lets the signalSplitEnabled effect force the Upper pane (owned by the
  // primary mount effect) to reproject/re-render after switching its shared
  // `projection.setPane()` filter, without exposing Upper's internal
  // renderer/projection closures outside that effect.
  const forceUpperReprojectRef = useRef<() => void>(() => undefined);
  // Signal Split View (#200) Lower-local row interaction PR1: clicking
  // anywhere on Lower's own waveform canvas selects that cycle exactly
  // like clicking Upper's does (shared horizontal geometry, shared
  // selectedCycle/timelineRange state) -- set by the primary mount effect
  // (which owns cycle-selection logic and the shared timeline geometry),
  // called by the separate Lower mount effect below on its own click
  // events, since the two are independent `useEffect`s with no shared
  // closure. Deliberately narrower than Upper's full canvas interaction
  // set: no drag-range-selection, no annotation drag, no context menu yet
  // -- those remain a further, separate follow-up.
  const lowerCanvasClickRef = useRef<(event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => void>(() => undefined);
  const timelineRuntimeRef = useRef<TimelineViewportRuntime | null>(null);
  const armArrowPick = useRef<(annotationType: "arrow" | "dependency") => void>(() => undefined);
  const selectAllRef = useRef<() => void>(() => undefined);
  const snapTransactionCycle = useRef<(clientX: number, surfaceLeft?: number) => number | undefined>(() => undefined);
  const transactionBoundaryX = useRef<(cycle: number) => number | undefined>(() => undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useSelectionOwner(visualReference ? signalId("sig_cycle_clock") : undefined);
  const editActions = useClipboardActions({ application, selection });
  const documentEpoch = application.runtime.documentEpoch.current();
  const { signalId: selectedId, signalIds: selectedSignalIds, groupId: selectedGroupId, annotationId: selectedAnnotationId, transactionId: selectedTransactionId, transactionIds: selectedTransactionIds } = selection.state;
  const { signalId: selectedSignalRef, signalIds: selectedSignalIdsRef, groupId: selectedGroupRef, spacerId: selectedSpacerRef, annotationId: selectedAnnotationRef, transactionId: selectedTransactionRef } = selection.refs;
  const presentation = useEditorPresentationState({ hostRef: host });
  const {
    arrowPickStatus, setArrowPickStatus,
    gridEnabled, setGridEnabled, gridEnabledRef,
    snapEnabled, setSnapEnabled, snapEnabledRef,
    rulerEnabled, setRulerEnabled,
    minimapEnabled, setMinimapEnabled,
    showSignalNames, setShowSignalNames,
    showRoles, setShowRoles,
    showAnnotations, setShowAnnotations,
    showTransactions, setShowTransactions,
    showGroupBackground, setShowGroupBackground,
    applySelectionDecorations,
  } = presentation;
  // The normal preview starts on the built-in Transaction sample so a browser
  // refresh immediately shows the populated reference surface. The dedicated
  // visual-reference fixture remains a Cycle-oriented inspection entry point.
  const workspace = useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId>({
    documentEpoch,
    cycleCount: snapshot.document.timeline.cycleCount,
    initialViewMode: visualReference ? "Cycle" : "Transaction",
  });
  const {
    ribbonTab, setRibbonTab,
    bottomTab, setBottomTab,
    viewMode, setViewMode,
    activeContext,
    signalSplitEnabled, setSignalSplitEnabled,
    signalSplitRatio, setSignalSplitRatio, signalSplitResizeRef,
    density, setDensity,
    workspacePreset, setWorkspacePreset,
    waveformRestoreRef,
    signalTreeVisible, setSignalTreeVisible,
    inspectorVisible, setInspectorVisible,
    inspectorResetToken, setInspectorResetToken,
    bottomResetToken, setBottomResetToken,
    bottomVisible, setBottomVisible,
    leftPaneWidth, setLeftPaneWidth, leftPaneResizeRef,
    frozenPaneWidth: frozenPaneWidthState, setFrozenPaneWidth, frozenPaneResizeRef,
    inspectorWidth, setInspectorWidth, inspectorResizeRef,
    bottomHeight, setBottomHeight, bottomResizeRef,
    treeFilter, setTreeFilter, transactionTreeFilter, setTransactionTreeFilter, transactionTreeFilterMode, setTransactionTreeFilterMode,
    transactionTreeTab, setTransactionTreeTab,
    treeTypeFilter, setTreeTypeFilter,
    followSelection, setFollowSelection, followSelectionRef,
    bottomPinned, setBottomPinned, bottomPinnedRef,
    pinnedBottomSelection, setPinnedBottomSelection,
    cursorA, cursorB, cursorDelta, setCursor, clearCursor, moveCursor, swapCursors,
    activePane, setActivePane,
  } = workspace;
  // Keep standalone Cycle and Transaction presentation zoom independent while
  // Combined continues to use the shared time viewport zoom.
  const timelineNavigation = useTimelineNavigationOwner(viewMode);
  const zoom = timelineNavigation.zoom;
  useEffect(() => {
    if (typeof window !== "undefined" && viewMode !== "Split") window.localStorage.setItem("timing-chart-v2.view-mode", viewMode);
  }, [viewMode]);
  const bottomTabs: readonly ("Signal" | "Annotation" | "Transaction" | "Phases" | "Linked Signals" | "Bookmarks" | "AI" | "Problems" | "JSON")[] = viewMode === "Cycle"
    ? ["Signal", "Annotation", "Bookmarks", "AI", "Problems", "JSON"]
    : viewMode === "Transaction"
      ? ["Transaction", "Phases", "Linked Signals", "Bookmarks", "AI", "Problems", "JSON"]
      : ["Signal", "Transaction", "Annotation", "Bookmarks", "AI", "Problems", "JSON"];
  const workspaceActions = useEditorWorkspaceActions({
    workspacePreset,
    setWorkspacePreset,
    waveformRestoreRef,
    inspectorVisible,
    setInspectorVisible,
    bottomVisible,
    setBottomVisible,
    setViewMode,
    setBottomTab,
    setSignalTreeVisible,
    setLeftPaneWidth,
    setFrozenPaneWidth,
    setInspectorWidth,
    setBottomHeight,
    bottomTabs,
  });
  const { applyWorkspacePreset, resetWorkspaceLayout, selectBottomTab, onBottomTabKeyDown } = workspaceActions;
  // Keep the transient splitter independent, but never let it collapse the
  // persisted Role/Signal columns and break the shared frozen/timing origin.
  // `frozenPaneMinWidth` is the actual achievable floor for the loaded
  // document (161px..360px static bounds are meaningless once a document's
  // own Role+Signal columns need more room) -- both the resize handle's own
  // aria-valuemin and the keyboard/pointer resize clamps must agree with it,
  // or the control silently ignores input (drag/keyboard "resize" attempts
  // that can never move the effective width) while still advertising a
  // smaller, unreachable minimum via ARIA.
  const frozenPaneMinWidth = Math.max(160, snapshot.document.layout.roleColumnWidth + snapshot.document.layout.signalNameWidth);
  const frozenPaneWidth = Math.max(frozenPaneWidthState, frozenPaneMinWidth);
  const resizeActions = useEditorResizeActions({
    bottomResizeRef,
    bottomHeight,
    setBottomHeight,
    signalSplitResizeRef,
    signalSplitRatio,
    setSignalSplitRatio,
    inspectorResizeRef,
    inspectorWidth,
    setInspectorWidth,
    leftPaneResizeRef,
    leftPaneWidth,
    setLeftPaneWidth,
    frozenPaneResizeRef,
    frozenPaneWidth,
    frozenPaneMinWidth,
    setFrozenPaneWidth,
  });
  const {
    startBottomResize, moveBottomResize, finishBottomResize, resizeBottomByKeyboard,
    startSignalSplitResize, moveSignalSplitResize, finishSignalSplitResize, resizeSignalSplitByKeyboard,
    startInspectorResize, moveInspectorResize, finishInspectorResize, resizeInspectorByKeyboard,
    startLeftPaneResize, moveLeftPaneResize, finishLeftPaneResize, resizeLeftPaneByKeyboard,
    startFrozenPaneResize, moveFrozenPaneResize, finishFrozenPaneResize, resizeFrozenPaneByKeyboard,
  } = resizeActions;
  selection.configure({
    decorateSelection: applySelectionDecorations,
    synchronizeContext: (kind) => {
      if (!followSelectionRef.current || bottomPinnedRef.current) return;
      const preferredTab = kind === "annotation" ? "Annotation"
        : kind === "transaction" ? "Transaction"
          : kind === "signal" || kind === "spacer" ? "Signal" : undefined;
      // Entity creation/selection can originate in a ribbon that is visible
      // from another View Mode. Keep Follow Selection, but never put the
      // Bottom panel into a tab that the current mode does not expose; that
      // would make aria-labelledby point at a nonexistent tab while rendering
      // the corresponding hidden-mode editor.
      if (preferredTab !== undefined && bottomTabs.includes(preferredTab)) setBottomTab(preferredTab);
    },
  });
  const viewMetricsOwnerRef = useRef<ViewMetricsOwner | null>(null);
  if (viewMetricsOwnerRef.current === null) {
    viewMetricsOwnerRef.current = new ViewMetricsOwner({ leftPaneWidth, frozenPaneWidth, inspectorWidth, viewportWidth: viewport.current?.clientWidth ?? 0, zoom });
  }
  viewMetricsOwnerRef.current.update({ leftPaneWidth, frozenPaneWidth, inspectorWidth, viewportWidth: viewport.current?.clientWidth ?? 0, zoom });
  const viewMetricsOwner = viewMetricsOwnerRef.current!;
  const dialogMenu = useDialogMenuState<GroupId>();
  const {
    contextMenu, setContextMenu,
    treeAddMenuOpen, setTreeAddMenuOpen,
    treeMoreMenuOpen, setTreeMoreMenuOpen,
    propertiesVisible, setPropertiesVisible,
    exportVisible, setExportVisible,
    saveAsVisible, setSaveAsVisible,
    hierarchyVisible, setHierarchyVisible,
    bulkRegistrationVisible, setBulkRegistrationVisible,
    bulkRegistrationText, setBulkRegistrationText,
    bulkRegistrationGroupId, setBulkRegistrationGroupId,
    bulkRegistrationStatus, setBulkRegistrationStatus,
    bulkRegistrationPreview, setBulkRegistrationPreview,
    renameDialogOpen, setRenameDialogOpen,
    renameDraft, setRenameDraft,
    renameError, setRenameError,
  } = dialogMenu;
  const compatibilityPreview = documentLifecycle.compatibilityPreview;
  const dialogOriginRef = useRef<HTMLElement | null>(null);
  const dialogOriginLabelRef = useRef<string | null>(null);
  const closeDialog = (close: () => void) => close();
  const pendingFileAction = documentLifecycle.pendingAction;
  const pendingFileOriginRef = useRef<HTMLElement | null>(null);
  const unsavedCancelRef = useRef<HTMLButtonElement>(null);
  const renameDialogRef = useRef<HTMLFormElement>(null);
  const renameDialogOriginRef = useRef<HTMLElement | null>(null);
  const bulkRegistrationDialogRef = useRef<HTMLElement>(null);
  const unsavedFileDialogRef = useRef<HTMLElement>(null);
  const compatibilityDialogRef = useRef<HTMLElement>(null);
  const timelinePresentation = useTimelinePresentationState({ visualReference, documentEpoch });
  const {
    collapsedGroupIds,
    treePresentationRevision,
    playheadPresentationRevision,
    transactionPresentationRevision,
    rangePresentationRevision,
    timelineRange,
    rangeSelectionActive,
    selectedCycle,
    setCollapsedGroups,
    toggleCollapsedGroup,
    setTreePresentationRevision,
    setPlayheadPresentationRevision,
    setTransactionPresentationRevision,
    setRangePresentationRevision,
    setTimelineRange,
    setRangeSelectionActive,
    setSelectedCycle,
  } = timelinePresentation;
  const { collapsedGroupIdsRef, applyCollapsedGroupsRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef } = timelinePresentation.refs;
  const treeFocusRowIdRef = useRef<string | undefined>(undefined);
  const menuOriginRef = useRef<HTMLElement | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const restoreMenuFocus = () => {
    const origin = menuOriginRef.current;
    menuOriginRef.current = null;
    if (origin?.isConnected) requestAnimationFrame(() => {
      if (!origin.hasAttribute("tabindex")) origin.setAttribute("tabindex", "-1");
      origin.focus({ preventScroll: true });
    });
  };
  const closeContextMenu = () => { setContextMenu(undefined); };
  const closeTreeAddMenu = () => { setTreeAddMenuOpen(false); };
  const closeTreeMoreMenu = () => { setTreeMoreMenuOpen(false); };
  const previousMenuOpenRef = useRef(false);
  useEffect(() => {
    const menuOpen = contextMenu !== undefined || treeAddMenuOpen || treeMoreMenuOpen;
    if (previousMenuOpenRef.current && !menuOpen) restoreMenuFocus();
    previousMenuOpenRef.current = menuOpen;
  }, [contextMenu, treeAddMenuOpen, treeMoreMenuOpen]);
  useEffect(() => {
    const selector = contextMenu ? ".context-menu" : treeAddMenuOpen ? ".tree-add-menu" : treeMoreMenuOpen ? ".tree-header-menu" : undefined;
    const menu = selector ? document.querySelector<HTMLElement>(selector) : undefined;
    menu?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")?.focus();
    return attachMenuKeyboardNavigation(document, closeContextMenu, closeTreeAddMenu, closeTreeMoreMenu);
  }, [contextMenu, treeAddMenuOpen, treeMoreMenuOpen]);
  const clipboardStatus = editActions.status;
  const clipboardAvailable = editActions.available;
  const refreshPlayhead = useRef<() => void>(() => undefined);
  const refreshRangeSelectionBand = useRef<() => void>(() => undefined);
  // #175: lets an outside action (Refresh Checks) that only changes React
  // state -- never a document/scroll/zoom event the mount effect already
  // republishes on -- still refresh the DOM `data-session-counters`
  // snapshot immediately, so `validatorInvocations` is observable right
  // after the click that incremented it rather than only at the next
  // unrelated render/publish.
  const publishStateRef = useRef<() => void>(() => undefined);
  // View-only navigation updates zoom without replacing the canonical document.
  // Keep entity lookup work on the document boundary so large documents do not
  // linearly rescan every signal during each zoom render.
  const signalById = useMemo(() => new Map(snapshot.document.signals.map((signal) => [signal.id, signal] as const)), [snapshot.document]);
  const groupById = useMemo(() => new Map(snapshot.document.signalGroups.map((group) => [group.id, group] as const)), [snapshot.document]);
  const annotationById = useMemo(() => new Map(snapshot.document.annotations.map((annotation) => [annotation.id, annotation] as const)), [snapshot.document]);
  const transactionById = useMemo(() => new Map(snapshot.document.transactions.map((transaction) => [transaction.id, transaction] as const)), [snapshot.document]);
  const firstNonCommentSignal = useMemo(() => snapshot.document.signals.find((signal) => signal.type !== "commentRow"), [snapshot.document]);
  const referenceClockSignal = useMemo(() => {
    const referenceClockId = snapshot.document.timeline.referenceClock;
    return referenceClockId === undefined ? undefined : signalById.get(referenceClockId);
  }, [signalById, snapshot.document.timeline.referenceClock]);
  const selectedSignal = selectedId === undefined ? undefined : signalById.get(selectedId);
  const selectedAnnotationTarget = selectedAnnotationId === undefined ? undefined : annotationById.get(selectedAnnotationId);
  const annotationTargetSignalId = useMemo(() => {
    if (selectedSignal && selectedSignal.type !== "commentRow") return selectedSignal.id;
    const annotationSignalId = selectedAnnotationTarget?.anchor?.signalId ?? selectedAnnotationTarget?.start?.signalId ?? selectedAnnotationTarget?.from?.signalId;
    if (annotationSignalId && signalById.get(annotationSignalId)?.type !== "commentRow") return annotationSignalId;
    if (referenceClockSignal && referenceClockSignal.type !== "commentRow") return referenceClockSignal.id;
    return firstNonCommentSignal?.id;
  }, [annotationById, firstNonCommentSignal, referenceClockSignal, selectedAnnotationTarget, selectedSignal, signalById]);
  const selectedGroup = selectedGroupId === undefined ? undefined : groupById.get(selectedGroupId);
  const selectedSpacer = selectedSpacerRef.current === undefined ? undefined : selectedGroup?.spacers?.find((spacer) => spacer.id === selectedSpacerRef.current);
  const selectedAnnotation = selectedAnnotationId === undefined ? undefined : annotationById.get(selectedAnnotationId);
  const selectedTransaction = selectedTransactionId === undefined ? undefined : transactionById.get(selectedTransactionId);
  // #426 Bottom Panel UX Closure (source of truth: the open Issue text, not
  // this file's own prior behavior) -- "Follow Selection" OFF must keep the
  // current Bottom editor target, exactly like Pin, until Follow Selection
  // is turned back on. Previously only `bottomPinned` gated these four --
  // Follow Selection OFF was a no-op for *which entity* Bottom shows (it
  // only gated automatic Bottom-tab switching in selection.configure's
  // synchronizeContext above), silently contradicting the issue's explicit
  // contract. `frozen` covers both freeze sources through the one shared
  // `pinnedBottomSelection` snapshot, captured by `setFollowSelectionWithFreeze`
  // below the same way `toggleBottomPin` already captures it for Pin.
  const frozen = (bottomPinned || !followSelection) && pinnedBottomSelection !== undefined;
  const bottomSignal = frozen ? (pinnedBottomSelection!.signalId === undefined ? undefined : signalById.get(pinnedBottomSelection!.signalId)) : selectedSignal;
  const bottomGroup = frozen ? (pinnedBottomSelection!.groupId === undefined ? undefined : groupById.get(pinnedBottomSelection!.groupId)) : selectedGroup;
  const bottomAnnotation = frozen ? (pinnedBottomSelection!.annotationId === undefined ? undefined : annotationById.get(pinnedBottomSelection!.annotationId)) : selectedAnnotation;
  const bottomTransaction = frozen ? (pinnedBottomSelection!.transactionId === undefined ? undefined : transactionById.get(pinnedBottomSelection!.transactionId)) : selectedTransaction;
  const setFollowSelectionWithFreeze = (value: boolean) => {
    if (!value && !bottomPinned) {
      setPinnedBottomSelection({
        ...(selectedId === undefined ? {} : { signalId: selectedId }),
        ...(selectedGroupId === undefined ? {} : { groupId: selectedGroupId }),
        ...(selectedAnnotationId === undefined ? {} : { annotationId: selectedAnnotationId }),
        ...(selectedTransactionId === undefined ? {} : { transactionId: selectedTransactionId }),
      });
    } else if (value && !bottomPinned) {
      setPinnedBottomSelection(undefined);
    }
    setFollowSelection(value);
  };
  useEffect(() => {
    if (!pinnedBottomSelection) return;
    const targetExists = (pinnedBottomSelection.signalId === undefined || snapshot.document.signals.some((item) => item.id === pinnedBottomSelection.signalId))
      && (pinnedBottomSelection.groupId === undefined || snapshot.document.signalGroups.some((item) => item.id === pinnedBottomSelection.groupId))
      && (pinnedBottomSelection.annotationId === undefined || snapshot.document.annotations.some((item) => item.id === pinnedBottomSelection.annotationId))
      && (pinnedBottomSelection.transactionId === undefined || snapshot.document.transactions.some((item) => item.id === pinnedBottomSelection.transactionId));
    if (!targetExists) {
      if (bottomPinned) setBottomPinned(false);
      if (!followSelection) setFollowSelection(true);
      setPinnedBottomSelection(undefined);
    }
  }, [bottomPinned, followSelection, pinnedBottomSelection, snapshot.revision]);
  useEffect(() => {
    setPinnedBottomSelection(undefined);
    if (bottomPinned) setBottomPinned(false);
    if (!followSelection) setFollowSelection(true);
    setContextMenu(undefined);
  }, [documentEpoch]);
  useEffect(() => {
    refreshTreeFilterPresentation(host, treeFilter, treeTypeFilter);
  }, [treePresentationRevision, treeFilter, treeTypeFilter, collapsedGroupIds]);
  useEffect(() => {
    refreshTreeCollapsedMetadata(host, collapsedGroupIds);
  }, [treePresentationRevision, collapsedGroupIds]);
  useEffect(() => {
    refreshTreeRovingFocus(host, treeFocusRowIdRef);
  }, [treePresentationRevision, treeFilter, collapsedGroupIds, selectedId, selectedGroupId]);
  const diagnostics = useMemo(() => [...validationDiagnostics, ...runtimeDiagnostics], [runtimeDiagnostics, validationDiagnostics]);
  const waveDromHasError = runtimeDiagnostics.some((item) => item.code === "WAVE_RENDER_ERROR");
  const commandRouter = useEditorCommandRouter({ application, selection, editActions, selectAllRef });
  const commandRegistry = commandRouter.commandRegistry;
  const executeBatch = commandRouter.executeBatch;
  useEffect(() => {
    refreshRulerRangeSelection(ruler, rangeSelectionActive, timelineRange);
  }, [rangeSelectionActive, timelineRange, rangePresentationRevision]);
  useEffect(() => {
    if (timelineRuntimeRef.current) timelineRuntimeRef.current.onViewportResize();
    else applyRendererHostSizing({ host, viewport, metrics: viewMetricsOwner.snapshot() });
  }, [viewMetricsOwner, leftPaneWidth, frozenPaneWidth, inspectorWidth]);
  useTimelineSurfaceRuntime({
    application,
    documentLifecycle,
    selection,
    editActions,
    navigation: timelineNavigation,
    commandRegistry,
    executeBatch,
    dom: { host, viewport, ruler, gridLayer, viewportLower, rulerLower, hostLower, gridLayerLower, signalSplitRuntimeRef },
    presentation: { collapsedGroupIdsRef, applyCollapsedGroupsRef, forceUpperReprojectRef, lowerCanvasClickRef, timelineRuntimeRef, armArrowPick, snapTransactionCycle, transactionBoundaryX, refreshPlayhead, refreshRangeSelectionBand, publishStateRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef, selectedAnnotationRef, gridEnabledRef, snapEnabledRef, treeFocusRowIdRef, suppressCanvasClickRef, menuOriginRef },
    state: { setRuntimeDiagnostics, setProblem, setTreePresentationRevision, setTransactionPresentationRevision, setRangePresentationRevision, setPlayheadPresentationRevision, setTimelineRange, setRangeSelectionActive, setSelectedCycle, setBottomPinned, setPinnedBottomSelection, setTreeFilter, setTreeTypeFilter, setTreeAddMenuOpen, setTreeMoreMenuOpen, setContextMenu, setArrowPickStatus, setRenameDialogOpen, setCollapsedGroups, toggleCollapsedGroup, closeContextMenu },
    viewMetricsOwner,
    signalSplitEnabled,
    signalSplitRatio,
    viewMode,
  });
  // #613: `getSourceWindow` (timeline-surface-controller.ts) reads the live
  // `data-view-mode` DOM attribute and returns a different bounded window for
  // Cycle vs. Transaction/Combined (Cycle excludes the shared
  // transactionExtent padding). Switching View Mode is pure React state --
  // `setViewMode` never touches the renderer -- so that window mismatch sits
  // stale until whatever `renderer.update()` call happens to come next, which
  // then gets blamed for a WaveDrom re-render it didn't actually cause.
  // Force the same canonical/history/dirty-neutral reproject Signal Split
  // already uses for its own pure view-state toggle (forceUpperReprojectRef,
  // see timeline-surface-controller.ts) so the window reconciles at the
  // moment View Mode actually changes instead of leaking into later updates.
  const viewModeMounted = useRef(false);
  useEffect(() => {
    if (!viewModeMounted.current) { viewModeMounted.current = true; return; }
    forceUpperReprojectRef.current();
    // #614 taught us the ruler and each wave-owner's window/width must be
    // reconciled together through the ruler's one authoritative rebuild --
    // reprojecting the wave owners alone (above) without also rebuilding the
    // ruler leaves the ruler's cached tick positions stale against the new
    // window, misaligning the grid/ruler from the waveform edges.
    timelineRuntimeRef.current?.refreshRuler();
  }, [viewMode]);
  useEffect(() => {
    refreshPlayhead.current();
  }, [selectedCycle, playheadPresentationRevision, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth]);
  useEffect(() => {
    refreshRangeSelectionBand.current();
  }, [rangePresentationRevision, timelineRange, rangeSelectionActive, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth]);

  const selectedLinkedSignalKey = selectedTransaction?.linkedSignals?.join("\u0000") ?? "";
  useEffect(() => {
    refreshTransactionLinkedRows(host, new Set(selectedTransaction?.linkedSignals ?? []));
  }, [selectedTransactionId, selectedLinkedSignalKey]);

  // #407: Split active pane -- click-delegated (rather than a JSX onClick)
  // because the Split panes are owned/rendered by editor-workspace-view.tsx
  // (Codex's shell-decomposition file), not this one; a delegated listener
  // on the cycle panel reads which pane was clicked without touching that
  // file's JSX at all. `setActivePaneRef` keeps the listener attached once
  // (rather than resubscribing every render) while still calling whichever
  // `setActivePane` closure is current.
  const setActivePaneRef = useRef(setActivePane);
  setActivePaneRef.current = setActivePane;
  useEffect(() => {
    const root = viewport.current?.closest<HTMLElement>(".cycle-panel");
    if (!root) return;
    const onPointerDownCapture = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      setActivePaneRef.current(target?.closest(".transaction-lanes, .split-transaction-pane") ? "transaction" : "signal");
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      setActivePaneRef.current(target?.closest(".transaction-lanes, .split-transaction-pane") ? "transaction" : "signal");
    };
    root.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
    root.addEventListener("focusin", onFocusIn);
    return () => {
      root.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
      root.removeEventListener("focusin", onFocusIn);
    };
  }, []);
  // View-only presentation of `activePane` -- an imperative DOM attribute
  // (same reasoning as above: `cycle-viewport` isn't this file's JSX) so
  // CSS alone can show which Split region is active, only meaningful while
  // `viewMode === "Split"`.
  useEffect(() => {
    const root = viewport.current;
    if (root) root.dataset.activePane = viewMode === "Split" ? activePane : "";
  }, [activePane, viewMode]);

  const actions = useEditorActions({
    document: snapshot.document,
    documentEpoch,
    commandRegistry,
    navigation: timelineNavigation,
    rulerRef: ruler,
    setBottomTab,
    viewMode,
    setBottomVisible,
    createBookmarkId: () => nextEntityId("bookmark", snapshot.document) as BookmarkId,
    nextCommandId,
    selection,
    diagnostics,
    selectedCycleRef,
    setSelectedCycle,
    hostRef: host,
    viewportRef: viewport,
    application,
    editActions,
    bottomSignal: bottomSignal?.id,
    bottomAnnotation,
    bottomTransaction,
    bottomPinnedRef,
    selectedSignalRef,
    selectedAnnotationRef,
    selectedTransactionRef,
    selectAllRef,
    selectedSignal,
    selectedGroup,
    selectedTransactionName: selectedTransaction?.name,
    annotationTargetSignalId,
    timelineRange,
    menuOriginRef,
    renameDialogOriginRef,
    setRenameDraft,
    setRenameError,
    setRenameDialogOpen,
    renameDraft,
    bottomPinned,
    setBottomPinned,
    followSelection,
    pinnedBottomSelection,
    setPinnedBottomSelection,
    selectedSignalId: selectedId,
    selectedGroupId,
    selectedAnnotationId,
    selectedTransactionId,
    bulkRegistrationText,
    bulkRegistrationGroupId,
    bulkRegistrationPreview,
    setBulkRegistrationStatus,
    setBulkRegistrationPreview,
    setBulkRegistrationVisible,
    documentLifecycle,
    pendingFileOriginRef,
    documentTitle: snapshot.document.document.title,
  });
  const {
    selectedBookmarkId,
    selectedBookmark,
    selectBookmark,
    addBookmarkAtCycle,
    revealBookmark,
    deleteBottomBookmark,
    navigateToBookmark,
    navigateProblem,
    createSelectedAnnotation,
    selectAnnotation,
    deleteBottomSignal,
    deleteBottomAnnotation,
    deleteBottomTransaction,
    selectTransaction,
    duplicateAnnotation,
    clearSelection,
    selectAllSignals,
    selectAll,
    renameSelection,
    applyRename,
    toggleBottomPin,
    selectHierarchySignal,
    revealSelectedInHierarchy,
    createSignalGroup,
    addTreeEntity,
    moveTreeItemToGroup,
    createTransaction,
    registerBulkSignals,
    previewBulkSignals,
    copySelectedSignal,
    cutSelectedSignal,
    pasteSelectedEntity,
    duplicateSelectedEntity,
    createCopiedSignals,
    setSelectionVisibility,
    moveSelection,
    restorePendingFileFocus,
    capturePendingFileOrigin,
    cancelPendingFileAction,
    continuePendingFileAction,
    saveAndContinuePendingFileAction,
    requestNewDocument,
  } = actions;
  useEditorDialogRuntime({
    dirty: history.dirty,
    documentLifecycle,
    contextMenu,
    treeAddMenuOpen,
    treeMoreMenuOpen,
    propertiesVisible,
    exportVisible,
    saveAsVisible,
    hierarchyVisible,
    bulkRegistrationVisible,
    setContextMenu,
    setTreeAddMenuOpen,
    setTreeMoreMenuOpen,
    setPropertiesVisible,
    setExportVisible,
    setSaveAsVisible,
    setHierarchyVisible,
    setBulkRegistrationVisible,
    setBulkRegistrationPreview,
    suppressCanvasClickRef,
    dialogOriginRef,
    dialogOriginLabelRef,
    menuOriginRef,
    pendingFileOriginRef,
    renameDialogRef,
    renameDialogOriginRef,
    bulkRegistrationDialogRef,
    unsavedFileDialogRef,
    compatibilityDialogRef,
    renameDialogOpen,
    pendingFileAction,
    compatibilityPreview,
    restorePendingFileFocus,
    cancelPendingFileAction,
    closeContextMenu,
    closeTreeAddMenu,
    closeTreeMoreMenu,
  });
  const secondarySurfaces = useEditorSecondarySurfaces({
    document: snapshot.document,
    documentEpoch,
    revision: snapshot.revision,
    transactionPresentationRevision,
    history,
    problem,
    diagnostics,
    refs: { host, viewport, menuOriginRef, transactionBoundaryX, snapTransactionCycle },
    command: {
      registry: commandRegistry,
      execute: (command) => commandRegistry.current.execute("semantic.execute", command),
      undo: () => commandRegistry.current.execute("history.undo"),
      redo: () => commandRegistry.current.execute("history.redo"),
      executeBatch,
      nextCommandId,
    },
    selected: { signal: selectedSignal, signalIds: selectedSignalIds, group: selectedGroup, annotation: selectedAnnotation, transaction: selectedTransaction, transactionIds: selectedTransactionIds, bookmark: selectedBookmark, transactionId: selectedTransactionId },
    bottom: { signal: bottomSignal, group: bottomGroup, annotation: bottomAnnotation, transaction: bottomTransaction },
    timeline: { range: timelineRange, collapsedGroupIds, setCollapsedGroups, toggleCollapsedGroup },
    workspace: { viewMode, activeContext, bottomTabs, bottomTab, setBottomTab, selectBottomTab, onBottomTabKeyDown, followSelection, setFollowSelection: setFollowSelectionWithFreeze, bottomPinned, toggleBottomPin, treeFilter, setTreeFilter, treeTypeFilter, setTreeTypeFilter: (value) => setTreeTypeFilter(value), transactionTreeFilter, setTransactionTreeFilter, transactionTreeFilterMode, setTransactionTreeFilterMode, transactionTreeTab, setTransactionTreeTab, setRibbonTab },
    dialog: { treeAddMenuOpen, setTreeAddMenuOpen, treeMoreMenuOpen, setTreeMoreMenuOpen, bulkRegistrationText, setBulkRegistrationText, bulkRegistrationGroupId, setBulkRegistrationGroupId, bulkRegistrationStatus, setBulkRegistrationStatus, setBulkRegistrationVisible, setHierarchyVisible, contextMenu, setContextMenu, closeTreeAddMenu, closeTreeMoreMenu, bottomResetToken, setBottomResetToken, inspectorResetToken, setInspectorResetToken, setInspectorVisible },
    annotationTargetSignalId,
    referenceClockName: referenceClockSignal?.display.name,
    zoom,
    editActions,
    actions,
    setRuntimeDiagnostics,
    navigateProblem,
    ai: { getZoom: timelineNavigation.getZoom, fitAll: timelineNavigation.fitAll },
  });
  const capabilities = deriveSelectionCapabilities(snapshot.document, selection.state);
  const { hasSelectedSignal, hasSelectedEntity, hasSelectedClipboard, hasDeletableSelection, canMoveUp, canMoveDown } = capabilities;
  const canRenameSelection = capabilities.canRename;
  const canShowSelection = capabilities.canShow;
  const canHideSelection = capabilities.canHide;
  const shellRibbon = {
    tabs: <MinimalCycleViewRibbonTabs ribbonTab={ribbonTab} setRibbonTab={setRibbonTab} viewMode={viewMode} setViewMode={setViewMode} bottomTab={bottomTab} setBottomTab={setBottomTab} />,
    main: {
      commands: secondarySurfaces.surfaceCommands,
      tab: ribbonTab,
      document: snapshot.document,
      revision: snapshot.revision,
      range: timelineRange,
      history,
      zoom,
      gridEnabled,
      snapEnabled,
      rulerEnabled,
      minimapEnabled,
      signalSplitEnabled,
      onToggleSignalSplit: () => setSignalSplitEnabled((value) => !value),
      // #431/#459: Cursor A/B had a fully-built view-only state API
      // (use-workspace-ui-state.ts) with zero GUI anywhere -- these set a
      // cursor to whatever cycle is currently selected, same "current
      // cycle" the status bar's own "Cycle N" reads.
      selectedCycle,
      cursorA,
      cursorB,
      onSetCursorA: () => setCursor("a", selectedCycle),
      onSetCursorB: () => setCursor("b", selectedCycle),
      onClearCursors: () => { clearCursor("a"); clearCursor("b"); },
      onSwapCursors: swapCursors,
      showSignalNames,
      showRoles,
      showAnnotations,
      showTransactions,
      showGroupBackground,
      signalTreeVisible,
      inspectorVisible,
      bottomVisible,
      arrowPickStatus,
      selectedSignalId: annotationTargetSignalId,
      selectedInsertionSignalId: selectedSignal?.id,
      selectedGroupId: selectedGroup?.id,
      selectedAnnotation,
      selectedAnnotationIds: selection.state.annotationIds,
      selectedCommentRow: selectedSignal?.type === "commentRow" ? selectedSignal : undefined,
      onSignalCreated: selection.selectSignal,
      onGroupCreated: selection.selectGroup,
      onSpacerCreated: selection.selectSpacer,
      onTransactionCreated: selection.selectTransaction,
      problemsCount: diagnostics.length,
      diagnostics,
      onNavigateProblem: navigateProblem,
      onRefreshChecks: () => { application.validateDocument(snapshot.document); publishStateRef.current(); },
      onDiagnostic: (next: DocumentProblem | readonly DocumentProblem[] | undefined) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("ai-proposal:")), ...nextDiagnostics]); },
      viewMode,
      activeContext,
      density,
      workspacePreset,
      onDensityChange: setDensity,
      onWorkspacePresetChange: applyWorkspacePreset,
      onResetLayout: resetWorkspaceLayout,
      selectedTransactionId,
      clipboardStatus,
      clipboardAvailable,
      hasSelectedSignal,
      hasSelectedClipboard,
      hasSelectedEntity,
      hasDeletableSelection,
      canRenameSelection,
      canMoveUp,
      canMoveDown,
      canShowSelection,
      canHideSelection,
      onCopy: copySelectedSignal,
      onCut: cutSelectedSignal,
      onPaste: pasteSelectedEntity,
      onDuplicate: duplicateSelectedEntity,
      onRename: renameSelection,
      onClearSelection: clearSelection,
      onSelectAll: selectAll,
      onMoveUp: () => moveSelection(-1),
      onMoveDown: () => moveSelection(1),
      onVisibility: setSelectionVisibility,
      onRange: (range: { readonly start: number; readonly end: number }) => { setRangeSelectionActive(true); setTimelineRange(range); },
      onViewIntent: (intent: "fit-all" | "open-timeline") => { if (intent === "fit-all") timelineNavigation.fitAll(); else setRibbonTab("Timeline"); },
      onCreateAnnotation: createSelectedAnnotation,
      onArrowPick: (annotationType: Parameters<typeof armArrowPick.current>[0]) => armArrowPick.current(annotationType),
      onZoom: timelineNavigation.zoomBy,
      onFitSelection: timelineNavigation.fitSelection,
      onNavigateBookmark: navigateToBookmark,
      onFitAll: timelineNavigation.fitAll,
      onSetZoom: timelineNavigation.setZoom,
      onToggleGrid: () => setGridEnabled((value) => !value),
      onToggleSnap: () => setSnapEnabled((value) => !value),
      onToggleRuler: () => setRulerEnabled((value) => !value),
      onToggleMinimap: () => setMinimapEnabled((value) => !value),
      onToggleSignalNames: () => setShowSignalNames((value) => !value),
      onToggleRoles: () => setShowRoles((value) => !value),
      onToggleAnnotations: () => setShowAnnotations((value) => !value),
      onToggleTransactions: () => setShowTransactions((value) => !value),
      onToggleGroupBackground: () => setShowGroupBackground((value) => !value),
      onToggleSignalTree: () => setSignalTreeVisible((value) => !value),
      onUndo: () => commandRegistry.current.execute("history.undo"),
      onRedo: () => commandRegistry.current.execute("history.redo"),
      onDelete: () => commandRegistry.current.execute("selection.delete"),
      onNew: requestNewDocument,
      onOpen: () => { pendingFileOriginRef.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null; fileInput.current?.click(); },
      onSave: () => { documentLifecycle.save(`${snapshot.document.document.title || "timing-chart"}.tcd`); },
      onSaveAs: () => { dialogOriginLabelRef.current = "Save As"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSaveAsVisible(true); },
      onRecent: documentLifecycle.openRecent,
      onProperties: () => { dialogOriginLabelRef.current = "Properties"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPropertiesVisible(true); },
      onExport: () => { dialogOriginLabelRef.current = "Export"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setExportVisible(true); },
      onToggleInspector: () => startTransition(() => setInspectorVisible((value) => !value)),
      onToggleBottom: () => startTransition(() => setBottomVisible((value) => !value)),
      bottomHeight,
      onSetBottomSize: (size: "hidden" | "compact" | "expanded") => { if (size === "hidden") { setBottomVisible(false); return; } setBottomVisible(true); setBottomHeight(size === "compact" ? 180 : 420); },
      onShowProblems: () => { setBottomTab("Problems"); setBottomVisible(true); },
      onOpenTimeline: () => setRibbonTab("Timeline"),
      onOpenBookmarks: () => { setBottomTab("Bookmarks"); setBottomVisible(true); },
      onOpenAIAssistant: () => { setBottomTab("AI"); setBottomVisible(true); },
      aiBridgeStatus: secondarySurfaces.aiBridgeStatus,
      onOpenProperties: () => { dialogOriginLabelRef.current = "Properties"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPropertiesVisible(true); },
    },
  };
  const onCursorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.shiftKey && !event.altKey) return;
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (delta === 0) return;
    const target = event.altKey ? "b" : "a";
    if ((target === "a" ? cursorA : cursorB) === undefined) return;
    event.preventDefault();
    moveCursor(target, delta);
  };
  const shellWorkspace = {
    view: { viewMode, signalSplitEnabled, signalSplitRatio, gridEnabled, snapEnabled, rulerEnabled, zoom, cursorPresentationRevision: treePresentationRevision + playheadPresentationRevision, cursor: { ...(cursorA === undefined ? {} : { a: cursorA }), ...(cursorB === undefined ? {} : { b: cursorB }), ...(cursorDelta.cycles === undefined ? {} : { deltaCycles: cursorDelta.cycles }) } },
    layout: { leftPaneWidth, frozenPaneMinWidth, frozenPaneWidth, bottomVisible, bottomHeight, inspectorVisible, inspectorWidth },
    refs: { viewport, gridLayer, ruler, host, viewportLower, rulerLower, hostLower, gridLayerLower },
    content: { header: secondarySurfaces.workspaceHeader, transactionTree: secondarySurfaces.workspaceTransactionTree, viewportContent: secondarySurfaces.workspaceViewportContent, viewportLegend: secondarySurfaces.workspaceViewportLegend, leftRail: secondarySurfaces.workspaceLeftRail, bottom: secondarySurfaces.workspaceBottom, inspector: secondarySurfaces.workspaceInspector },
    interactions: {
      onInspectorKeyDown: resizeInspectorByKeyboard, onInspectorPointerDown: startInspectorResize, onInspectorPointerMove: moveInspectorResize, onInspectorPointerUp: finishInspectorResize,
      onLeftPaneKeyDown: resizeLeftPaneByKeyboard, onLeftPanePointerDown: startLeftPaneResize, onLeftPanePointerMove: moveLeftPaneResize, onLeftPanePointerUp: finishLeftPaneResize,
      onFrozenPaneKeyDown: resizeFrozenPaneByKeyboard, onFrozenPanePointerDown: startFrozenPaneResize, onFrozenPanePointerMove: moveFrozenPaneResize, onFrozenPanePointerUp: finishFrozenPaneResize,
      onBottomKeyDown: resizeBottomByKeyboard, onBottomPointerDown: startBottomResize, onBottomPointerMove: moveBottomResize, onBottomPointerUp: finishBottomResize,
      onSignalSplitKeyDown: resizeSignalSplitByKeyboard, onSignalSplitPointerDown: startSignalSplitResize, onSignalSplitPointerMove: moveSignalSplitResize, onSignalSplitPointerUp: finishSignalSplitResize,
      onViewportKeyDown: onCursorKeyDown,
      onSetCursorAtCycle: (which: "a" | "b", cycle: number) => setCursor(which, cycle),
      resolveCursorCycleAtClientX: (clientX: number, viewportElement: HTMLDivElement) => {
        const runtime = timelineRuntimeRef.current;
        if (!runtime) return undefined;
        const rect = viewportElement.getBoundingClientRect();
        const scrollLeft = viewportElement.scrollLeft;
        return runtime.screenXToSourceCycle(clientX - rect.left + scrollLeft);
      },
    },
  };
  const shellStatus = {
    toolStatus: arrowPickStatus === "idle" ? (rangeSelectionActive ? "Range select active" : "Ready · Tool: Select") : `Arrow pick · ${arrowPickStatus}`,
    selectionStatus: selectedSignalIds.size > 1 ? `${selectedSignalIds.size} signals` : selectedTransactionIds.size > 1 ? `${selectedTransactionIds.size} transactions` : selectedTransaction?.name ?? selectedAnnotation?.label ?? selectedSignal?.display.name ?? selectedGroup?.name ?? "None",
    signalCount: snapshot.document.signals.length,
    annotationCount: snapshot.document.annotations.length,
    rangeStatus: visualReference ? `Time Range: ${snapshot.document.timeline.start} – ${snapshot.document.timeline.end} cycles` : `Range: [${timelineRange.start}, ${timelineRange.end})`,
    selectedCycle,
    zoom,
    snapEnabled,
    viewMode,
    statusContext: `Workspace: ${workspacePreset} · ${bottomPinned ? "Bottom: Pinned" : followSelection ? "Bottom: Follow" : "Bottom: Fixed"}${selectedSignal ? ` · Scope: ${selectedSignal.source.instancePath.length > 0 ? selectedSignal.source.instancePath.join("/") : "root"}` : ""}`,
    hideRevisionDetail: visualReference,
    revision: snapshot.revision,
    undoDepth: history.undoDepth,
    redoDepth: history.redoDepth,
    timeAxisStatus: `Time Axis: ${snapshot.document.timeline.referenceClock ? `Clock · ${referenceClockSignal?.display.name ?? snapshot.document.timeline.referenceClock}` : "Time · No Clock Reference"}`,
    dirty: history.dirty,
    problemsCount: diagnostics.length,
    waveDromHasError,
    // #431/#459: `cursorA`/`cursorB` are source-time cycle numbers; empty
    // string formatting stays out of EditorStatusBar per its own "pure
    // display" contract, so the readout is fully assembled here.
    cursorStatus: cursorA === undefined && cursorB === undefined ? undefined
      : `Cursor: ${cursorA === undefined ? "A —" : `A ${cursorA}`} · ${cursorB === undefined ? "B —" : `B ${cursorB}`}${cursorDelta.cycles === undefined ? "" : ` · Δ ${cursorDelta.cycles} cycles`}`,
    // #407: textual counterpart to the CSS border indicator -- only
    // meaningful in Split (Cycle/Transaction each have exactly one pane).
    activePaneStatus: viewMode === "Split" ? `Active Pane: ${activePane === "transaction" ? "Transaction" : "Signal"}` : undefined,
  };
  return <EditorShellView
    viewModel={{
      style: { "--gui-left-width": `${viewMode === "Transaction" ? 246 : leftPaneWidth}px`, "--gui-frozen-width": `${frozenPaneWidth}px`, "--gui-bottom-height": `${bottomHeight}px`, "--gui-inspector-width": `${inspectorWidth}px`, "--gui-role-width": `${snapshot.document.layout.roleColumnWidth}px`, "--gui-signal-width": `${snapshot.document.layout.signalNameWidth}px`, "--gui-signal-align": snapshot.document.layout.signalNameAlign, "--gui-signal-split-upper-ratio": String(signalSplitRatio), "--transaction-tree-row-height": viewMode === "Transaction" ? "29px" : undefined } as React.CSSProperties,
      density, workspacePreset, inspectorVisible, bottomVisible, rulerEnabled, minimapEnabled, signalTreeVisible,
      showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground,
      layoutOverflow: snapshot.document.layout.overflow, leftPaneWidth, frozenPaneWidth, bottomHeight, inspectorWidth,
      cycleCount: snapshot.document.timeline.cycleCount, signalCount: snapshot.document.signals.length, transactionCount: snapshot.document.transactions.length,
    }}
    titleBar={<MinimalCycleViewTitleBar title={snapshot.document.document.title} dirty={history.dirty} viewMode={viewMode} />}
    ribbon={shellRibbon}
    workspace={shellWorkspace}
    dialogs={<EditorDialogLayer
      compatibilityPreview={compatibilityPreview}
      compatibilityDialogRef={compatibilityDialogRef}
      closeCompatibility={documentLifecycle.closeCompatibility}
      restorePendingFileFocus={restorePendingFileFocus}
      enterCompatibilityReadOnly={documentLifecycle.enterCompatibilityReadOnly}
      pendingFileAction={pendingFileAction}
      unsavedFileDialogRef={unsavedFileDialogRef}
      unsavedCancelRef={unsavedCancelRef}
      cancelPendingFileAction={cancelPendingFileAction}
      continuePendingFileAction={continuePendingFileAction}
      saveAndContinuePendingFileAction={saveAndContinuePendingFileAction}
      fileInputRef={fileInput}
      onFileChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) { capturePendingFileOrigin(); void documentLifecycle.readFile(file); } event.currentTarget.value = ""; }}
    >
    <ContextMenuPanel contextMenu={contextMenu} hasSelectedClipboard={hasSelectedClipboard} clipboardAvailable={clipboardAvailable} hasSelectedEntity={hasSelectedEntity} hasSelectedSignal={hasSelectedSignal} hasDeletableSelection={hasDeletableSelection} canRenameSelection={canRenameSelection} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canShowSelection={canShowSelection} canHideSelection={canHideSelection} copySelectedSignal={copySelectedSignal} cutSelectedSignal={cutSelectedSignal} pasteSelectedEntity={pasteSelectedEntity} duplicateSelectedEntity={duplicateSelectedEntity} moveSelection={moveSelection} setSelectionVisibility={setSelectionVisibility} renameSelection={renameSelection} closeContextMenu={closeContextMenu} deleteSelection={() => commandRegistry.current.execute("selection.delete")} addBookmarkAtCycle={addBookmarkAtCycle} transactionGroups={snapshot.document.transactionGroups} selectedTransactionGroupId={selectedTransaction?.groupId} moveSelectedTransactionToGroup={(groupId: TransactionGroup["id"] | undefined) => secondarySurfaces.surfaceCommands.moveTransactionToGroup(selectedTransactionId!, groupId)} />
    {renameDialogOpen && <RenameDialog dialogRef={renameDialogRef} draft={renameDraft} onDraftChange={(value) => { setRenameDraft(value); setRenameError(""); }} error={renameError} onApply={applyRename} onClose={() => setRenameDialogOpen(false)} />}
    {hierarchyVisible && <HardwareHierarchyBrowser document={snapshot.document} selectedSignalId={selectedSignal?.id} onSelect={selectHierarchySignal} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setHierarchyVisible(false))} />}
    {propertiesVisible && <DocumentProperties document={snapshot.document} commands={secondarySurfaces.surfaceCommands} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setPropertiesVisible(false))} />}
    {bulkRegistrationVisible && <BulkRegistrationDialog dialogRef={bulkRegistrationDialogRef} groups={snapshot.document.signalGroups} text={bulkRegistrationText} onTextChange={(value) => { setBulkRegistrationText(value); setBulkRegistrationPreview(undefined); setBulkRegistrationStatus(""); }} groupId={bulkRegistrationGroupId} onGroupIdChange={setBulkRegistrationGroupId} status={bulkRegistrationStatus} preview={bulkRegistrationPreview} onPreview={previewBulkSignals} onApply={registerBulkSignals} onClose={() => closeDialog(() => { setBulkRegistrationVisible(false); setBulkRegistrationPreview(undefined); })} />}
    {exportVisible && <ExportDialog snapshot={snapshot} range={timelineRange} controller={exportController} restoreFocusRef={dialogOriginRef} onDiagnostic={(next) => setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("export-failure:")), ...(next ? [next] : [])])} onClose={() => closeDialog(() => setExportVisible(false))} />}
     {saveAsVisible && <SaveAsDialog defaultName={snapshot.document.document.title || "timing-chart"} restoreFocusRef={dialogOriginRef} onSave={(name) => { const saved = documentLifecycle.saveAs(name); if (saved) closeDialog(() => setSaveAsVisible(false)); return saved; }} onClose={() => closeDialog(() => setSaveAsVisible(false))} />}
    </EditorDialogLayer>}
    status={shellStatus}
  />;
}
