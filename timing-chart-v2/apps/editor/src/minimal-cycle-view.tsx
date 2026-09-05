import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { type Point, type SnapKind } from "@timing-chart-v2/geometry";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, type DisplayTimeMapping, type HardwareHierarchyView, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { type AnnotationOverlayPrimitive, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { scanJsonSyntax, serializeCanonicalDocument } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor, quickValueLiteral, quickValueOptions, type Annotation, type AnnotationId, type AnnotationType, type Bookmark, type BookmarkId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type EdgeCounterSettings, type GroupId, type LegendEntry, type SemanticAnchor, type Signal, type SignalId, type SignalRole, type SpacerId, type TimeGroupId, type Transaction, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
import { resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import { ViewMetricsOwner } from "./runtime/view-metrics.js";
import { buildViewportWindow } from "./runtime/viewport-window.js";
import { projectEdgeCounters } from "./runtime/edge-counter-projection.js";
import { referenceSvgScreenScale } from "./runtime/screen-scale.js";
import type { RangeDragState } from "./runtime/range-drag.js";
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
import { parseBulkSignalDefinitions } from "./bulk-signal-parser.js";
import { MinimalCycleViewPanels, InspectorPanel, ContextMenuPanel, MinimalCycleViewTitleBar, RenameDialog, BulkRegistrationDialog, SignalTreeColumnHeader, BottomEditorPanel, EditorStatusBar } from "./minimal-cycle-view-panels.js";
import { MinimalCycleViewRibbonTabs, refreshTreeCollapsedMetadata, refreshTreeFilterPresentation, refreshTreeRovingFocus } from "./minimal-cycle-view-ui.js";
import { cycleDocument, v1ReferenceDocument } from "./fixtures-cycle-reference-documents.js";
import { groupId, signalId, valueSignal } from "./minimal-cycle-view-fixture-helpers.js";
import { defaultEventValue, EventRow, QuickValues } from "./event-table-components.js";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { AnnotationList } from "./annotation-list.js";
import { CommentRowEditor } from "./comment-row-editor.js";
import { LegendView } from "./legend-view.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import type { AIViewIntent } from "./ai-proposal-provider.js";
import { useAIBridgeClient } from "./ai-bridge-client.js";
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
import { useDocumentLifecycle } from "./application/use-document-lifecycle.js";
import { deriveSelectionCapabilities, useSelectionOwner, type SelectionState } from "./application/use-selection-owner.js";
import { useClipboardActions } from "./application/use-clipboard-actions.js";
import { useTimelineNavigationOwner } from "./runtime/use-timeline-navigation-owner.js";
import type { SelectedClockEdge } from "./runtime/edge-counter-projection.js";
import { TimelineGeometryOwner } from "./runtime/timeline-geometry-owner.js";
import { TimelineRangeInteractionOwner } from "./runtime/timeline-range-interaction-owner.js";
import { AnnotationInteractionOwner } from "./runtime/timeline-annotation-interaction-owner.js";
import { TreeDragInteractionOwner } from "./runtime/tree-drag-interaction-owner.js";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH, useWorkspaceUiState, type TreeTypeFilter, type WorkspacePreset } from "./workspace/use-workspace-ui-state.js";
import { useDialogMenuState } from "./workspace/use-dialog-menu-state.js";
import { routeGlobalShortcut } from "./runtime/keyboard-shortcut-router.js";
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { TransactionEditor } from "./transaction-editor.js";
import { BookmarkEditor } from "./bookmark-editor.js";
import { resolveGroupInsertionIndex, resolveInsertionTarget } from "./insertion-target.js";
import { buildRuler } from "./runtime/build-ruler.js";
import { projectAnnotationOverlays } from "./runtime/annotation-overlays.js";
import type { TimelineViewportRuntime } from "./runtime/timeline-viewport-runtime.js";
import { applyRendererHostSizing, attachDialogOriginCapture, attachDirtyUnloadGuard, attachEditorEventBindings, attachMenuKeyboardNavigation, collectWaveRenderErrors, createEditorTimelineRuntime, createOpenPhaseTracker, createWaveformSurfaceProvider, deriveRenderInvalidation, mountInitialTimelineProjection, projectViewportWindow, publishRendererState, rebuildRulerPresentation, refreshAnnotationPreview, refreshClockPreview, refreshGridPresentation, refreshGroupStylePreview, refreshPlayheadPresentation, refreshRangeBandPresentation, refreshRendererForReason, refreshRendererOverlays, refreshRulerRangeSelection, refreshTimelinePresentation, refreshTransactionLinkedRows, resolveTransactionSnapCycle, scheduleDialogFocusRestore, scheduleInitialTimelineRefresh, syncFrozenColumnScroll, syncPresentationScale as syncPresentationScaleDom, syncRulerScroll, trapDialogTab } from "./runtime/use-editor-runtime-bridge.js";

const spacerId = (value: string) => value as SpacerId;

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
  const timelineRuntimeRef = useRef<TimelineViewportRuntime | null>(null);
  const armArrowPick = useRef<(annotationType: "arrow" | "dependency") => void>(() => undefined);
  const selectAllRef = useRef<() => void>(() => undefined);
  const snapTransactionCycle = useRef<(clientX: number) => number | undefined>(() => undefined);
  const transactionBoundaryX = useRef<(cycle: number) => number | undefined>(() => undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useSelectionOwner(visualReference ? signalId("sig_cycle_clock") : undefined);
  const previousSelectionDecorationRef = useRef<SelectionState | undefined>(undefined);
  const editActions = useClipboardActions({ application, selection });
  const timelineNavigation = useTimelineNavigationOwner();
  const { signalId: selectedId, signalIds: selectedSignalIds, groupId: selectedGroupId, annotationId: selectedAnnotationId, transactionId: selectedTransactionId } = selection.state;
  const { signalId: selectedSignalRef, signalIds: selectedSignalIdsRef, groupId: selectedGroupRef, spacerId: selectedSpacerRef, annotationId: selectedAnnotationRef, transactionId: selectedTransactionRef } = selection.refs;
  useEffect(() => {
    return attachDirtyUnloadGuard(history.dirty);
  }, [history.dirty]);
  const [arrowPickStatus, setArrowPickStatus] = useState<"idle" | "from" | "to">("idle");
  const zoom = timelineNavigation.zoom;
  const [gridEnabled, setGridEnabled] = useState(true);
  const gridEnabledRef = useRef(true);
  gridEnabledRef.current = gridEnabled;
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapEnabledRef = useRef(true);
  snapEnabledRef.current = snapEnabled;
  const [rulerEnabled, setRulerEnabled] = useState(true);
  const [minimapEnabled, setMinimapEnabled] = useState(true);
  const [showSignalNames, setShowSignalNames] = useState(true);
  const [showRoles, setShowRoles] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showTransactions, setShowTransactions] = useState(true);
  const [showGroupBackground, setShowGroupBackground] = useState(true);
  const workspace = useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId>();
  const {
    ribbonTab, setRibbonTab,
    bottomTab, setBottomTab,
    viewMode, setViewMode,
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
  const commandRegistry = useRef(new UiCommandRegistry());
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

  // #211: Canonical restoration alone isn't UX parity -- if Undo brings a
  // deleted Signal back (or Redo removes it again), the selection should
  // follow rather than silently staying at "None"/pointing at a since-gone
  // ID. Scoped to Signals for now (signal.create/delete are the only
  // commands with distinct addedSignals/removedSignals changeSet fields;
  // Annotation/Group/Spacer create+delete share one symmetric field name,
  // so telling "added" from "removed" for them needs a different check --
  // left for a follow-up rather than guessed at here).
  const repairSelectionAfterHistoryChange = (result: CommandResult) => {
    if (!result.ok) return;
    const removedIds = result.changeSet.removedSignals ?? [];
    const currentSignalId = selection.refs.signalId.current;
    if (currentSignalId && removedIds.includes(currentSignalId)) {
      selection.clear();
      return;
    }
    const addedIds = result.changeSet.addedSignals ?? [];
    const nothingSelected = !selection.refs.signalId.current && !selection.refs.groupId.current && !selection.refs.spacerId.current && !selection.refs.annotationId.current && !selection.refs.transactionId.current;
    if (nothingSelected && addedIds.length === 1) selection.selectSignal(addedIds[0]!);
  };
  useEffect(() => {
    const registry = commandRegistry.current;
    const unregister = [
      registry.register<SemanticCommand>("semantic.execute", (command) => application.execute(command)),
      registry.register("selection.delete", editActions.deleteSelection),
      registry.register<{ readonly name: string }>("selection.rename", ({ name }) => editActions.rename(name)),
      registry.register<{ readonly visible: boolean }>("selection.visibility", ({ visible }) => editActions.setVisibility(visible)),
      registry.register("history.undo", () => { const result = application.undo(); repairSelectionAfterHistoryChange(result); return result; }),
      registry.register("history.redo", () => { const result = application.redo(); repairSelectionAfterHistoryChange(result); return result; }),
      registry.register("clipboard.copy", editActions.copy),
      registry.register("clipboard.cut", editActions.cut),
      registry.register("clipboard.paste", editActions.paste),
      registry.register("clipboard.duplicate", editActions.duplicate),
      registry.register("selection.selectAll", () => selectAllRef.current()),
    ];
    return () => unregister.forEach((dispose) => dispose());
  }, []);

  useEffect(() => {
    refreshRulerRangeSelection(ruler, rangeSelectionActive, timelineRange);
  }, [rangeSelectionActive, timelineRange, rangePresentationRevision]);

  useEffect(() => {
    if (timelineRuntimeRef.current) timelineRuntimeRef.current.onViewportResize();
    else applyRendererHostSizing({ host, viewport, metrics: viewMetricsOwner.snapshot() });
  }, [viewMetricsOwner, leftPaneWidth, frozenPaneWidth, inspectorWidth]);

  useEffect(() => {
    let active = true;
    const rendererHost = host.current;
    const viewportElement = viewport.current;
    const rulerElement = ruler.current;
    const rulerViewportElement = rulerElement?.parentElement;
    const gridElement = gridLayer.current;
    if (!rendererHost || !viewportElement || !rulerElement || !rulerViewportElement || !gridElement) return;

    const runtime = application.runtime;
    const sessionController = runtime.session;
    let session = sessionController.current();
    const documentEpoch = runtime.documentEpoch;
    const adapter = runtime.createWaveDromAdapter();
    const projectionCoordinator = runtime.projection;
    const mappingCache = runtime.displayMapping;
    const geometryRegistry = runtime.geometry;
    const geometrySvgs = geometryRegistry.svgs;
    const geometryMaps = geometryRegistry.maps;
    const openPhaseTracker = createOpenPhaseTracker(rendererHost);
    const markOpenPhase = openPhaseTracker.mark;
    const beginOpenMeasurement = openPhaseTracker.begin;
    let projection!: RenderProjection;
    let publishState: () => void = () => undefined;
    const timelineGeometry = new TimelineGeometryOwner({
      mappingCache,
      geometryMaps,
      getDocument: () => sessionController.snapshot().document,
      getProjection: () => projection,
      onSnapIndexBuilt: () => publishState(),
    });
    const provider = createWaveformSurfaceProvider({
      sessionController,
      mappingCache,
      adapter,
      geometryRegistry,
      markOpenPhase,
      onReferenceGeometryReady: () => {
        if (active && !rulerInitialized) {
          timelineRuntimeRef.current?.refreshRuler();
          timelineRuntimeRef.current?.refreshGrid();
        }
      },
      invalidateSnapIndex: () => timelineGeometry.invalidateSnapIndex(),
    });
    const renderCoordinator = runtime.createRenderer(provider);
    const renderer = renderCoordinator.renderer;
    const initialProjection = mountInitialTimelineProjection({
      coordinator: renderCoordinator,
      renderer,
      host: rendererHost,
      viewport: viewportElement,
      referenceClock: sessionController.snapshot().document.timeline.referenceClock,
      projectionCoordinator,
      snapshot: sessionController.snapshot(),
      collapsedGroupIds: [...collapsedGroupIdsRef.current],
    });
    let window: VirtualizationWindow = initialProjection.window;
    projection = initialProjection.projection;
    // Signal Split View (#200): lets the signalSplitEnabled effect force
    // Upper to reproject/re-render immediately after flipping
    // `projectionCoordinator.setPane()`, using the CURRENT document (not a
    // change -- Split toggling itself is view-only, so this must never
    // touch history/dirty/canonical state).
    forceUpperReprojectRef.current = () => {
      if (!active) return;
      // An empty changeSet is correct here, not `fullDocumentReplace` --
      // `projectionCoordinator.setPane()` already nulled the cached layout,
      // so the very next `project()` call rebuilds regardless of changeSet
      // flags. Declaring a fake full-document-replace would incorrectly
      // advance documentEpoch and clear annotation preview state for a
      // toggle that must be canonical/history/dirty-neutral.
      projection = projectionCoordinator.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      renderer.update(projection);
    };
    let rulerBuilds = 0;
    let edgeCounterResolvePasses = 0;
    let rulerInitialized = false;
    refreshPlayhead.current = () => {
      const boundaryToLocalX = (cycle: number) => timelineRuntime.sourceBoundaryToLocalX(session.getSnapshot().document, cycle);
      refreshPlayheadPresentation(rulerElement, selectedCycleRef.current, boundaryToLocalX);
      // Signal Split View (#200): the playhead is a pure x-position marker
      // inside the ruler (ruler height is fixed regardless of pane row
      // count), so it mirrors safely onto Lower's own ruler using the same
      // one authoritative horizontal mapping -- no second playhead owner.
      if (rulerLower.current) refreshPlayheadPresentation(rulerLower.current, selectedCycleRef.current, boundaryToLocalX);
    };
    const refreshRangeSelectionBandNow = () => {
      refreshRangeBandPresentation(viewportElement, rulerElement, rendererHost, rangeSelectionActiveRef.current, rendererHost.dataset.rangePreview, timelineRangeRef.current, (cycle) => timelineRuntime.sourceBoundaryToLocalX(session.getSnapshot().document, cycle), timelineNavigation.getZoom(), timelineOffset(), projection.totalHeight);
      // Signal Split View (#200): the range band's horizontal extent comes
      // from the one shared time mapping, but its vertical extent must span
      // Lower's OWN row content, not Upper's -- reusing Upper's totalHeight
      // here would stretch/shrink the band to the wrong pane's height.
      if (viewportLower.current && rulerLower.current && signalSplitRuntimeRef.current) refreshRangeBandPresentation(viewportLower.current, rulerLower.current, rendererHost, rangeSelectionActiveRef.current, rendererHost.dataset.rangePreview, timelineRangeRef.current, (cycle) => timelineRuntime.sourceBoundaryToLocalX(session.getSnapshot().document, cycle), timelineNavigation.getZoom(), timelineOffset(), signalSplitRuntimeRef.current.getTotalHeight());
    };
    refreshRangeSelectionBand.current = refreshRangeSelectionBandNow;
    const refreshRangePreview = () => {
      timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end);
    };

    publishState = () => publishRendererState(rendererHost, session, viewMetricsOwner, adapter, geometryRegistry, projectionCoordinator, renderer, mappingCache, timelineGeometry.snapService, timelineGeometry.snapIndex, rulerBuilds, edgeCounterResolvePasses, timelineNavigation.getZoom(), application.validatorInvocationsRef.current);
    publishStateRef.current = () => publishState();
    let frame = 0;
    // Definite-assignment: assigned below before createEditorTimelineRuntime's
    // returned closures can ever be invoked (matches this file's rangeInteractions/
    // treeDrag forward-declaration convention); no dummy body is reachable.
    let timelineRender!: (reason: string) => void;
    const timelineRuntime = createEditorTimelineRuntime({
      dom: { viewportRef: { current: viewportElement }, waveformRef: { current: rendererHost }, rulerRef: { current: rulerElement }, gridRef: { current: gridElement }, overlayRef: { current: rendererHost.querySelector<HTMLElement>("[data-role='annotation-overlay-surface']") }, rangeBandRef: { current: viewportElement.querySelector<HTMLElement>("[data-role='range-selection-band']") }, playheadRef: { current: rulerElement.querySelector<HTMLElement>("[data-role='playhead']") } },
      geometry: {
        getDisplayTimeMapping: () => timelineGeometry.displayMapping,
        getTimeAxisGeometry: () => timelineGeometry.timeAxis.geometry,
        getLocalGeometryMap: () => geometryMaps,
        sourceCycleToLocalX: (cycle) => timelineGeometry.sourceBoundaryToLocalX(session.getSnapshot().document, cycle),
        sourceBoundaryToLocalX: (document, cycle) => timelineGeometry.sourceBoundaryToLocalX(document as CanonicalDocument, cycle),
        localXToScreenX: (localX) => localX,
      },
      viewport: { getMetrics: () => { const metrics = viewMetricsOwner.snapshot(); return { width: viewportElement.clientWidth, leftInset: metrics.leftPaneWidth + metrics.frozenPaneWidth }; }, getScrollState: () => ({ left: viewportElement.scrollLeft, top: viewportElement.scrollTop }), setScrollState: (state) => { if (state.left !== undefined) viewportElement.scrollLeft = state.left; if (state.top !== undefined) viewportElement.scrollTop = state.top; }, getZoom: timelineNavigation.getZoom, setZoom: timelineNavigation.setZoom },
      document: { getSnapshot: () => session.getSnapshot().document, getCanonicalRevision: () => session.getSnapshot().revision, getDocumentEpoch: () => documentEpoch.current() },
      render: { requestRender: (reason) => timelineRender(reason), requestOverlayRefresh: (reason) => { rendererHost.dataset.overlayRefreshReason = reason; refreshRendererForReason(renderer, host, reason, session.getSnapshot().document, projection, geometryMaps, mappingCache, timelineGeometry.presentationScale, timelineRangeRef.current, selectedCycleRef.current, selectedAnnotationRef.current, selectedEdgeRef.current); edgeCounterResolvePasses += 1; }, waitForRendererIdle: () => renderer.whenIdle().then(() => undefined) },
      lifecycle: { isCurrentEpoch: (epoch) => documentEpoch.isCurrent(epoch) },
    });
    timelineRuntimeRef.current = timelineRuntime;
    timelineRender = (reason) => {
      rendererHost.dataset.timelineRefreshReason = reason;
      if (reason === "scroll") {
        syncRulerScroll(rulerElement, viewportElement, timelineNavigation.getZoom());
        syncFrozenColumnScroll(viewportElement, rendererHost, viewMetricsOwner.snapshot().leftPaneWidth);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => projectViewportWindow({
          viewport: viewportElement,
          referenceClock: session.getSnapshot().document.timeline.referenceClock,
          snapshot: session.getSnapshot(),
          previous: { window, projection },
          projectionCoordinator,
          collapsedGroupIds: [...collapsedGroupIdsRef.current],
          onProjection: (nextProjection: any, nextWindow: any, mountedSignalsChanged: boolean) => {
            window = nextWindow;
            projection = nextProjection;
            if (mountedSignalsChanged) timelineGeometry.invalidateSnapIndex();
            renderer.update(projection);
            rendererHost.dataset.viewportStartY = String(window.viewportStartY);
            publishState();
          },
        }));
        return;
      }
      const document = session.getSnapshot().document;
      if (reason === "ruler") rulerBuilds += 1;
      const presentation = refreshTimelinePresentation({
        reason,
        document,
        ruler: rulerElement,
        grid: gridElement,
        viewport: viewportElement,
        host: rendererHost,
        rulerViewport: rulerViewportElement,
        geometryMaps,
        geometrySvgs,
        mappingCache,
        metricsOwner: viewMetricsOwner,
        currentZoom: timelineNavigation.getZoom(),
        previousScale: timelineGeometry.presentationScale,
        rulerInitialized,
        timeAxis: timelineGeometry.timeAxis,
        totalHeight: projection.totalHeight,
        gridEnabled: gridEnabledRef.current,
        markOpenPhase,
        onPlayhead: () => refreshPlayhead.current(),
        onRange: () => refreshRangeSelectionBand.current(),
        onResize: () => applyRendererHostSizing({ host, viewport, metrics: viewMetricsOwner.snapshot() }),
      });
      timelineGeometry.updatePresentation(presentation.timeAxis, presentation.screenGeometryScale);
      rulerInitialized = presentation.rulerInitialized;
      // Timeline presentation refreshes are view-only. The canonical command path
      // already submits the changed projection once; replaying that projection for
      // ruler/grid/zoom refreshes would regenerate the same WaveDrom rows.
      // Signal Split View (#200): grid lines mark shared cycle-boundary
      // x-positions from the one authoritative geometryMaps/mappingCache
      // (Upper's), same for every pane -- but each pane's grid must span
      // its OWN row content height, not Upper's, so this reuses Upper's
      // inputs with Lower's own totalHeight rather than cloning Upper's
      // grid DOM outright.
      if (reason === "grid" && gridLayerLower.current && signalSplitRuntimeRef.current) {
        const metrics = viewMetricsOwner.snapshot();
        refreshGridPresentation(gridLayerLower.current, document, geometryMaps, mappingCache, gridEnabledRef.current, signalSplitRuntimeRef.current.getTotalHeight(), globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth, presentation.screenGeometryScale);
      }
    };
    timelineRuntime.attach();
    transactionBoundaryX.current = (cycle) => timelineGeometry.sourceBoundaryToLocalX(session.getSnapshot().document, cycle);
    const currentViewMetrics = () => {
      viewMetricsOwner.update({ viewportWidth: viewportElement.clientWidth, zoom: timelineNavigation.getZoom() });
      return viewMetricsOwner.snapshot();
    };
    const timelineOffset = () => {
      const metrics = currentViewMetrics();
      return metrics.leftPaneWidth + metrics.frozenPaneWidth;
    };
    const detachTimelineNavigation = timelineNavigation.attach({
      runtime: timelineRuntime,
      rendererHost,
      timingSurface: rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']") ?? rendererHost,
      viewport: viewportElement,
      ruler: rulerElement,
      scalable: [gridElement, ...rendererHost.querySelectorAll<HTMLElement>("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']")],
      rulerViewport: rulerViewportElement,
      viewMetrics: viewMetricsOwner,
      timelineOffset,
      getPresentationScale: () => timelineGeometry.presentationScale,
      syncPresentationScale: syncPresentationScaleDom,
      syncFrozenColumns: () => syncFrozenColumnScroll(viewportElement, rendererHost, viewMetricsOwner.snapshot().leftPaneWidth),
      getDocument: () => session.getSnapshot().document,
      getRange: () => timelineRangeRef.current,
      setSelectedCycle,
      setRange: setTimelineRange,
      publishState,
    });
    syncFrozenColumnScroll(viewportElement, rendererHost, viewMetricsOwner.snapshot().leftPaneWidth);
    snapTransactionCycle.current = (clientX) => resolveTransactionSnapCycle({
      clientX,
      host: rendererHost,
      projection,
      timeAxis: timelineGeometry.timeAxis,
      screenGeometry: timelineGeometry.screen,
      zoom: timelineNavigation.getZoom(),
      snapEnabled: snapEnabledRef.current,
      document: session.getSnapshot().document,
      currentSnapIndex: () => timelineGeometry.currentSnapIndex(),
      cycleBoundaryAtPointerX,
      cycleBoundaryAtX,
      publishState,
    });
    publishState();

    scheduleInitialTimelineRefresh(renderer, rendererHost, {
      ruler: () => { if (active) timelineRuntime.refreshRuler(); },
      range: () => { if (active) timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end); },
      playhead: () => { if (active) timelineRuntime.refreshPlayhead(); },
      grid: () => { if (active) timelineRuntime.refreshGrid(); },
      zoom: () => { if (active) timelineRuntime.setZoom(timelineNavigation.getZoom()); },
      overlays: () => { if (active) timelineRuntime.refreshOverlays(); },
      collectErrors: () => { if (active) collectWaveErrors(); },
      publish: () => { if (active) publishState(); },
    });

    const upsertDiagnostic = (predicate: (item: DocumentProblem) => boolean, next: DocumentProblem | undefined) => {
      setRuntimeDiagnostics((current) => {
        const filtered = current.filter((item) => !predicate(item));
        return next ? [...filtered, next] : filtered;
      });
    };

    const collectWaveErrors = () => {
      const failed = collectWaveRenderErrors(rendererHost);
      setRuntimeDiagnostics((current) => [...current.filter((item) => item.code !== "WAVE_RENDER_ERROR"), ...failed]);
      if (failed.length > 0) setProblem(failed[0]!.message);
    };

    const detachApplicationHandler = application.attachAcceptedHandler((result) => {
      delete rendererHost.dataset.editorIdle;
      projection = projectionCoordinator.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      const changed = result.changeSet;
      if (changed.fullDocumentReplace === true || changed.rowOrder !== undefined || changed.rowPresentation !== undefined || changed.addedSignals !== undefined || changed.removedSignals !== undefined || changed.addedGroups !== undefined || changed.removedGroups !== undefined) {
        setTreePresentationRevision((value) => value + 1);
      }
      if (changed.fullDocumentReplace === true || changed.transactionSemantics !== undefined) {
        setTransactionPresentationRevision((value) => value + 1);
      }
      if (changed.fullDocumentReplace === true) {
        timelineRuntime.onDocumentEpochChanged(documentEpoch.advance());
        clearAnnotationPreview();
      }
      const invalidation = deriveRenderInvalidation(changed, result.snapshot.document.timeline.referenceClock);
      const snapDependenciesChanged = invalidation.snapDependenciesChanged;
      if (snapDependenciesChanged) timelineGeometry.invalidateSnapIndex();
      const refreshRuler = invalidation.refreshRuler;
      const refreshGridNow = invalidation.refreshGrid;
      const refreshOverlaysNow = invalidation.refreshOverlays;
      const rangePresentationAffected = refreshRuler
        || changed.geometryScreenX === true
        || changed.geometryScreenY !== undefined
        || changed.rowOrder !== undefined
        || changed.rowPresentation !== undefined
        || changed.addedSignals !== undefined
        || changed.removedSignals !== undefined
        || changed.addedGroups !== undefined
        || changed.removedGroups !== undefined;
      if (rangePresentationAffected) setRangePresentationRevision((value) => value + 1);
      const refreshPlayheadNow = changed.fullDocumentReplace === true || changed.geometryScreenX === true || refreshRuler;
      if (refreshPlayheadNow) setPlayheadPresentationRevision((value) => value + 1);
      renderer.update(projection);
      signalSplitRuntimeRef.current?.onDocumentChanged(result);
      setTimelineRange((range) => {
        const start = Math.min(range.start, result.snapshot.document.timeline.cycleCount - 1);
        const end = Math.max(start + 1, Math.min(range.end, result.snapshot.document.timeline.cycleCount));
        // Most property/style commits do not change the selected timeline
        // range. Preserve its identity so the range-selection effect does not
        // perform another DOM pass for an unchanged range.
        return range.start === start && range.end === end ? range : { start, end };
      });
      publishState();
      void renderer.whenIdle().then(() => {
        if (!active || !rendererHost.isConnected) return;
        if (refreshRuler && (!changed.fullDocumentReplace || !rulerInitialized)) {
          timelineRuntime.refreshRuler();
          timelineRuntime.refreshRange(timelineRangeRef.current.start, timelineRangeRef.current.end);
        }
        if (refreshPlayheadNow) timelineRuntime.refreshPlayhead();
        if (refreshGridNow) timelineRuntime.refreshGrid();
        timelineRuntime.setZoom(timelineNavigation.getZoom());
        if (refreshOverlaysNow) timelineRuntime.refreshOverlays();
        collectWaveErrors();
        publishState();
        rendererHost.dataset.editorIdle = "true";
      });
    });
    applyCollapsedGroupsRef.current = (ids) => {
      projection = projectionCoordinator.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport: window, previous: projection, collapsedGroupIds: [...ids] });
      timelineGeometry.invalidateSnapIndex();
      renderer.update(projection);
      signalSplitRuntimeRef.current?.onDocumentChanged({ snapshot: session.getSnapshot(), changeSet: {} });
      timelineRuntime.refreshPlayhead();
      timelineRuntime.refreshGrid();
      timelineRuntime.refreshOverlays();
      publishState();
    };
    const detachDocumentLifecycle = documentLifecycle.attachEffects({
      beginOpenMeasurement,
      markOpenPhase,
      applyReplacement: ({ document: canonicalDocument, session: nextSession, documentEpoch: nextDocumentEpoch }) => {
      timelineRuntime.onDocumentEpochChanged(nextDocumentEpoch);
      clearAnnotationPreview();
      delete rendererHost.dataset.editorIdle;
      session = nextSession;
      setBottomPinned(false);
      setPinnedBottomSelection(undefined);
      setRangeSelectionActive(false);
      setTimelineRange({ start: 0, end: Math.min(1, canonicalDocument.timeline.cycleCount) });
      setSelectedCycle(0);
      selection.clear();
      setCollapsedGroups(new Set());
      setTreeFilter("");
      setTreeTypeFilter("all");
      setTreeAddMenuOpen(false);
      setTreeMoreMenuOpen(false);
      setContextMenu(undefined);
      setArrowPickStatus("idle");
      setRenameDialogOpen(false);
      treeFocusRowIdRef.current = undefined;
      geometryRegistry.clear();
      timelineGeometry.reset();
      rulerInitialized = false;
      // Open/New owns a deterministic viewport policy. Apply it before the
      // first projection so the previous document cannot seed stale rows.
      viewportElement.scrollLeft = 0;
      viewportElement.scrollTop = 0;
        window = buildViewportWindow(viewportElement, canonicalDocument.timeline.referenceClock);
      projection = projectionCoordinator.project({ snapshot: session.getSnapshot(), changeSet: { fullDocumentReplace: true }, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      renderer.update(projection);
      signalSplitRuntimeRef.current?.onDocumentReplaced();
      markOpenPhase("canonical-replaced");
      requestAnimationFrame(() => { if (active) markOpenPhase("row-shell-painted"); });
      rulerElement.replaceChildren();
      publishState();
      void renderer.whenIdle().then(() => {
        if (!active || !rendererHost.isConnected) return;
        timelineRuntime.refreshRuler();
        timelineRuntime.refreshPlayhead();
        timelineRuntime.refreshGrid();
        timelineRuntime.setZoom(timelineNavigation.getZoom());
        timelineRuntime.refreshOverlays();
        collectWaveErrors();
        publishState();
        markOpenPhase("all-visible-idle");
        rendererHost.dataset.editorIdle = "true";
      });
      },
    });

    const onScroll = () => {
      timelineRuntime.onViewportScroll();
    };
    const onViewportKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-testid='cycle-viewport']") || target.closest("input, textarea, select, button, [contenteditable='true']")) return;
      const horizontalStep = Math.max(48, Math.round(viewportElement.clientWidth * 0.18));
      const verticalStep = Math.max(48, Math.round(viewportElement.clientHeight * 0.75));
      let left: number | undefined;
      let top: number | undefined;
      if (event.key === "ArrowLeft") left = -horizontalStep;
      else if (event.key === "ArrowRight") left = horizontalStep;
      else if (event.key === "PageUp") top = -verticalStep;
      else if (event.key === "PageDown") top = verticalStep;
      else if (event.key === "Home") left = -viewportElement.scrollWidth;
      else if (event.key === "End") left = viewportElement.scrollWidth;
      if (left === undefined && top === undefined) return;
      event.preventDefault();
      viewportElement.scrollBy({ ...(left === undefined ? {} : { left }), ...(top === undefined ? {} : { top }), behavior: "auto" });
    };
    let pendingArrow: "armed" | SemanticAnchor | undefined;
    // #375: the picked-transitions workflow is shared by both line-shaped
    // types that need real geometry-anchored endpoints -- Arrow and
    // Dependency -- so it must produce whichever type the Annotation type
    // dropdown currently has selected, not a type hardcoded to "arrow".
    let pendingArrowAnnotationType: "arrow" | "dependency" = "arrow";
    armArrowPick.current = (annotationType) => {
      pendingArrow = "armed";
      pendingArrowAnnotationType = annotationType;
      setArrowPickStatus("from");
      rendererHost.dataset.arrowPick = "from";
    };
    const leftTree = rendererHost.querySelector<HTMLElement>("[data-role='left-tree-rows']");
    const treeItems = () => [...(leftTree?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? [])].filter((item) => !item.hidden && !item.closest("[hidden]"));
    const focusTreeItem = (item: HTMLElement | undefined) => {
      if (!item || !leftTree) return;
      treeFocusRowIdRef.current = item.dataset.rowId;
      for (const candidate of leftTree.querySelectorAll<HTMLElement>("[role='treeitem']")) candidate.tabIndex = candidate === item ? 0 : -1;
      item.focus({ preventScroll: true });
      leftTree.dataset.focusRowId = item.dataset.rowId ?? "";
    };
    const focusTreeChild = (groupId: string) => focusTreeItem(treeItems().find((item) => item.dataset.groupId === groupId && item.dataset.groupHeader !== "true"));
    const onTreeKeyDown = (event: KeyboardEvent) => {
      if (!leftTree || !(event.target instanceof Element) || !leftTree.contains(event.target)) return;
      const item = event.target.closest<HTMLElement>("[role='treeitem']");
      const items = treeItems();
      if (items.length === 0) return;
      const active = item ?? items.find((candidate) => candidate.dataset.rowId === treeFocusRowIdRef.current) ?? items[0];
      if (!active) return;
      const index = items.indexOf(active);
      const move = (next: HTMLElement | undefined) => { if (next) { event.preventDefault(); event.stopPropagation(); focusTreeItem(next); requestAnimationFrame(() => focusTreeItem(next)); } };
      if (event.key === "ArrowDown") { move(items[Math.min(items.length - 1, index + 1)]); return; }
      if (event.key === "ArrowUp") { move(items[Math.max(0, index - 1)]); return; }
      if (event.key === "Home") { move(items[0]); return; }
      if (event.key === "End") { move(items.at(-1)); return; }
      if (event.key === "ArrowRight" && active.dataset.groupHeader === "true") {
        if (active.getAttribute("aria-expanded") === "false") {
          event.preventDefault();
          event.stopPropagation();
          active.querySelector<HTMLElement>("[data-role='tree-collapse']")?.click();
          requestAnimationFrame(() => focusTreeChild(active.dataset.groupId ?? ""));
        } else move(items.find((candidate) => candidate.dataset.groupId === active.dataset.groupId && candidate.dataset.groupHeader !== "true"));
        return;
      }
      if (event.key === "ArrowLeft") {
        if (active.dataset.groupHeader === "true" && active.getAttribute("aria-expanded") !== "false") {
          event.preventDefault();
          event.stopPropagation();
          active.querySelector<HTMLElement>("[data-role='tree-collapse']")?.click();
          requestAnimationFrame(() => focusTreeItem(active));
        } else if (active.dataset.groupHeader !== "true") {
          move(items.find((candidate) => candidate.dataset.groupId === active.dataset.groupId && candidate.dataset.groupHeader === "true"));
        }
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        const target = active.dataset.groupHeader === "true" ? active.querySelector<HTMLElement>("[data-role='tree-branch']") : active;
        target?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: globalThis.window }));
        return;
      }
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        const rect = active.getBoundingClientRect();
        active.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, view: globalThis.window }));
      }
    };
    const onSelect = (event: MouseEvent) => {
      const closestFromEvent = <T extends Element>(selector: string): T | null => {
        const target = event.target instanceof Element ? event.target.closest<T>(selector) : null;
        if (target) return target;
        return event.composedPath().find((item): item is T => item instanceof Element && item.matches(selector)) ?? null;
      };
      const signalMore = closestFromEvent<HTMLElement>("[data-role='tree-more'][data-tree-signal-id]");
      if (signalMore?.dataset.treeSignalId) {
        event.preventDefault();
        event.stopPropagation();
        const signalId = signalMore.dataset.treeSignalId as SignalId;
        selection.selectSignal(signalId);
        setContextMenu({ x: event.clientX, y: event.clientY, target: "signal" });
        return;
      }
      const groupMore = closestFromEvent<HTMLElement>("[data-role='tree-group-more'][data-group-id]");
      if (groupMore?.dataset.groupId) {
        event.preventDefault();
        event.stopPropagation();
        const groupId = groupMore.dataset.groupId as GroupId;
        selection.selectGroup(groupId);
        setContextMenu({ x: event.clientX, y: event.clientY, target: "group" });
        return;
      }
      const collapseOwner = closestFromEvent<HTMLElement>("[data-role='tree-collapse'][data-group-id]");
      if (collapseOwner?.dataset.groupId) {
        event.preventDefault();
        event.stopPropagation();
        const groupId = collapseOwner.dataset.groupId as GroupId;
        toggleCollapsedGroup(groupId);
        return;
      }
      const visibilityOwner = closestFromEvent<HTMLElement>("[data-role='tree-visibility'][data-tree-signal-id]");
      if (visibilityOwner?.dataset.treeSignalId) {
        event.preventDefault();
        event.stopPropagation();
        const signalId = visibilityOwner.dataset.treeSignalId as SignalId;
        const signal = session.getSnapshot().document.signals.find((candidate) => candidate.id === signalId);
        if (signal) {
          commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_visibility"), type: "signal.setVisibility", signalId, visible: signal.display.visible === false });
        }
        return;
      }
      const groupOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='tree-branch'][data-group-id]") : null;
      if (groupOwner?.dataset.groupId) {
        selection.selectGroup(groupOwner.dataset.groupId as GroupId);
        focusTreeItem(groupOwner.closest<HTMLElement>("[role='treeitem']") ?? undefined);
        return;
      }
      // Endpoint picking must win over annotation selection when an existing
      // overlay sits above the actual waveform.  The snap resolver still uses
      // semantic geometry; this only keeps the overlay from swallowing the
      // browser click before that resolver runs.
      if (pendingArrow && event.target instanceof Element && event.target.closest("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']")) {
        const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
        if (!waveLayer) return;
        const bounds = waveLayer.getBoundingClientRect();
        const currentZoom = timelineNavigation.getZoom();
        const localPointer = timelineGeometry.screenToLocal({ x: event.clientX - bounds.left, y: 0 }, currentZoom);
        const snap = timelineGeometry.currentSnapIndex().nearest({ x: localPointer.x, y: event.clientY - bounds.top }, 12 / currentZoom, ["clock-edge", "signal-transition", "bus-transition"]);
        publishState();
        if (!snap) {
          setProblem("No rendered transition is within the 12 px snap tolerance.");
          return;
        }
        if (pendingArrow === "armed") {
          pendingArrow = snap.anchor;
          setArrowPickStatus("to");
          rendererHost.dataset.arrowPick = "to";
          rendererHost.dataset.snapKind = snap.kind;
          return;
        }
        const annotation: Annotation = { id: nextEntityId("annotation", session.getSnapshot().document) as AnnotationId, type: pendingArrowAnnotationType, label: "Transition", visible: true, color: "#d04a36", from: pendingArrow, to: snap.anchor, lineType: "straight", arrowhead: "end" };
        const result = application.execute({ id: nextCommandId("annotation_transition_arrow"), type: "annotation.create", annotation });
        if (result.ok) selectAnnotation(annotation.id);
        pendingArrow = undefined;
        setArrowPickStatus("idle");
        delete rendererHost.dataset.arrowPick;
        rendererHost.dataset.snapKind = snap.kind;
        return;
      }
      const annotationOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]") : null;
      if (annotationOwner?.dataset.annotationId) {
        const id = annotationOwner.dataset.annotationId as AnnotationId;
        selection.selectAnnotation(id, event.ctrlKey || event.metaKey);
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
      const id = target?.dataset.rowId;
      if (!id) return;
      const spacerGroup = session.getSnapshot().document.signalGroups.find((group) => group.rows.includes(id as SpacerId) && group.spacers?.some((spacer) => spacer.id === id));
      if (spacerGroup) {
        selection.selectSpacer(spacerGroup.id, id as SpacerId);
        focusTreeItem(target);
        return;
      }
      const signal = session.getSnapshot().document.signals.find((candidate) => candidate.id === id);
      if (!signal) return;
      startTransition(() => selection.selectSignal(signal.id, event.ctrlKey || event.metaKey));
      const nextSelected = selection.refs.signalIds.current;
      const primary = selection.refs.signalId.current;
      if (primary) rendererHost.dataset.selectedSignalId = primary;
      focusTreeItem(target);
      // Selection decoration is synchronous for immediate feedback, while the
      // diagnostic/status snapshot is observational and can wait until the next
      // frame so selection input is not held behind JSON serialization.
      requestAnimationFrame(() => publishState());
    };
    const applyCanvasCycleSelection = (cycle: number, shiftKey: boolean) => {
      const cycleCount = session.getSnapshot().document.timeline.cycleCount;
      if (cycle < 0 || cycle > cycleCount) return false;
      selectedEdgeRef.current = undefined;
      setRangeSelectionActive(true);
      setSelectedCycle(cycle);
      rendererHost.dataset.selectedCycle = String(cycle);
      if (shiftKey) {
        const anchor = timelineRangeRef.current.start;
        setTimelineRange({ start: Math.min(anchor, cycle), end: Math.min(cycleCount, Math.max(anchor, cycle) + 1) });
      } else if (cycle === cycleCount) {
        setTimelineRange({ start: Math.max(0, cycle - 1), end: cycle });
      } else {
        setTimelineRange({ start: cycle, end: cycle + 1 });
      }
      publishState();
      return true;
    };
    const selectedClockEdgeAtPointer = (event: MouseEvent): SelectedClockEdge | undefined => {
      const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
      if (!waveLayer) return undefined;
      const bounds = waveLayer.getBoundingClientRect();
      const currentZoom = timelineNavigation.getZoom();
      const localPointer = timelineGeometry.screenToLocal({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, currentZoom);
      const snap = timelineGeometry.currentSnapIndex().nearest({ x: localPointer.x, y: event.clientY - bounds.top }, 14 / currentZoom, ["clock-edge"]);
      const signalId = snap?.anchor.signalId;
      const point = snap?.anchor.point;
      if (!signalId || (point !== "rising-edge" && point !== "falling-edge")) return undefined;
      return { signalId, cycle: snap.anchor.cycle, kind: point === "rising-edge" ? "rising" : "falling" };
    };
    const selectCanvasCycle = (event: MouseEvent) => {
      if (!isTimeDomainPointerTarget(event)) return false;
      const cycle = cycleBoundaryAtX(event.clientX);
      if (cycle === undefined) return false;
      const selectedEdge = selectedClockEdgeAtPointer(event);
      const accepted = applyCanvasCycleSelection(cycle, event.shiftKey);
      if (accepted) {
        selectedEdgeRef.current = selectedEdge;
        timelineRuntime.refreshOverlays();
      }
      return accepted;
    };
    const onRulerSelect = (event: MouseEvent) => {
      if (rangeInteractions.consumeRulerClickSuppression()) return;
      const tick = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cycle]") : null;
      if (!tick) return;
      const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle);
      if (!Number.isInteger(cycle) || cycle > session.getSnapshot().document.timeline.cycleCount) return;
      selectedEdgeRef.current = undefined;
      setRangeSelectionActive(true);
      setSelectedCycle(cycle);
      rendererHost.dataset.selectedCycle = String(cycle);
      if (cycle === session.getSnapshot().document.timeline.cycleCount) {
        setTimelineRange({ start: Math.max(0, cycle - 1), end: cycle });
        return;
      }
      if (event.shiftKey) {
        const anchor = timelineRangeRef.current.start;
        setTimelineRange({ start: Math.min(anchor, cycle), end: Math.max(anchor, cycle) + 1 });
      } else setTimelineRange({ start: cycle, end: cycle + 1 });
      timelineRuntime.refreshOverlays();
    };
    let rangeInteractions!: TimelineRangeInteractionOwner;
    const cycleBoundaryAtX = (clientX: number): number | undefined => {
      const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
      if (!waveLayer) return undefined;
      const bounds = waveLayer.getBoundingClientRect();
      return timelineGeometry.cycleBoundaryAtScreenX(clientX, bounds.left, timelineNavigation.getZoom(), snapEnabledRef.current);
    };
    // The ruler ticks are placed from the same LocalGeometryMap as the
    // waveform. Their screen rectangles therefore provide the shared
    // interaction-space boundary resolver for both drag surfaces.
    // Ruler labels are a bounded presentation sample. Resolve pointer input
    // from the complete waveform geometry so omitted labels never change the
    // canonical cycle selected by a drag.
    const cycleBoundaryAtPointerX = (clientX: number): number | undefined => cycleBoundaryAtX(clientX);
    const timeDomainExclusions = [
      "[data-role='left-tree-rows']",
      "[data-role='frozen-label-rows']",
      "[data-role='annotation-owner']",
      "[data-role='annotation-body']",
      "[data-role='annotation-label']",
      "[data-role='annotation-handle']",
      "[data-testid='transaction-lanes']",
      "[data-transaction-id]",
      ".transaction-lane",
      "[data-testid='editor-legend']",
      "[role='menu']",
      "button",
      "input",
      "select",
      "textarea",
      "[contenteditable='true']",
      "[role='separator']",
      "[draggable='true']",
    ].join(", ");
    const isTimeDomainPointerTarget = (event: MouseEvent | PointerEvent): boolean => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (!target || target.closest(timeDomainExclusions)) return false;
      const viewportBounds = viewportElement.getBoundingClientRect();
      const timeDomainLeft = viewportBounds.left + timelineOffset();
      const insideViewport = event.clientX >= timeDomainLeft
        && event.clientX <= viewportBounds.right
        && event.clientY >= viewportBounds.top
        && event.clientY <= viewportBounds.bottom;
      if (!insideViewport) return false;
      // The viewport is the interaction contract; the renderer/ruler layers
      // are implementation details and must not be enumerated as hit areas.
      return target === viewportElement || viewportElement.contains(target);
    };
    rangeInteractions = new TimelineRangeInteractionOwner({
      rendererHost,
      isTimeDomainPointerTarget,
      cycleBoundaryAtX: cycleBoundaryAtPointerX,
      getCycleCount: () => session.getSnapshot().document.timeline.cycleCount,
      getRange: () => timelineRangeRef.current,
      getSelectedCycle: () => selectedCycleRef.current,
      setSelectedCyclePreview: (cycle) => { selectedCycleRef.current = cycle; },
      setRangeSelectionActive,
      setRange: setTimelineRange,
      setSelectedCycle,
      applyCanvasCycleSelection,
      refreshRange: refreshRangePreview,
      refreshPlayhead: () => timelineRuntime.refreshPlayhead(),
    });
    const onRangePointerDown = rangeInteractions.pointerDown;
    const onRangePointerMove = rangeInteractions.pointerMove;
    const onRangePointerUp = rangeInteractions.pointerUp;
    const onRangePointerCancel = rangeInteractions.pointerCancel;
    const onRangeKeyDown = rangeInteractions.keyDown;
    const treeDrag = new TreeDragInteractionOwner({
      rendererHost,
      getDocument: () => session.getSnapshot().document,
      execute: (command) => { commandRegistry.current.execute<SemanticCommand>("semantic.execute", command); },
    });
    const onDragStart = treeDrag.onDragStart;
    const onDragOver = treeDrag.onDragOver;
    const onDrop = treeDrag.onDrop;
    const onDragEnd = treeDrag.onDragEnd;
    const annotationInteraction = new AnnotationInteractionOwner({
      rendererHost,
      renderer,
      timelineGeometry,
      documentEpoch,
      getZoom: () => timelineNavigation.getZoom(),
      getDocument: () => session.getSnapshot().document,
      getProjection: () => projection,
      isSnapEnabled: () => snapEnabledRef.current,
      execute: (command) => { commandRegistry.current.execute<SemanticCommand>("semantic.execute", command); },
      executeBatch: (commands) => { application.executeBatch(nextCommandId("annotation_group_move"), commands); },
      getDragTargets: (annotationId) => {
        const document = session.getSnapshot().document;
        const group = (document.annotationGroups ?? []).find((candidate) => candidate.annotationIds.includes(annotationId as AnnotationId));
        if (group) return new Set(group.annotationIds);
        const multi = selection.refs.annotationIds.current;
        if (multi.size > 1 && multi.has(annotationId as AnnotationId)) return new Set(multi);
        return new Set([annotationId]);
      },
      publishState,
    });
    const clearAnnotationPreview = annotationInteraction.cancel;
    const onAnnotationPointerDown = annotationInteraction.onPointerDown;
    const onAnnotationPointerMove = annotationInteraction.onPointerMove;
    const onAnnotationPointerUp = annotationInteraction.onPointerUp;
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      const handled = routeGlobalShortcut(event, {
        isGestureActive: () => annotationInteraction.active,
        execute: (name) => commandRegistry.current.execute(name),
        cancel: () => {
          closeContextMenu();
          clearAnnotationPreview();
          pendingArrow = undefined;
          setArrowPickStatus("idle");
          delete rendererHost.dataset.arrowPick;
        },
      });
      if (!handled) annotationInteraction.nudge(event);
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-row-id], [data-annotation-id], [data-role='tree-more'], [data-role='tree-group-more']")) return;
       event.preventDefault();
       const menuTarget = event.target.closest<HTMLElement>("[data-row-id], [data-annotation-id], [data-role='tree-more'], [data-role='tree-group-more']");
       menuOriginRef.current = menuTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
       // #195: right-clicking a member that is already part of the current
       // multi-selection must not collapse it down to just that member --
       // only rebuild the selection when the target isn't already selected,
       // so Context Menu commands keep operating on the full preserved set.
       const rowId = menuTarget?.dataset.rowId;
       const annotationId = menuTarget?.dataset.annotationId;
       const alreadySelected = (rowId !== undefined && selection.refs.signalIds.current.has(rowId as SignalId))
         || (annotationId !== undefined && selection.refs.annotationIds.current.has(annotationId as AnnotationId));
       if (!alreadySelected) onSelect(event);
       setContextMenu({ x: event.clientX, y: event.clientY, target: event.target instanceof Element && event.target.closest("[data-annotation-id]") ? "annotation" : event.target.closest("[data-role='tree-group-more']") ? "group" : "signal" });
    };
    const onCanvasClick = (event: MouseEvent) => {
      if (suppressCanvasClickRef.current) { suppressCanvasClickRef.current = false; return; }
      if (rangeInteractions.consumeCanvasClickSuppression()) return;
      const target = event.target instanceof Element ? event.target : undefined;
      // Renderer-owned command controls must win over the time-domain hit
      // resolver, even when the browser reports an inner SVG path as target.
      // Their actions are routed by onSelect into SemanticCommand.
      if (target?.closest("[data-role='tree-visibility'], [data-role='tree-more'], [data-role='tree-collapse'], [data-role='tree-group-more']")) { onSelect(event); return; }
      if (target?.closest("[data-row-id], [data-annotation-id], [data-transaction-id]")) { onSelect(event); return; }
      if (rendererHost.dataset.arrowPick) onSelect(event); else if (!selectCanvasCycle(event)) onSelect(event);
    };
    const onViewportClick = (event: MouseEvent) => {
      if (suppressCanvasClickRef.current) { suppressCanvasClickRef.current = false; return; }
      const target = event.target instanceof Element ? event.target : undefined;
      if (target && (rendererHost.contains(target) || target.closest("[data-testid='cycle-ruler']"))) return;
      if (rangeInteractions.consumeCanvasClickSuppression()) return;
      if (rendererHost.dataset.arrowPick) onSelect(event);
      else selectCanvasCycle(event);
    };
    const detachTimelineListeners = attachEditorEventBindings([
      ...(leftTree ? [{ target: leftTree, type: "keydown", listener: onTreeKeyDown as EventListener }] : []),
      { target: viewportElement, type: "scroll", listener: onScroll as EventListener, options: { passive: true } },
      { target: viewportElement, type: "keydown", listener: onViewportKeyDown as EventListener },
      { target: rendererHost, type: "click", listener: onCanvasClick as EventListener },
      { target: rendererHost, type: "pointerdown", listener: onRangePointerDown as EventListener },
      { target: rendererHost, type: "pointermove", listener: onRangePointerMove as EventListener },
      { target: rendererHost, type: "pointerup", listener: onRangePointerUp as EventListener },
      { target: rendererHost, type: "pointercancel", listener: onRangePointerCancel as EventListener },
      { target: rendererHost.ownerDocument, type: "keydown", listener: onRangeKeyDown as EventListener },
      { target: rendererHost, type: "dragstart", listener: onDragStart as EventListener },
      { target: rendererHost, type: "dragover", listener: onDragOver as EventListener },
      { target: rendererHost, type: "drop", listener: onDrop as EventListener },
      { target: rendererHost, type: "dragend", listener: onDragEnd as EventListener },
      { target: viewportElement, type: "click", listener: onViewportClick as EventListener },
      { target: viewportElement, type: "pointerdown", listener: onRangePointerDown as EventListener },
      { target: viewportElement, type: "pointermove", listener: onRangePointerMove as EventListener },
      { target: viewportElement, type: "pointerup", listener: onRangePointerUp as EventListener },
      { target: viewportElement, type: "pointercancel", listener: onRangePointerCancel as EventListener },
      { target: rulerViewportElement, type: "click", listener: onRulerSelect as EventListener },
      { target: rulerViewportElement, type: "pointerdown", listener: onRangePointerDown as EventListener },
      { target: rulerViewportElement, type: "pointermove", listener: onRangePointerMove as EventListener },
      { target: rulerViewportElement, type: "pointerup", listener: onRangePointerUp as EventListener },
      { target: rulerViewportElement, type: "pointercancel", listener: onRangePointerCancel as EventListener },
      { target: rendererHost, type: "pointerdown", listener: onAnnotationPointerDown as EventListener },
      { target: rendererHost, type: "pointermove", listener: onAnnotationPointerMove as EventListener },
      { target: rendererHost, type: "pointerup", listener: onAnnotationPointerUp as EventListener },
      { target: rendererHost, type: "pointercancel", listener: clearAnnotationPreview as EventListener },
      { target: rendererHost, type: "contextmenu", listener: onContextMenu as EventListener },
      { target: rendererHost.ownerDocument, type: "keydown", listener: onGlobalKeyDown as EventListener },
    ]);
    return () => {
      active = false;
      applyCollapsedGroupsRef.current = () => undefined;
      refreshPlayhead.current = () => undefined;
      detachTimelineNavigation();
      cancelAnimationFrame(frame);
      detachTimelineListeners();
      timelineRuntime.detach();
      timelineRuntime.dispose();
      timelineRuntimeRef.current = null;
      detachApplicationHandler();
      detachDocumentLifecycle();
      armArrowPick.current = () => undefined;
      snapTransactionCycle.current = () => undefined;
      renderCoordinator.dispose();
    };
  }, []);

  // Signal Split View (#200) PR 4: builds the Lower pane's own real
  // renderer/adapter/geometry/projection pipeline (mirroring the primary
  // mount effect's pattern, via the same runtime factory methods) whenever
  // Split turns on, mounted into hostLower; disposes it and reverts Upper's
  // pane filter whenever Split turns off. Upper does NOT get a second
  // projection instance -- it keeps using the primary mount effect's own
  // `projectionCoordinator` (runtime.projection) and just switches that one
  // instance's fixed pane filter via `setPane()`, so there is still exactly
  // one Upper-owned row-layout authority, and (per #200's own constraint) no
  // second pixels-per-cycle/horizontal-geometry owner is ever created here --
  // Lower reuses the shared `runtime.displayMapping` cycle mapping and has
  // its own CSS `--presentation-x-scale`/width mirrored from Upper's single
  // authoritative value below, never computing its own.
  useEffect(() => {
    const runtime = application.runtime;
    if (!signalSplitEnabled) {
      signalSplitRuntimeRef.current?.dispose();
      signalSplitRuntimeRef.current = null;
      runtime.projection.setPane(undefined);
      forceUpperReprojectRef.current();
      return;
    }
    const hostLowerElement = hostLower.current;
    const viewportLowerElement = viewportLower.current;
    if (!hostLowerElement || !viewportLowerElement) return;
    let active = true;
    const { geometry: geometryRegistryLower, projection: projectionCoordinatorLower } = runtime.createSignalSplitLowerPane();
    const adapterLower = runtime.createWaveDromAdapter();
    const providerLower = createWaveformSurfaceProvider({
      sessionController: runtime.session,
      mappingCache: runtime.displayMapping,
      adapter: adapterLower,
      geometryRegistry: geometryRegistryLower,
      // Lower doesn't own open/first-paint instrumentation (Upper's single
      // mount effect already reports that for the document as a whole) and
      // doesn't do its own snap-index lookups (snap is Upper-owned, per the
      // single-authority constraint above), so both are no-ops here.
      markOpenPhase: () => undefined,
      invalidateSnapIndex: () => undefined,
    });
    const renderCoordinatorLower = runtime.createRenderer(providerLower);
    const rendererLower = renderCoordinatorLower.renderer;
    const initialSnapshot = runtime.session.snapshot();
    const initialLower = mountInitialTimelineProjection({
      coordinator: renderCoordinatorLower,
      renderer: rendererLower,
      host: hostLowerElement,
      viewport: viewportLowerElement,
      referenceClock: initialSnapshot.document.timeline.referenceClock,
      projectionCoordinator: projectionCoordinatorLower,
      snapshot: initialSnapshot,
      collapsedGroupIds: [...collapsedGroupIdsRef.current],
    });
    let lowerWindow = initialLower.window;
    let lowerProjection = initialLower.projection;
    // Lower's own vertical scroll must re-virtualize its rows exactly like
    // Upper's viewport does (via timelineRuntime.onViewportScroll() in the
    // primary mount effect) -- without this, Lower would only ever mount
    // whatever rows happened to fall in its initial mount-time window,
    // never responding to the user scrolling it. This is Lower-local
    // (Y-axis row mounting), not the shared horizontal/pixels-per-cycle
    // authority, so it doesn't conflict with the single-owner constraint.
    const reprojectLowerViewportOnly = () => {
      if (!active) return;
      lowerWindow = buildViewportWindow(viewportLowerElement, runtime.session.snapshot().document.timeline.referenceClock);
      lowerProjection = projectionCoordinatorLower.project({ snapshot: runtime.session.snapshot(), changeSet: {}, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      rendererLower.update(lowerProjection);
    };
    viewportLowerElement.addEventListener("scroll", reprojectLowerViewportOnly, { passive: true });
    signalSplitRuntimeRef.current = {
      onDocumentChanged: (result) => {
        if (!active) return;
        lowerWindow = buildViewportWindow(viewportLowerElement, result.snapshot.document.timeline.referenceClock);
        lowerProjection = projectionCoordinatorLower.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
        rendererLower.update(lowerProjection);
      },
      // The splitter (signalSplitRatio) resizes Lower's viewport via CSS
      // height alone -- unlike a real scroll, that never fires a "scroll"
      // event on its own, so Lower would keep mounting rows sized for its
      // pre-resize viewport until the user happened to scroll it. Re-run
      // the same viewport-only reproject explicitly whenever the ratio
      // changes (wired below).
      onViewportResize: reprojectLowerViewportOnly,
      onDocumentReplaced: () => {
        if (!active || !viewportLowerElement.isConnected) return;
        geometryRegistryLower.clear();
        viewportLowerElement.scrollLeft = 0;
        viewportLowerElement.scrollTop = 0;
        const replacedSnapshot = runtime.session.snapshot();
        lowerWindow = buildViewportWindow(viewportLowerElement, replacedSnapshot.document.timeline.referenceClock);
        lowerProjection = projectionCoordinatorLower.project({ snapshot: replacedSnapshot, changeSet: { fullDocumentReplace: true }, viewport: lowerWindow, previous: lowerProjection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
        rendererLower.update(lowerProjection);
      },
      getTotalHeight: () => lowerProjection.totalHeight,
      dispose: () => { renderCoordinatorLower.dispose(); },
    };
    // Upper must now show only its own pane's Signals too -- switch the
    // shared Upper projection's filter and force it to redraw immediately,
    // using the document as it stands right now (view-only: no command, no
    // history/dirty/canonical delta).
    runtime.projection.setPane("upper");
    forceUpperReprojectRef.current();
    // Paint Lower's initial grid/playhead/range presentation immediately --
    // otherwise it would stay blank until the next unrelated grid/playhead/
    // range-triggering event happened to fire.
    timelineRuntimeRef.current?.refreshGrid();
    refreshPlayhead.current();
    refreshRangeSelectionBand.current();
    return () => {
      active = false;
      viewportLowerElement.removeEventListener("scroll", reprojectLowerViewportOnly);
      renderCoordinatorLower.dispose();
      if (signalSplitRuntimeRef.current) signalSplitRuntimeRef.current = null;
    };
  }, [signalSplitEnabled]);

  // The splitter changes Lower's (and correspondingly Upper's) real CSS
  // height via signalSplitRatio; re-virtualize Lower's rows for its new
  // viewport size the same way Upper's own resize effect above does.
  useEffect(() => {
    signalSplitRuntimeRef.current?.onViewportResize();
  }, [signalSplitRatio]);

  // Signal Split View (#200) PR 3/4: the Lower pane's viewport scrolls
  // vertically fully independently (native `overflow-y: auto`, no wiring
  // needed) but must share ONE horizontal time domain with Upper. Neither
  // side is a persistent "leader" -- whichever pane the user actually
  // scrolled drives the other, guarded by an equality check so the
  // opposite side's own scroll listener firing from the mirrored write
  // doesn't bounce back and forth. The ruler's horizontal position is a
  // CSS transform (see syncRulerScroll in use-editor-runtime-bridge.ts);
  // mirroring that same transform string onto Lower's ruler keeps its
  // ticks aligned without re-deriving it independently. Lower's surface
  // width and presentation scale are mirrored from Upper's single
  // authoritative values so both panes render at the exact same horizontal
  // scale without Lower ever computing its own.
  useEffect(() => {
    if (!signalSplitEnabled) return;
    const upperViewport = viewport.current;
    const lowerViewport = viewportLower.current;
    if (!upperViewport || !lowerViewport) return;
    const mirrorPresentation = () => {
      const upperRulerContent = ruler.current;
      const lowerRulerContent = rulerLower.current;
      if (upperRulerContent && lowerRulerContent) lowerRulerContent.style.transform = upperRulerContent.style.transform;
      if (host.current && hostLower.current) {
        hostLower.current.style.width = host.current.style.width;
        const scale = host.current.style.getPropertyValue("--presentation-x-scale");
        if (scale) {
          hostLower.current.style.setProperty("--presentation-x-scale", scale);
          viewportLower.current?.style.setProperty("--presentation-x-scale", scale);
        }
      }
    };
    // Upper is the sole horizontal-scroll authority (per #200's single
    // pixels-per-cycle/horizontal-geometry-owner constraint): Upper's own
    // scroll always drives Lower's scrollLeft to match. Lower's own "scroll"
    // event only re-syncs presentation (ruler/scale/width) and must NEVER
    // write back to Upper -- Lower's real WaveDrom content mounts
    // asynchronously as rows render, and a resulting incidental reflow can
    // fire a native "scroll" event on Lower even with no user interaction;
    // writing that back to Upper would silently clobber the user's actual
    // scroll position with Lower's still-settling one.
    const onUpperScroll = () => {
      if (lowerViewport.scrollLeft !== upperViewport.scrollLeft) lowerViewport.scrollLeft = upperViewport.scrollLeft;
      mirrorPresentation();
    };
    const onLowerScroll = () => {
      if (lowerViewport.scrollLeft !== upperViewport.scrollLeft) lowerViewport.scrollLeft = upperViewport.scrollLeft;
      mirrorPresentation();
    };
    upperViewport.addEventListener("scroll", onUpperScroll);
    lowerViewport.addEventListener("scroll", onLowerScroll);
    mirrorPresentation();
    return () => {
      upperViewport.removeEventListener("scroll", onUpperScroll);
      lowerViewport.removeEventListener("scroll", onLowerScroll);
    };
  }, [signalSplitEnabled, zoom]);

  useEffect(() => {
    refreshPlayhead.current();
  }, [selectedCycle, playheadPresentationRevision, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth]);
  useEffect(() => {
    refreshRangeSelectionBand.current();
  }, [rangePresentationRevision, timelineRange, rangeSelectionActive, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth]);

  useEffect(() => {
    refreshTransactionLinkedRows(host, new Set(selectedTransaction?.linkedSignals ?? []));
  }, [selectedTransactionId, transactionPresentationRevision]);

  const createSelectedAnnotation = (annotation: Annotation) => {
    const result = application.execute({ id: nextCommandId("annotation_create"), type: "annotation.create", annotation });
    if (!result.ok) return;
    selection.selectAnnotation(annotation.id);
  };
  const selectAnnotation = (id: AnnotationId) => {
    selection.selectAnnotation(id);
  };
  const deleteBottomSignal = () => {
    if (!bottomSignal) return;
    const result = editActions.deleteSignal(bottomSignal.id);
    if (result.ok && !bottomPinnedRef.current && selectedSignalRef.current === bottomSignal.id) {
      selection.clear();
    }
  };
  const deleteBottomAnnotation = () => {
    if (!bottomAnnotation) return;
    const result = editActions.deleteAnnotation(bottomAnnotation.id);
    if (result.ok && !bottomPinnedRef.current && selectedAnnotationRef.current === bottomAnnotation.id) {
      selection.clear();
    }
  };
  const deleteBottomTransaction = () => {
    if (!bottomTransaction) return;
    const result = editActions.deleteTransaction(bottomTransaction.id);
    if (result.ok && !bottomPinnedRef.current && selectedTransactionRef.current === bottomTransaction.id) {
      selection.clear();
    }
  };
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
    onDuplicate={(source) => {
      const duplicate = { ...source, id: nextEntityId("annotation", snapshot.document) as AnnotationId };
      const result = application.execute({ id: nextCommandId("annotation_duplicate"), type: "annotation.create", annotation: duplicate });
      if (result.ok) selectAnnotation(duplicate.id);
    }}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={deleteBottomAnnotation}
    onCancel={() => setBottomResetToken((value) => value + 1)}
    onPreview={(draft) => refreshAnnotationPreview(host.current!, bottomAnnotation.id, draft, { label: bottomAnnotation.label, color: bottomAnnotation.color, opacity: bottomAnnotation.opacity })}
  /> : <><AnnotationList annotations={snapshot.document.annotations} selectedId={undefined} onSelect={selectAnnotation} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} /><div className="empty-editor">Select or create an Annotation.</div></>;
  const selectTransaction = (id: TransactionId) => {
    selection.selectTransaction(id);
  };
  // #388: Bookmark selection is its own lightweight view-only piece of
  // state (not folded into the shared SelectionOwner, which drives
  // clipboard/rename/delete-selection routing that Bookmark never
  // participates in -- Bookmark already has its own dedicated
  // bookmark.create/update/delete commands). One owner across Ribbon
  // Previous/Next, the Bottom Bookmark list, and canvas ruler marker
  // clicks -- never a second Bookmark collection copy (the list itself
  // always reads live from `snapshot.document.bookmarks`).
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<BookmarkId | undefined>(undefined);
  const selectedBookmark = selectedBookmarkId === undefined ? undefined : snapshot.document.bookmarks.find((item) => item.id === selectedBookmarkId);
  const selectBookmark = (id: BookmarkId) => setSelectedBookmarkId(id);
  const revealBookmark = (start: number) => timelineNavigation.navigateToCycle(start);
  const bookmarksRef = useRef(snapshot.document.bookmarks);
  bookmarksRef.current = snapshot.document.bookmarks;
  const deleteBottomBookmark = () => {
    if (!selectedBookmark) return;
    const result = commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: nextCommandId("bookmark_delete"), type: "bookmark.delete", bookmarkId: selectedBookmark.id });
    if (result.ok) setSelectedBookmarkId(undefined);
  };
  // #388: clicking a Bookmark marker on the ruler selects the same Bottom
  // row -- a small, independent listener (not folded into the primary
  // mount effect above) so it never touches the existing pointer-based
  // range-selection/drag gesture owner. A marker click still resolves an
  // ordinary cycle selection through that owner too (the marker has no
  // `data-cycle`, so `rulerCycleAtTarget` falls through to the geometry-
  // based boundary at that x position) -- both effects composing is
  // intentional, not a conflict: selecting the cycle under a Bookmark
  // while also selecting the Bookmark itself is the expected behavior.
  useEffect(() => {
    const rulerElement = ruler.current;
    if (!rulerElement) return;
    const markerAt = (event: MouseEvent) => event.target instanceof Element ? event.target.closest<HTMLElement>("[data-bookmark-id]") : null;
    const onRulerClick = (event: MouseEvent) => {
      const id = markerAt(event)?.dataset.bookmarkId;
      if (id) setSelectedBookmarkId(id as BookmarkId);
    };
    // A double-click on the marker also reveals it (same Reveal contract as
    // the Bottom Bookmark list's own row double-click), matching the single
    // gesture the removed Ribbon "jump" button used to offer.
    const onRulerDoubleClick = (event: MouseEvent) => {
      const marker = markerAt(event);
      const id = marker?.dataset.bookmarkId;
      if (!id) return;
      const bookmark = bookmarksRef.current.find((item) => item.id === id);
      if (bookmark) timelineNavigation.navigateToCycle(bookmark.start);
    };
    rulerElement.addEventListener("click", onRulerClick);
    rulerElement.addEventListener("dblclick", onRulerDoubleClick);
    return () => {
      rulerElement.removeEventListener("click", onRulerClick);
      rulerElement.removeEventListener("dblclick", onRulerDoubleClick);
    };
  }, []);
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
  const bookmarkEditor = <BookmarkEditor
    key={`${selectedBookmark?.id ?? "none"}:${snapshot.revision}:${bottomResetToken}`}
    bookmark={selectedBookmark}
    document={snapshot.document}
    history={history}
    onSelect={selectBookmark}
    onReveal={revealBookmark}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={deleteBottomBookmark}
    onCancel={() => setBottomResetToken((value) => value + 1)}
  />;
  // #395 PR3: the local Agent Bridge connection itself -- owned here
  // (not inside AIOperationPanel) so the Ribbon's Provider status can
  // show the same real, live connection state the Bottom AI Assistant's
  // Settings section manages. Off by default; see ai-bridge-client.ts
  // and scripts/ai-bridge-server.mjs for exactly what it can and cannot
  // do (three named tools, localhost-only, token-gated, no arbitrary
  // Canonical JSON patch path).
  const aiBridgeHost = "127.0.0.1";
  const aiBridgePort = 4610;
  const [aiBridgeEnabled, setAiBridgeEnabled] = useState(false);
  const [aiBridgeToken, setAiBridgeToken] = useState("");
  const aiBridgeOnViewIntent = (intent: AIViewIntent) => { if (intent === "fit-all") timelineNavigation.fitAll(); else setRibbonTab("Timeline"); };
  const aiBridgeStatus = useAIBridgeClient(aiBridgeEnabled, aiBridgeHost, aiBridgePort, aiBridgeToken, {
    document: snapshot.document,
    selectedSignalId: annotationTargetSignalId,
    selectedGroupId: selectedGroup?.id,
    selectedAnnotationId: selectedAnnotation?.id,
    selectedTransactionId,
    onViewIntent: aiBridgeOnViewIntent,
  });
  // #395 PR1: the AI Ribbon tab used to host the entire query/preview/
  // apply surface directly -- a narrow control competing for space with
  // every other Ribbon tab's icon-button rows. It now lives here, as the
  // Bottom Panel's own "AI Assistant" tab (opened via the Ribbon's Ask/
  // Edit trigger, see onOpenAIAssistant below), the same relocation this
  // codebase already uses for Transaction/Bookmarks. AIOperationPanel's
  // own preview/validate/apply logic is completely unchanged -- this is
  // still the one and only proposal/apply owner; only where it renders
  // moved.
  const aiAssistantPanel = <AIOperationPanel
    document={snapshot.document}
    revision={snapshot.revision}
    selectedSignalId={annotationTargetSignalId}
    selectedGroupId={selectedGroup?.id}
    selectedAnnotationId={selectedAnnotation?.id}
    selectedTransactionId={selectedTransactionId}
    range={timelineRange}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onCommandBatch={(commands) => application.executeBatch(nextCommandId("ribbon_annotation_arrange"), commands)}
    onViewIntent={aiBridgeOnViewIntent}
    bridgeHost={aiBridgeHost}
    bridgePort={aiBridgePort}
    bridgeEnabled={aiBridgeEnabled}
    onBridgeEnabledChange={setAiBridgeEnabled}
    bridgeToken={aiBridgeToken}
    onBridgeTokenChange={setAiBridgeToken}
    bridgeStatus={aiBridgeStatus}
    onDiagnostic={(next) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("ai-proposal:")), ...nextDiagnostics]); }}
    icon={null}
  />;
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

  function applySelectionDecorations(next: SelectionState): void {
    const rendererHost = host.current;
    if (!rendererHost) return;
    if (next.signalId) rendererHost.dataset.selectedSignalId = next.signalId;
    else delete rendererHost.dataset.selectedSignalId;
    const previous = previousSelectionDecorationRef.current;
    const affectedSignalIds = new Set<string>([
      ...(previous?.signalIds ?? []), ...(next.signalIds ?? []),
      ...(previous?.spacerId ? [previous.spacerId] : []), ...(next.spacerId ? [next.spacerId] : []),
    ]);
    for (const id of affectedSignalIds) for (const row of rendererHost.querySelectorAll<HTMLElement>(`[data-row-id="${CSS.escape(id)}"], [data-signal-id="${CSS.escape(id)}"]`)) {
      const isSelected = next.signalIds.has(id as SignalId) || id === next.spacerId;
      row.dataset.selected = String(isSelected);
      row.setAttribute("aria-selected", String(isSelected));
    }
    // Multi-select-aware version of the upstream perf fix: diff against the
    // previous decoration (previous U next, not every [data-annotation-id]
    // in the document) so only actually-changed rows get touched, same as
    // upstream, but membership in `next.annotationIds` (not equality to a
    // single `next.annotationId`) decides selected state so a multi-select
    // Arrange target set still decorates correctly.
    const affectedAnnotationIds = new Set([...(previous?.annotationIds ?? []), ...next.annotationIds]);
    for (const id of affectedAnnotationIds) for (const owner of rendererHost.querySelectorAll<HTMLElement>(`[data-annotation-id="${CSS.escape(String(id))}"]`)) owner.dataset.selected = String(next.annotationIds.has(id));
    const affectedGroupIds = new Set([previous?.groupId, next.groupId].filter(Boolean));
    for (const id of affectedGroupIds) for (const treeItem of rendererHost.querySelectorAll<HTMLElement>(`[role="treeitem"][data-row-id="${CSS.escape(String(id))}:header"]`)) treeItem.setAttribute("aria-selected", String(id === next.groupId));
    previousSelectionDecorationRef.current = next;
  }

  const clearSelection = () => {
    selection.clear();
  };
  const selectAllSignals = () => {
    const ids = snapshot.document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
    const selected = new Set(ids);
    const primary = ids[0];
    selection.selectSignals(selected, primary);
  };
  selectAllRef.current = selectAllSignals;
  const copySelectedSignal = editActions.copy;
  const cutSelectedSignal = editActions.cut;
  const pasteSelectedEntity = editActions.paste;
  const duplicateSelectedEntity = editActions.duplicate;
  const createCopiedSignals = editActions.createSignals;
  const renameSelection = () => {
    const current = selectedSignal?.display.name ?? selectedGroup?.name ?? selectedTransaction?.name;
    if (current === undefined) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const homeOverflowTrigger = active?.closest<HTMLElement>("[role='menu']")?.getAttribute("aria-label") === "More Home Commands"
      ? [...document.querySelectorAll<HTMLButtonElement>("[data-testid='ribbon'] button")].find((button) => button.textContent?.trim() === "More") ?? null
      : null;
    renameDialogOriginRef.current = menuOriginRef.current ?? homeOverflowTrigger ?? active;
    setRenameDraft(current);
    setRenameError("");
    setRenameDialogOpen(true);
  };
  const applyRename = () => {
    const name = renameDraft.trim();
    if (!name) {
      setRenameError("Name is required.");
      return;
    }
    commandRegistry.current.execute("selection.rename", { name });
    setRenameDialogOpen(false);
    setRenameError("");
  };
  const setSelectionVisibility = editActions.setVisibility;
  const moveSelection = editActions.move;
  const toggleBottomPin = () => {
    if (bottomPinned) {
      setBottomPinned(false);
      setPinnedBottomSelection(undefined);
      return;
    }
    setPinnedBottomSelection({
      ...(selectedId === undefined ? {} : { signalId: selectedId }),
      ...(selectedGroupId === undefined ? {} : { groupId: selectedGroupId }),
      ...(selectedAnnotationId === undefined ? {} : { annotationId: selectedAnnotationId }),
      ...(selectedTransactionId === undefined ? {} : { transactionId: selectedTransactionId }),
    });
    setBottomPinned(true);
  };
  const selectHierarchySignal = (id: SignalId) => {
    const signal = snapshot.document.signals.find((item) => item.id === id);
    if (!signal) return;
    selection.selectSignal(id);
  };
  const revealSelectedInHierarchy = () => {
    if (!selectedSignal) return;
    selection.selectSignal(selectedSignal.id);
    requestAnimationFrame(() => host.current?.querySelector<HTMLElement>(`[data-role='left-tree-rows'] [data-row-id='${CSS.escape(selectedSignal.id)}']`)?.scrollIntoView({ block: "nearest" }));
  };
  const registerBulkSignals = () => {
    const targetGroupId = bulkRegistrationGroupId ?? snapshot.document.signalGroups.at(-1)?.id;
    if (!targetGroupId) return;
    if (!bulkRegistrationPreview || bulkRegistrationPreview.sourceText !== bulkRegistrationText) {
      setBulkRegistrationStatus("Preview the definitions before applying.");
      return;
    }
    if (bulkRegistrationPreview.errors.length > 0 || bulkRegistrationPreview.definitions.length === 0) {
      setBulkRegistrationStatus("Fix preview errors before applying.");
      return;
    }
    const signals: Signal[] = [];
    for (const [index, definition] of bulkRegistrationPreview.definitions.entries()) {
      const id = signalId(`${nextEntityId("signal", snapshot.document)}_bulk_${index}`);
      if (definition.kind === "clock") {
        signals.push({ id, name: definition.signalName, type: "clock", role: "internal", source: { instancePath: definition.instancePath, signalName: definition.signalName }, display: { name: definition.signalName }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } });
      } else {
        const type = definition.kind;
        const initialValue = type === "state" ? "IDLE" : type === "bus" ? "0" : type === "event" ? "NONE" : 0;
        const signal = valueSignal(id, definition.signalName, "internal", [{ start: 0, value: initialValue }], type === "bus" ? { type, width: definition.width ?? 1, displayFormat: "hex" } : { type });
        signals.push({ ...signal, source: { ...signal.source, instancePath: definition.instancePath } });
      }
    }
    const result = commandRegistry.current.execute<SemanticCommand, ReturnType<CommandHistorySession["execute"]>>("semantic.execute", { id: nextCommandId("bulk_register_signals"), type: "signal.bulkCreate", signals, targetGroupId, index: snapshot.document.signalGroups.find((group) => group.id === targetGroupId)?.rows.length ?? 0 });
    if (result.ok) { setBulkRegistrationStatus(`Registered ${signals.length} signal${signals.length === 1 ? "" : "s"} in one operation`); setBulkRegistrationPreview(undefined); setBulkRegistrationVisible(false); }
    else setBulkRegistrationStatus(result.problems.map((item) => item.message).join(" "));
  };
  const previewBulkSignals = () => {
    const preview = parseBulkSignalDefinitions(bulkRegistrationText, snapshot.document);
    setBulkRegistrationPreview({ sourceText: bulkRegistrationText, ...preview });
    setBulkRegistrationStatus(preview.errors.length === 0 ? `Preview ready: ${preview.definitions.length} signal${preview.definitions.length === 1 ? "" : "s"}` : preview.errors.join(" "));
  };
  const createSignalGroup = () => {
    const id = groupId(nextEntityId("group", snapshot.document));
    const result = application.execute({ id: nextCommandId("group_create_tree"), type: "group.create", group: { id, name: `Group ${snapshot.document.signalGroups.length + 1}`, rows: [] }, index: snapshot.document.signalGroups.length });
    if (result.ok) {
      selection.selectGroup(id);
    }
  };
  const addTreeEntity = (kind: "signal" | "clock" | "bus" | "state" | "logic" | "event" | "pulse" | "group" | "spacer" | "commentRow") => {
    if (kind === "group") {
      const id = groupId(nextEntityId("group", snapshot.document));
      const index = resolveGroupInsertionIndex(snapshot.document, selectedId, selectedGroupId);
      const result = commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: nextCommandId("tree_add_group"), type: "group.create", group: { id, name: `Group ${snapshot.document.signalGroups.length + 1}`, rows: [] }, index });
      if (result.ok) {
        selection.selectGroup(id);
      }
      return;
    }
    const target = resolveInsertionTarget(snapshot.document, selectedId, selectedGroupId);
    if (!target) return;
    const { group: targetGroup, index } = target;
    if (kind === "spacer") {
      const spacer = { id: spacerId(nextEntityId("spacer", snapshot.document)), height: 24 };
      const result = application.execute({ id: nextCommandId("tree_add_spacer"), type: "spacer.create", spacer, targetGroupId: targetGroup.id, index });
      if (result.ok) {
        selection.selectSpacer(targetGroup.id, spacer.id);
      }
      return;
    }
    const id = signalId(nextEntityId(kind === "commentRow" ? "commentRow" : "signal", snapshot.document));
    if (kind === "commentRow") {
      const name = `Comment ${snapshot.document.signals.length + 1}`;
      const result = commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: nextCommandId("tree_add_comment"), type: "commentRow.create", commentRow: { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" }, targetGroupId: targetGroup.id, index });
      // Same "select the thing that was just created" contract as Group and
      // Spacer just above: without it, adding a row leaves the PREVIOUS
      // selection in place, so the newly added row isn't immediately
      // reachable for rename/edit without an extra manual click.
      if (result.ok) selection.selectSignal(id);
      return;
    }
    const name = `${kind === "clock" ? "CLOCK" : kind.toUpperCase()}_${snapshot.document.signals.length + 1}`;
    const signal = kind === "clock"
      ? { id, name, type: "clock" as const, role: "internal" as const, source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0 as 0 | 1, polarity: "positive" as const }, edgeCounter: { show: false, mode: "both" as const, startNumber: 1, countFrom: "signal-start" as const, labelEvery: 1, position: "above" as const, offset: { x: 0, y: -6 } } }
      : valueSignal(id, name, "internal", [{ start: 0, value: kind === "state" ? "IDLE" : kind === "bus" ? "00" : kind === "event" ? "NONE" : 0 }], kind === "bus" ? { type: "bus", width: 8, displayFormat: "hex" } : { type: kind === "signal" ? "binary" : kind });
    const result = commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: nextCommandId("tree_add_signal"), type: "signal.create", signal, targetGroupId: targetGroup.id, index });
    if (result.ok) selection.selectSignal(id);
  };
  const bottomTabs: readonly ("Signal" | "Annotation" | "Transaction" | "Bookmarks" | "AI" | "Problems" | "JSON")[] = viewMode === "Cycle"
    ? ["Signal", "Annotation", "Bookmarks", "AI", "Problems", "JSON"]
    : viewMode === "Transaction"
      ? ["Transaction", "Annotation", "Bookmarks", "AI", "Problems", "JSON"]
      : ["Signal", "Transaction", "Annotation", "Bookmarks", "AI", "Problems", "JSON"];
  const bottomTabLabels: Readonly<Record<typeof bottomTabs[number], string>> = { Signal: "Signal Editor", Annotation: "Annotations", Transaction: "Transactions", Bookmarks: "Bookmarks", AI: "AI Assistant", Problems: "Checks", JSON: "JSON" };
  const startBottomResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    bottomResizeRef.current = { startY: event.clientY, startHeight: bottomHeight };
  };
  const moveBottomResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = bottomResizeRef.current;
    if (!resize) return;
    const nextHeight = Math.max(180, Math.min(420, resize.startHeight - (event.clientY - resize.startY)));
    if (nextHeight !== bottomHeight) setBottomHeight(nextHeight);
  };
  const finishBottomResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!bottomResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    bottomResizeRef.current = undefined;
  };
  const resizeBottomByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    setBottomHeight((current) => Math.max(180, Math.min(420, current + delta)));
  };
  // Signal Split View (#200) item D: view-only Upper/Lower height splitter.
  // Ratio-based (not a fixed pixel height like Bottom's) since the two panes
  // together always fill the same variable container height; dragging never
  // touches canonical/history/dirty state, matching every other pane resize
  // handle in this file.
  const startSignalSplitResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    signalSplitResizeRef.current = { startY: event.clientY, startRatio: signalSplitRatio, containerHeight: container.getBoundingClientRect().height };
  };
  const moveSignalSplitResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = signalSplitResizeRef.current;
    if (!resize || resize.containerHeight <= 0) return;
    const nextRatio = Math.max(0.15, Math.min(0.85, resize.startRatio + (event.clientY - resize.startY) / resize.containerHeight));
    if (nextRatio !== signalSplitRatio) setSignalSplitRatio(nextRatio);
  };
  const finishSignalSplitResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!signalSplitResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    signalSplitResizeRef.current = undefined;
  };
  const resizeSignalSplitByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const delta = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    if (delta === 0) return;
    event.preventDefault();
    setSignalSplitRatio((current) => Math.max(0.15, Math.min(0.85, current + delta)));
  };
  const startInspectorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    inspectorResizeRef.current = { startX: event.clientX, startWidth: inspectorWidth };
  };
  const moveInspectorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = inspectorResizeRef.current;
    if (!resize) return;
    const nextWidth = Math.max(240, Math.min(420, resize.startWidth - (event.clientX - resize.startX)));
    if (nextWidth !== inspectorWidth) setInspectorWidth(nextWidth);
  };
  const finishInspectorResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!inspectorResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    inspectorResizeRef.current = undefined;
  };
  const resizeInspectorByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowLeft" ? step : event.key === "ArrowRight" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    setInspectorWidth((current) => Math.max(240, Math.min(420, current + delta)));
  };
  const startLeftPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    leftPaneResizeRef.current = { startX: event.clientX, startWidth: leftPaneWidth };
  };
  const moveLeftPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = leftPaneResizeRef.current;
    if (!resize) return;
    const nextWidth = Math.max(LEFT_PANE_MIN_WIDTH, Math.min(LEFT_PANE_MAX_WIDTH, resize.startWidth + (event.clientX - resize.startX)));
    if (nextWidth !== leftPaneWidth) setLeftPaneWidth(nextWidth);
  };
  const finishLeftPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!leftPaneResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    leftPaneResizeRef.current = undefined;
  };
  const resizeLeftPaneByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    setLeftPaneWidth((current) => Math.max(LEFT_PANE_MIN_WIDTH, Math.min(LEFT_PANE_MAX_WIDTH, current + delta)));
  };
  const startFrozenPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    frozenPaneResizeRef.current = { startX: event.clientX, startWidth: frozenPaneWidth };
  };
  const moveFrozenPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = frozenPaneResizeRef.current;
    if (!resize) return;
    const nextWidth = Math.max(frozenPaneMinWidth, Math.min(360, resize.startWidth + (event.clientX - resize.startX)));
    if (nextWidth !== frozenPaneWidth) setFrozenPaneWidth(nextWidth);
  };
  const finishFrozenPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!frozenPaneResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    frozenPaneResizeRef.current = undefined;
  };
  const resizeFrozenPaneByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    if (delta === 0) return;
    event.preventDefault();
    // Base the delta on `frozenPaneWidth` (the derived, displayed value --
    // Math.max(frozenPaneWidthState, layout.roleColumnWidth +
    // layout.signalNameWidth), same as aria-valuenow), not the raw
    // frozenPaneWidthState alone. Otherwise, whenever the document's own
    // layout floor exceeds the raw resize state (the common case for the
    // default demo document, where that floor is 240px against a 209px
    // initial state), incrementing the raw state by the arrow-key step
    // still resolves to the same effective/displayed width -- the key
    // press silently does nothing, with no feedback that anything
    // happened at all.
    setFrozenPaneWidth(Math.max(frozenPaneMinWidth, Math.min(360, frozenPaneWidth + delta)));
  };
  const selectBottomTab = (tab: typeof bottomTabs[number]) => setBottomTab(tab);
  const onBottomTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: typeof bottomTabs[number]) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = bottomTabs.indexOf(tab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? bottomTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + bottomTabs.length) % bottomTabs.length;
    const next = bottomTabs[nextIndex];
    if (!next) return;
    selectBottomTab(next);
    requestAnimationFrame(() => globalThis.document.querySelector<HTMLButtonElement>(`[data-bottom-tab="${next}"]`)?.focus());
  };

  const capabilities = deriveSelectionCapabilities(snapshot.document, selection.state);
  const { hasSelectedSignal, hasSelectedEntity, hasSelectedClipboard, hasDeletableSelection, canMoveUp, canMoveDown } = capabilities;
  const canRenameSelection = capabilities.canRename;
  const canShowSelection = capabilities.canShow;
  const canHideSelection = capabilities.canHide;
  const restorePendingFileFocus = () => {
    const origin = pendingFileOriginRef.current;
    pendingFileOriginRef.current = null;
    if (origin?.isConnected) requestAnimationFrame(() => origin.focus());
  };
  const capturePendingFileOrigin = () => {
    if (pendingFileOriginRef.current === null) pendingFileOriginRef.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
  };
  const cancelPendingFileAction = () => { documentLifecycle.cancelPending(); restorePendingFileFocus(); };
  const continuePendingFileAction = () => { documentLifecycle.discardPending(); restorePendingFileFocus(); };
  const saveAndContinuePendingFileAction = () => {
    if (documentLifecycle.savePendingAndContinue(`${snapshot.document.document.title || "timing-chart"}.tcd`)) restorePendingFileFocus();
  };
  const requestNewDocument = () => { capturePendingFileOrigin(); documentLifecycle.requestNew(); };
  const applyWorkspacePreset = (preset: WorkspacePreset) => {
    if (preset === "waveform") {
      if (workspacePreset !== "waveform") waveformRestoreRef.current = { inspectorVisible, bottomVisible };
      setWorkspacePreset(preset);
      setInspectorVisible(false);
      setBottomVisible(false);
      return;
    }
    setWorkspacePreset(preset);
    if (workspacePreset === "waveform" && preset === "edit") {
      const restored = waveformRestoreRef.current;
      waveformRestoreRef.current = undefined;
      setInspectorVisible(restored?.inspectorVisible ?? true);
      setBottomVisible(restored?.bottomVisible ?? true);
    } else {
      waveformRestoreRef.current = undefined;
      setInspectorVisible(true);
      setBottomVisible(true);
    }
    if (preset === "review") setBottomTab("Problems");
    else if (preset === "transaction") { setViewMode("Transaction"); setBottomTab("Transaction"); }
    else setBottomTab("Signal");
  };
  const resetWorkspaceLayout = () => {
    waveformRestoreRef.current = undefined;
    setWorkspacePreset("edit");
    setViewMode("Cycle");
    setBottomTab("Signal");
    setSignalTreeVisible(true);
    setInspectorVisible(true);
    setBottomVisible(true);
    setLeftPaneWidth(LEFT_PANE_MIN_WIDTH);
    setFrozenPaneWidth(209);
    setInspectorWidth(297);
    setBottomHeight(240);
  };
  return <main className="editor-shell" style={{ "--gui-left-width": `${leftPaneWidth}px`, "--gui-frozen-width": `${frozenPaneWidth}px`, "--gui-bottom-height": `${bottomHeight}px`, "--gui-inspector-width": `${inspectorWidth}px`, "--gui-role-width": `${snapshot.document.layout.roleColumnWidth}px`, "--gui-signal-width": `${snapshot.document.layout.signalNameWidth}px`, "--gui-signal-align": snapshot.document.layout.signalNameAlign, "--gui-signal-split-upper-ratio": String(signalSplitRatio) } as React.CSSProperties} data-density={density} data-workspace-preset={workspacePreset} data-inspector-visible={String(inspectorVisible)} data-bottom-visible={String(bottomVisible)} data-ruler-enabled={String(rulerEnabled)} data-minimap-enabled={String(minimapEnabled)} data-signal-tree-visible={String(signalTreeVisible)} data-show-signal-names={String(showSignalNames)} data-show-roles={String(showRoles)} data-show-annotations={String(showAnnotations)} data-show-transactions={String(showTransactions)} data-show-group-background={String(showGroupBackground)} data-layout-overflow={snapshot.document.layout.overflow} data-left-pane-width={leftPaneWidth} data-frozen-pane-width={frozenPaneWidth} data-bottom-height={bottomHeight} data-inspector-width={inspectorWidth} data-cycle-count={snapshot.document.timeline.cycleCount} data-signal-count={snapshot.document.signals.length} data-transaction-count={snapshot.document.transactions.length}>
    <MinimalCycleViewTitleBar title={snapshot.document.document.title} dirty={history.dirty} viewMode={viewMode} />
    <MinimalCycleViewRibbonTabs ribbonTab={ribbonTab} setRibbonTab={setRibbonTab} viewMode={viewMode} setViewMode={setViewMode} bottomTab={bottomTab} setBottomTab={setBottomTab} />
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
      onNavigateBookmark={(cycle, bookmarkId) => { timelineNavigation.navigateToCycle(cycle); if (bookmarkId) selectBookmark(bookmarkId); }}
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
      <aside className="left-panel-tail"><span data-testid="left-tree-signal-count">{snapshot.document.signals.length} signals</span>{selectedSignal && <span className="scope-breadcrumb" data-testid="scope-breadcrumb">Scope: {selectedSignal.source.instancePath.length ? selectedSignal.source.instancePath.join(" / ") : "(root)"}</span>}</aside>
      {bottomVisible && <BottomEditorPanel
        tabs={bottomTabs}
        activeTab={bottomTab}
        onSelectTab={selectBottomTab}
        onTabKeyDown={onBottomTabKeyDown}
        followSelection={followSelection}
        onFollowSelectionChange={setFollowSelection}
        pinned={bottomPinned}
        onTogglePinned={toggleBottomPin}
        content={bottomTab === "Signal" ? signalEditor : bottomTab === "Annotation" ? annotationEditor : bottomTab === "Transaction" ? transactionEditor : bottomTab === "Bookmarks" ? bookmarkEditor : bottomTab === "AI" ? aiAssistantPanel : bottomTab === "Problems" ? <ProblemsPanel diagnostics={diagnostics} onNavigate={navigateProblem} /> : <AdvancedJsonPanel document={snapshot.document} selectedSignal={bottomSignal} selectedGroup={bottomGroup} selectedAnnotation={bottomAnnotation} selectedTransaction={bottomTransaction} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onDiagnostic={(next) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("advanced-json:")), ...nextDiagnostics]); }} />}
      />}
       <aside hidden={!inspectorVisible} className="inspector-shell" data-testid="inspector-shell"><div className="inspector-resize-handle" data-testid="inspector-resizer" role="separator" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={inspectorWidth} tabIndex={0} onKeyDown={resizeInspectorByKeyboard} onPointerDown={startInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={finishInspectorResize} onPointerCancel={finishInspectorResize} /><InspectorPanel key={selectedSignal?.id ?? `${selectedGroup?.id ?? selectedAnnotation?.id ?? selectedTransaction?.id ?? "none"}:${snapshot.revision}:${inspectorResetToken}`} signal={selectedSignal} group={selectedGroup} annotation={selectedAnnotation} transaction={selectedTransaction} collapsedGroup={selectedGroup !== undefined && collapsedGroupIds.has(selectedGroup.id)} onToggleGroupCollapse={selectedGroup === undefined ? undefined : () => toggleCollapsedGroup(selectedGroup.id)} registry={commandRegistry.current} document={snapshot.document} viewport={viewport} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onReveal={revealSelectedInHierarchy} onCancel={() => { if (selectedGroup) refreshGroupStylePreview(host.current!, selectedGroup.id, selectedGroup.style); setInspectorResetToken((value) => value + 1); }} onGroupPreview={(groupId, style) => refreshGroupStylePreview(host.current!, groupId, style ?? snapshot.document.signalGroups.find((group) => group.id === groupId)?.style)} /></aside>
    </div>
    <ContextMenuPanel contextMenu={contextMenu} hasSelectedClipboard={hasSelectedClipboard} clipboardAvailable={clipboardAvailable} hasSelectedEntity={hasSelectedEntity} hasSelectedSignal={hasSelectedSignal} hasDeletableSelection={hasDeletableSelection} canRenameSelection={canRenameSelection} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canShowSelection={canShowSelection} canHideSelection={canHideSelection} copySelectedSignal={copySelectedSignal} cutSelectedSignal={cutSelectedSignal} pasteSelectedEntity={pasteSelectedEntity} duplicateSelectedEntity={duplicateSelectedEntity} moveSelection={moveSelection} setSelectionVisibility={setSelectionVisibility} renameSelection={renameSelection} closeContextMenu={closeContextMenu} deleteSelection={() => commandRegistry.current.execute("selection.delete")} />
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
  </main>;
}
