import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { type Point, type SnapKind } from "@timing-chart-v2/geometry";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, type HardwareHierarchyView } from "@timing-chart-v2/projection";
import { type AnnotationOverlayPrimitive } from "@timing-chart-v2/renderer";
import { scanJsonSyntax, serializeCanonicalDocument } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor, quickValueLiteral, quickValueOptions, type Annotation, type AnnotationId, type AnnotationType, type Bookmark, type BookmarkId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type EdgeCounterSettings, type GroupId, type LegendEntry, type SemanticAnchor, type Signal, type SignalId, type SignalRole, type TimeGroupId, type Transaction, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
import { resolveProblemTarget } from "@timing-chart-v2/ui";
import { ViewMetricsOwner } from "./runtime/view-metrics.js";
import { buildViewportWindow } from "./runtime/viewport-window.js";
import { createEdgeCounterProjectionMetrics, projectEdgeCounters } from "./runtime/edge-counter-projection.js";
import { referenceSvgScreenScale } from "./runtime/screen-scale.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "./design-system.js";
import { ContextMenuSurface } from "./context-menu-surface.js";
import { TransactionLinkedSignals } from "./transaction-linked-signals.js";
import { ExportDialog } from "./export-dialog.js";
import { ReviewWorkflow } from "./review-workflow.js";
import { ProblemsPanel } from "./problems-panel.js";
import { problemMatchesFilter } from "./problem-filter.js";
import { JsonPanel } from "./json-panel.js";
import { replaceSelectedJsonObject } from "./json-selection.js";
import { selectedJsonProblem } from "./json-problems.js";
import { downloadText } from "./download-text.js";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { createAnnotation } from "./create-annotation.js";
import { AnnotationToolbar } from "./annotation-toolbar.js";
import { renderGeometryGrid } from "./render-geometry-grid.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { InspectorSection } from "./inspector-section.js";
import { MiniMap } from "./minimap.js";
import { MinimalCycleViewPanels, InspectorPanel, ContextMenuPanel, MinimalCycleViewTitleBar, RenameDialog, BulkRegistrationDialog, SignalTreeColumnHeader, BottomEditorPanel, EditorStatusBar } from "./minimal-cycle-view-panels.js";
import { MinimalCycleViewRibbonTabs, refreshTreeCollapsedMetadata, refreshTreeFilterPresentation, refreshTreeRovingFocus } from "./minimal-cycle-view-ui.js";
import { cycleDocument, v1ReferenceDocument } from "./fixtures-cycle-reference-documents.js";
import { signalId } from "./minimal-cycle-view-fixture-helpers.js";
import { defaultEventValue, EventRow, QuickValues } from "./event-table-components.js";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { AnnotationList } from "./annotation-list.js";
import { CommentRowEditor } from "./comment-row-editor.js";
import { LegendView } from "./legend-view.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { InsertSemanticIcon, type InsertSemanticIconKind } from "./insert-semantic-icon.js";
import { EditorIcon, EditorIconButton, type EditorIconName } from "./editor-icon.js";
import { HardwareHierarchyBrowser } from "./hardware-hierarchy-browser.js";
import { InlineNameInput } from "./inline-name-input.js";
import { SaveAsDialog } from "./save-as-dialog.js";
import { ProblemsPanelLegacy } from "./problems-panel-legacy.js";
import { EventTable } from "./event-table.js";
import { ClockGeneratorEditor } from "./clock-generator-editor.js";
import { DocumentProperties } from "./document-properties.js";
import { TimelineToolbar, type SignalEditorProps } from "./timeline-toolbar.js";
import { LayoutInspector } from "./layout-inspector.js";
import { AnnotationEditor } from "./annotation-editor.js";
import { AdvancedJsonPanel } from "./advanced-json-panel.js";
import { SignalEditor } from "./signal-editor.js";
import { InspectorAnnotationEditor } from "./inspector-annotation-editor.js";
import { InspectorSignalRouter } from "./inspector-signal-router.js";
import { InspectorClockEditor } from "./inspector-clock-editor.js";
import { Ribbon } from "./minimal-cycle-view-ribbon.js";
import { styleNumber, styleString } from "./inspector-style.js";
import { useEditorApplicationOwner } from "./application/use-editor-application-owner.js";
import { useEditorCommandRouter } from "./application/use-editor-command-router.js";
import { useEditorActions } from "./application/use-editor-actions.js";
import { useEditorPresentationState } from "./application/use-editor-presentation-state.js";
import { useEditorResizeActions } from "./application/use-editor-resize-actions.js";
import { useEditorWorkspaceActions } from "./application/use-editor-workspace-actions.js";
import { useEditorAiAssistantModel } from "./application/use-editor-ai-assistant-model.js";
import { EditorShellView } from "./editor-shell-view.js";
import { useDocumentLifecycle } from "./application/use-document-lifecycle.js";
import { deriveSelectionCapabilities, useSelectionOwner } from "./application/use-selection-owner.js";
import { useClipboardActions } from "./application/use-clipboard-actions.js";
import { useTimelineNavigationOwner } from "./runtime/use-timeline-navigation-owner.js";
import type { SelectedClockEdge } from "./runtime/edge-counter-projection.js";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH, useWorkspaceUiState, type TreeTypeFilter, type WorkspacePreset } from "./workspace/use-workspace-ui-state.js";
import { useDialogMenuState } from "./workspace/use-dialog-menu-state.js";
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { TransactionEditor } from "./transaction-editor.js";
import { useTimelineSurfaceRuntime } from "./runtime/use-timeline-surface-runtime.js";
import { BookmarkEditor } from "./bookmark-editor.js";
import type { TimelineViewportRuntime } from "./runtime/timeline-viewport-runtime.js";
import { applyRendererHostSizing, attachDialogOriginCapture, attachDirtyUnloadGuard, attachMenuKeyboardNavigation, refreshAnnotationPreview, refreshClockPreview, refreshGroupStylePreview, refreshRendererOverlays, refreshRulerRangeSelection, refreshTransactionLinkedRows, scheduleDialogFocusRestore, trapDialogTab } from "./runtime/use-editor-runtime-bridge.js";

