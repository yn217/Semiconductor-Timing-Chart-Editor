import { cursorSourceCycleAtClientX, cursorViewportXForSourceCycle } from "./runtime/cursor-screen-geometry.js";
import { startTransition, useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { CommandResult } from "@timing-chart-v2/commands";
import { type Point } from "@timing-chart-v2/geometry";
import { quickValueLiteral, quickValueOptions, scenarioModelFromV2, type AnnotationId, type BookmarkId, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type GroupId, type ScenarioId, type ScenarioSignalDifference, type Signal,type SignalId, type TransactionGroup, type TransactionId } from "@timing-chart-v2/schema";
import { ViewMetricsOwner } from "./runtime/view-metrics.js";
import { ExportDialog } from "./export-dialog.js";
import { downloadText } from "./download-text.js";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { ContextMenuPanel, MinimalCycleViewTitleBar, RenameDialog, BulkRegistrationDialog } from "./minimal-cycle-view-panels.js";
import { MinimalCycleViewRibbonTabs } from "./minimal-cycle-view-ui.js";
import { signalId } from "./minimal-cycle-view-fixture-helpers.js";
import { useEditorDialogRuntime } from "./application/use-editor-dialog-runtime.js";
import { HardwareHierarchyBrowser } from "./hardware-hierarchy-browser.js";
import { SaveAsDialog } from "./save-as-dialog.js";
import { DocumentProperties } from "./document-properties.js";
import { cursorStatusReadout } from "./cursor-status-readout.js";
import { useEditorApplicationOwner } from "./application/use-editor-application-owner.js";
import { useDocumentEntityIndexes } from "./application/use-document-entity-indexes.js";
import { useEditorCommandRouter } from "./application/use-editor-command-router.js";
import { useEditorActions } from "./application/use-editor-actions.js";
import { useEditorPresentationState } from "./application/use-editor-presentation-state.js";
import { useEditorResizeActions } from "./application/use-editor-resize-actions.js";
import { useEditorWorkspaceActions } from "./application/use-editor-workspace-actions.js";
import { EditorShellView } from "./editor-shell-view.js";
import { OperationFeedback } from "./operation-feedback.js";
import { composeMode } from "./workspace/mode-composition.js";
import { useViewModeTransition } from "./runtime/use-view-mode-transition.js";
import { useActivePaneTracking } from "./runtime/use-active-pane-tracking.js";
import { useOverlayPresentationRefresh } from "./runtime/use-overlay-presentation-refresh.js";
import { EditorDialogLayer } from "./editor-dialog-layer.js";
import { useDocumentLifecycle } from "./application/use-document-lifecycle.js";
import { deriveSelectionCapabilities, useSelectionOwner } from "./application/use-selection-owner.js";
import { useClipboardActions } from "./application/clipboard-actions.js";
import { useTimelineNavigationOwner } from "./runtime/use-timeline-navigation-owner.js";
import { useWorkspaceUiState } from "./workspace/use-workspace-ui-state.js";
import { useBottomPinLifecycle } from "./workspace/use-bottom-pin-lifecycle.js";
import { useBottomPanelSizing } from "./workspace/use-bottom-panel-sizing.js";
import { useTimelinePresentationState } from "./workspace/use-timeline-presentation-state.js";
import { useDialogMenuState } from "./workspace/use-dialog-menu-state.js";
import { useTimelineSurfaceRuntime } from "./runtime/use-timeline-surface-runtime.js";
import { useEditorSecondarySurfaces } from "./editor-secondary-surfaces.js";
import { createEditorExportController } from "./application/editor-export-controller.js";
import type { TimelineViewportRuntime } from "./runtime/timeline-viewport-runtime.js";
import { refreshRendererOverlays } from "./runtime/render-coordinator.js";
import { useEditorDomBridgeEffects } from "./runtime/use-editor-dom-bridge-effects.js";
import { resolveEditorStartupDocument } from "./workspace/editor-startup-document.js";
import { useEditorInteractionLifecycle } from "./workspace/use-editor-interaction-lifecycle.js";
import { documentFilename } from "./document-filename.js";

export function MinimalCycleView() {
  const { visualReference, initialDocument, productTemplate, initialViewMode } = resolveEditorStartupDocument(typeof window !== "undefined" ? window.location.search : undefined);
  const application = useEditorApplicationOwner(initialDocument);
  const documentLifecycle = useDocumentLifecycle({ application, productTemplate, persistText: downloadText });
  const exportController = useMemo(() => createEditorExportController(), []);
  const { snapshot, lastChangeSet, history, problem, validationDiagnostics, validationPending, runtimeDiagnostics, setProblem, setRuntimeDiagnostics } = application;
  const scenarioModel = application.runtime.session.scenarioModel();
  const activeScenarioId = application.runtime.session.activeScenarioId();
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
  // The timeline runtime supplies the Lower pane's shared source-time click route.
  const lowerCanvasClickRef = useRef<(event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => void>(() => undefined);
  const timelineRuntimeRef = useRef<TimelineViewportRuntime | null>(null);
  const scenarioDifferencesRef = useRef<readonly ScenarioSignalDifference[]>([]);
  const publishScenarioDifferences = useCallback((differences: readonly ScenarioSignalDifference[]) => {
    scenarioDifferencesRef.current = differences;
    timelineRuntimeRef.current?.refreshOverlays("scenario-comparison");
  }, []);
  const armArrowPick = useRef<(annotationType: "arrow" | "dependency" | "measurement") => void>(() => undefined);
  const selectAllRef = useRef<() => void>(() => undefined);
  const snapTransactionCycle = useRef<(clientX: number, surfaceLeft?: number, horizontalScroll?: number) => number | undefined>(() => undefined);
  const transactionBoundaryX = useRef<(cycle: number) => number | undefined>(() => undefined);
  const transactionSourceWindow = useRef<(viewport: HTMLElement) => Readonly<{ start: number; end: number }> | undefined>(() => undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useSelectionOwner(visualReference ? signalId("sig_cycle_clock") : undefined);
  const editActions = useClipboardActions({ application, selection });
  const documentEpoch = application.runtime.documentEpoch.current();
  const { signalId: selectedId, signalIds: selectedSignalIds, groupId: selectedGroupId, annotationId: selectedAnnotationId, transactionId: selectedTransactionId, transactionIds: selectedTransactionIds } = selection.state;
  const { signalId: selectedSignalRef, signalIds: selectedSignalIdsRef, groupId: selectedGroupRef, spacerId: selectedSpacerRef, annotationId: selectedAnnotationRef, transactionId: selectedTransactionRef } = selection.refs;
  // The normal preview starts on the built-in Transaction sample so a browser
  // refresh immediately shows the populated reference surface. The dedicated
  // visual-reference fixture remains a Cycle-oriented inspection entry point.
  const workspace = useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId, BookmarkId>({
    documentEpoch,
    cycleCount: snapshot.document.timeline.cycleCount,
    initialViewMode,
  });
  const {
    ribbonTab, setRibbonTab,
    bottomTab, setBottomTab,
    viewMode, setViewMode,
    cyclesPerTc, setCyclesPerTc,
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
    bottomHeight, setBottomHeight: setRawBottomHeight, bottomResizeRef,
    treeFilter, setTreeFilter, transactionTreeFilter, setTransactionTreeFilter, transactionTreeFilterMode, setTransactionTreeFilterMode,
    treeTypeFilter, setTreeTypeFilter,
    followSelection, setFollowSelection, followSelectionRef,
    bottomPinned, setBottomPinned, bottomPinnedRef,
    pinnedBottomSelection, setPinnedBottomSelection,
    pinnedSignalIds, setPinnedSignalIds, getPinnedSignalIds,
    cursorA, cursorB, cursorDelta, setCursor, clearCursor, moveCursor, swapCursors,
    focusLinkedSignals, setFocusLinkedSignals,
    activePane, setActivePane,
  } = workspace;
  const { bottomMaxHeight, setBottomHeight, resetBottomHeight, ribbonProps: bottomRibbonProps } = useBottomPanelSizing(host, setRawBottomHeight, setBottomVisible, bottomVisible, bottomHeight, viewMode);
  const presentation = useEditorPresentationState({ hostRef: host, mode: viewMode, selection: selection.state, selectionRef: selection.refs.state, initialMinimapEnabled: visualReference });
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
  const transactionCyclesPerTcRef = useRef(cyclesPerTc);
  transactionCyclesPerTcRef.current = cyclesPerTc;
  // Keep standalone Cycle and Transaction presentation zoom independent while
  // Combined continues to use the shared time viewport zoom.
  const timelineNavigation = useTimelineNavigationOwner(viewMode, documentEpoch);
  const zoom = timelineNavigation.zoom;
  useEffect(() => {
    // The preferred mode is best-effort: blocked storage (private mode, site data disabled) must not take the editor down.
    try { if (typeof window !== "undefined" && modeComposition.persistsAsDefault) window.localStorage.setItem("timing-chart-v2.view-mode", viewMode); } catch { /* ignored */ }
  }, [viewMode]);
  const modeComposition = composeMode(viewMode);
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
    bottomTabs: modeComposition.bottomTabs,
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
      if (!followSelectionRef.current || bottomPinnedRef.current || bottomTab === "JSON") return;
      const preferredTab = kind === "annotation" ? "Annotation"
        : kind === "transaction" ? "Transaction"
          : kind === "signal" || kind === "spacer" ? "Signal" : undefined;
      // Entity creation/selection can originate in a ribbon that is visible
      // from another View Mode. Keep Follow Selection, but never put the
      // Bottom panel into a tab that the current mode does not expose; that
      // would make aria-labelledby point at a nonexistent tab while rendering
      // the corresponding hidden-mode editor.
      if (preferredTab !== undefined && modeComposition.bottomTabs.includes(preferredTab)) setBottomTab(preferredTab);
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
  const timelinePresentation = useTimelinePresentationState({ visualReference });
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
    resetCollapsedGroups,
    resetForDocument,
    toggleCollapsedGroup,
    setTreePresentationRevision,
    setPlayheadPresentationRevision,
    setTransactionPresentationRevision,
    setRangePresentationRevision,
    setTimelineRange,
    setRangeSelectionActive,
    setSelectedCycle,
  } = timelinePresentation;
  const { collapsedGroupIdsRef, applyCollapsedGroupsRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef, groupStylePreviewRef } = timelinePresentation.refs;
  const [treeFocusRowIdRef, menuOriginRef, suppressCanvasClickRef, closeContextMenu, closeTreeAddMenu, closeTreeMoreMenu] = useEditorInteractionLifecycle(contextMenu, treeAddMenuOpen, treeMoreMenuOpen, setContextMenu, setTreeAddMenuOpen, setTreeMoreMenuOpen);
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
  const { signalById, groupById, annotationById, transactionById, bookmarkById } = useDocumentEntityIndexes(snapshot.document);
  const selectedBookmarkIdRef = useRef<BookmarkId | undefined>(undefined);
  const referenceClockSignal = useMemo(() => {
    const referenceClockId = snapshot.document.timeline.referenceClock;
    return referenceClockId === undefined ? undefined : signalById.get(referenceClockId);
  }, [signalById, snapshot.document.timeline.referenceClock]);
  const selectedSignal = selectedId === undefined ? undefined : signalById.get(selectedId);
  const selectedAnnotationTarget = selectedAnnotationId === undefined ? undefined : annotationById.get(selectedAnnotationId);
  const annotationTargetSignalId = useMemo(() => {
    // A new Annotation is saved on this Signal, and only visible rows are drawn, so a hidden Signal (display.visible === false)
    // is never a target: fall through exactly as if nothing were selected.
    const isTargetable = (signal: Signal | undefined): signal is Signal => signal !== undefined && signal.type !== "commentRow" && signal.display.visible !== false;
    if (selectedSignal && isTargetable(selectedSignal)) return selectedSignal.id;
    const annotationSignalId = selectedAnnotationTarget?.anchor?.signalId ?? selectedAnnotationTarget?.start?.signalId ?? selectedAnnotationTarget?.from?.signalId;
    const annotationSignal = annotationSignalId === undefined ? undefined : signalById.get(annotationSignalId);
    if (isTargetable(annotationSignal)) return annotationSignal.id;
    if (isTargetable(referenceClockSignal)) return referenceClockSignal.id;
    return snapshot.document.signals.find(isTargetable)?.id;
  }, [annotationById, referenceClockSignal, selectedAnnotationTarget, selectedSignal, signalById, snapshot.document]);
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
        ...(selectedBookmarkIdRef.current === undefined ? {} : { bookmarkId: selectedBookmarkIdRef.current }),
      });
    } else if (value && !bottomPinned) {
      setPinnedBottomSelection(undefined);
    }
    setFollowSelection(value);
  };
  useBottomPinLifecycle({
    document: snapshot.document, revision: snapshot.revision, documentEpoch, projectionGeneration: application.runtime.session.projectionGeneration(),
    pinnedBottomSelection, bottomPinned, followSelection,
    setBottomPinned, setFollowSelection, setPinnedBottomSelection,
    clearContextMenu: () => setContextMenu(undefined),
  });
  useEditorDomBridgeEffects({ host, ruler, viewport, timelineRuntimeRef, viewMetricsOwner, treeFilter, treeTypeFilter, treePresentationRevision, collapsedGroupIds, treeFocusRowIdRef, selectedSignalId: selectedId, selectedGroupId, rangeSelectionActive, timelineRange, rangePresentationRevision, cyclesPerTc, leftPaneWidth, frozenPaneWidth, inspectorWidth });
  const diagnostics = useMemo(() => [...validationDiagnostics, ...runtimeDiagnostics], [runtimeDiagnostics, validationDiagnostics]);
  const waveDromHasError = runtimeDiagnostics.some((item) => item.code === "WAVE_RENDER_ERROR");
  const commandRouter = useEditorCommandRouter({ application, selection, editActions, selectAllRef });
  const commandRegistry = commandRouter.commandRegistry;
  const executeBatch = commandRouter.executeBatch;
  useTimelineSurfaceRuntime({
    application,
    documentLifecycle,
    selection,
    editActions,
    navigation: timelineNavigation,
    commandRegistry,
    executeBatch,
    dom: { host, viewport, ruler, gridLayer, viewportLower, rulerLower, hostLower, gridLayerLower, signalSplitRuntimeRef },
    presentation: { getPinnedSignalIds, collapsedGroupIdsRef, applyCollapsedGroupsRef, forceUpperReprojectRef, reapplySelectionRef: presentation.reapplySelectionRef, lowerCanvasClickRef, timelineRuntimeRef, armArrowPick, snapTransactionCycle, transactionBoundaryX, transactionSourceWindow, refreshPlayhead, refreshRangeSelectionBand, publishStateRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef, selectedAnnotationRef, scenarioDifferencesRef, gridEnabledRef, snapEnabledRef, treeFocusRowIdRef, suppressCanvasClickRef, menuOriginRef, transactionCyclesPerTcRef, groupStylePreviewRef },
    state: { setRuntimeDiagnostics, setProblem, setTreePresentationRevision, setTransactionPresentationRevision, setRangePresentationRevision, setPlayheadPresentationRevision, setTimelineRange, setRangeSelectionActive, setSelectedCycle, setBottomPinned, setPinnedBottomSelection, setPinnedSignalIds, setTreeFilter, setTreeTypeFilter, setTreeAddMenuOpen, setTreeMoreMenuOpen, setContextMenu, setArrowPickStatus, setRenameDialogOpen, setCollapsedGroups, resetCollapsedGroups, resetForDocument, toggleCollapsedGroup, closeContextMenu },
    viewMetricsOwner,
    signalSplitEnabled,
    signalSplitRatio,
    viewMode,
  });
  useViewModeTransition(viewMode, forceUpperReprojectRef, timelineRuntimeRef);
  useOverlayPresentationRefresh({
    refreshPlayhead, refreshRangeSelectionBand, host, selectedCycle, playheadPresentationRevision, rangePresentationRevision,
    timelineRange, rangeSelectionActive, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth, selectedTransactionId,
    selectedLinkedSignals: selectedTransaction?.linkedSignals,
  });

  useActivePaneTracking(viewport, setActivePane, activePane, viewMode);

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
    setFollowSelection: setFollowSelectionWithFreeze,
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
    clearBookmarkSelection,
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
  const setFollowSelectionFromUi = (value: boolean) => {
    setFollowSelectionWithFreeze(value);
    // Bookmark selection is a local Bottom target, not primary selection.
    // Returning to Follow Selection releases that local target.
    if (value) clearBookmarkSelection();
  };
  selectedBookmarkIdRef.current = selectedBookmarkId;
  const bottomBookmark = frozen ? (pinnedBottomSelection!.bookmarkId === undefined ? undefined : bookmarkById.get(pinnedBottomSelection!.bookmarkId)) : (selectedBookmarkId === undefined ? undefined : bookmarkById.get(selectedBookmarkId));
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
    scenario: { model: scenarioModel, activeScenarioId, generateHandshakeScenarios: application.generateHandshakeScenarios }, document: snapshot.document,
    changeSet: lastChangeSet,
    validationDiagnostics,
    validationPending,
    documentEpoch,
    projectionGeneration: application.runtime.session.projectionGeneration(),
    revision: snapshot.revision,
    transactionPresentationRevision,
    history,
    problem,
    diagnostics,
    refs: { host, viewport, menuOriginRef, transactionBoundaryX, transactionSourceWindow, snapTransactionCycle, groupStylePreviewRef },
    command: {
      registry: commandRegistry,
      execute: (command) => commandRegistry.current.execute("semantic.execute", command),
      undo: () => commandRegistry.current.execute("history.undo"),
      redo: () => commandRegistry.current.execute("history.redo"),
      executeBatch,
      nextCommandId,
    },
    selected: { signal: selectedSignal, signalIds: selectedSignalIds, group: selectedGroup, annotation: selectedAnnotation, transaction: selectedTransaction, transactionIds: selectedTransactionIds, bookmark: selectedBookmark, transactionId: selectedTransactionId, transactionPhaseId: selection.state.transactionPhaseId, legendSelected: selection.state.legendSelected },
    bottom: { signal: bottomSignal, group: bottomGroup, annotation: bottomAnnotation, transaction: bottomTransaction, bookmark: bottomBookmark },
    timeline: { range: timelineRange, selectedCycle, collapsedGroupIds, setCollapsedGroups, toggleCollapsedGroup },
    setBottomVisible,
    workspace: { viewMode, setViewMode, activeContext, focusLinkedSignals, setFocusLinkedSignals, bottomTabs: modeComposition.bottomTabs, bottomTab, setBottomTab, selectBottomTab, onBottomTabKeyDown, followSelection, setFollowSelection: setFollowSelectionFromUi, bottomPinned, toggleBottomPin, treeFilter, setTreeFilter, treeTypeFilter, setTreeTypeFilter: (value) => setTreeTypeFilter(value), transactionTreeFilter, setTransactionTreeFilter, transactionTreeFilterMode, setTransactionTreeFilterMode, cyclesPerTc, setCyclesPerTc, setRibbonTab },
    dialog: { treeAddMenuOpen, setTreeAddMenuOpen, treeMoreMenuOpen, setTreeMoreMenuOpen, bulkRegistrationText, setBulkRegistrationText, bulkRegistrationGroupId, setBulkRegistrationGroupId, bulkRegistrationStatus, setBulkRegistrationStatus, setBulkRegistrationVisible, setHierarchyVisible, contextMenu, setContextMenu, closeTreeAddMenu, closeTreeMoreMenu, bottomResetToken, setBottomResetToken, inspectorResetToken, setInspectorResetToken, setInspectorVisible },
    annotationTargetSignalId,
    referenceClockName: referenceClockSignal?.display.name,
    zoom,
    editActions,
    actions,
    setRuntimeDiagnostics,
    navigateProblem,
    ai: { getZoom: timelineNavigation.getZoom, fitAll: timelineNavigation.fitAll, fitSelection: timelineNavigation.fitSelection, fitSourceRange: timelineNavigation.fitSourceRange },
  });
  const capabilities = deriveSelectionCapabilities(snapshot.document, selection.state);
  const { hasSelectedSignal, hasSelectedEntity, hasSelectedClipboard, hasDeletableSelection, canMoveUp, canMoveDown } = capabilities;
  const canRenameSelection = capabilities.canRename;
  const canShowSelection = capabilities.canShow;
  const canHideSelection = capabilities.canHide;
  const selectedSignalsPinned = selectedSignalIds.size > 0 && ((pinned) => [...selectedSignalIds].every((id) => pinned.has(id)))(new Set(pinnedSignalIds));
  const togglePinnedSignals = () => {
    const selected = [...selectedSignalIds];
    if (selected.length === 0) return;
    const current = new Set(pinnedSignalIds);
    if (selected.every((id) => current.has(id))) selected.forEach((id) => current.delete(id));
    else selected.forEach((id) => current.add(id));
    setPinnedSignalIds([...current]);
    timelineRuntimeRef.current?.onViewportScroll();
  };
  const shellRibbon = {
    tabs: <MinimalCycleViewRibbonTabs ribbonTab={ribbonTab} setRibbonTab={setRibbonTab} viewMode={viewMode} activeContext={activeContext} setViewMode={setViewMode} />,
    main: {
      commands: secondarySurfaces.surfaceCommands,
      tab: ribbonTab,
      document: snapshot.document,
      revision: snapshot.revision,
      range: timelineRange,
      history,
      zoom,
      cyclesPerTc,
      onCyclesPerTcChange: setCyclesPerTc,
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
      ...bottomRibbonProps,
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
      problemsCount: diagnostics.filter((item) => item.severity !== "info").length, // migration notices are information, not problems
      problemsPending: validationPending,
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
      selectedTransaction,
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
      onViewIntent: (intent: "fit-all" | "fit-selection" | "open-timeline") => { if (intent === "fit-all") timelineNavigation.fitAll(); else if (intent === "fit-selection") timelineNavigation.fitSelection(); else setRibbonTab("Timeline"); },
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
      onSave: () => { documentLifecycle.saveCurrent(documentFilename(snapshot.document.document.title)); },
      onSaveAs: () => { dialogOriginLabelRef.current = "Save As"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSaveAsVisible(true); },
      onRecent: documentLifecycle.openRecent,
      onProperties: () => { dialogOriginLabelRef.current = "Properties"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPropertiesVisible(true); },
      onExport: () => { dialogOriginLabelRef.current = "Export"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setExportVisible(true); },
      onToggleInspector: () => startTransition(() => setInspectorVisible((value) => !value)),
      onToggleBottom: () => startTransition(() => setBottomVisible((value) => !value)),
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
    view: { documentEpoch, viewMode, signalSplitEnabled, signalSplitRatio, gridEnabled, snapEnabled, rulerEnabled, zoom, cursorPresentationRevision: treePresentationRevision + playheadPresentationRevision, cursor: { ...(cursorA === undefined ? {} : { a: cursorA }), ...(cursorB === undefined ? {} : { b: cursorB }), ...(cursorDelta.cycles === undefined ? {} : { deltaCycles: cursorDelta.cycles }) } },
    layout: { leftPaneWidth, frozenPaneMinWidth, frozenPaneWidth, bottomVisible, bottomHeight, bottomMaxHeight, inspectorVisible, inspectorWidth },
    refs: { viewport, gridLayer, ruler, host, viewportLower, rulerLower, hostLower, gridLayerLower },
    content: { header: secondarySurfaces.workspaceHeader, signalHeader: secondarySurfaces.workspaceSignalHeader, transactionTree: secondarySurfaces.workspaceTransactionTree, viewportContent: secondarySurfaces.workspaceViewportContent, viewportLegend: secondarySurfaces.workspaceViewportLegend, leftRail: secondarySurfaces.workspaceLeftRail, bottom: secondarySurfaces.workspaceBottom, inspector: secondarySurfaces.workspaceInspector },
    interactions: {
      onInspectorKeyDown: resizeInspectorByKeyboard, onInspectorPointerDown: startInspectorResize, onInspectorPointerMove: moveInspectorResize, onInspectorPointerUp: finishInspectorResize,
      onLeftPaneKeyDown: resizeLeftPaneByKeyboard, onLeftPanePointerDown: startLeftPaneResize, onLeftPanePointerMove: moveLeftPaneResize, onLeftPanePointerUp: finishLeftPaneResize,
      onFrozenPaneKeyDown: resizeFrozenPaneByKeyboard, onFrozenPanePointerDown: startFrozenPaneResize, onFrozenPanePointerMove: moveFrozenPaneResize, onFrozenPanePointerUp: finishFrozenPaneResize,
      onBottomReset: resetBottomHeight, onInspectorReset: () => setInspectorWidth(297),
      onBottomKeyDown: resizeBottomByKeyboard, onBottomPointerDown: startBottomResize, onBottomPointerMove: moveBottomResize, onBottomPointerUp: finishBottomResize,
      onSignalSplitKeyDown: resizeSignalSplitByKeyboard, onSignalSplitPointerDown: startSignalSplitResize, onSignalSplitPointerMove: moveSignalSplitResize, onSignalSplitPointerUp: finishSignalSplitResize,
      onViewportKeyDown: onCursorKeyDown,
      onSetCursorAtCycle: (which: "a" | "b", cycle: number) => setCursor(which, cycle),
      resolveCursorCycleAtClientX: (clientX: number, viewportElement: HTMLDivElement, rulerContent?: HTMLDivElement) => {
        return cursorSourceCycleAtClientX(timelineRuntimeRef.current, clientX, viewportElement, rulerContent);
      },
      resolveCursorViewportXForCycle: (cycle: number, viewportElement: HTMLDivElement, rulerContent: HTMLDivElement) => {
        return cursorViewportXForSourceCycle(timelineRuntimeRef.current, snapshot.document, cycle, viewportElement, rulerContent, zoom);
      },
    },
  };
  const shellStatus = {
    toolStatus: arrowPickStatus === "idle" ? (rangeSelectionActive ? (viewMode === "Cycle" ? "Range select active" : "Source range select active") : "Ready · Tool: Select") : `Annotation endpoint pick · ${arrowPickStatus}`,
    selectionStatus: selectedSignalIds.size > 1 ? `${selectedSignalIds.size} signals` : selectedTransactionIds.size > 1 ? `${selectedTransactionIds.size} transactions` : selectedTransaction?.name ?? selectedAnnotation?.label ?? selectedSignal?.display.name ?? selectedGroup?.name ?? "None",
    signalCount: snapshot.document.signals.length,
    annotationCount: snapshot.document.annotations.length,
    rangeStatus: visualReference ? `Time Range: ${snapshot.document.timeline.start} – ${snapshot.document.timeline.end} cycles` : `${viewMode === "Cycle" ? "Range" : "Source range"}: [${timelineRange.start}, ${timelineRange.end})`,
    selectedCycle,
    zoom,
    snapEnabled,
    viewMode,
    statusContext: `Workspace: ${workspacePreset}${bottomPinned || !followSelection ? ` · Bottom: ${bottomPinned ? "Pinned" : "Fixed"} · Target: ${bottomBookmark ? `Bookmark ${bottomBookmark.name}` : bottomTransaction ? `Transaction ${bottomTransaction.name}` : bottomAnnotation ? `Annotation ${bottomAnnotation.label || bottomAnnotation.type}` : bottomSignal ? `Signal ${bottomSignal.display.name}` : bottomGroup ? `Group ${bottomGroup.name}` : "None"}` : ""}${selectedSignal ? ` · Scope: ${selectedSignal.source.instancePath.length > 0 ? selectedSignal.source.instancePath.join("/") : "root"}` : ""}`,
    hideRevisionDetail: visualReference,
    revision: snapshot.revision,
    undoDepth: history.undoDepth,
    redoDepth: history.redoDepth,
    timeAxisStatus: `Time Axis: ${snapshot.document.timeline.referenceClock ? `Clock · ${referenceClockSignal?.display.name ?? snapshot.document.timeline.referenceClock}` : "Time · No Clock Reference"}`,
    dirty: history.dirty,
    problemsCount: diagnostics.filter((item) => item.severity !== "info").length, // migration notices are information, not problems
    problemsPending: validationPending,
    waveDromHasError,
    cursorStatus: cursorStatusReadout(cursorA, cursorB, cursorDelta, snapshot.document.timeline.physicalTimebase),
    // #407: textual counterpart to the CSS border indicator -- only
    // meaningful in Split (Cycle/Transaction each have exactly one pane).
    activePaneStatus: viewMode === "Split" ? `Active Pane: ${activePane === "transaction" ? "Transaction" : "Signal"}` : undefined,
    // Surface Open metrics are already published by the runtime. Read them
    // on demand so the in-app browser can expose measurements without adding
    // another collector or any work to the Open hot path.
    openPerformanceData: () => {
      const surface = host.current;
      if (!surface) return "Cycle surface is not mounted.";
      const fields = ["openReadiness", "openPhaseMarks", "openPhaseDurations", "openWaveBatchMetrics", "sessionCounters"] as const;
      const phaseMarks = JSON.parse(surface.dataset.openPhaseMarks ?? "{}") as Record<string, number>;
      const durations = JSON.parse(surface.dataset.openPhaseDurations ?? "{}") as Record<string, number>;
      const waveMetrics = JSON.parse(surface.dataset.openWaveBatchMetrics ?? "{}") as Record<string, number>;
      const sessionCounters = JSON.parse(surface.dataset.sessionCounters ?? "{}") as { viewMetrics?: { viewportWidth?: number }; mountedWaveOwners?: number };
      const openStart = phaseMarks["open-command-start"] ?? phaseMarks["open-start"] ?? 0;
      const openEnd = performance.now();
      const longTasks = performance.getEntriesByType("longtask").filter((entry) => entry.startTime >= openStart && entry.startTime < openEnd);
      return JSON.stringify({
        ...Object.fromEntries(fields.map((field) => [field, surface.dataset[field] ?? null])),
        openTotalWallMs: durations.idle,
        openOutsideWaveBatchMs: typeof durations.idle === "number" && typeof waveMetrics.batchWallMs === "number" ? Math.max(0, durations.idle - waveMetrics.batchWallMs) : null,
        viewportWidth: sessionCounters.viewMetrics?.viewportWidth ?? null,
        mountedWaveOwners: sessionCounters.mountedWaveOwners ?? null,
        nativeSchedulerYieldAvailable: typeof (globalThis as typeof globalThis & { scheduler?: { yield?: unknown } }).scheduler?.yield === "function",
        longTasks: { count: longTasks.length, maxDurationMs: Math.max(0, ...longTasks.map((entry) => entry.duration)) },
      });
    },
  };
  // Dropping a file anywhere on the window opens it like File > Open. Without this the browser navigates to the dropped file and the unsaved document is lost.
  const openDroppedFileRef = useRef<(file: File) => void>(() => undefined);
  // A drop while a modal (the Unsaved Changes prompt, a dialog) is open is ignored, like Ctrl+O: it must not replace the answer the prompt is waiting for.
  openDroppedFileRef.current = (file) => {
    if (documentLifecycle.pendingAction !== undefined || document.querySelector("[role='dialog'][aria-modal='true']")) return;
    capturePendingFileOrigin();
    void documentLifecycle.readFile(file);
  };
  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onDragOver = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) openDroppedFileRef.current(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("dragover", onDragOver); window.removeEventListener("drop", onDrop); };
  }, []);
  // The browser tab names the document (and marks unsaved changes) so several open editors can be told apart.
  const tabTitle = `${history.dirty ? "* " : ""}${snapshot.document.document.title.replace(/\s+(?:--|—)\s+(?:Cycle|Transaction|Combined)\s+Mode$/i, "").trim() || snapshot.document.document.title.trim() || "Untitled"} - Timing Chart Editor`;
  useEffect(() => { globalThis.document.title = tabTitle; }, [tabTitle]);
  // Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S opens Save As, Ctrl/Cmd+O opens a file -- the browser's own "Save page" / "Open file" must never appear in a document editor.
  const fileShortcutRef = useRef<(key: "s" | "S" | "o") => void>(() => undefined);
  fileShortcutRef.current = (key) => {
    if (key === "s") documentLifecycle.saveCurrent(documentFilename(snapshot.document.document.title));
    else if (key === "S") { dialogOriginLabelRef.current = "Save As"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSaveAsVisible(true); }
    else { pendingFileOriginRef.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null; fileInput.current?.click(); }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      if (key !== "s" && key !== "o") return;
      if (key === "o" && event.shiftKey) return;
      event.preventDefault();
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      fileShortcutRef.current(key === "o" ? "o" : event.shiftKey ? "S" : "s");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return <EditorShellView
    viewModel={{
      style: { "--gui-left-width": `${modeComposition.fixedLeftWidth ?? leftPaneWidth}px`, "--gui-frozen-width": `${frozenPaneWidth}px`, "--gui-bottom-height": `${bottomHeight}px`, "--gui-inspector-width": `${inspectorWidth}px`, "--gui-role-width": `${snapshot.document.layout.roleColumnWidth}px`, "--gui-signal-width": `${snapshot.document.layout.signalNameWidth}px`, "--gui-signal-align": snapshot.document.layout.signalNameAlign, "--gui-signal-split-upper-ratio": String(signalSplitRatio), "--transaction-tree-row-height": viewMode === "Transaction" ? "29px" : undefined } as React.CSSProperties,
      density, workspacePreset, inspectorVisible, bottomVisible, viewMode, rulerEnabled, minimapEnabled, signalTreeVisible,
      showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground,
      focusLinkedSignals: focusLinkedSignals && (selectedTransaction?.linkedSignals?.length ?? 0) > 0,
      layoutOverflow: snapshot.document.layout.overflow, leftPaneWidth, frozenPaneWidth, bottomHeight, inspectorWidth,
      cycleCount: snapshot.document.timeline.cycleCount, signalCount: snapshot.document.signals.length, transactionCount: snapshot.document.transactions.length,
    }}
    titleBar={<MinimalCycleViewTitleBar
      title={snapshot.document.document.title}
      dirty={history.dirty}
      viewMode={viewMode}
      {...(scenarioModel === undefined ? {} : { scenarios: scenarioModel.scenarios.map(({ id, name }) => ({ id, name })), scenarioModel })}
      {...(activeScenarioId === undefined ? {} : { activeScenarioId })}
      onScenarioEnable={() => {
        try { application.replaceScenarioSession(scenarioModelFromV2(snapshot.document), [], true); }
        catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
      }}
      onScenarioChange={(id: ScenarioId) => {
        try { if (application.switchScenario(id)) selection.clear(); }
        catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
      }}
      onScenarioRename={(id, name) => {
        try { application.renameScenario(id, name); }
        catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
      }}
      onScenarioDuplicate={(id) => {
        try { application.duplicateScenario(id); selection.clear(); }
        catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
      }}
      onScenarioDelete={(id) => {
        try { application.deleteScenario(id); selection.clear(); }
        catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
      }}
      onScenarioComparisonChange={publishScenarioDifferences}
      onRevealScenarioDifference={(signalId, sourceRange) => {
        if (!snapshot.document.signals.some((signal) => signal.id === signalId)) return;
        const start = Math.max(0, sourceRange.start);
        const end = Math.min(snapshot.document.timeline.cycleCount, sourceRange.end);
        if (end <= start) return;
        selection.selectSignal(signalId);
        setRangeSelectionActive(true);
        setTimelineRange({ start, end });
        timelineRuntimeRef.current?.navigateToCycle(start);
      }}
    />}
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
    <ContextMenuPanel contextMenu={contextMenu} hasSelectedClipboard={hasSelectedClipboard} clipboardAvailable={clipboardAvailable} hasSelectedEntity={hasSelectedEntity} hasSelectedSignal={hasSelectedSignal} hasDeletableSelection={hasDeletableSelection} canRenameSelection={canRenameSelection} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canShowSelection={canShowSelection} canHideSelection={canHideSelection} signalPinned={selectedSignalsPinned} togglePinnedSignals={togglePinnedSignals} copySelectedSignal={copySelectedSignal} cutSelectedSignal={cutSelectedSignal} pasteSelectedEntity={pasteSelectedEntity} duplicateSelectedEntity={duplicateSelectedEntity} moveSelection={moveSelection} setSelectionVisibility={setSelectionVisibility} renameSelection={renameSelection} closeContextMenu={closeContextMenu} deleteSelection={() => commandRegistry.current.execute("selection.delete")} addBookmarkAtCycle={addBookmarkAtCycle} transactionGroups={snapshot.document.transactionGroups} selectedTransactionGroupId={selectedTransaction?.groupId} moveSelectedTransactionToGroup={(groupId: TransactionGroup["id"] | undefined) => secondarySurfaces.surfaceCommands.moveTransactionToGroup(selectedTransactionId!, groupId)} />
    {renameDialogOpen && <RenameDialog dialogRef={renameDialogRef} draft={renameDraft} onDraftChange={(value) => { setRenameDraft(value); setRenameError(""); }} error={renameError} onApply={applyRename} onClose={() => setRenameDialogOpen(false)} />}
    {hierarchyVisible && <HardwareHierarchyBrowser document={snapshot.document} selectedSignalId={selectedSignal?.id} onSelect={selectHierarchySignal} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setHierarchyVisible(false))} />}
    {propertiesVisible && <DocumentProperties document={snapshot.document} viewport={viewport} commands={secondarySurfaces.surfaceCommands} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setPropertiesVisible(false))} />}
    {bulkRegistrationVisible && <BulkRegistrationDialog dialogRef={bulkRegistrationDialogRef} groups={snapshot.document.signalGroups} text={bulkRegistrationText} onTextChange={(value) => { setBulkRegistrationText(value); setBulkRegistrationPreview(undefined); setBulkRegistrationStatus(""); }} groupId={bulkRegistrationGroupId} onGroupIdChange={setBulkRegistrationGroupId} status={bulkRegistrationStatus} preview={bulkRegistrationPreview} onPreview={previewBulkSignals} onSelectionChange={(selectedPaths) => setBulkRegistrationPreview((current) => current ? { ...current, selectedPaths } : current)} onApply={registerBulkSignals} onClose={() => closeDialog(() => { setBulkRegistrationVisible(false); setBulkRegistrationPreview(undefined); })} />}
    {exportVisible && <ExportDialog snapshot={snapshot} range={timelineRange} controller={exportController} restoreFocusRef={dialogOriginRef} onDiagnostic={(next) => setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("export-failure:")), ...(next ? [next] : [])])} onClose={() => closeDialog(() => setExportVisible(false))} />}
     {saveAsVisible && <SaveAsDialog defaultName={snapshot.document.document.title || "timing-chart"} restoreFocusRef={dialogOriginRef} onSave={(name) => { const saved = documentLifecycle.saveAs(name); if (saved) closeDialog(() => setSaveAsVisible(false)); return saved; }} onClose={() => closeDialog(() => setSaveAsVisible(false))} />}
    </EditorDialogLayer>}
    status={shellStatus}
    feedback={<OperationFeedback error={problem} message={application.operationMessage} operationLabel={runtimeDiagnostics.find((item) => problem.includes(item.message))?.operationLabel} onShowProblems={() => { setBottomTab("Problems"); setBottomVisible(true); }} />}
  />;
}
