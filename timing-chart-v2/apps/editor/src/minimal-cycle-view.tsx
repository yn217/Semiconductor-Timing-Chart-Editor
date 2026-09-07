import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { type Point, type SnapKind } from "@timing-chart-v2/geometry";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, type HardwareHierarchyView } from "@timing-chart-v2/projection";
import { type AnnotationOverlayPrimitive } from "@timing-chart-v2/renderer";
import { scanJsonSyntax, serializeCanonicalDocument } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor, quickValueLiteral, quickValueOptions, type Annotation, type AnnotationId, type AnnotationType, type Bookmark, type BookmarkId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type EdgeCounterSettings, type GroupId, type LegendEntry, type SemanticAnchor, type Signal, type SignalId, type SignalRole, type SpacerId, type TimeGroupId, type Transaction, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
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
import type { AIBridgeStatus } from "./ai-bridge-client.js";
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
import { useDocumentLifecycle } from "./application/use-document-lifecycle.js";
import { deriveSelectionCapabilities, useSelectionOwner, type SelectionState } from "./application/use-selection-owner.js";
import { useClipboardActions } from "./application/use-clipboard-actions.js";
import { useTimelineNavigationOwner } from "./runtime/use-timeline-navigation-owner.js";
import type { SelectedClockEdge } from "./runtime/edge-counter-projection.js";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH, useWorkspaceUiState, type TreeTypeFilter, type WorkspacePreset } from "./workspace/use-workspace-ui-state.js";
import { useDialogMenuState } from "./workspace/use-dialog-menu-state.js";
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { TransactionEditor } from "./transaction-editor.js";
import { useTimelineSurfaceRuntime } from "./runtime/use-timeline-surface-runtime.js";
import { BookmarkEditor } from "./bookmark-editor.js";
import { resolveGroupInsertionIndex, resolveInsertionTarget } from "./insertion-target.js";
import type { TimelineViewportRuntime } from "./runtime/timeline-viewport-runtime.js";
import { applyRendererHostSizing, attachDialogOriginCapture, attachDirtyUnloadGuard, attachMenuKeyboardNavigation, refreshAnnotationPreview, refreshClockPreview, refreshGroupStylePreview, refreshRendererOverlays, refreshRulerRangeSelection, refreshTransactionLinkedRows, scheduleDialogFocusRestore, trapDialogTab } from "./runtime/use-editor-runtime-bridge.js";

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
  const addBookmarkAtCycle = (cycle: number) => {
    const maxCycle = Math.max(0, snapshot.document.timeline.cycleCount - 1);
    const start = Math.max(0, Math.min(maxCycle, Math.trunc(cycle)));
    const id = nextEntityId("bookmark", snapshot.document) as BookmarkId;
    const result = commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: nextCommandId("ruler_bookmark_create"), type: "bookmark.create", bookmark: { id, name: `Bookmark ${start}`, start } });
    if (result.ok) {
      setSelectedBookmarkId(id);
      setBottomTab("Bookmarks");
      setBottomVisible(true);
    }
  };
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
  // #422: the one Bookmark-navigation dispatch owner -- shared verbatim by
  // the Timeline Ribbon's Previous/Next and the Bottom Bookmarks panel's
  // Previous/Next, so neither surface can drift into a second navigation
  // command path (both still resolve *which* Bookmark is adjacent via the
  // shared runtime/bookmark-navigation.js `findAdjacentBookmark`).
  const navigateToBookmark = (cycle: number, bookmarkId?: BookmarkId) => { timelineNavigation.navigateToCycle(cycle); if (bookmarkId) selectBookmark(bookmarkId); };
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
  // #395 PR3: the local Agent Bridge's enable/token state is owned here
  // (not inside AIOperationPanel) so the Ribbon's Provider status can
  // show the same real, live connection state the Bottom AI Assistant's
  // Settings section manages -- the actual polling connection
  // (useAIBridgeClient) lives inside AIOperationPanel itself now (PR4),
  // since propose_edit needs direct access to its own preview/validate
  // state; it reports status back up here via onBridgeStatusChange. See
  // ai-bridge-client.ts and scripts/ai-bridge-server.mjs for exactly what
  // it can and cannot do (three read/view-only tools plus propose_edit,
  // localhost-only, token-gated, no arbitrary Canonical JSON patch path,
  // no bridge-side apply for a document-changing proposal).
  const aiBridgeHost = "127.0.0.1";
  const aiBridgePort = 4610;
  const [aiBridgeEnabled, setAiBridgeEnabled] = useState(false);
  const [aiBridgeToken, setAiBridgeToken] = useState("");
  const [aiBridgeStatus, setAiBridgeStatus] = useState<AIBridgeStatus>("disabled");
  const aiBridgeOnViewIntent = (intent: AIViewIntent) => { if (intent === "fit-all") timelineNavigation.fitAll(); else setRibbonTab("Timeline"); };
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
    getZoom={timelineNavigation.getZoom}
    bridgeHost={aiBridgeHost}
    bridgePort={aiBridgePort}
    bridgeEnabled={aiBridgeEnabled}
    onBridgeEnabledChange={setAiBridgeEnabled}
    bridgeToken={aiBridgeToken}
    onBridgeTokenChange={setAiBridgeToken}
    onBridgeStatusChange={setAiBridgeStatus}
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
        content={bottomTab === "Signal" ? signalEditor : bottomTab === "Annotation" ? annotationEditor : bottomTab === "Transaction" ? transactionEditor : bottomTab === "Bookmarks" ? bookmarkEditor : bottomTab === "AI" ? aiAssistantPanel : bottomTab === "Problems" ? <ProblemsPanel diagnostics={diagnostics} onNavigate={navigateProblem} /> : <AdvancedJsonPanel document={snapshot.document} selectedSignal={bottomSignal} selectedGroup={bottomGroup} selectedAnnotation={bottomAnnotation} selectedTransaction={bottomTransaction} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onDiagnostic={(next) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("advanced-json:")), ...nextDiagnostics]); }} />}
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
  </main>;
}