export function MinimalCycleView() {
  const visualReference = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("visual-reference");
  const initialDocument = visualReference ? v1ReferenceDocument : cycleDocument;
  const application = useEditorApplicationOwner(initialDocument);
  const documentLifecycle = useDocumentLifecycle({ application, productTemplate: cycleDocument, persistText: downloadText });
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
  // geometry/projection pipeline, owned by the effect below (keyed on
  // signalSplitEnabled) and consumed by the primary mount effect's document-
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
  const snapTransactionCycle = useRef<(clientX: number) => number | undefined>(() => undefined);
  const transactionBoundaryX = useRef<(cycle: number) => number | undefined>(() => undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useSelectionOwner(visualReference ? signalId("sig_cycle_clock") : undefined);
  const editActions = useClipboardActions({ application, selection });
  const timelineNavigation = useTimelineNavigationOwner();
  const { signalId: selectedId, signalIds: selectedSignalIds, groupId: selectedGroupId, annotationId: selectedAnnotationId, transactionId: selectedTransactionId } = selection.state;
  const { signalId: selectedSignalRef, signalIds: selectedSignalIdsRef, groupId: selectedGroupRef, spacerId: selectedSpacerRef, annotationId: selectedAnnotationRef, transactionId: selectedTransactionRef } = selection.refs;
  useEffect(() => {
    return attachDirtyUnloadGuard(history.dirty);
  }, [history.dirty]);
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
  const zoom = timelineNavigation.zoom;
  const workspace = useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId>();
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
    treeFilter, setTreeFilter,
    treeTypeFilter, setTreeTypeFilter,
    followSelection, setFollowSelection, followSelectionRef,
    bottomPinned, setBottomPinned, bottomPinnedRef,
    pinnedBottomSelection, setPinnedBottomSelection,
  } = workspace;
  const bottomTabs: readonly ("Signal" | "Annotation" | "Transaction" | "Bookmarks" | "AI" | "Problems" | "JSON")[] = viewMode === "Cycle"
    ? ["Signal", "Annotation", "Bookmarks", "AI", "Problems", "JSON"]
    : viewMode === "Transaction"
      ? ["Transaction", "Annotation", "Bookmarks", "AI", "Problems", "JSON"]
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
      if (kind === "annotation") setBottomTab("Annotation");
      else if (kind === "transaction") setBottomTab("Transaction");
      else if (kind === "signal" || kind === "spacer") setBottomTab("Signal");
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
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<GroupId>>(new Set());
  const [treePresentationRevision, setTreePresentationRevision] = useState(0);
  const [playheadPresentationRevision, setPlayheadPresentationRevision] = useState(0);
  const [transactionPresentationRevision, setTransactionPresentationRevision] = useState(0);
  const [rangePresentationRevision, setRangePresentationRevision] = useState(0);
  const collapsedGroupIdsRef = useRef<ReadonlySet<GroupId>>(new Set());
  const applyCollapsedGroupsRef = useRef<(ids: ReadonlySet<GroupId>) => void>(() => undefined);
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
    if (contextMenu === undefined && !treeAddMenuOpen && !treeMoreMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest(".context-menu, .tree-add-menu, .tree-header-menu, .tree-add-button, .tree-more-button")) return;
      const canvasOutside = target !== undefined && target.closest("[data-testid='cycle-viewport'], [data-role='timing-chart-surface'], [data-testid='cycle-ruler']") !== null
        && target?.closest("[data-row-id], [data-annotation-id], [data-transaction-id]") === null;
      suppressCanvasClickRef.current = canvasOutside;
      setContextMenu(undefined);
      setTreeAddMenuOpen(false);
      setTreeMoreMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [contextMenu, treeAddMenuOpen, treeMoreMenuOpen]);
  useEffect(() => {
    return attachDialogOriginCapture(document, dialogOriginRef, dialogOriginLabelRef, menuOriginRef);
  }, []);
  useLayoutEffect(() => {
    if (propertiesVisible || exportVisible || saveAsVisible || hierarchyVisible || bulkRegistrationVisible) return undefined;
    return scheduleDialogFocusRestore(document, dialogOriginRef, dialogOriginLabelRef);
  }, [bulkRegistrationVisible, exportVisible, hierarchyVisible, propertiesVisible, saveAsVisible]);
  useEffect(() => {
    const onDialogKeyDown = (event: KeyboardEvent) => {
      if (trapDialogTab(document, event)) return;
      if (event.key !== "Escape") return;
      if (contextMenu || treeAddMenuOpen || treeMoreMenuOpen) return;
      if (compatibilityPreview) { event.preventDefault(); documentLifecycle.closeCompatibility(); restorePendingFileFocus(); return; }
      if (pendingFileAction) { event.preventDefault(); cancelPendingFileAction(); return; }
      if (bulkRegistrationVisible) { event.preventDefault(); closeDialog(() => { setBulkRegistrationVisible(false); setBulkRegistrationPreview(undefined); }); return; }
      if (hierarchyVisible) { event.preventDefault(); closeDialog(() => setHierarchyVisible(false)); return; }
      if (propertiesVisible) { event.preventDefault(); closeDialog(() => setPropertiesVisible(false)); return; }
      if (exportVisible) { event.preventDefault(); closeDialog(() => setExportVisible(false)); return; }
      if (saveAsVisible) { event.preventDefault(); closeDialog(() => setSaveAsVisible(false)); }
    };
    document.addEventListener("keydown", onDialogKeyDown, true);
    return () => document.removeEventListener("keydown", onDialogKeyDown, true);
  }, [bulkRegistrationVisible, closeDialog, compatibilityPreview, contextMenu, exportVisible, hierarchyVisible, pendingFileAction, propertiesVisible, saveAsVisible, treeAddMenuOpen, treeMoreMenuOpen]);
  useEffect(() => {
    const selector = contextMenu ? ".context-menu" : treeAddMenuOpen ? ".tree-add-menu" : treeMoreMenuOpen ? ".tree-header-menu" : undefined;
    const menu = selector ? document.querySelector<HTMLElement>(selector) : undefined;
    menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return attachMenuKeyboardNavigation(document, closeContextMenu, closeTreeAddMenu, closeTreeMoreMenu);
  }, [contextMenu, treeAddMenuOpen, treeMoreMenuOpen]);
  useDialogFocusLoop(renameDialogRef, renameDialogOriginRef, renameDialogOpen);
  useDialogFocusLoop(bulkRegistrationDialogRef, dialogOriginRef, bulkRegistrationVisible);
  useDialogFocusLoop(unsavedFileDialogRef, pendingFileOriginRef, pendingFileAction !== undefined);
  useDialogFocusLoop(compatibilityDialogRef, pendingFileOriginRef, compatibilityPreview !== undefined);
  const clipboardStatus = editActions.status;
  const clipboardAvailable = editActions.available;
  const [timelineRange, setTimelineRange] = useState(() => visualReference ? { start: 0, end: 1 } : { start: 2, end: 4 });
  const [rangeSelectionActive, setRangeSelectionActive] = useState(false);
  const rangeSelectionActiveRef = useRef(false);
  rangeSelectionActiveRef.current = rangeSelectionActive;
  const [selectedCycle, setSelectedCycle] = useState(() => visualReference ? 0 : 2);
  const selectedCycleRef = useRef(selectedCycle);
  selectedCycleRef.current = selectedCycle;
  const selectedEdgeRef = useRef<SelectedClockEdge | undefined>(undefined);
  const refreshPlayhead = useRef<() => void>(() => undefined);
  const refreshRangeSelectionBand = useRef<() => void>(() => undefined);
  // #175: lets an outside action (Refresh Checks) that only changes React
  // state -- never a document/scroll/zoom event the mount effect already
  // republishes on -- still refresh the DOM `data-session-counters`
  // snapshot immediately, so `validatorInvocations` is observable right
  // after the click that incremented it rather than only at the next
  // unrelated render/publish.
  const publishStateRef = useRef<() => void>(() => undefined);
  const timelineRangeRef = useRef(timelineRange);
  timelineRangeRef.current = timelineRange;
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
  const annotationTargetSignalId = useMemo(() => {
    if (selectedSignal && selectedSignal.type !== "commentRow") return selectedSignal.id;
    if (referenceClockSignal && referenceClockSignal.type !== "commentRow") return referenceClockSignal.id;
    return firstNonCommentSignal?.id;
  }, [firstNonCommentSignal, referenceClockSignal, selectedSignal]);
  const selectedGroup = selectedGroupId === undefined ? undefined : groupById.get(selectedGroupId);
  const selectedSpacer = selectedSpacerRef.current === undefined ? undefined : selectedGroup?.spacers?.find((spacer) => spacer.id === selectedSpacerRef.current);
  const selectedAnnotation = selectedAnnotationId === undefined ? undefined : annotationById.get(selectedAnnotationId);
  const selectedTransaction = selectedTransactionId === undefined ? undefined : transactionById.get(selectedTransactionId);
  const bottomSignal = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.signalId === undefined ? undefined : signalById.get(pinnedBottomSelection.signalId)) : selectedSignal;
  const bottomGroup = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.groupId === undefined ? undefined : groupById.get(pinnedBottomSelection.groupId)) : selectedGroup;
  const bottomAnnotation = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.annotationId === undefined ? undefined : annotationById.get(pinnedBottomSelection.annotationId)) : selectedAnnotation;
  const bottomTransaction = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.transactionId === undefined ? undefined : transactionById.get(pinnedBottomSelection.transactionId)) : selectedTransaction;
  useEffect(() => {
    if (!bottomPinned || !pinnedBottomSelection) return;
    const targetExists = (pinnedBottomSelection.signalId === undefined || snapshot.document.signals.some((item) => item.id === pinnedBottomSelection.signalId))
      && (pinnedBottomSelection.groupId === undefined || snapshot.document.signalGroups.some((item) => item.id === pinnedBottomSelection.groupId))
      && (pinnedBottomSelection.annotationId === undefined || snapshot.document.annotations.some((item) => item.id === pinnedBottomSelection.annotationId))
      && (pinnedBottomSelection.transactionId === undefined || snapshot.document.transactions.some((item) => item.id === pinnedBottomSelection.transactionId));
    if (!targetExists) {
      setBottomPinned(false);
      setPinnedBottomSelection(undefined);
    }
  }, [bottomPinned, pinnedBottomSelection, snapshot.revision]);
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
  const setCollapsedGroups = (next: ReadonlySet<GroupId>) => {
    const stable = new Set(next);
    collapsedGroupIdsRef.current = stable;
    setCollapsedGroupIds(stable);
    applyCollapsedGroupsRef.current(stable);
  };
  const toggleCollapsedGroup = (id: GroupId) => {
    const next = new Set(collapsedGroupIdsRef.current);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsedGroups(next);
  };
  const commandRouter = useEditorCommandRouter({ application, selection, editActions, selectAllRef });
  const commandRegistry = commandRouter.commandRegistry;
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
    dom: { host, viewport, ruler, gridLayer, viewportLower, rulerLower, hostLower, gridLayerLower, signalSplitRuntimeRef },
    presentation: { collapsedGroupIdsRef, applyCollapsedGroupsRef, forceUpperReprojectRef, lowerCanvasClickRef, timelineRuntimeRef, armArrowPick, snapTransactionCycle, transactionBoundaryX, refreshPlayhead, refreshRangeSelectionBand, publishStateRef, timelineRangeRef, rangeSelectionActiveRef, selectedCycleRef, selectedEdgeRef, selectedAnnotationRef, gridEnabledRef, snapEnabledRef, treeFocusRowIdRef, suppressCanvasClickRef, menuOriginRef },
    state: { setRuntimeDiagnostics, setProblem, setTreePresentationRevision, setTransactionPresentationRevision, setRangePresentationRevision, setPlayheadPresentationRevision, setTimelineRange, setRangeSelectionActive, setSelectedCycle, setBottomPinned, setPinnedBottomSelection, setTreeFilter, setTreeTypeFilter, setTreeAddMenuOpen, setTreeMoreMenuOpen, setContextMenu, setArrowPickStatus, setRenameDialogOpen, setCollapsedGroups, toggleCollapsedGroup, closeContextMenu },
    viewMetricsOwner,
    signalSplitEnabled,
    signalSplitRatio,
  });
  useEffect(() => {
    refreshPlayhead.current();
  }, [selectedCycle, playheadPresentationRevision, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth]);
  useEffect(() => {
    refreshRangeSelectionBand.current();
  }, [rangePresentationRevision, timelineRange, rangeSelectionActive, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth]);

  useEffect(() => {
    refreshTransactionLinkedRows(host, new Set(selectedTransaction?.linkedSignals ?? []));
  }, [selectedTransactionId, transactionPresentationRevision]);

  const actions = useEditorActions({
    document: snapshot.document,
    commandRegistry,
    navigation: timelineNavigation,
    rulerRef: ruler,
    setBottomTab,
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
    menuOriginRef,
    renameDialogOriginRef,
    setRenameDraft,
    setRenameError,
    setRenameDialogOpen,
    renameDraft,
    bottomPinned,
    setBottomPinned,
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
    renameSelection,
    applyRename,
    toggleBottomPin,
    selectHierarchySignal,
    revealSelectedInHierarchy,
    createSignalGroup,
    addTreeEntity,
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
  const signalEditor = <SignalEditor
    key={`${bottomSignal?.id ?? "none"}:${snapshot.revision}:${bottomResetToken}`}
    signal={bottomSignal}
    cycleCount={snapshot.document.timeline.cycleCount}
    bookmarks={snapshot.document.bookmarks}
    history={history}
    groups={snapshot.document.signalGroups}
    problem={problem}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onVisibility={editActions.setSignalVisibility}
    onDelete={deleteBottomSignal}
    onDuplicate={(signalId) => {
      const source = snapshot.document.signals.find((item) => item.id === signalId);
      const group = source === undefined ? undefined : snapshot.document.signalGroups.find((candidate) => candidate.rows.includes(signalId));
      if (source && group) createCopiedSignals([{ signal: source, groupId: group.id, index: group.rows.indexOf(signalId) }], "duplicate", "source-group");
    }}
    onCancel={() => setBottomResetToken((value) => value + 1)}
    onDropToGroup={(kind, id, targetGroupId) => {
      const document = snapshot.document;
      const targetGroup = document.signalGroups.find((group) => group.id === targetGroupId);
      if (!targetGroup) return;
      if (kind === "signal") {
        const sourceGroup = document.signalGroups.find((group) => group.rows.includes(id as SignalId));
        let index = targetGroup.rows.length;
        if (sourceGroup?.id === targetGroup.id) index = Math.max(0, index - 1);
        commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("drop_group_target"), type: "signal.move", signalId: id as SignalId, targetGroupId, index });
        return;
      }
      const sourceIndex = document.signalGroups.findIndex((group) => group.id === id);
      const targetIndex = document.signalGroups.findIndex((group) => group.id === targetGroupId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
      commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("drop_group_target"), type: "group.move", groupId: id as GroupId, index: sourceIndex < targetIndex ? targetIndex - 1 : targetIndex });
    }}
    onClockPreview={(draft) => { const currentHost = host.current; if (currentHost && bottomSignal?.type === "clock") refreshClockPreview(currentHost, bottomSignal, draft, snapshot.document.timeline.cycleCount); }}
  />;
  const annotationEditor = bottomAnnotation ? <AnnotationEditor
    key={`${bottomAnnotation.id}:${snapshot.revision}:${bottomResetToken}`}
    annotation={bottomAnnotation}
    annotations={snapshot.document.annotations}
    document={snapshot.document}
    history={history}
    problem={problem}
    onSelect={selectAnnotation}
    onCreate={(type) => { if (annotationTargetSignalId) createSelectedAnnotation(createAnnotation(type, annotationTargetSignalId, timelineRange, snapshot.document)); }}
    onDuplicate={duplicateAnnotation}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={deleteBottomAnnotation}
    onCancel={() => setBottomResetToken((value) => value + 1)}
    onPreview={(draft) => refreshAnnotationPreview(host.current!, bottomAnnotation.id, draft, { label: bottomAnnotation.label, color: bottomAnnotation.color, opacity: bottomAnnotation.opacity })}
  /> : <><AnnotationList annotations={snapshot.document.annotations} selectedId={undefined} onSelect={selectAnnotation} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} /><div className="empty-editor">Select or create an Annotation.</div></>;
  const openTransactionContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    menuOriginRef.current = event.currentTarget;
    setContextMenu({ x: event.clientX, y: event.clientY, target: "transaction" });
  };
  const transactionEditor = <TransactionEditor
    key={`${bottomTransaction?.id ?? "none"}:${snapshot.revision}:${bottomResetToken}`}
    transaction={bottomTransaction}
    document={snapshot.document}
    history={history}
    onSelect={selectTransaction}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={deleteBottomTransaction}
    onCancel={() => setBottomResetToken((value) => value + 1)}
  />;
  // #422: the one Bookmark-navigation dispatch owner -- shared verbatim by
  // the Timeline Ribbon's Previous/Next and the Bottom Bookmarks panel's
  // Previous/Next, so neither surface can drift into a second navigation
  // command path (both still resolve *which* Bookmark is adjacent via the
  // shared runtime/bookmark-navigation.js `findAdjacentBookmark`).
  const bookmarkEditor = <BookmarkEditor
    key={`${selectedBookmark?.id ?? "none"}:${snapshot.revision}:${bottomResetToken}`}
    bookmark={selectedBookmark}
    document={snapshot.document}
    history={history}
    range={timelineRange}
    onSelect={selectBookmark}
    onReveal={revealBookmark}
    onNavigateBookmark={navigateToBookmark}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={deleteBottomBookmark}
    onCancel={() => setBottomResetToken((value) => value + 1)}
  />;
  const { aiBridgeStatus, ...aiAssistantPanel } = useEditorAiAssistantModel({
    document: snapshot.document,
    revision: snapshot.revision,
    selectedSignalId: annotationTargetSignalId,
    selectedGroupId: selectedGroup?.id,
    selectedAnnotationId: selectedAnnotation?.id,
    selectedTransactionId,
    range: timelineRange,
    onCommand: (command) => commandRegistry.current.execute("semantic.execute", command),
    onCommandBatch: (commands) => application.executeBatch(nextCommandId("ribbon_annotation_arrange"), commands),
    getZoom: timelineNavigation.getZoom,
    onFitAll: timelineNavigation.fitAll,
    onOpenTimeline: () => setRibbonTab("Timeline"),
    setRuntimeDiagnostics,
  });
  const capabilities = deriveSelectionCapabilities(snapshot.document, selection.state);
  const { hasSelectedSignal, hasSelectedEntity, hasSelectedClipboard, hasDeletableSelection, canMoveUp, canMoveDown } = capabilities;
  const canRenameSelection = capabilities.canRename;
  const canShowSelection = capabilities.canShow;
  const canHideSelection = capabilities.canHide;
  return <EditorShellView
    style={{ "--gui-left-width": `${leftPaneWidth}px`, "--gui-frozen-width": `${frozenPaneWidth}px`, "--gui-bottom-height": `${bottomHeight}px`, "--gui-inspector-width": `${inspectorWidth}px`, "--gui-role-width": `${snapshot.document.layout.roleColumnWidth}px`, "--gui-signal-width": `${snapshot.document.layout.signalNameWidth}px`, "--gui-signal-align": snapshot.document.layout.signalNameAlign, "--gui-signal-split-upper-ratio": String(signalSplitRatio) } as React.CSSProperties}
    density={density} workspacePreset={workspacePreset} inspectorVisible={inspectorVisible} bottomVisible={bottomVisible} rulerEnabled={rulerEnabled} minimapEnabled={minimapEnabled} signalTreeVisible={signalTreeVisible}
    showSignalNames={showSignalNames} showRoles={showRoles} showAnnotations={showAnnotations} showTransactions={showTransactions} showGroupBackground={showGroupBackground}
    layoutOverflow={snapshot.document.layout.overflow} leftPaneWidth={leftPaneWidth} frozenPaneWidth={frozenPaneWidth} bottomHeight={bottomHeight} inspectorWidth={inspectorWidth}
    cycleCount={snapshot.document.timeline.cycleCount} signalCount={snapshot.document.signals.length} transactionCount={snapshot.document.transactions.length}
    titleBar={<MinimalCycleViewTitleBar title={snapshot.document.document.title} dirty={history.dirty} viewMode={viewMode} />} ribbon={<MinimalCycleViewRibbonTabs ribbonTab={ribbonTab} setRibbonTab={setRibbonTab} viewMode={viewMode} setViewMode={setViewMode} bottomTab={bottomTab} setBottomTab={setBottomTab} />}
  >
    <Ribbon
      tab={ribbonTab}
      document={snapshot.document}
      revision={snapshot.revision}
      range={timelineRange}
      history={history}
      zoom={zoom}
      gridEnabled={gridEnabled}
      snapEnabled={snapEnabled}
      rulerEnabled={rulerEnabled}
      minimapEnabled={minimapEnabled}
      signalSplitEnabled={signalSplitEnabled}
      onToggleSignalSplit={() => setSignalSplitEnabled((value) => !value)}
      showSignalNames={showSignalNames}
      showRoles={showRoles}
      showAnnotations={showAnnotations}
      showTransactions={showTransactions}
      showGroupBackground={showGroupBackground}
       signalTreeVisible={signalTreeVisible}
       inspectorVisible={inspectorVisible}
       bottomVisible={bottomVisible}
      arrowPickStatus={arrowPickStatus}
      selectedSignalId={annotationTargetSignalId}
      selectedInsertionSignalId={selectedSignal?.id}
      selectedGroupId={selectedGroup?.id}
      selectedAnnotation={selectedAnnotation}
      selectedAnnotationIds={selection.state.annotationIds}
      selectedCommentRow={selectedSignal?.type === "commentRow" ? selectedSignal : undefined}
      onSignalCreated={selection.selectSignal}
      onGroupCreated={selection.selectGroup}
      onSpacerCreated={selection.selectSpacer}
      onTransactionCreated={selection.selectTransaction}
      problemsCount={diagnostics.length}
      diagnostics={diagnostics}
      onNavigateProblem={navigateProblem}
      onRefreshChecks={() => { application.validateDocument(snapshot.document); publishStateRef.current(); }}
      onDiagnostic={(next) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("ai-proposal:")), ...nextDiagnostics]); }}
       viewMode={viewMode}
       activeContext={activeContext}
       density={density}
       workspacePreset={workspacePreset}
       onDensityChange={setDensity}
       onWorkspacePresetChange={applyWorkspacePreset}
       onResetLayout={resetWorkspaceLayout}
      selectedTransactionId={selectedTransactionId}
      clipboardStatus={clipboardStatus}
      clipboardAvailable={clipboardAvailable}
      hasSelectedSignal={hasSelectedSignal}
      hasSelectedClipboard={hasSelectedClipboard}
      hasSelectedEntity={hasSelectedEntity}
      hasDeletableSelection={hasDeletableSelection}
      canRenameSelection={canRenameSelection}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      canShowSelection={canShowSelection}
      canHideSelection={canHideSelection}
      onCopy={copySelectedSignal}
      onCut={cutSelectedSignal}
      onPaste={pasteSelectedEntity}
      onDuplicate={duplicateSelectedEntity}
      onRename={renameSelection}
      onClearSelection={clearSelection}
      onSelectAll={selectAllSignals}
      onMoveUp={() => moveSelection(-1)}
      onMoveDown={() => moveSelection(1)}
      onVisibility={setSelectionVisibility}
      onRange={(range) => { setRangeSelectionActive(true); setTimelineRange(range); }}
      onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
      onCommandBatch={(commands) => application.executeBatch(nextCommandId("ribbon_annotation_arrange"), commands)}
      onViewIntent={(intent) => { if (intent === "fit-all") timelineNavigation.fitAll(); else setRibbonTab("Timeline"); }}
      onCreateAnnotation={createSelectedAnnotation}
      onArrowPick={(annotationType) => armArrowPick.current(annotationType)}
      onZoom={timelineNavigation.zoomBy}
      onFitSelection={timelineNavigation.fitSelection}
      onNavigateBookmark={navigateToBookmark}
      onFitAll={timelineNavigation.fitAll}
      onSetZoom={timelineNavigation.setZoom}
      onToggleGrid={() => setGridEnabled((value) => !value)}
      onToggleSnap={() => setSnapEnabled((value) => !value)}
      onToggleRuler={() => setRulerEnabled((value) => !value)}
      onToggleMinimap={() => setMinimapEnabled((value) => !value)}
      onToggleSignalNames={() => setShowSignalNames((value) => !value)}
      onToggleRoles={() => setShowRoles((value) => !value)}
      onToggleAnnotations={() => setShowAnnotations((value) => !value)}
      onToggleTransactions={() => setShowTransactions((value) => !value)}
      onToggleGroupBackground={() => setShowGroupBackground((value) => !value)}
      onToggleSignalTree={() => setSignalTreeVisible((value) => !value)}
      onUndo={() => commandRegistry.current.execute("history.undo")}
      onRedo={() => commandRegistry.current.execute("history.redo")}
      onDelete={() => commandRegistry.current.execute("selection.delete")}
       onNew={requestNewDocument}
       onOpen={() => { pendingFileOriginRef.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null; fileInput.current?.click(); }}
      onSave={() => { documentLifecycle.save(`${snapshot.document.document.title || "timing-chart"}.tcd`); }}
      onSaveAs={() => { dialogOriginLabelRef.current = "Save As"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSaveAsVisible(true); }}
      onRecent={documentLifecycle.openRecent}
      onProperties={() => { dialogOriginLabelRef.current = "Properties"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPropertiesVisible(true); }}
      onExport={() => { dialogOriginLabelRef.current = "Export"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setExportVisible(true); }}
      onToggleInspector={() => startTransition(() => setInspectorVisible((value) => !value))}
      onToggleBottom={() => startTransition(() => setBottomVisible((value) => !value))}
      bottomHeight={bottomHeight}
      onSetBottomSize={(size) => { if (size === "hidden") { setBottomVisible(false); return; } setBottomVisible(true); setBottomHeight(size === "compact" ? 180 : 420); }}
      onShowProblems={() => { setBottomTab("Problems"); setBottomVisible(true); }}
      onOpenTimeline={() => setRibbonTab("Timeline")}
      onOpenBookmarks={() => { setBottomTab("Bookmarks"); setBottomVisible(true); }}
      onOpenAIAssistant={() => { setBottomTab("AI"); setBottomVisible(true); }}
      aiBridgeStatus={aiBridgeStatus}
      onOpenProperties={() => { dialogOriginLabelRef.current = "Properties"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPropertiesVisible(true); }}
    />
    <MinimalCycleViewPanels>
    <div className="desktop-workspace">
      <section className={`cycle-panel mode-${viewMode.toLowerCase()}`} aria-label={`${viewMode} View`} data-view-mode={viewMode} data-signal-split={String(signalSplitEnabled && viewMode === "Cycle")}>
         <div className="left-pane-resize-handle" data-testid="left-pane-resizer" role="separator" aria-label="Resize Signal Group pane" aria-orientation="vertical" aria-valuemin={LEFT_PANE_MIN_WIDTH} aria-valuemax={LEFT_PANE_MAX_WIDTH} aria-valuenow={leftPaneWidth} tabIndex={0} onKeyDown={resizeLeftPaneByKeyboard} onPointerDown={startLeftPaneResize} onPointerMove={moveLeftPaneResize} onPointerUp={finishLeftPaneResize} onPointerCancel={finishLeftPaneResize} />
          <div className="frozen-pane-resize-handle" data-testid="frozen-pane-resizer" role="separator" aria-label="Resize Signal label and timing pane" aria-orientation="vertical" aria-valuemin={frozenPaneMinWidth} aria-valuemax={360} aria-valuenow={frozenPaneWidth} tabIndex={0} onKeyDown={resizeFrozenPaneByKeyboard} onPointerDown={startFrozenPaneResize} onPointerMove={moveFrozenPaneResize} onPointerUp={finishFrozenPaneResize} onPointerCancel={finishFrozenPaneResize} />
        <SignalTreeColumnHeader
          treeTypeFilter={treeTypeFilter}
          onTreeTypeFilterChange={(value) => setTreeTypeFilter(value as TreeTypeFilter)}
          treeFilter={treeFilter}
          onTreeFilterChange={setTreeFilter}
          onClearTreeFilter={() => setTreeFilter("")}
          addMenuOpen={treeAddMenuOpen}
          onToggleAddMenu={(origin) => { menuOriginRef.current = origin; setTreeAddMenuOpen((value) => !value); }}
          moreMenuOpen={treeMoreMenuOpen}
          onToggleMoreMenu={(origin) => { menuOriginRef.current = origin; setTreeMoreMenuOpen((value) => !value); }}
          onAddEntity={addTreeEntity}
          onCloseAddMenu={closeTreeAddMenu}
          onOpenBulkRegistration={() => { setBulkRegistrationGroupId(snapshot.document.signalGroups.at(-1)?.id); setBulkRegistrationVisible(true); }}
          onCollapseAllGroups={() => setCollapsedGroups(new Set(snapshot.document.signalGroups.map((group) => group.id)))}
          onExpandAllGroups={() => setCollapsedGroups(new Set())}
          onOpenHierarchy={() => setHierarchyVisible(true)}
          onCloseMoreMenu={closeTreeMoreMenu}
          timeScaleLabel={snapshot.document.timeline.referenceClock ? `Time Scale: Cycle    Reference: ${referenceClockSignal?.display.name ?? snapshot.document.timeline.referenceClock}` : "Time Scale: Cycle    Axis: Time"}
        />
        <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport" tabIndex={0} aria-label="Timing canvas navigation">
          {viewMode !== "Cycle" && <TransactionLanes document={snapshot.document} zoom={zoom} selectedId={selectedTransactionId} getBoundaryX={(cycle) => transactionBoundaryX.current(cycle)} onSelect={selectTransaction} onSnap={(clientX) => snapTransactionCycle.current(clientX)} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onContextMenu={(event) => openTransactionContextMenu(event)} />}
          <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
          <div className="cycle-ruler" data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled}>
            <div className="cycle-ruler-content" ref={ruler} />
          </div>
          <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band" aria-hidden="true" hidden />
          <LegendView document={snapshot.document} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} />
      <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
        </div>
        {signalSplitEnabled && viewMode === "Cycle" && <>
          <div className="signal-split-divider" data-testid="signal-split-divider" role="separator" aria-label="Signal Split divider" aria-orientation="horizontal" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(signalSplitRatio * 100)} tabIndex={0} onKeyDown={resizeSignalSplitByKeyboard} onPointerDown={startSignalSplitResize} onPointerMove={moveSignalSplitResize} onPointerUp={finishSignalSplitResize} onPointerCancel={finishSignalSplitResize} />
          <div className="cycle-viewport signal-split-lower" ref={viewportLower} data-testid="cycle-viewport-lower" data-pane="lower" tabIndex={0} aria-label="Lower pane timing canvas navigation">
            <div className="geometry-grid" ref={gridLayerLower} data-testid="geometry-grid-lower" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
            <div className="cycle-ruler" data-testid="cycle-ruler-lower" aria-label="Lower pane cycle ruler" hidden={!rulerEnabled}>
              <div className="cycle-ruler-content" ref={rulerLower} />
            </div>
            <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band-lower" aria-hidden="true" hidden />
            <div className="surface-host" ref={hostLower} data-testid="cycle-surface-lower" />
          </div>
        </>}
      </section>
       {bottomVisible && <div className="bottom-resize-track" data-testid="bottom-resizer" role="separator" aria-label="Resize bottom editor" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={420} aria-valuenow={bottomHeight} tabIndex={0} onKeyDown={resizeBottomByKeyboard} onPointerDown={startBottomResize} onPointerMove={moveBottomResize} onPointerUp={finishBottomResize} onPointerCancel={finishBottomResize} />}
      {bottomVisible && <BottomEditorPanel
        tabs={bottomTabs}
        activeTab={bottomTab}
        onSelectTab={selectBottomTab}
        onTabKeyDown={onBottomTabKeyDown}
        followSelection={followSelection}
        onFollowSelectionChange={setFollowSelection}
        pinned={bottomPinned}
        onTogglePinned={toggleBottomPin}
        summary={<div className="left-panel-tail"><span data-testid="left-tree-signal-count">{snapshot.document.signals.length} signals</span>{selectedSignal && <span className="scope-breadcrumb" data-testid="scope-breadcrumb">Scope: {selectedSignal.source.instancePath.length ? selectedSignal.source.instancePath.join(" / ") : "(root)"}</span>}</div>}
        content={bottomTab === "Signal" ? signalEditor : bottomTab === "Annotation" ? annotationEditor : bottomTab === "Transaction" ? transactionEditor : bottomTab === "Bookmarks" ? bookmarkEditor : bottomTab === "AI" ? <AIOperationPanel {...aiAssistantPanel} /> : bottomTab === "Problems" ? <ProblemsPanel diagnostics={diagnostics} onNavigate={navigateProblem} /> : <AdvancedJsonPanel document={snapshot.document} selectedSignal={bottomSignal} selectedGroup={bottomGroup} selectedAnnotation={bottomAnnotation} selectedTransaction={bottomTransaction} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onDiagnostic={(next) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("advanced-json:")), ...nextDiagnostics]); }} />}
      />}
       <aside hidden={!inspectorVisible} className="inspector-shell" data-testid="inspector-shell"><div className="inspector-resize-handle" data-testid="inspector-resizer" role="separator" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={inspectorWidth} tabIndex={0} onKeyDown={resizeInspectorByKeyboard} onPointerDown={startInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={finishInspectorResize} onPointerCancel={finishInspectorResize} />{/* Bug fix: `selectedSignal?.id ?? \`...:${revision}:${token}\`` short-circuited
    to *just* the signal id whenever a Signal was selected (operator
    precedence -- `??`'s left side already being truthy skips the whole
    template on the right), so bumping inspectorResetToken via Cancel never
    changed a Signal's own key and therefore never remounted/reset its
    Inspector draft state (Group/Annotation/Transaction were unaffected,
    since their id is only ever the *fallback* inside that same template).
    One template literal now always appends :revision:token regardless of
    which kind of selection it is. */}
       <InspectorPanel key={`${selectedSignal?.id ?? selectedGroup?.id ?? selectedAnnotation?.id ?? selectedTransaction?.id ?? selectedBookmark?.id ?? "none"}:${snapshot.revision}:${inspectorResetToken}`} signal={selectedSignal} group={selectedGroup} annotation={selectedAnnotation} transaction={selectedTransaction} bookmark={selectedBookmark} collapsedGroup={selectedGroup !== undefined && collapsedGroupIds.has(selectedGroup.id)} onToggleGroupCollapse={selectedGroup === undefined ? undefined : () => toggleCollapsedGroup(selectedGroup.id)} registry={commandRegistry.current} document={snapshot.document} viewport={viewport} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onReveal={revealSelectedInHierarchy} onCancel={() => { if (selectedGroup) refreshGroupStylePreview(host.current!, selectedGroup.id, selectedGroup.style); setInspectorResetToken((value) => value + 1); }} onClose={() => setInspectorVisible(false)} onDeleteBookmark={deleteBottomBookmark} onGroupPreview={(groupId, style) => refreshGroupStylePreview(host.current!, groupId, style ?? snapshot.document.signalGroups.find((group) => group.id === groupId)?.style)} /></aside>
    </div>
    <ContextMenuPanel contextMenu={contextMenu} hasSelectedClipboard={hasSelectedClipboard} clipboardAvailable={clipboardAvailable} hasSelectedEntity={hasSelectedEntity} hasSelectedSignal={hasSelectedSignal} hasDeletableSelection={hasDeletableSelection} canRenameSelection={canRenameSelection} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canShowSelection={canShowSelection} canHideSelection={canHideSelection} copySelectedSignal={copySelectedSignal} cutSelectedSignal={cutSelectedSignal} pasteSelectedEntity={pasteSelectedEntity} duplicateSelectedEntity={duplicateSelectedEntity} moveSelection={moveSelection} setSelectionVisibility={setSelectionVisibility} renameSelection={renameSelection} closeContextMenu={closeContextMenu} deleteSelection={() => commandRegistry.current.execute("selection.delete")} addBookmarkAtCycle={addBookmarkAtCycle} />
    {renameDialogOpen && <RenameDialog dialogRef={renameDialogRef} draft={renameDraft} onDraftChange={(value) => { setRenameDraft(value); setRenameError(""); }} error={renameError} onApply={applyRename} onClose={() => setRenameDialogOpen(false)} />}
    {hierarchyVisible && <HardwareHierarchyBrowser document={snapshot.document} selectedSignalId={selectedSignal?.id} onSelect={selectHierarchySignal} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setHierarchyVisible(false))} />}
    {propertiesVisible && <DocumentProperties document={snapshot.document} onApplyProperties={(commands) => application.executeBatch(nextCommandId("document_properties"), commands)} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setPropertiesVisible(false))} />}
    {bulkRegistrationVisible && <BulkRegistrationDialog dialogRef={bulkRegistrationDialogRef} groups={snapshot.document.signalGroups} text={bulkRegistrationText} onTextChange={(value) => { setBulkRegistrationText(value); setBulkRegistrationPreview(undefined); setBulkRegistrationStatus(""); }} groupId={bulkRegistrationGroupId} onGroupIdChange={setBulkRegistrationGroupId} status={bulkRegistrationStatus} preview={bulkRegistrationPreview} onPreview={previewBulkSignals} onApply={registerBulkSignals} onClose={() => closeDialog(() => { setBulkRegistrationVisible(false); setBulkRegistrationPreview(undefined); })} />}
    {exportVisible && <ExportDialog snapshot={snapshot} range={timelineRange} restoreFocusRef={dialogOriginRef} onDiagnostic={(next) => setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("export-failure:")), ...(next ? [next] : [])])} onClose={() => closeDialog(() => setExportVisible(false))} />}
     {saveAsVisible && <SaveAsDialog defaultName={snapshot.document.document.title || "timing-chart"} restoreFocusRef={dialogOriginRef} onSave={(name) => { const saved = documentLifecycle.saveAs(name); if (saved) closeDialog(() => setSaveAsVisible(false)); return saved; }} onClose={() => closeDialog(() => setSaveAsVisible(false))} />}
     {compatibilityPreview && <div className="modal-backdrop" data-testid="compatibility-dialog"><section ref={compatibilityDialogRef} className="document-properties compatibility-dialog" role="dialog" aria-modal="true" aria-labelledby="compatibility-dialog-title"><header><h2 id="compatibility-dialog-title">Compatibility Mode</h2></header><p>Format version {compatibilityPreview.sourceFormatVersion} is newer than this editor supports. The current document has not been replaced.</p><p className="inspector-note">Unknown fields are preserved in the original source below. Compatibility Mode is read-only and cannot Save or overwrite this file.</p><textarea aria-label="Compatibility source" readOnly value={compatibilityPreview.sourceText} rows={14} />{compatibilityPreview.readOnly && <output role="status">Read-only Compatibility Mode active</output>}<footer><button type="button" onClick={() => { documentLifecycle.closeCompatibility(); restorePendingFileFocus(); }}>{compatibilityPreview.readOnly ? "Close" : "Cancel"}</button>{!compatibilityPreview.readOnly && <button type="button" data-testid="compatibility-read-only" onClick={documentLifecycle.enterCompatibilityReadOnly}>View Read-Only</button>}</footer></section></div>}
     {pendingFileAction && <div className="modal-backdrop" data-testid="unsaved-file-dialog"><section ref={unsavedFileDialogRef} className="document-properties unsaved-file-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-file-dialog-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelPendingFileAction(); } }}><header><h2 id="unsaved-file-dialog-title">Unsaved Changes</h2></header><p>Save changes before {pendingFileAction.kind === "new" ? "creating a new document" : "opening another document"}?</p><p className="inspector-note">Your current document has unsaved changes.</p><footer><button type="button" ref={unsavedCancelRef} autoFocus data-testid="unsaved-cancel" onClick={cancelPendingFileAction}>Cancel</button><button type="button" data-testid="unsaved-discard" onClick={continuePendingFileAction}>Discard</button><button type="button" data-testid="unsaved-save" onClick={saveAndContinuePendingFileAction}>Save</button></footer></section></div>}
     <input ref={fileInput} hidden type="file" accept=".json,.tcd" onChange={(event) => { const file = event.target.files?.[0]; if (file) { capturePendingFileOrigin(); void documentLifecycle.readFile(file); } event.currentTarget.value = ""; }} />
    <EditorStatusBar
      toolStatus={arrowPickStatus === "idle" ? (rangeSelectionActive ? "Range select active" : "Ready · Tool: Select") : `Arrow pick · ${arrowPickStatus}`}
      selectionStatus={selectedSignalIds.size > 1 ? `${selectedSignalIds.size} signals` : selectedTransaction?.name ?? selectedAnnotation?.label ?? selectedSignal?.display.name ?? selectedGroup?.name ?? "None"}
      signalCount={snapshot.document.signals.length}
      annotationCount={snapshot.document.annotations.length}
      rangeStatus={visualReference ? `Time Range: ${snapshot.document.timeline.start} – ${snapshot.document.timeline.end} cycles` : `Range: [${timelineRange.start}, ${timelineRange.end})`}
      selectedCycle={selectedCycle}
      zoom={zoom}
      snapEnabled={snapEnabled}
      viewMode={viewMode}
      statusContext={`Workspace: ${workspacePreset} · ${bottomPinned ? "Bottom: Pinned" : followSelection ? "Bottom: Follow" : "Bottom: Fixed"}${selectedSignal ? ` · Scope: ${selectedSignal.source.instancePath.length > 0 ? selectedSignal.source.instancePath.join("/") : "root"}` : ""}`}
      hideRevisionDetail={visualReference}
      revision={snapshot.revision}
      undoDepth={history.undoDepth}
      redoDepth={history.redoDepth}
      timeAxisStatus={`Time Axis: ${snapshot.document.timeline.referenceClock ? `Clock · ${referenceClockSignal?.display.name ?? snapshot.document.timeline.referenceClock}` : "Time · No Clock Reference"}`}
      dirty={history.dirty}
      problemsCount={diagnostics.length}
      waveDromHasError={waveDromHasError}
    />
    </MinimalCycleViewPanels>
  </EditorShellView>;
}
