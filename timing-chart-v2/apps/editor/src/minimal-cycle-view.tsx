import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { DefaultScreenGeometryProjector, resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type SnapKind, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { CommandHistorySession, type HistoryState } from "@timing-chart-v2/history";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, type DisplayTimeMapping, type HardwareHierarchyView, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { type AnnotationOverlayPrimitive, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { scanJsonSyntax, serializeCanonicalDocument, validateCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor, quickValueLiteral, quickValueOptions, type Annotation, type AnnotationId, type AnnotationType, type BookmarkId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type EdgeCounterSettings, type GroupId, type LegendEntry, type ParsedCanonicalDocument, type SemanticAnchor, type Signal, type SignalGroup, type SignalId, type SignalRole, type SpacerId, type SpacerRow, type TimeGroupId, type Transaction, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
import { mayRouteGlobalShortcut, resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import { ViewMetricsOwner } from "./runtime/view-metrics.js";
import { buildViewportWindow } from "./runtime/viewport-window.js";
import { projectEdgeCounters } from "./runtime/edge-counter-projection.js";
import { normalizeSnapDistance } from "./runtime/snap-distance.js";
import { withAddedOffset, withSnapOffset } from "./runtime/anchor-offset.js";
import { preferredSnapKinds } from "./runtime/snap-policy.js";
import { referenceSvgScreenScale } from "./runtime/screen-scale.js";
import { rangeFromBoundaries } from "./runtime/range-selection.js";
import { RangeDragController, type RangeDragState } from "./runtime/range-drag.js";
import { EditorApplicationRuntime } from "./runtime/editor-application-runtime.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "./design-system.js";
import { buildCommandRejectionDiagnostics } from "./command-diagnostics.js";
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
import { resolveAnchorPoint } from "./resolve-anchor-point.js";
import { createAnnotation } from "./create-annotation.js";
import { AnnotationToolbar } from "./annotation-toolbar.js";
import { renderGeometryGrid } from "./render-geometry-grid.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { InspectorSection } from "./inspector-section.js";
import { canonicalDocumentOf, createNewDocument, MAX_OPEN_FILE_BYTES, openFileByteBudgetProblem, parseOpenDocument, serializeSaveDocument } from "./file-document-controller.js";
import { MiniMap } from "./minimap.js";
import { parseBulkSignalDefinitions, type BulkSignalDefinition } from "./bulk-signal-parser.js";
import { MinimalCycleViewPanels, InspectorPanel, ContextMenuPanel, MinimalCycleViewTitleBar } from "./minimal-cycle-view-panels.js";
import { MinimalCycleViewRibbonTabs } from "./minimal-cycle-view-ui.js";
import { cycleDocument, v1ReferenceDocument } from "./fixtures-cycle-reference-documents.js";
import { groupId, signalId, valueSignal } from "./minimal-cycle-view-fixture-helpers.js";
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
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { TransactionEditor } from "./transaction-editor.js";
import { buildRuler } from "./runtime/build-ruler.js";
import { displayBoundaryForSource } from "./runtime/display-boundary.js";
import { buildSnapIndex } from "./runtime/snap-index.js";
import { annotationFields, projectAnnotationOverlays } from "./runtime/annotation-overlays.js";
import { createTimelineViewportRuntime } from "./runtime/timeline-viewport-runtime.js";
import { applyRendererHostSizing } from "./runtime/use-editor-runtime-bridge.js";

const spacerId = (value: string) => value as SpacerId;
const LEFT_PANE_MIN_WIDTH = 265;
const LEFT_PANE_MAX_WIDTH = 420;
type DensityMode = "compact" | "comfortable";
type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
type TreeTypeFilter = "all" | "input" | "output" | "wire" | "comment";
type PendingFileAction = Readonly<{ kind: "new" | "open"; text?: string }>;

export function MinimalCycleView() {
  const visualReference = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("visual-reference");
  const initialDocument = visualReference ? v1ReferenceDocument : cycleDocument;
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const gridLayer = useRef<HTMLDivElement>(null);
  const execute = useRef<(command: SemanticCommand) => ReturnType<CommandHistorySession["execute"]>>(() => ({ ok: false, reason: "no-op", problems: [] }));
  const executeBatch = useRef<(id: CommandId, commands: readonly SemanticCommand[]) => ReturnType<CommandHistorySession["executeBatch"]>>(() => ({ ok: false, reason: "no-op", problems: [] }));
  const undo = useRef<() => void>(() => undefined);
  const redo = useRef<() => void>(() => undefined);
  const armArrowPick = useRef<() => void>(() => undefined);
  const changeZoom = useRef<(delta: number) => void>(() => undefined);
  const fitSelection = useRef<() => void>(() => undefined);
  const fitAll = useRef<() => void>(() => undefined);
  const setZoomAbsolute = useRef<(zoom: number) => void>(() => undefined);
  const navigateToCycle = useRef<(cycle: number) => void>(() => undefined);
  const openDocument = useRef<(text: string) => void>(() => undefined);
  const newDocument = useRef<() => void>(() => undefined);
  const saveDocument = useRef<() => string | undefined>(() => undefined);
  const snapTransactionCycle = useRef<(clientX: number) => number | undefined>(() => undefined);
  const transactionBoundaryX = useRef<(cycle: number) => number | undefined>(() => undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const openFileReadStartedAtRef = useRef<number | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<SignalId | undefined>(() => visualReference ? signalId("sig_cycle_clock") : undefined);
  const [selectedSignalIds, setSelectedSignalIds] = useState<ReadonlySet<SignalId>>(() => visualReference ? new Set([signalId("sig_cycle_clock")]) : new Set());
  const selectedSignalRef = useRef<SignalId | undefined>(undefined);
  const selectedSignalIdsRef = useRef<ReadonlySet<SignalId>>(new Set());
  selectedSignalIdsRef.current = selectedSignalIds;
  selectedSignalRef.current = selectedId;
  const [selectedGroupId, setSelectedGroupId] = useState<GroupId | undefined>();
  const selectedGroupRef = useRef<GroupId | undefined>(undefined);
  selectedGroupRef.current = selectedGroupId;
  const selectedSpacerRef = useRef<SpacerId | undefined>(undefined);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<AnnotationId | undefined>();
  const selectedAnnotationRef = useRef<AnnotationId | undefined>(undefined);
  selectedAnnotationRef.current = selectedAnnotationId;
  const [selectedTransactionId, setSelectedTransactionId] = useState<TransactionId | undefined>();
  const selectedTransactionRef = useRef<TransactionId | undefined>(undefined);
  selectedTransactionRef.current = selectedTransactionId;
  const [snapshot, setSnapshot] = useState<CanonicalSnapshot>({ revision: 0, document: initialDocument });
  const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, dirty: false });
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!history.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [history.dirty]);
  const [problem, setProblem] = useState("");
  const [validationDiagnostics, setValidationDiagnostics] = useState<readonly DocumentProblem[]>(() => validateCanonicalDocument(initialDocument));
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<readonly DocumentProblem[]>([]);
  const [arrowPickStatus, setArrowPickStatus] = useState<"idle" | "from" | "to">("idle");
  const [zoom, setZoom] = useState(1);
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
  const [signalTreeVisible, setSignalTreeVisible] = useState(true);
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [bottomTab, setBottomTab] = useState<"Signal" | "Annotation" | "Transaction" | "Problems" | "JSON">("Signal");
  const [viewMode, setViewMode] = useState<"Cycle" | "Transaction" | "Split">("Cycle");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [workspacePreset, setWorkspacePreset] = useState<WorkspacePreset>("edit");
  const [followSelection, setFollowSelection] = useState(true);
  const followSelectionRef = useRef(true);
  followSelectionRef.current = followSelection;
  const [bottomPinned, setBottomPinned] = useState(false);
  const bottomPinnedRef = useRef(false);
  bottomPinnedRef.current = bottomPinned;
  const [pinnedBottomSelection, setPinnedBottomSelection] = useState<{ readonly signalId?: SignalId; readonly groupId?: GroupId; readonly annotationId?: AnnotationId; readonly transactionId?: TransactionId }>();
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorResetToken, setInspectorResetToken] = useState(0);
  const [bottomResetToken, setBottomResetToken] = useState(0);
  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_PANE_MIN_WIDTH);
  const leftPaneResizeRef = useRef<{ readonly startX: number; readonly startWidth: number } | undefined>(undefined);
  const [frozenPaneWidth, setFrozenPaneWidth] = useState(209);
  const frozenPaneResizeRef = useRef<{ readonly startX: number; readonly startWidth: number } | undefined>(undefined);
  const [inspectorWidth, setInspectorWidth] = useState(297);
  const inspectorResizeRef = useRef<{ readonly startX: number; readonly startWidth: number } | undefined>(undefined);
  const [bottomVisible, setBottomVisible] = useState(true);
  const [bottomHeight, setBottomHeight] = useState(240);
  const bottomResizeRef = useRef<{ readonly startY: number; readonly startHeight: number } | undefined>(undefined);
  const viewMetricsOwnerRef = useRef<ViewMetricsOwner | null>(null);
  if (viewMetricsOwnerRef.current === null) {
    viewMetricsOwnerRef.current = new ViewMetricsOwner({ leftPaneWidth, frozenPaneWidth, inspectorWidth, viewportWidth: viewport.current?.clientWidth ?? 0, zoom });
  }
  viewMetricsOwnerRef.current.update({ leftPaneWidth, frozenPaneWidth, inspectorWidth, viewportWidth: viewport.current?.clientWidth ?? 0, zoom });
  const viewMetricsOwner = viewMetricsOwnerRef.current!;
  const [propertiesVisible, setPropertiesVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const dialogOriginRef = useRef<HTMLElement | null>(null);
  const dialogOriginLabelRef = useRef<string | null>(null);
  const closeDialog = (close: () => void) => close();
  const [pendingFileAction, setPendingFileAction] = useState<PendingFileAction | undefined>();
  const pendingFileOriginRef = useRef<HTMLElement | null>(null);
  const unsavedCancelRef = useRef<HTMLButtonElement>(null);
  const [hierarchyVisible, setHierarchyVisible] = useState(false);
  const [bulkRegistrationVisible, setBulkRegistrationVisible] = useState(false);
  const renameDialogRef = useRef<HTMLFormElement>(null);
  const bulkRegistrationDialogRef = useRef<HTMLElement>(null);
  const unsavedFileDialogRef = useRef<HTMLElement>(null);
  const [bulkRegistrationText, setBulkRegistrationText] = useState("dut.status binary\ndut.data[7:0] bus\n");
  const [bulkRegistrationGroupId, setBulkRegistrationGroupId] = useState<GroupId | undefined>();
  const [bulkRegistrationStatus, setBulkRegistrationStatus] = useState("");
  const [bulkRegistrationPreview, setBulkRegistrationPreview] = useState<{ readonly sourceText: string; readonly definitions: readonly BulkSignalDefinition[]; readonly errors: readonly string[] }>();
  const [treeFilter, setTreeFilter] = useState("");
  const [treeTypeFilter, setTreeTypeFilter] = useState<TreeTypeFilter>("all");
  const [treeAddMenuOpen, setTreeAddMenuOpen] = useState(false);
  const [treeMoreMenuOpen, setTreeMoreMenuOpen] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<GroupId>>(new Set());
  const collapsedGroupIdsRef = useRef<ReadonlySet<GroupId>>(new Set());
  const applyCollapsedGroupsRef = useRef<(ids: ReadonlySet<GroupId>) => void>(() => undefined);
  const treeFocusRowIdRef = useRef<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ readonly x: number; readonly y: number; readonly target: "signal" | "group" | "annotation" } | undefined>();
  const menuOriginRef = useRef<HTMLElement | null>(null);
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
    const captureDialogOrigin = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-testid='bulk-register-open'], [data-testid='hierarchy-open']") : null;
      if (target) {
        dialogOriginLabelRef.current = target.dataset.testid === "bulk-register-open" ? "Add signal or group" : "More tree actions";
        dialogOriginRef.current = menuOriginRef.current ?? document.querySelector<HTMLElement>(`button[aria-label='${dialogOriginLabelRef.current}']`) ?? target;
      }
    };
    document.addEventListener("click", captureDialogOrigin, true);
    return () => document.removeEventListener("click", captureDialogOrigin, true);
  }, []);
  useLayoutEffect(() => {
    if (propertiesVisible || exportVisible || saveAsVisible || hierarchyVisible || bulkRegistrationVisible) return undefined;
    const frame = requestAnimationFrame(() => {
      const label = dialogOriginLabelRef.current;
      const origin = dialogOriginRef.current?.isConnected
        ? dialogOriginRef.current
        : label === null ? null : label === "Properties"
          ? [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === label) ?? null
          : document.querySelector<HTMLElement>(`button[aria-label='${label}']`);
      dialogOriginRef.current = null;
      dialogOriginLabelRef.current = null;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [bulkRegistrationVisible, exportVisible, hierarchyVisible, propertiesVisible, saveAsVisible]);
  useEffect(() => {
    const onDialogKeyDown = (event: KeyboardEvent) => {
      const activeDialog = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
      if (activeDialog && event.key === "Tab") {
        const focusable = [...activeDialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")]
          .filter((element) => element.getClientRects().length > 0);
        if (focusable.length > 0) {
          const first = focusable[0]!;
          const last = focusable.at(-1)!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
        return;
      }
      if (event.key !== "Escape") return;
      if (contextMenu || treeAddMenuOpen || treeMoreMenuOpen) return;
      if (pendingFileAction) { event.preventDefault(); cancelPendingFileAction(); return; }
      if (bulkRegistrationVisible) { event.preventDefault(); closeDialog(() => { setBulkRegistrationVisible(false); setBulkRegistrationPreview(undefined); }); return; }
      if (hierarchyVisible) { event.preventDefault(); closeDialog(() => setHierarchyVisible(false)); return; }
      if (propertiesVisible) { event.preventDefault(); closeDialog(() => setPropertiesVisible(false)); return; }
      if (exportVisible) { event.preventDefault(); closeDialog(() => setExportVisible(false)); return; }
      if (saveAsVisible) { event.preventDefault(); closeDialog(() => setSaveAsVisible(false)); }
    };
    document.addEventListener("keydown", onDialogKeyDown, true);
    return () => document.removeEventListener("keydown", onDialogKeyDown, true);
  }, [bulkRegistrationVisible, closeDialog, contextMenu, exportVisible, hierarchyVisible, pendingFileAction, propertiesVisible, saveAsVisible, treeAddMenuOpen, treeMoreMenuOpen]);
  useEffect(() => {
    const selector = contextMenu ? ".context-menu" : treeAddMenuOpen ? ".tree-add-menu" : treeMoreMenuOpen ? ".tree-header-menu" : undefined;
    const menu = selector ? document.querySelector<HTMLElement>(selector) : undefined;
    menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onMenuKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      const activeMenu = target?.closest<HTMLElement>("[role='menu']");
      if (!activeMenu) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeMenu.classList.contains("context-menu")) closeContextMenu();
        else if (activeMenu.classList.contains("tree-add-menu")) closeTreeAddMenu();
        else closeTreeMoreMenu();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [...activeMenu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener("keydown", onMenuKeyDown);
    return () => document.removeEventListener("keydown", onMenuKeyDown);
  }, [contextMenu, treeAddMenuOpen, treeMoreMenuOpen]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  useDialogFocusLoop(renameDialogRef, undefined, renameDialogOpen);
  useDialogFocusLoop(bulkRegistrationDialogRef, dialogOriginRef, bulkRegistrationVisible);
  useDialogFocusLoop(unsavedFileDialogRef, pendingFileOriginRef, pendingFileAction !== undefined);
  const clipboardSignalRef = useRef<Signal | undefined>(undefined);
  const clipboardSignalsRef = useRef<readonly { readonly signal: Signal; readonly groupId: GroupId; readonly index: number }[]>([]);
  const clipboardGroupRef = useRef<{ readonly group: SignalGroup; readonly rows: readonly Signal[]; readonly sourceIndex: number } | undefined>(undefined);
  const clipboardAnnotationRef = useRef<Annotation | undefined>(undefined);
  const clipboardTransactionRef = useRef<Transaction | undefined>(undefined);
  const clipboardSpacerRef = useRef<{ readonly spacer: SpacerRow; readonly groupId: GroupId; readonly index: number } | undefined>(undefined);
  const copySelectedSignalRef = useRef<() => void>(() => undefined);
  const cutSelectedSignalRef = useRef<() => void>(() => undefined);
  const pasteSelectedSignalRef = useRef<() => void>(() => undefined);
  const [clipboardStatus, setClipboardStatus] = useState("Empty");
  const [clipboardAvailable, setClipboardAvailable] = useState(false);
  const commandRegistry = useRef(new UiCommandRegistry());
  const [timelineRange, setTimelineRange] = useState(() => visualReference ? { start: 0, end: 1 } : { start: 2, end: 4 });
  const [rangeSelectionActive, setRangeSelectionActive] = useState(false);
  const rangeSelectionActiveRef = useRef(false);
  rangeSelectionActiveRef.current = rangeSelectionActive;
  const [selectedCycle, setSelectedCycle] = useState(() => visualReference ? 0 : 2);
  const selectedCycleRef = useRef(selectedCycle);
  selectedCycleRef.current = selectedCycle;
  const refreshPlayhead = useRef<() => void>(() => undefined);
  const refreshRangeSelectionBand = useRef<() => void>(() => undefined);
  const timelineRangeRef = useRef(timelineRange);
  timelineRangeRef.current = timelineRange;
  const selectedSignal = snapshot.document.signals.find((signal) => signal.id === selectedId);
  const annotationTargetSignalId = (() => {
    if (selectedSignal && selectedSignal.type !== "commentRow") return selectedSignal.id;
    const referenceClockId = snapshot.document.timeline.referenceClock;
    const referenceSignal = referenceClockId ? snapshot.document.signals.find((signal) => signal.id === referenceClockId && signal.type !== "commentRow") : undefined;
    if (referenceSignal) return referenceSignal.id;
    return snapshot.document.signals.find((signal) => signal.type !== "commentRow")?.id;
  })();
  const selectedGroup = snapshot.document.signalGroups.find((group) => group.id === selectedGroupId);
  const selectedSpacer = selectedSpacerRef.current === undefined ? undefined : selectedGroup?.spacers?.find((spacer) => spacer.id === selectedSpacerRef.current);
  const selectedAnnotation = snapshot.document.annotations.find((annotation) => annotation.id === selectedAnnotationId);
  const selectedTransaction = snapshot.document.transactions.find((transaction) => transaction.id === selectedTransactionId);
  const bottomSignal = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.signalId === undefined ? undefined : snapshot.document.signals.find((item) => item.id === pinnedBottomSelection.signalId)) : selectedSignal;
  const bottomGroup = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.groupId === undefined ? undefined : snapshot.document.signalGroups.find((item) => item.id === pinnedBottomSelection.groupId)) : selectedGroup;
  const bottomAnnotation = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.annotationId === undefined ? undefined : snapshot.document.annotations.find((item) => item.id === pinnedBottomSelection.annotationId)) : selectedAnnotation;
  const bottomTransaction = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.transactionId === undefined ? undefined : snapshot.document.transactions.find((item) => item.id === pinnedBottomSelection.transactionId)) : selectedTransaction;
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
    const root = host.current;
    if (!root) return;
    const query = treeFilter.trim().toLocaleLowerCase();
    const matchesType = (row: HTMLElement) => treeTypeFilter === "all"
      || (treeTypeFilter === "comment" ? row.dataset.kind === "comment" : treeTypeFilter === "wire" ? row.dataset.signalRole === "internal" : row.dataset.signalRole === treeTypeFilter);
    let matches = 0;
    for (const row of root.querySelectorAll<HTMLElement>("[data-role='left-row']")) {
      const text = [row.dataset.name, row.dataset.fullPath, row.dataset.instancePath, row.dataset.signalRole, row.dataset.groupName].filter(Boolean).join(" ").toLocaleLowerCase();
      const visible = matchesType(row) && (query.length === 0 || text.includes(query));
      row.hidden = !visible;
      row.dataset.filteredOut = String(!visible);
      row.dataset.groupCollapsed = "false";
      if (visible && row.dataset.kind === "timing" && row.dataset.role === "left-row") matches += 1;
    }
    const filterActive = treeTypeFilter !== "all" || query.length > 0;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-role='left-row']")];
    for (const header of root.querySelectorAll<HTMLElement>("[data-role='left-group-header']")) {
      const hasVisibleChild = rows.some((row) => row.dataset.groupId === header.dataset.groupId && !row.hidden);
      header.hidden = filterActive && !hasVisibleChild;
      header.dataset.filteredOut = String(header.hidden);
    }
    root.dataset.treeFilter = treeFilter;
    root.dataset.treeTypeFilter = treeTypeFilter;
    root.dataset.treeFilterMatches = String(matches);
  }, [snapshot.revision, treeFilter, treeTypeFilter, collapsedGroupIds]);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.dataset.collapsedGroups = [...collapsedGroupIds].join(",");
  }, [snapshot.revision, collapsedGroupIds]);
  useEffect(() => {
    const root = host.current;
    const tree = root?.querySelector<HTMLElement>("[data-role='left-tree-rows']");
    if (!tree) return;
    const items = [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].filter((item) => !item.hidden && !item.closest("[hidden]"));
    const preferred = items.find((item) => item.dataset.rowId === treeFocusRowIdRef.current)
      ?? items.find((item) => item.getAttribute("aria-selected") === "true")
      ?? items[0];
    for (const item of tree.querySelectorAll<HTMLElement>("[role='treeitem']")) item.tabIndex = item === preferred ? 0 : -1;
    if (preferred) {
      const shouldRepairFocus = treeFocusRowIdRef.current !== undefined && !tree.contains(tree.ownerDocument.activeElement);
      treeFocusRowIdRef.current = preferred.dataset.rowId;
      if (shouldRepairFocus) preferred.focus({ preventScroll: true });
    }
    tree.dataset.focusRowId = preferred?.dataset.rowId ?? "";
  }, [snapshot.revision, treeFilter, collapsedGroupIds, selectedId, selectedGroupId]);
  const diagnostics = [...validationDiagnostics, ...runtimeDiagnostics];
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

  useEffect(() => {
    const registry = commandRegistry.current;
    const unregister = [
      registry.register<SemanticCommand>("semantic.execute", (command) => execute.current(command)),
      registry.register("selection.delete", () => {
        const annotationId = selectedAnnotationRef.current;
        const signalId = selectedSignalRef.current;
        const groupId = selectedGroupRef.current;
        const transactionId = selectedTransactionRef.current;
        const spacerId = selectedSpacerRef.current;
        if (transactionId) {
          const result = execute.current({ id: nextCommandId("route_delete_transaction"), type: "transaction.delete", transactionId });
          if (result.ok) { selectedTransactionRef.current = undefined; setSelectedTransactionId(undefined); }
        } else if (annotationId) {
          const result = execute.current({ id: nextCommandId("route_delete_annotation"), type: "annotation.delete", annotationId });
          if (result.ok) { selectedAnnotationRef.current = undefined; setSelectedAnnotationId(undefined); }
        } else if (selectedSignalIdsRef.current.size > 1) {
          const commands = [...selectedSignalIdsRef.current].map((id) => ({ id: nextCommandId("route_delete_signal"), type: "signal.delete" as const, signalId: id }));
          const result = executeBatch.current(nextCommandId("route_delete_selection"), commands);
          if (result.ok) { selectedSignalRef.current = undefined; setSelectedId(undefined); selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set()); }
        } else if (signalId) {
          const result = execute.current({ id: nextCommandId("route_delete_signal"), type: "signal.delete", signalId });
          if (result.ok) { selectedSignalRef.current = undefined; setSelectedId(undefined); selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set()); }
        } else if (spacerId) {
          const result = execute.current({ id: nextCommandId("route_delete_spacer"), type: "spacer.delete", spacerId });
          if (result.ok) selectedSpacerRef.current = undefined;
        } else if (groupId) {
          const result = execute.current({ id: nextCommandId("route_delete_group"), type: "group.delete", groupId });
          if (result.ok) { selectedGroupRef.current = undefined; setSelectedGroupId(undefined); }
        }
      }),
      registry.register<{ readonly name: string }>("selection.rename", ({ name }) => {
        const signalId = selectedSignalRef.current;
        const groupId = selectedGroupRef.current;
        const transactionId = selectedTransactionRef.current;
        if (transactionId) execute.current({ id: nextCommandId("route_rename_transaction"), type: "transaction.rename", transactionId, name });
        else if (signalId) execute.current({ id: nextCommandId("route_rename"), type: "signal.rename", signalId, name });
        else if (groupId) execute.current({ id: nextCommandId("route_rename_group"), type: "group.rename", groupId, name });
      }),
      registry.register<{ readonly visible: boolean }>("selection.visibility", ({ visible }) => {
        const signalId = selectedSignalRef.current;
        if (signalId) execute.current({ id: nextCommandId("route_visibility"), type: "signal.setVisibility", signalId, visible });
      }),
      registry.register("history.undo", () => undo.current()),
      registry.register("history.redo", () => redo.current()),
      registry.register("clipboard.copy", () => copySelectedSignalRef.current()),
      registry.register("clipboard.cut", () => cutSelectedSignalRef.current()),
      registry.register("clipboard.paste", () => pasteSelectedSignalRef.current()),
    ];
    return () => unregister.forEach((dispose) => dispose());
  }, []);

  useEffect(() => {
    const rulerElement = ruler.current;
    if (!rulerElement) return;
    if (!rangeSelectionActive) {
      for (const tick of rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")) delete tick.dataset.rangeSelected;
      return;
    }
    for (const tick of rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")) {
      const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle);
      tick.dataset.rangeSelected = String(cycle >= timelineRange.start && cycle < timelineRange.end);
    }
  }, [rangeSelectionActive, timelineRange, snapshot.revision]);

  useEffect(() => {
    applyRendererHostSizing({ host, viewport, metrics: viewMetricsOwner.snapshot() });
  }, [viewMetricsOwner, leftPaneWidth, frozenPaneWidth, inspectorWidth, zoom]);

  useEffect(() => {
    const rendererHost = host.current;
    const viewportElement = viewport.current;
    const rulerElement = ruler.current;
    const rulerViewportElement = rulerElement?.parentElement;
    const gridElement = gridLayer.current;
    if (!rendererHost || !viewportElement || !rulerElement || !rulerViewportElement || !gridElement) return;

    const runtime = new EditorApplicationRuntime(initialDocument);
    const sessionController = runtime.session;
    let session = sessionController.current();
    const documentEpoch = runtime.documentEpoch;
    const adapter = runtime.createWaveDromAdapter();
    const screenGeometry = new DefaultScreenGeometryProjector();
    const projectionCoordinator = runtime.projection;
    let timeAxis: TimeAxisGeometry = { mode: "clockless" };
    const mappingCache = runtime.displayMapping;
    const geometryRegistry = runtime.geometry;
    const geometrySvgs = geometryRegistry.svgs;
    const geometryMaps = geometryRegistry.maps;
    const openPhaseMarks: Record<string, number> = {};
    let openPhaseActive = false;
    let openRowShellPainted = false;
    let openReferenceGeometryReady = false;
    let openRulerPainted = false;
    const markOpenPhase = (phase: string, phaseTimestamp = globalThis.performance.now()) => {
      if (!openPhaseActive || openPhaseMarks[phase] !== undefined) return;
      openPhaseMarks[phase] = phaseTimestamp;
      globalThis.performance.mark(`timing-chart-v2:${phase}`);
      rendererHost.dataset.openPhaseMarks = JSON.stringify(openPhaseMarks);
      const fileReadDurationMs = openPhaseMarks["file-read-start"] !== undefined && openPhaseMarks["file-read-complete"] !== undefined
        ? Math.max(0, openPhaseMarks["file-read-complete"] - openPhaseMarks["file-read-start"]) : undefined;
      rendererHost.dataset.openPhaseDurations = JSON.stringify(fileReadDurationMs === undefined ? {} : { fileReadDurationMs });
      if (phase === "row-shell-painted") openRowShellPainted = true;
      if (phase === "reference-geometry-ready") openReferenceGeometryReady = true;
      if (phase === "ruler-painted") openRulerPainted = true;
      if (openRowShellPainted && openReferenceGeometryReady && openRulerPainted) markOpenPhase("first-correct-paint");
    };
    const beginOpenMeasurement = (commandStartedAt = globalThis.performance.now(), fileReadStartedAt?: number) => {
      openPhaseActive = true;
      openRowShellPainted = false;
      openReferenceGeometryReady = false;
      openRulerPainted = false;
      for (const key of Object.keys(openPhaseMarks)) delete openPhaseMarks[key];
      delete rendererHost.dataset.openPhaseMarks;
      delete rendererHost.dataset.openPhaseDurations;
      markOpenPhase("open-command-start", commandStartedAt);
      markOpenPhase("open-start", commandStartedAt);
      if (fileReadStartedAt !== undefined) markOpenPhase("file-read-start", fileReadStartedAt);
    };
    // The progressive wave queue can flush many batches for one canonical
    // snapshot. Keep the derived lookup scoped to that snapshot instead of
    // rebuilding an O(totalSignals) Map for every batch.
    let signalIndexDocument: CanonicalDocument | undefined;
    let signalIndexRevision = -1;
    let signalById = new Map<SignalId, CanonicalDocument["signals"][number]>();
    const provider: WaveformSurfaceProvider = {
      async mountWaveBatch(requests) {
        const currentSnapshot = sessionController.snapshot();
        const document = currentSnapshot.document;
        const mapping = mappingCache.get(document.timeline, document.timeGroups);
        if (signalIndexDocument !== document || signalIndexRevision !== currentSnapshot.revision) {
          signalById = new Map(document.signals.map((signal) => [signal.id, signal]));
          signalIndexDocument = document;
          signalIndexRevision = currentSnapshot.revision;
        }
        const prepared = requests.map((request) => {
          const signal = signalById.get(request.signalId);
          if (!signal) return { request, waveJson: undefined, error: new Error(`Signal '${request.signalId}' is missing.`) };
          const displaySignal = signal.type === "commentRow" ? signal
            : signal.type === "clock" ? { ...signal, ...(signal.enable ? { enable: mappingCache.remapValueChanges(signal.enable, mapping) } : {}) }
            : { ...signal, values: mappingCache.remapValueChanges(signal.values, mapping) };
          return { request, waveJson: adapter.toWaveJson({ signal: displaySignal, cycleCount: mapping.displayCycleCount }), error: undefined };
        });

        // WaveDrom materialization is a DOM write. Start every render before
        // awaiting any of them so this phase completes all writes as one batch.
        const renderResults = await Promise.all(prepared.map(async (item) => {
          if (item.error || !item.waveJson) return { ...item, rendered: undefined };
          try { return { ...item, rendered: await adapter.renderWave(item.request.signalId, item.waveJson, item.request.owner) }; }
          catch (error: unknown) { return { ...item, rendered: undefined, error }; }
        }));

        // Geometry extraction calls getScreenCTM(). Keep it in a separate
        // phase, after every SVG write in this batch has completed.
        return renderResults.map((item) => {
          if (item.error || !item.rendered) return { signalId: item.request.signalId, error: item.error ?? new Error("Waveform render did not produce an SVG.") };
          try {
            if (item.request.signalId === document.timeline.referenceClock) markOpenPhase("reference-clock-painted");
            const geometry = adapter.extractLocalGeometry(item.rendered);
            geometryMaps.set(item.request.signalId, geometry);
            geometrySvgs.set(item.request.signalId, item.rendered.svg as SVGSVGElement);
            if (item.request.signalId === document.timeline.referenceClock) markOpenPhase("reference-geometry-ready");
            markOpenPhase("first-visible-wave-painted");
            snapIndex = undefined;
            return { signalId: item.request.signalId, result: { waveDromRenders: 1, localGeometryBuilds: 1 } };
          } catch (error: unknown) {
            geometryRegistry.remove(item.request.signalId);
            snapIndex = undefined;
            return { signalId: item.request.signalId, error };
          }
        });
      },
      async mountWave(id, owner) {
        const item = (await this.mountWaveBatch?.([{ signalId: id, owner }]))?.[0];
        if (!item?.result) throw item?.error instanceof Error ? item.error : new Error("Waveform batch did not produce a result.");
        return item.result;
      },
      disposeWave(id) {
        adapter.dispose(id);
        geometryRegistry.remove(id);
        // Snap candidates contain the disposed wave's local geometry.  The
        // next query must rebuild against the currently mounted set.
        snapIndex = undefined;
      },
    };
    const renderCoordinator = runtime.createRenderer(provider);
    const renderer = renderCoordinator.renderer;
    const snapService = new SemanticSnapCandidateService();
    let snapIndex: ImmutableSnapIndex | undefined;
    const currentSnapIndex = () => {
      if (!snapIndex) {
      const snapDocument = sessionController.snapshot().document;
        snapIndex = buildSnapIndex(snapDocument, projection, geometryMaps, mappingCache.get(snapDocument.timeline, snapDocument.timeGroups), snapService, screenGeometryScale);
        publishState();
      }
      return snapIndex;
    };
    renderCoordinator.mount(rendererHost);
    const initialSnapshot = sessionController.snapshot();
      let window: VirtualizationWindow = buildViewportWindow(viewportElement, initialSnapshot.document.timeline.referenceClock);
    let projection: RenderProjection = projectionCoordinator.project({ snapshot: initialSnapshot, changeSet: { fullDocumentReplace: true }, viewport: window, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
    renderer.update(projection);
    let rulerBuilds = 0;
    let edgeCounterResolvePasses = 0;
    let screenGeometryScale = 1;
    let rulerInitialized = false;
    const refreshOverlays = (document: CanonicalDocument) => {
      renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps, mappingCache.get(document.timeline, document.timeGroups), screenGeometryScale));
      edgeCounterResolvePasses += 1;
      renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, timelineRangeRef.current, selectedCycleRef.current, screenGeometryScale));
      for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-annotation-id]")) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationRef.current);
    };
    const rebuildRuler = (document: CanonicalDocument) => {
      rulerBuilds += 1;
      viewMetricsOwner.update({ viewportWidth: viewportElement.clientWidth });
      const metrics = viewMetricsOwner.snapshot();
      const fitWidth = Math.max(160, globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth);
      timeAxis = resolveTimeAxisGeometry(document, geometryMaps);
      screenGeometryScale = buildRuler(rulerElement, timeAxis.geometry, document, timeAxis.ownerSignalId, mappingCache.get(document.timeline, document.timeGroups), fitWidth, rulerInitialized ? screenGeometryScale : undefined, referenceSvgScreenScale(timeAxis.ownerSignalId ? geometrySvgs.get(timeAxis.ownerSignalId) : undefined, metrics.zoom), timeAxis.mode);
      rulerInitialized = true;
      markOpenPhase("ruler-painted");
      syncPresentationScale();
    };
    const refreshGrid = (document: CanonicalDocument) => {
      viewMetricsOwner.update({ viewportWidth: viewportElement.clientWidth });
      const metrics = viewMetricsOwner.snapshot();
      timeAxis = resolveTimeAxisGeometry(document, geometryMaps);
      renderGeometryGrid(gridElement, timeAxis.geometry, timeAxis.ownerSignalId, gridEnabledRef.current, projection.totalHeight, mappingCache.get(document.timeline, document.timeGroups), Math.max(160, globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth), screenGeometryScale, timeAxis.mode);
    };
    refreshPlayhead.current = () => {
      const cycle = selectedCycleRef.current;
      const playheadX = sourceBoundaryLocalX(session.getSnapshot().document, cycle);
      let playhead = rulerElement.querySelector<HTMLElement>("[data-role='playhead']");
      if (playheadX === undefined) {
        playhead?.remove();
        return;
      }
      if (!playhead) {
        playhead = rulerElement.ownerDocument.createElement("span");
        playhead.dataset.role = "playhead";
        playhead.dataset.testid = "playhead";
        playhead.setAttribute("aria-label", "Playhead");
        rulerElement.append(playhead);
      }
      playhead.dataset.playheadCycle = String(cycle);
      playhead.style.left = `${playheadX}px`;
    };
    const refreshRangeSelectionBandNow = () => {
      const band = viewportElement.querySelector<HTMLElement>("[data-role='range-selection-band']");
      const rulerBand = rulerElement.querySelector<HTMLElement>("[data-role='range-selection-ruler-band']");
      if (!band) return;
      const preview = rendererHost.dataset.rangePreview;
      if (!rangeSelectionActiveRef.current && !preview) {
        band.hidden = true;
        if (rulerBand) rulerBand.hidden = true;
        for (const tick of rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")) delete tick.dataset.rangeSelected;
        return;
      }
      const [startText, endText] = (preview ? preview : `${timelineRangeRef.current.start}:${timelineRangeRef.current.end}`).split(":");
      const start = Number(startText);
      const end = Number(endText);
      const currentDocument = session.getSnapshot().document;
      const startLocalX = sourceBoundaryLocalX(currentDocument, start);
      const endLocalX = sourceBoundaryLocalX(currentDocument, end);
      if (startLocalX === undefined || endLocalX === undefined || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
        band.hidden = true;
        return;
      }
      const startX = startLocalX * currentZoom;
      const endX = endLocalX * currentZoom;
      const timeDomainLeft = timelineOffset();
      if (!Number.isFinite(startX) || !Number.isFinite(endX) || endX <= startX) {
        band.hidden = true;
        return;
      }
      band.hidden = false;
      band.dataset.rangeStart = String(start);
      band.dataset.rangeEnd = String(end);
      band.dataset.source = "ruler-local-geometry";
      band.style.left = `${timeDomainLeft + startX}px`;
      band.style.width = `${endX - startX}px`;
      band.style.top = "34px";
      band.style.height = `${Math.max(projection.totalHeight, viewportElement.clientHeight - 34)}px`;
      band.setAttribute("aria-label", `Selected time range [${start}, ${end})`);
      if (rulerBand) {
        rulerBand.hidden = false;
        rulerBand.dataset.rangeStart = String(start);
        rulerBand.dataset.rangeEnd = String(end);
        rulerBand.dataset.source = "ruler-local-geometry";
        rulerBand.style.left = `${startLocalX}px`;
        rulerBand.style.width = `${endLocalX - startLocalX}px`;
        rulerBand.setAttribute("aria-label", `Selected time range [${start}, ${end})`);
      }
      for (const tick of rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")) {
        const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle);
        tick.dataset.rangeSelected = String(cycle >= start && cycle < end);
      }
    };
    refreshRangeSelectionBand.current = refreshRangeSelectionBandNow;
    const refreshRangePreview = () => {
      refreshRangeSelectionBandNow();
    };

    const publishState = () => {
      rendererHost.dataset.canonicalRevision = String(session.getSnapshot().revision);
      rendererHost.dataset.historyDepth = String(session.historyState().undoDepth);
      const metrics = viewMetricsOwner.snapshot();
      rendererHost.dataset.viewMetrics = JSON.stringify(metrics);
      const { renderCallsBySignal: _renderCallsBySignal, ...waveAdapter } = adapter.metrics();
      const { last: _lastGeometry, ...geometryExtraction } = adapter.geometryMetrics();
      // Keep the hot-path DOM snapshot scalar-only. Per-signal maps remain
      // available through the renderer/adapter pull diagnostics APIs.
      rendererHost.dataset.sessionCounters = JSON.stringify({ ...session.metrics(), ...session.historyMetrics(), ...projectionCoordinator.diagnostics(), ...renderer.diagnosticSummary(), rulerBuilds, edgeCounterResolvePasses, ...mappingCache.metrics(), snapIndexBuilds: snapService.metrics().builds, snapCandidateCount: snapService.metrics().candidateCount, snapQueries: snapIndex?.metrics().queries ?? 0, snapCandidatesVisited: snapIndex?.metrics().candidatesVisited ?? 0, viewMetrics: metrics, waveAdapter, geometryExtraction });
    };
    let currentZoom = 1;
    const timelineRuntime = createTimelineViewportRuntime({
      dom: { viewportRef: { current: viewportElement }, waveformRef: { current: rendererHost }, rulerRef: { current: rulerElement }, gridRef: { current: gridElement }, overlayRef: { current: rendererHost.querySelector<HTMLElement>("[data-role='annotation-overlay-surface']") }, rangeBandRef: { current: viewportElement.querySelector<HTMLElement>("[data-role='range-selection-band']") }, playheadRef: { current: rulerElement.querySelector<HTMLElement>("[data-role='playhead']") } },
      geometry: {
        getDisplayTimeMapping: () => mappingCache.get(session.getSnapshot().document.timeline, session.getSnapshot().document.timeGroups),
        getTimeAxisGeometry: () => timeAxis.geometry,
        getLocalGeometryMap: () => geometryMaps,
        sourceCycleToLocalX: (cycle) => timelineRuntime.sourceBoundaryToLocalX(session.getSnapshot().document, cycle),
        sourceBoundaryToLocalX: (document, cycle) => {
          const canonical = document as CanonicalDocument;
          const axis = resolveTimeAxisGeometry(canonical, geometryMaps);
          if (!axis.geometry || axis.ownerSignalId === undefined) return undefined;
          const mapping = mappingCache.get(canonical.timeline, canonical.timeGroups);
          const displayCycle = displayBoundaryForSource(mapping, cycle, canonical.timeline.cycleCount);
          if (displayCycle === undefined) return undefined;
          const point = axis.geometry.find({ signalId: axis.ownerSignalId, cycle: displayCycle, point: "cycle-start" })?.point;
          return point === undefined ? undefined : point.x * screenGeometryScale;
        },
        localXToScreenX: (localX) => localX,
      },
      viewport: { getMetrics: () => { const metrics = viewMetricsOwner.snapshot(); return { width: viewportElement.clientWidth, leftInset: metrics.leftPaneWidth + metrics.frozenPaneWidth }; }, getScrollState: () => ({ left: viewportElement.scrollLeft, top: viewportElement.scrollTop }), setScrollState: (state) => { if (state.left !== undefined) viewportElement.scrollLeft = state.left; if (state.top !== undefined) viewportElement.scrollTop = state.top; }, getZoom: () => currentZoom, setZoom: (next) => { currentZoom = next; }, },
      document: { getSnapshot: () => session.getSnapshot().document, getCanonicalRevision: () => session.getSnapshot().revision, getDocumentEpoch: () => documentEpoch },
      render: { requestRender: (reason) => { rendererHost.dataset.timelineRefreshReason = reason; renderer.update(projection); }, requestOverlayRefresh: (reason) => { rendererHost.dataset.overlayRefreshReason = reason; refreshOverlays(session.getSnapshot().document); }, waitForRendererIdle: async () => undefined },
      lifecycle: { isCurrentEpoch: (epoch) => epoch === documentEpoch },
    });
    function sourceBoundaryLocalX(document: CanonicalDocument, cycle: number): number | undefined {
      return timelineRuntime.sourceBoundaryToLocalX(document, cycle);
    }
    transactionBoundaryX.current = (cycle) => sourceBoundaryLocalX(session.getSnapshot().document, cycle);
    function syncPresentationScale() {
      // The measured screen-geometry scale is shared by the ruler, overlays,
      // and snap projection. WaveDrom text consumes the same derived value to
      // undo only the non-uniform viewport stretch applied to the SVG root.
      const presentationScale = Math.max(0.0001, currentZoom * screenGeometryScale);
      viewportElement!.style.setProperty("--presentation-x-scale", String(presentationScale));
      rendererHost!.style.setProperty("--presentation-x-scale", String(presentationScale));
      rulerViewportElement!.style.setProperty("--presentation-x-scale", String(presentationScale));
    }
    function syncRulerContent() {
      // The outer ruler is a sticky/clipped viewport. Its content follows the
      // actual horizontal scroll while the viewport remains at the domain
      // boundary next to the frozen columns.
      rulerElement!.style.transform = `translateX(${-viewportElement!.scrollLeft}px) scaleX(${currentZoom})`;
      rulerElement!.dataset.scrollLeft = String(viewportElement!.scrollLeft);
    }
    const currentViewMetrics = () => {
      viewMetricsOwner.update({ viewportWidth: viewportElement.clientWidth, zoom: currentZoom });
      return viewMetricsOwner.snapshot();
    };
    const timelineOffset = () => {
      const metrics = currentViewMetrics();
      return metrics.leftPaneWidth + metrics.frozenPaneWidth;
    };
    const applyZoom = (next: number) => {
      currentZoom = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
      viewMetricsOwner.update({ zoom: currentZoom, viewportWidth: viewportElement.clientWidth });
      const metrics = viewMetricsOwner.snapshot();
      const scalable = [gridElement, ...rendererHost.querySelectorAll<HTMLElement>("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']")];
      for (const element of scalable) {
        element.style.transformOrigin = "0 0";
        element.style.scale = `${currentZoom} 1`;
      }
      rulerElement.style.transformOrigin = "0 0";
      syncRulerContent();
      viewportElement.style.setProperty("--zoom-x", String(currentZoom));
      syncPresentationScale();
      const baseWidth = Math.max(160, globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth);
      const width = timelineOffset() + baseWidth * currentZoom;
      rendererHost.style.width = `${width}px`;
      rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.style.setProperty("width", `${width}px`);
      rendererHost.dataset.zoom = String(currentZoom);
      startTransition(() => setZoom(currentZoom));
    };
    changeZoom.current = (delta) => applyZoom(currentZoom + delta);
    setZoomAbsolute.current = (zoom) => applyZoom(zoom);
    fitSelection.current = () => {
      const selected = timelineRangeRef.current;
      const document = session.getSnapshot().document;
      const start = sourceBoundaryLocalX(document, selected.start) ?? 0;
      const end = sourceBoundaryLocalX(document, selected.end) ?? start + 1;
      const span = Math.max(1, end - start);
      const available = Math.max(160, viewportElement.clientWidth - timelineOffset() - 20);
      applyZoom(available / span);
      requestAnimationFrame(() => { viewportElement.scrollLeft = Math.max(0, Math.round(start * currentZoom - timelineOffset())); });
    };
    fitAll.current = () => {
      const document = session.getSnapshot().document;
      const start = sourceBoundaryLocalX(document, 0) ?? 0;
      const end = sourceBoundaryLocalX(document, document.timeline.cycleCount) ?? start + 1;
      const span = Math.max(1, end - start);
      const available = Math.max(160, viewportElement.clientWidth - timelineOffset() - 20);
      applyZoom(available / span);
      requestAnimationFrame(() => { viewportElement.scrollLeft = 0; });
    };
    navigateToCycle.current = (cycle) => {
      const document = session.getSnapshot().document;
      if (!Number.isInteger(cycle) || cycle < 0 || cycle > document.timeline.cycleCount) return;
      const cycleX = sourceBoundaryLocalX(document, cycle);
      if (cycleX === undefined) return;
      setSelectedCycle(cycle);
      rendererHost.dataset.selectedCycle = String(cycle);
      if (cycle === document.timeline.cycleCount) setTimelineRange({ start: Math.max(0, cycle - 1), end: cycle });
      else setTimelineRange({ start: cycle, end: cycle + 1 });
      requestAnimationFrame(() => {
        const target = Math.max(0, Math.round(cycleX * currentZoom - Math.max(0, viewportElement.clientWidth * 0.35)));
        viewportElement.scrollLeft = target;
      });
      publishState();
    };
    snapTransactionCycle.current = (clientX) => {
      const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
      const axisOwner = timeAxis.ownerSignalId;
      const axisRow = axisOwner === undefined ? undefined : projection.rowLayout.find((row) => row.rowId === axisOwner);
      // The boundary resolver is independent of a rendered owner row. This
      // keeps clockless transactions usable while a virtualized wave is being
      // mounted (or when no geometry owner is currently available).
      if (!waveLayer || !axisOwner || !axisRow) return cycleBoundaryAtPointerX(clientX);
      rendererHost.dataset.transactionSnapAxisRowId = axisRow.rowId;
      const bounds = waveLayer.getBoundingClientRect();
      if (!snapEnabledRef.current) return cycleBoundaryAtX(clientX);
      const localPointer = screenGeometry.fromScreen({ x: clientX - bounds.left, y: 0 }, { scrollX: 0, scrollY: 0, zoom: currentZoom });
       const snap = currentSnapIndex().nearest({ x: localPointer.x, y: axisRow.y + session.getSnapshot().document.layout.rowHeight / 2 }, 14 / currentZoom, ["cycle-boundary", "clock-edge", "signal-transition", "bus-transition", "marker", "annotation"]);
      publishState();
      return snap?.anchor.cycle;
    };
    publishState();

    void renderer.whenIdle().then(() => {
      if (!rendererHost.isConnected) return;
      rebuildRuler(session.getSnapshot().document);
      refreshRangeSelectionBand.current();
      refreshPlayhead.current();
      refreshGrid(session.getSnapshot().document);
      applyZoom(currentZoom);
      refreshOverlays(session.getSnapshot().document);
      collectWaveErrors();
      publishState();
      rendererHost.dataset.cycleViewReady = "true";
    });

    const upsertDiagnostic = (predicate: (item: DocumentProblem) => boolean, next: DocumentProblem | undefined) => {
      setRuntimeDiagnostics((current) => {
        const filtered = current.filter((item) => !predicate(item));
        return next ? [...filtered, next] : filtered;
      });
    };

    const collectWaveErrors = () => {
      const failed = [...rendererHost.querySelectorAll<HTMLElement>("[data-wave-error]")].map((owner) => ({
        code: "WAVE_RENDER_ERROR",
        path: `$.signals[${owner.dataset.signalId}]`,
        message: owner.dataset.waveError ?? "WaveDrom render failed.",
        severity: "error" as const,
        operation: "waveform.render",
        operationLabel: "Render waveform",
        objectType: "signal",
        ...(owner.dataset.signalId ? { objectId: owner.dataset.signalId } : {}),
        source: "renderer" as const,
        stage: "render" as const,
      }));
      setRuntimeDiagnostics((current) => [...current.filter((item) => item.code !== "WAVE_RENDER_ERROR"), ...failed]);
      if (failed.length > 0) setProblem(failed[0]!.message);
    };

    const clearCommandDiagnostics = () => {
      setRuntimeDiagnostics((current) => current.filter((item) => !item.detail?.startsWith("command-rejection:")));
    };

    const commandDiagnosticTarget = (command: SemanticCommand | undefined): Pick<DocumentProblem, "objectType" | "objectId"> => {
      if (!command) return {};
      if ("signalId" in command) return { objectType: "signal", objectId: command.signalId };
      if ("groupId" in command) return { objectType: "group", objectId: command.groupId };
      if ("annotationId" in command) return { objectType: "annotation", objectId: command.annotationId };
      if ("transactionId" in command) return { objectType: "transaction", objectId: command.transactionId };
      if ("spacerId" in command) return { objectType: "spacer", objectId: command.spacerId };
      if ("bookmarkId" in command) return { objectType: "bookmark", objectId: command.bookmarkId };
      if ("timeGroupId" in command) return { objectType: "timeGroup", objectId: command.timeGroupId };
      if (command.type === "signal.create") return { objectType: "signal", objectId: command.signal.id };
      if (command.type === "signal.bulkCreate") { const firstSignalId = command.signals[0]?.id; return firstSignalId === undefined ? { objectType: "signal" } : { objectType: "signal", objectId: firstSignalId }; }
      if (command.type === "group.create") return { objectType: "group", objectId: command.group.id };
      if (command.type === "transaction.create") return { objectType: "transaction", objectId: command.transaction.id };
      if (command.type === "annotation.create") return { objectType: "annotation", objectId: command.annotation.id };
      if (command.type === "bookmark.create") return { objectType: "bookmark", objectId: command.bookmark.id };
      if (command.type === "timeGroup.create") return { objectType: "timeGroup", objectId: command.timeGroup.id };
      if (command.type === "spacer.create") return { objectType: "spacer", objectId: command.spacer.id };
      return {};
    };

    const applyResult = (result: ReturnType<CommandHistorySession["execute"]>, operation = "command", command?: SemanticCommand, batchId?: CommandId) => {
      if (!result.ok) {
        const target = commandDiagnosticTarget(command);
        const objectId = target.objectId;
        const safeTarget = (objectId === undefined
          ? (target.objectType === undefined ? {} : { objectType: target.objectType })
          : { ...(target.objectType === undefined ? {} : { objectType: target.objectType }), objectId }) as Pick<DocumentProblem, "objectType" | "objectId">;
        const commandId = command?.id ?? batchId;
        const diagnostics = buildCommandRejectionDiagnostics({ result, operation, ...(commandId === undefined ? {} : { commandId }), target: safeTarget });
        setProblem(result.reason === "no-op" ? "" : diagnostics.map((item) => item.message).join(" "));
        setRuntimeDiagnostics((current) => [
          ...current.filter((item) => !item.detail?.startsWith("command-rejection:")),
          ...diagnostics,
        ]);
        return;
      }
      delete rendererHost.dataset.editorIdle;
      projection = projectionCoordinator.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      const changed = result.changeSet;
      if (changed.fullDocumentReplace === true) {
        documentEpoch.advance();
        clearAnnotationPreview();
      }
      const snapDependenciesChanged = changed.fullDocumentReplace === true || changed.rowOrder !== undefined || changed.addedSignals !== undefined || changed.removedSignals !== undefined || changed.addedGroups !== undefined || changed.removedGroups !== undefined || changed.waveSemantics !== undefined || changed.geometryLocal !== undefined || changed.geometryScreenX === true || changed.geometryScreenY !== undefined || changed.annotationPosition !== undefined || changed.annotationStyle !== undefined || changed.bookmarkPosition !== undefined || changed.timeGroupSemantics !== undefined || changed.timelineSemantics === true;
      if (snapDependenciesChanged) snapIndex = undefined;
      const referenceSignalId = result.snapshot.document.timeline.referenceClock;
      const referenceWaveChanged = referenceSignalId !== undefined && (changed.fullDocumentReplace === true || changed.timelineSemantics === true || changed.timeGroupSemantics !== undefined || changed.waveSemantics?.includes(referenceSignalId) === true || changed.geometryLocal?.includes(referenceSignalId) === true);
      const refreshRuler = changed.fullDocumentReplace === true || changed.timelineSemantics === true || changed.timeGroupSemantics !== undefined || changed.bookmarkPosition !== undefined || referenceWaveChanged;
      const refreshGridNow = changed.fullDocumentReplace === true || changed.timelineSemantics === true || changed.timeGroupSemantics !== undefined || referenceWaveChanged;
      // Row presentation (for example a signal rename or role/style edit) does
      // not change annotation anchor coordinates. Re-resolve overlays only for
      // actual screen-Y/order changes or an explicit annotation dependency.
      const refreshOverlaysNow = refreshRuler || changed.rowOrder !== undefined || changed.geometryScreenY !== undefined || changed.edgeCounter !== undefined || (changed.annotationPosition?.length ?? 0) > 0 || (changed.annotationStyle?.length ?? 0) > 0 || (changed.addedSignals?.length ?? 0) > 0 || (changed.removedSignals?.length ?? 0) > 0;
      renderer.update(projection);
      setSnapshot(result.snapshot);
      setValidationDiagnostics([]);
      setTimelineRange((range) => {
        const start = Math.min(range.start, result.snapshot.document.timeline.cycleCount - 1);
        return { start, end: Math.max(start + 1, Math.min(range.end, result.snapshot.document.timeline.cycleCount)) };
      });
      setHistory(session.historyState());
      setProblem("");
      clearCommandDiagnostics();
      publishState();
      void renderer.whenIdle().then(() => {
        if (!rendererHost.isConnected) return;
        if (refreshRuler) {
          rebuildRuler(result.snapshot.document);
          refreshRangeSelectionBand.current();
        }
        refreshPlayhead.current();
        if (refreshGridNow) refreshGrid(result.snapshot.document);
        applyZoom(currentZoom);
        if (refreshOverlaysNow) refreshOverlays(result.snapshot.document);
        collectWaveErrors();
        publishState();
        rendererHost.dataset.editorIdle = "true";
      });
    };
    applyCollapsedGroupsRef.current = (ids) => {
      projection = projectionCoordinator.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport: window, previous: projection, collapsedGroupIds: [...ids] });
      snapIndex = undefined;
      renderer.update(projection);
      refreshPlayhead.current();
      refreshGrid(session.getSnapshot().document);
      refreshOverlays(session.getSnapshot().document);
      publishState();
    };
    execute.current = (command) => { const result = sessionController.execute(command); applyResult(result, command.type, command); return result; };
    executeBatch.current = (id, commands) => { const result = sessionController.executeBatch(id, commands); applyResult(result, `batch:${id}`, undefined, id); return result; };
    undo.current = () => applyResult(sessionController.undo(), "history.undo");
    redo.current = () => applyResult(sessionController.redo(), "history.redo");
    const replaceDocument = (document: CanonicalDocument | ParsedCanonicalDocument, migrationWarnings: readonly { code: string; path: string; message: string }[] = []) => {
      const canonicalDocument = canonicalDocumentOf(document);
      const resourceProblems = validateDocumentResourceBudget(canonicalDocument);
      if (resourceProblems.length > 0) {
        const openProblems = resourceProblems.map((item) => ({
          ...item,
          severity: "error" as const,
          operation: "document.open",
          operationLabel: "Open document",
          source: "open" as const,
          stage: "validate" as const,
          recommendation: "Reduce the document resource count, then retry Open.",
          detail: `open-failure:${item.detail ?? item.code}`,
        }));
        setProblem(openProblems.map((item) => item.message).join(" "));
        setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), ...openProblems]);
        return;
      }
      documentEpoch.advance();
      clearAnnotationPreview();
      delete rendererHost.dataset.editorIdle;
      session = sessionController.replace(canonicalDocument);
      setBottomPinned(false);
      setPinnedBottomSelection(undefined);
      setRangeSelectionActive(false);
      geometryRegistry.clear();
      snapIndex = undefined;
      timeAxis = { mode: "clockless" };
      rulerInitialized = false;
      // Open/New owns a deterministic viewport policy. Apply it before the
      // first projection so the previous document cannot seed stale rows.
      viewportElement.scrollLeft = 0;
      viewportElement.scrollTop = 0;
        window = buildViewportWindow(viewportElement, canonicalDocument.timeline.referenceClock);
      projection = projectionCoordinator.project({ snapshot: session.getSnapshot(), changeSet: { fullDocumentReplace: true }, viewport: window, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
      renderer.update(projection);
      markOpenPhase("canonical-replaced");
      requestAnimationFrame(() => markOpenPhase("row-shell-painted"));
      rulerElement.replaceChildren();
      setSnapshot(session.getSnapshot());
      setValidationDiagnostics([]);
      setHistory(session.historyState());
      setSelectedId(undefined);
      selectedAnnotationRef.current = undefined;
      setSelectedAnnotationId(undefined);
      selectedTransactionRef.current = undefined;
      setSelectedTransactionId(undefined);
      setProblem("");
      setRuntimeDiagnostics(migrationWarnings.map((warning, index) => ({ code: warning.code, path: `${warning.path}[migration:${index}]`, message: warning.message })));
      publishState();
      void renderer.whenIdle().then(() => {
        if (!rendererHost.isConnected) return;
        rebuildRuler(session.getSnapshot().document);
        refreshPlayhead.current();
        refreshGrid(session.getSnapshot().document);
        applyZoom(currentZoom);
        refreshOverlays(session.getSnapshot().document);
        collectWaveErrors();
        publishState();
        markOpenPhase("all-visible-idle");
        rendererHost.dataset.editorIdle = "true";
      });
    };
    openDocument.current = (text) => {
      const fileReadStartedAt = openFileReadStartedAtRef.current;
      openFileReadStartedAtRef.current = undefined;
      beginOpenMeasurement(undefined, fileReadStartedAt);
      markOpenPhase("file-read-complete");
      const parsed = parseOpenDocument(text);
      markOpenPhase("parse-done");
      if (!parsed.ok) {
        const openProblems = parsed.problems.map((item) => ({
          ...item,
          severity: "error" as const,
          operation: "document.open",
          operationLabel: "Open document",
          source: "open" as const,
          stage: item.line !== undefined || item.column !== undefined ? "parse" as const : "validate" as const,
          detail: `open-failure:${item.code}${item.detail ? `;${item.detail}` : ""}`,
        }));
        setProblem(openProblems.map((item) => item.message).join(" "));
        setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), ...openProblems]);
        return;
      }
      markOpenPhase("validate-done");
      replaceDocument(parsed, parsed.warnings);
    };
    newDocument.current = () => { beginOpenMeasurement(); replaceDocument(createNewDocument(cycleDocument, `document_${Date.now()}`)); };
    saveDocument.current = () => {
      const reportSaveFailure = (error: unknown, stage: "validate" | "serialize" | "storage") => {
        const candidate = error as { problems?: unknown };
        const problems = Array.isArray(candidate?.problems) ? candidate.problems.filter((item): item is DocumentProblem => item !== null && typeof item === "object" && typeof (item as { code?: unknown }).code === "string" && typeof (item as { path?: unknown }).path === "string" && typeof (item as { message?: unknown }).message === "string") : [];
        const reason = error instanceof Error ? error.message : "Save failed.";
        const diagnostics: readonly DocumentProblem[] = problems.length > 0
          ? problems.map((item) => ({ ...item, severity: "error" as const, operation: "document.save", operationLabel: "Save document", source: "save" as const, stage, recommendation: "Fix the reported field and retry Save.", detail: `save-failure:${stage}:${item.code}` }))
          : [{ code: stage === "storage" ? "SAVE_STORAGE_FAILED" : stage === "validate" ? "SAVE_VALIDATION_FAILED" : "SAVE_SERIALIZE_FAILED", path: "$.document", message: `Save document failed: ${reason}`, severity: "error" as const, operation: "document.save", operationLabel: "Save document", source: "save" as const, stage, recommendation: stage === "storage" ? "Retry Save or choose Save As; the document remains unchanged." : "Fix the reported document problem, then retry Save.", detail: `save-failure:${stage}` }];
        setProblem(diagnostics.map((item) => item.message).join(" "));
        setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("save-failure:")), ...diagnostics]);
      };
      let text: string;
      try {
        text = serializeSaveDocument(session.getSnapshot().document);
      } catch (error) {
        reportSaveFailure(error, "serialize");
        return undefined;
      }
      try {
        localStorage.setItem("timing-chart-v2.recent", text);
      } catch (error) {
        reportSaveFailure(error, "storage");
        return undefined;
      }
      session.markClean();
      setHistory(session.historyState());
      setRuntimeDiagnostics((current) => current.filter((item) => !item.detail?.startsWith("save-failure:")));
      return text;
    };

    let frame = 0;
    const onScroll = () => {
      syncRulerContent();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        syncRulerContent();
        const next = buildViewportWindow(viewportElement, session.getSnapshot().document.timeline.referenceClock);
        if (next.viewportStartY === window.viewportStartY && next.viewportEndY === window.viewportEndY) return;
        const previousMountedSignals = projection.mountedSignalIds;
        window = next;
        projection = projectionCoordinator.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport: window, previous: projection, collapsedGroupIds: [...collapsedGroupIdsRef.current] });
        const mountedSignalsChanged = previousMountedSignals.length !== projection.mountedSignalIds.length
          || previousMountedSignals.some((signalId, index) => signalId !== projection.mountedSignalIds[index]);
        if (mountedSignalsChanged) snapIndex = undefined;
        renderer.update(projection);
        rendererHost.dataset.viewportStartY = String(window.viewportStartY);
        publishState();
      });
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
    armArrowPick.current = () => {
      pendingArrow = "armed";
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
    leftTree?.addEventListener("keydown", onTreeKeyDown);
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
        selectedSignalRef.current = signalId;
        selectedSignalIdsRef.current = selectionController.replace(new Set([signalId]));
        setSelectedId(signalId);
        setSelectedSignalIds(new Set([signalId]));
         setSelectedGroupId(undefined);
         setSelectedAnnotationId(undefined);
         setSelectedTransactionId(undefined);
         setContextMenu({ x: event.clientX, y: event.clientY, target: "signal" });
        return;
      }
      const groupMore = closestFromEvent<HTMLElement>("[data-role='tree-group-more'][data-group-id]");
      if (groupMore?.dataset.groupId) {
        event.preventDefault();
        event.stopPropagation();
        const groupId = groupMore.dataset.groupId as GroupId;
        selectedGroupRef.current = groupId;
        setSelectedGroupId(groupId);
        setSelectedId(undefined);
        applySelectionDecorations(new Set(), undefined);
        selectedSignalRef.current = undefined;
        selectedSignalIdsRef.current = selectionController.clear();
        setSelectedSignalIds(new Set());
         setSelectedAnnotationId(undefined);
         setSelectedTransactionId(undefined);
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
        selectedSpacerRef.current = undefined;
        setSelectedGroupId(groupOwner.dataset.groupId as GroupId);
        selectedGroupRef.current = groupOwner.dataset.groupId as GroupId;
        setSelectedId(undefined);
        applySelectionDecorations(new Set(), undefined);
        selectedSignalRef.current = undefined;
        selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set());
        setSelectedAnnotationId(undefined);
        selectedAnnotationRef.current = undefined;
        setSelectedTransactionId(undefined);
        selectedTransactionRef.current = undefined;
        for (const treeItem of leftTree?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? []) treeItem.setAttribute("aria-selected", String(treeItem.dataset.rowId === `${groupOwner.dataset.groupId}:header`));
        focusTreeItem(groupOwner.closest<HTMLElement>("[role='treeitem']") ?? undefined);
        return;
      }
      const annotationOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]") : null;
      if (annotationOwner?.dataset.annotationId) {
        selectedSpacerRef.current = undefined;
        const id = annotationOwner.dataset.annotationId as AnnotationId;
        selectedAnnotationRef.current = id;
        setSelectedAnnotationId(id);
        setSelectedId(undefined);
        applySelectionDecorations(new Set(), undefined);
        selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set());
        setSelectedGroupId(undefined);
        setSelectedTransactionId(undefined);
        selectedTransactionRef.current = undefined;
        if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Annotation");
        for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-annotation-id]")) owner.dataset.selected = String(owner.dataset.annotationId === id);
        return;
      }
      if (pendingArrow && event.target instanceof Element && event.target.closest("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface']")) {
        const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
        if (!waveLayer) return;
        const bounds = waveLayer.getBoundingClientRect();
        const localPointer = screenGeometry.fromScreen({ x: event.clientX - bounds.left, y: 0 }, { scrollX: 0, scrollY: 0, zoom: currentZoom });
        const snap = currentSnapIndex().nearest({ x: localPointer.x, y: event.clientY - bounds.top }, 12 / currentZoom, ["clock-edge", "signal-transition", "bus-transition"]);
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
        const annotation: Annotation = { id: nextEntityId("annotation", session.getSnapshot().document) as AnnotationId, type: "arrow", label: "Transition", visible: true, color: "#d04a36", from: pendingArrow, to: snap.anchor, lineType: "straight", arrowhead: "end" };
        const result = execute.current({ id: nextCommandId("annotation_transition_arrow"), type: "annotation.create", annotation });
        if (result.ok) selectAnnotation(annotation.id);
        pendingArrow = undefined;
        setArrowPickStatus("idle");
        delete rendererHost.dataset.arrowPick;
        rendererHost.dataset.snapKind = snap.kind;
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
      const id = target?.dataset.rowId;
      if (!id) return;
      const spacerGroup = session.getSnapshot().document.signalGroups.find((group) => group.rows.includes(id as SpacerId) && group.spacers?.some((spacer) => spacer.id === id));
      if (spacerGroup) {
        selectedSpacerRef.current = id as SpacerId;
        selectedGroupRef.current = spacerGroup.id;
        setSelectedGroupId(spacerGroup.id);
        setSelectedId(undefined);
        selectedSignalRef.current = undefined;
        selectedSignalIdsRef.current = new Set();
        setSelectedSignalIds(new Set());
        selectedAnnotationRef.current = undefined;
        setSelectedAnnotationId(undefined);
        selectedTransactionRef.current = undefined;
        setSelectedTransactionId(undefined);
        if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Signal");
        focusTreeItem(target);
        return;
      }
      const signal = session.getSnapshot().document.signals.find((candidate) => candidate.id === id);
      if (!signal) return;
      const nextSelected = selectionController.toggleSignal(selectedSignalIdsRef.current, signal.id, event.ctrlKey || event.metaKey);
      selectedSignalIdsRef.current = nextSelected;
      const primary = selectionController.primarySignal(nextSelected, signal.id);
      applySelectionDecorations(nextSelected, primary);
      if (primary) { rendererHost.dataset.selectedSignalId = primary; selectedSignalRef.current = primary; }
      focusTreeItem(target);
      selectedAnnotationRef.current = undefined;
      selectedTransactionRef.current = undefined;
      selectedSpacerRef.current = undefined;
      if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Signal");
      // Selection is view-only state. Commit it synchronously so the Inspector
      // and Bottom surfaces cannot remain on the layout context while a
      // concurrent WaveDrom/projection update is pending.
      setSelectedSignalIds(nextSelected);
      if (primary) setSelectedId(primary);
      setSelectedGroupId(undefined);
      setSelectedAnnotationId(undefined);
      setSelectedTransactionId(undefined);
      publishState();
    };
    const applyCanvasCycleSelection = (cycle: number, shiftKey: boolean) => {
      const cycleCount = session.getSnapshot().document.timeline.cycleCount;
      if (cycle < 0 || cycle > cycleCount) return false;
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
    const selectCanvasCycle = (event: MouseEvent) => {
      if (!isTimeDomainPointerTarget(event)) return false;
      const cycle = cycleBoundaryAtX(event.clientX);
      return cycle === undefined ? false : applyCanvasCycleSelection(cycle, event.shiftKey);
    };
    const onRulerSelect = (event: MouseEvent) => {
      if (suppressRulerClick) {
        suppressRulerClick = false;
        return;
      }
      const tick = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cycle]") : null;
      if (!tick) return;
      const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle);
      if (!Number.isInteger(cycle) || cycle > session.getSnapshot().document.timeline.cycleCount) return;
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
    };
    let dragged: { readonly kind: "signal" | "group"; readonly id: string } | undefined;
    const rangeDragController = new RangeDragController();
    const selectionController = runtime.selection;
    let suppressCanvasClick = false;
    let suppressRulerClick = false;
    const cycleBoundaryAtX = (clientX: number): number | undefined => {
      const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
      if (!waveLayer) return undefined;
      const bounds = waveLayer.getBoundingClientRect();
      const x = screenGeometry.fromScreen({ x: clientX - bounds.left, y: 0 }, { scrollX: 0, scrollY: 0, zoom: currentZoom }).x;
      const candidates = currentSnapIndex().entries().filter((candidate) => candidate.kind === "cycle-boundary");
      if (!snapEnabledRef.current) {
        const ordered = [...candidates].sort((left, right) => left.point.x - right.point.x);
        const x = (clientX - bounds.left) / currentZoom;
        const terminal = ordered.at(-1);
        if (terminal && x >= terminal.point.x - 32 / currentZoom) return terminal.anchor.cycle;
        return ordered.filter((candidate) => candidate.point.x <= x).at(-1)?.anchor.cycle ?? ordered[0]?.anchor.cycle;
      }
      let nearest: { cycle: number; distance: number } | undefined;
      for (const candidate of candidates) {
        const distance = Math.abs(candidate.point.x - x);
        if (!nearest || distance < nearest.distance) nearest = { cycle: candidate.anchor.cycle, distance };
      }
      return nearest?.cycle;
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
    const onRangePointerDown = (event: PointerEvent) => {
      if (rendererHost.dataset.arrowPick) return;
      if (rangeDragController.current) return;
      const target = event.target instanceof Element ? event.target : undefined;
      const onRuler = Boolean(target?.closest("[data-testid='cycle-ruler']"));
      if (event.button !== 0 || !isTimeDomainPointerTarget(event)) return;
      const cycle = cycleBoundaryAtPointerX(event.clientX);
      if (cycle === undefined || cycle > session.getSnapshot().document.timeline.cycleCount) return;
      rangeDragController.begin({ start: cycle, anchor: event.shiftKey ? timelineRangeRef.current.start : cycle, selectedCycle: selectedCycleRef.current, startClientX: event.clientX, surface: onRuler ? "ruler" : "waveform", moved: false });
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onRangePointerMove = (event: PointerEvent) => {
      const rangeDrag = rangeDragController.current;
      if (!rangeDrag) return;
      const cycle = cycleBoundaryAtPointerX(event.clientX);
      if (cycle === undefined) return;
      if (!rangeDrag.moved && Math.abs(event.clientX - rangeDrag.startClientX) < 4) return;
      rangeDragController.markMoved();
      // The preview and playhead consume the same interaction cycle before
      // any canonical/range state is committed on pointerup.
      selectedCycleRef.current = cycle;
      rendererHost.dataset.rangePreview = `${Math.min(rangeDrag.anchor, cycle)}:${Math.max(rangeDrag.anchor, cycle)}`;
      rendererHost.dataset.rangePreviewCycle = String(cycle);
      rendererHost.dataset.rangeDrag = "active";
      refreshRangePreview();
      refreshPlayhead.current();
      event.preventDefault();
    };
    const onRangePointerUp = (event: PointerEvent) => {
      const rangeDrag = rangeDragController.current;
      if (!rangeDrag) return;
      const cycle = cycleBoundaryAtPointerX(event.clientX) ?? rangeDrag.start;
      if (!rangeDrag.moved) {
        const dragSurface = rangeDrag.surface;
        selectedCycleRef.current = rangeDrag.selectedCycle;
        rangeDragController.clear();
        delete rendererHost.dataset.rangeDrag;
        delete rendererHost.dataset.rangePreview;
        delete rendererHost.dataset.rangePreviewCycle;
        refreshRangePreview();
        refreshPlayhead.current();
        suppressCanvasClick = true;
        suppressRulerClick = dragSurface === "ruler";
        const clickCycle = dragSurface === "ruler" ? cycle : cycleBoundaryAtX(event.clientX);
        if (clickCycle !== undefined) applyCanvasCycleSelection(clickCycle, event.shiftKey);
        requestAnimationFrame(() => { suppressCanvasClick = false; });
        if (suppressRulerClick) requestAnimationFrame(() => { suppressRulerClick = false; });
        event.preventDefault();
        return;
      }
      const next = rangeFromBoundaries(rangeDrag.anchor, cycle, session.getSnapshot().document.timeline.cycleCount);
      setRangeSelectionActive(true);
      selectedCycleRef.current = Math.min(next.start, session.getSnapshot().document.timeline.cycleCount);
      setTimelineRange(next);
      setSelectedCycle(Math.min(next.start, session.getSnapshot().document.timeline.cycleCount));
      rendererHost.dataset.selectedCycle = String(Math.min(next.start, session.getSnapshot().document.timeline.cycleCount));
      const dragSurface = rangeDrag.surface;
      delete rendererHost.dataset.rangeDrag;
      delete rendererHost.dataset.rangePreview;
      delete rendererHost.dataset.rangePreviewCycle;
      refreshRangePreview();
      refreshPlayhead.current();
      rangeDragController.clear();
      suppressCanvasClick = true;
      suppressRulerClick = dragSurface === "ruler";
      requestAnimationFrame(() => { suppressCanvasClick = false; });
      if (suppressRulerClick) requestAnimationFrame(() => { suppressRulerClick = false; });
      event.preventDefault();
    };
    const onRangePointerCancel = () => {
      const rangeDrag = rangeDragController.current;
      if (!rangeDrag) return;
      selectedCycleRef.current = rangeDrag.selectedCycle;
      rangeDragController.clear();
      delete rendererHost.dataset.rangeDrag;
      delete rendererHost.dataset.rangePreview;
      delete rendererHost.dataset.rangePreviewCycle;
      refreshRangePreview();
    };
    const onRangeKeyDown = (event: KeyboardEvent) => {
      const rangeDrag = rangeDragController.current;
      if (event.key !== "Escape" || !rangeDrag) return;
      selectedCycleRef.current = rangeDrag.selectedCycle;
      rangeDragController.clear();
      delete rendererHost.dataset.rangeDrag;
      delete rendererHost.dataset.rangePreview;
      delete rendererHost.dataset.rangePreviewCycle;
      refreshRangePreview();
    };
    const clearDropState = () => {
      for (const element of rendererHost.querySelectorAll<HTMLElement>("[data-drop-position], [data-dragging]")) {
        delete element.dataset.dropPosition;
        delete element.dataset.dragging;
        element.setAttribute("aria-grabbed", "false");
      }
    };
    const onDragStart = (event: DragEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const branch = element?.closest<HTMLElement>("[data-role='tree-branch'][draggable='true']");
      const row = element?.closest<HTMLElement>("[data-role='left-row'][data-row-id]");
      if (branch?.dataset.groupId) dragged = { kind: "group", id: branch.dataset.groupId };
      else if (row?.dataset.rowId) dragged = { kind: "signal", id: row.dataset.rowId };
      else return;
      const owner = dragged.kind === "group" ? branch : row;
      if (owner) {
        owner.dataset.dragging = "true";
        owner.setAttribute("aria-grabbed", "true");
      }
      event.dataTransfer?.setData("text/plain", `${dragged.kind}:${dragged.id}`);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    };
    const onDragOver = (event: DragEvent) => {
      if (!dragged) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='left-row'][data-row-id]") : null;
      if (!target) return;
      event.preventDefault();
      for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-drop-position]")) delete row.dataset.dropPosition;
      const bounds = target.getBoundingClientRect();
      target.dataset.dropPosition = event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    const onDrop = (event: DragEvent) => {
      if (!dragged) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='left-row'][data-row-id]") : null;
      if (!target?.dataset.rowId || !target.dataset.groupId) return;
      event.preventDefault();
      const after = target.dataset.dropPosition === "after";
      const document = session.getSnapshot().document;
      if (dragged.kind === "signal") {
        const sourceGroup = document.signalGroups.find((group) => group.rows.includes(dragged!.id as SignalId));
        const targetGroup = document.signalGroups.find((group) => group.id === target.dataset.groupId);
        if (sourceGroup && targetGroup && dragged.id !== target.dataset.rowId) {
          const sourceIndex = sourceGroup.rows.indexOf(dragged.id as SignalId);
          let index = targetGroup.rows.indexOf(target.dataset.rowId as SignalId) + (after ? 1 : 0);
          if (sourceGroup.id === targetGroup.id && sourceIndex < index) index -= 1;
          commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("drag_signal"), type: "signal.move", signalId: dragged.id as SignalId, targetGroupId: targetGroup.id, index });
        }
      } else {
        const sourceIndex = document.signalGroups.findIndex((group) => group.id === dragged!.id);
        const targetIndex = document.signalGroups.findIndex((group) => group.id === target.dataset.groupId);
        if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
          let index = targetIndex + (after ? 1 : 0);
          if (sourceIndex < index) index -= 1;
          commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("drag_group"), type: "group.move", groupId: dragged.id as GroupId, index });
        }
      }
      dragged = undefined;
      clearDropState();
    };
    const onDragEnd = () => { dragged = undefined; clearDropState(); };
    let annotationDrag: { readonly annotationId: AnnotationId; readonly field?: typeof annotationFields[number]; readonly label: boolean; readonly startX: number; readonly startY: number; readonly owner: HTMLElement; readonly epoch: number } | undefined;
    const clearAnnotationPreview = () => {
      if (annotationDrag) annotationDrag.owner.style.translate = "";
      annotationDrag = undefined;
      renderer.updateSnapGuide();
      delete rendererHost.dataset.snapKind;
      delete rendererHost.dataset.snapDistance;
    };
    const onAnnotationPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      const owner = event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]");
      if (!owner?.dataset.annotationId) return;
      const fieldElement = event.target.closest<HTMLElement>("[data-role='annotation-handle'][data-annotation-field]");
      const label = event.target.closest<HTMLElement>("[data-annotation-label='true']") !== null;
      const field = fieldElement?.dataset.annotationField as typeof annotationFields[number] | undefined;
      annotationDrag = {
        annotationId: owner.dataset.annotationId as AnnotationId,
        ...(field ? { field } : {}),
        label,
        startX: event.clientX,
        startY: event.clientY,
        owner,
        epoch: documentEpoch.current(),
      };
      publishState();
      owner.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onAnnotationPointerMove = (event: PointerEvent) => {
      if (!annotationDrag) return;
      if (!documentEpoch.isCurrent(annotationDrag.epoch)) { clearAnnotationPreview(); return; }
      const screenDx = Math.round(event.clientX - annotationDrag.startX);
      const dx = Math.round(screenGeometry.fromScreen({ x: screenDx, y: 0 }, { scrollX: 0, scrollY: 0, zoom: currentZoom }).x);
      const dy = Math.round(event.clientY - annotationDrag.startY);
      annotationDrag.owner.style.translate = `${screenDx}px ${dy}px`;
      if (!annotationDrag.field || annotationDrag.label) return;
      const document = session.getSnapshot().document;
      const annotation = document.annotations.find((item) => item.id === annotationDrag?.annotationId);
      const anchor = annotation?.[annotationDrag.field];
       const point = resolveAnchorPoint(anchor, document, projection, geometryMaps, mappingCache.get(document.timeline, document.timeGroups), screenGeometryScale);
      if (!annotation || !anchor || !point) return;
       const desired = { x: point.x + screenDx / currentZoom, y: point.y + dy };
      const snap = snapEnabledRef.current ? currentSnapIndex().nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
      publishState();
      if (!snap) {
        renderer.updateSnapGuide();
        delete rendererHost.dataset.snapKind;
        delete rendererHost.dataset.snapDistance;
        delete rendererHost.dataset.snapCycle;
        return;
      }
      const row = projection.rowLayout.find((item) => item.rowId === snap.anchor.signalId);
      renderer.updateSnapGuide({ x: snap.point.x, y: snap.point.y, rowY: row?.y ?? 0, rowHeight: row?.height ?? projection.totalHeight, surfaceHeight: projection.totalHeight, label: `${snap.kind} · cycle ${snap.anchor.cycle}` });
      rendererHost.dataset.snapKind = snap.kind;
       rendererHost.dataset.snapDistance = String(normalizeSnapDistance(snap.distance));
      rendererHost.dataset.snapCycle = String(snap.anchor.cycle);
    };
    const onAnnotationPointerUp = (event: PointerEvent) => {
      const drag = annotationDrag;
      if (!drag) return;
      if (!documentEpoch.isCurrent(drag.epoch)) { clearAnnotationPreview(); return; }
       const rawScreenDx = event.clientX - drag.startX;
       const dx = Math.round(screenGeometry.fromScreen({ x: rawScreenDx, y: 0 }, { scrollX: 0, scrollY: 0, zoom: currentZoom }).x);
      const dy = Math.round(event.clientY - drag.startY);
      drag.owner.style.translate = "";
      annotationDrag = undefined;
      renderer.updateSnapGuide();
      if (dx === 0 && dy === 0) return;
      const annotation = session.getSnapshot().document.annotations.find((item) => item.id === drag.annotationId);
      if (!annotation) return;
      if (drag.label) {
        commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_label_drag"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: (annotation.labelOffset?.x ?? 0) + dx, y: (annotation.labelOffset?.y ?? -14) + dy } });
        return;
      }
      if (!drag.field) {
        commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_move"), type: "annotation.translateOffsets", annotationId: annotation.id, delta: { x: dx, y: dy } });
        return;
      }
      const field = drag.field ?? annotationFields.find((key) => annotation[key] !== undefined);
      const anchor = field ? annotation[field] : undefined;
       const point = resolveAnchorPoint(anchor, session.getSnapshot().document, projection, geometryMaps, mappingCache.get(snapshot.document.timeline, snapshot.document.timeGroups), screenGeometryScale);
      if (!field || !anchor || !point) return;
       const desired = { x: point.x + rawScreenDx / currentZoom, y: point.y + dy };
      const snap = snapEnabledRef.current ? currentSnapIndex().nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
      publishState();
      const nextAnchor = snap ? withSnapOffset(snap.anchor, desired, snap.point) : withAddedOffset(anchor, dx, dy);
      if (snap) {
        rendererHost.dataset.snapKind = snap.kind;
         rendererHost.dataset.snapDistance = String(normalizeSnapDistance(snap.distance));
        rendererHost.dataset.snapCycle = String(snap.anchor.cycle);
      }
      commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_drag"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: nextAnchor });
    };
    const onAnnotationKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || !mayRouteGlobalShortcut(event, annotationDrag !== undefined)) return;
      if (event.ctrlKey || event.metaKey) {
        const shortcut = event.key.toLowerCase();
        if (shortcut === "c" || shortcut === "x" || shortcut === "v") {
          event.preventDefault();
          commandRegistry.current.execute(`clipboard.${shortcut === "c" ? "copy" : shortcut === "x" ? "cut" : "paste"}`);
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        commandRegistry.current.execute(event.shiftKey ? "history.redo" : "history.undo");
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        commandRegistry.current.execute("selection.delete");
        return;
      }
      const owner = event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]");
      const delta = event.shiftKey ? 10 : 1;
      const movement = event.key === "ArrowLeft" ? { x: -delta, y: 0 } : event.key === "ArrowRight" ? { x: delta, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -delta } : event.key === "ArrowDown" ? { x: 0, y: delta } : undefined;
      if (!owner?.dataset.annotationId || !movement) {
        if (event.key === "Escape") {
          closeContextMenu();
          clearAnnotationPreview();
          pendingArrow = undefined;
          setArrowPickStatus("idle");
          delete rendererHost.dataset.arrowPick;
        }
        return;
      }
      const annotation = session.getSnapshot().document.annotations.find((item) => item.id === owner.dataset.annotationId);
      const field = annotation && annotationFields.find((key) => annotation[key] !== undefined);
      const anchor = field && annotation ? annotation[field] : undefined;
      if (!annotation || !field || !anchor) return;
      event.preventDefault();
      commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_nudge"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: withAddedOffset(anchor, movement.x, movement.y) });
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-row-id], [data-annotation-id], [data-role='tree-more'], [data-role='tree-group-more']")) return;
       event.preventDefault();
       menuOriginRef.current = event.target.closest<HTMLElement>("[data-row-id], [data-annotation-id], [data-role='tree-more'], [data-role='tree-group-more']")
         ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
       onSelect(event);
       setContextMenu({ x: event.clientX, y: event.clientY, target: event.target instanceof Element && event.target.closest("[data-annotation-id]") ? "annotation" : event.target.closest("[data-role='tree-group-more']") ? "group" : "signal" });
    };
    const onCanvasClick = (event: MouseEvent) => {
      if (suppressCanvasClick) { suppressCanvasClick = false; return; }
      const target = event.target instanceof Element ? event.target : undefined;
      // Renderer-owned command controls must win over the time-domain hit
      // resolver, even when the browser reports an inner SVG path as target.
      // Their actions are routed by onSelect into SemanticCommand.
      if (target?.closest("[data-role='tree-visibility'], [data-role='tree-more'], [data-role='tree-collapse'], [data-role='tree-group-more']")) { onSelect(event); return; }
      if (target?.closest("[data-row-id], [data-annotation-id], [data-transaction-id]")) { onSelect(event); return; }
      if (rendererHost.dataset.arrowPick) onSelect(event); else if (!selectCanvasCycle(event)) onSelect(event);
    };
    const onViewportClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (target && (rendererHost.contains(target) || target.closest("[data-testid='cycle-ruler']"))) return;
      if (suppressCanvasClick) { suppressCanvasClick = false; return; }
      if (rendererHost.dataset.arrowPick) onSelect(event);
      else selectCanvasCycle(event);
    };
    viewportElement.addEventListener("scroll", onScroll, { passive: true });
    viewportElement.addEventListener("keydown", onViewportKeyDown);
    rendererHost.addEventListener("click", onCanvasClick);
    rendererHost.addEventListener("pointerdown", onRangePointerDown);
    rendererHost.addEventListener("pointermove", onRangePointerMove);
    rendererHost.addEventListener("pointerup", onRangePointerUp);
    rendererHost.addEventListener("pointercancel", onRangePointerCancel);
    rendererHost.ownerDocument.addEventListener("keydown", onRangeKeyDown);
    rendererHost.addEventListener("dragstart", onDragStart);
    rendererHost.addEventListener("dragover", onDragOver);
    rendererHost.addEventListener("drop", onDrop);
    rendererHost.addEventListener("dragend", onDragEnd);
    viewportElement.addEventListener("click", onViewportClick);
    viewportElement.addEventListener("pointerdown", onRangePointerDown);
    viewportElement.addEventListener("pointermove", onRangePointerMove);
    viewportElement.addEventListener("pointerup", onRangePointerUp);
    viewportElement.addEventListener("pointercancel", onRangePointerCancel);
    // Listen on the clipped viewport so direct synthetic events and bubbled
    // events from the translated content share the same interaction surface.
    rulerViewportElement.addEventListener("click", onRulerSelect);
    rulerViewportElement.addEventListener("pointerdown", onRangePointerDown);
    rulerViewportElement.addEventListener("pointermove", onRangePointerMove);
    rulerViewportElement.addEventListener("pointerup", onRangePointerUp);
    rulerViewportElement.addEventListener("pointercancel", onRangePointerCancel);
    rendererHost.addEventListener("pointerdown", onAnnotationPointerDown);
    rendererHost.addEventListener("pointermove", onAnnotationPointerMove);
    rendererHost.addEventListener("pointerup", onAnnotationPointerUp);
    rendererHost.addEventListener("pointercancel", clearAnnotationPreview);
    rendererHost.addEventListener("contextmenu", onContextMenu);
    rendererHost.ownerDocument.addEventListener("keydown", onAnnotationKeyDown);
    return () => {
      applyCollapsedGroupsRef.current = () => undefined;
      refreshPlayhead.current = () => undefined;
      navigateToCycle.current = () => undefined;
      cancelAnimationFrame(frame);
      leftTree?.removeEventListener("keydown", onTreeKeyDown);
      viewportElement.removeEventListener("scroll", onScroll);
      viewportElement.removeEventListener("keydown", onViewportKeyDown);
      rendererHost.removeEventListener("click", onCanvasClick);
      rendererHost.removeEventListener("pointerdown", onRangePointerDown);
      rendererHost.removeEventListener("pointermove", onRangePointerMove);
      rendererHost.removeEventListener("pointerup", onRangePointerUp);
      rendererHost.removeEventListener("pointercancel", onRangePointerCancel);
      rendererHost.ownerDocument.removeEventListener("keydown", onRangeKeyDown);
      rendererHost.removeEventListener("dragstart", onDragStart);
      rendererHost.removeEventListener("dragover", onDragOver);
      rendererHost.removeEventListener("drop", onDrop);
      rendererHost.removeEventListener("dragend", onDragEnd);
      viewportElement.removeEventListener("click", onViewportClick);
      viewportElement.removeEventListener("pointerdown", onRangePointerDown);
      viewportElement.removeEventListener("pointermove", onRangePointerMove);
      viewportElement.removeEventListener("pointerup", onRangePointerUp);
      viewportElement.removeEventListener("pointercancel", onRangePointerCancel);
      rulerViewportElement.removeEventListener("click", onRulerSelect);
      rulerViewportElement.removeEventListener("pointerdown", onRangePointerDown);
      rulerViewportElement.removeEventListener("pointermove", onRangePointerMove);
      rulerViewportElement.removeEventListener("pointerup", onRangePointerUp);
      rulerViewportElement.removeEventListener("pointercancel", onRangePointerCancel);
      rendererHost.removeEventListener("pointerdown", onAnnotationPointerDown);
      rendererHost.removeEventListener("pointermove", onAnnotationPointerMove);
      rendererHost.removeEventListener("pointerup", onAnnotationPointerUp);
      rendererHost.removeEventListener("pointercancel", clearAnnotationPreview);
      rendererHost.removeEventListener("contextmenu", onContextMenu);
      rendererHost.ownerDocument.removeEventListener("keydown", onAnnotationKeyDown);
      execute.current = () => ({ ok: false, reason: "no-op", problems: [] });
      executeBatch.current = () => ({ ok: false, reason: "no-op", problems: [] });
      undo.current = () => undefined;
      redo.current = () => undefined;
      armArrowPick.current = () => undefined;
      changeZoom.current = () => undefined;
      openDocument.current = () => undefined;
      newDocument.current = () => undefined;
      saveDocument.current = () => undefined;
      snapTransactionCycle.current = () => undefined;
      renderCoordinator.dispose();
    };
  }, []);

  useEffect(() => {
    refreshPlayhead.current();
    refreshRangeSelectionBand.current();
  }, [selectedCycle, snapshot.revision, timelineRange, rangeSelectionActive, zoom, leftPaneWidth, frozenPaneWidth, inspectorWidth]);

  useEffect(() => {
    const linked = new Set(selectedTransaction?.linkedSignals ?? []);
    for (const row of host.current?.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]") ?? []) {
      const id = row.dataset.rowId ?? row.dataset.signalId;
      row.dataset.transactionLinked = String(id !== undefined && linked.has(id as SignalId));
    }
  }, [selectedTransactionId, snapshot.revision]);

  const createSelectedAnnotation = (annotation: Annotation) => {
    const result = execute.current({ id: nextCommandId("annotation_create"), type: "annotation.create", annotation });
    if (!result.ok) return;
    selectedAnnotationRef.current = annotation.id;
    setSelectedAnnotationId(annotation.id);
    setSelectedId(undefined);
    applySelectionDecorations(new Set(), undefined);
    setSelectedTransactionId(undefined);
    selectedTransactionRef.current = undefined;
    if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Annotation");
  };
  const selectAnnotation = (id: AnnotationId) => {
    selectedAnnotationRef.current = id;
    setSelectedAnnotationId(id);
    setSelectedId(undefined);
        selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set());
    setSelectedGroupId(undefined);
    setSelectedTransactionId(undefined);
    selectedTransactionRef.current = undefined;
    applySelectionDecorations(new Set(), undefined);
    if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Annotation");
  };
  const deleteBottomSignal = () => {
    if (!bottomSignal) return;
    const result = execute.current({ id: nextCommandId("bottom_delete_signal"), type: "signal.delete", signalId: bottomSignal.id });
    if (result.ok && !bottomPinnedRef.current && selectedSignalRef.current === bottomSignal.id) {
      selectedSignalRef.current = undefined;
      setSelectedId(undefined);
        selectedSignalIdsRef.current = new Set();
      setSelectedSignalIds(new Set());
    }
  };
  const deleteBottomAnnotation = () => {
    if (!bottomAnnotation) return;
    const result = execute.current({ id: nextCommandId("bottom_delete_annotation"), type: "annotation.delete", annotationId: bottomAnnotation.id });
    if (result.ok && !bottomPinnedRef.current && selectedAnnotationRef.current === bottomAnnotation.id) {
      selectedAnnotationRef.current = undefined;
      setSelectedAnnotationId(undefined);
    }
  };
  const deleteBottomTransaction = () => {
    if (!bottomTransaction) return;
    const result = execute.current({ id: nextCommandId("bottom_delete_transaction"), type: "transaction.delete", transactionId: bottomTransaction.id });
    if (result.ok && !bottomPinnedRef.current && selectedTransactionRef.current === bottomTransaction.id) {
      selectedTransactionRef.current = undefined;
      setSelectedTransactionId(undefined);
    }
  };
  const signalEditor = <SignalEditor
    key={`${bottomSignal?.id ?? "none"}:${snapshot.revision}:${bottomResetToken}`}
    signal={bottomSignal}
    cycleCount={snapshot.document.timeline.cycleCount}
    history={history}
    groups={snapshot.document.signalGroups}
    problem={problem}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onVisibility={(signalId, visible) => commandRegistry.current.execute("semantic.execute", { id: nextCommandId("bottom_signal_visibility"), type: "signal.setVisibility", signalId, visible })}
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
      const result = execute.current({ id: nextCommandId("annotation_duplicate"), type: "annotation.create", annotation: duplicate });
      if (result.ok) selectAnnotation(duplicate.id);
    }}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={deleteBottomAnnotation}
    onCancel={() => setBottomResetToken((value) => value + 1)}
  /> : <><AnnotationList annotations={snapshot.document.annotations} selectedId={undefined} onSelect={selectAnnotation} /><div className="empty-editor">Select or create an Annotation.</div></>;
  const selectTransaction = (id: TransactionId) => {
    selectedSpacerRef.current = undefined;
    selectedTransactionRef.current = id;
    setSelectedTransactionId(id);
    selectedSignalRef.current = undefined; setSelectedId(undefined);
    selectedGroupRef.current = undefined; setSelectedGroupId(undefined);
    selectedAnnotationRef.current = undefined; setSelectedAnnotationId(undefined);
    applySelectionDecorations(new Set(), undefined);
    if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Transaction");
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
    setSelectedId(targetSignalId);
    selectedSignalRef.current = targetSignalId;
    selectedSignalIdsRef.current = targetSignalId ? new Set([targetSignalId]) : new Set();
    setSelectedSignalIds(targetSignalId ? new Set([targetSignalId]) : new Set());
    setSelectedGroupId(target.kind === "group" ? target.id as GroupId : undefined);
    selectedGroupRef.current = target.kind === "group" ? target.id as GroupId : undefined;
    setSelectedAnnotationId(target.kind === "annotation" ? target.id as AnnotationId : undefined);
    selectedAnnotationRef.current = target.kind === "annotation" ? target.id as AnnotationId : undefined;
    setSelectedTransactionId(target.kind === "transaction" ? target.id as TransactionId : undefined);
    selectedTransactionRef.current = target.kind === "transaction" ? target.id as TransactionId : undefined;
    if (semanticCycle !== undefined) {
      const cycle = Math.max(0, Math.min(snapshot.document.timeline.cycleCount, semanticCycle));
      selectedCycleRef.current = cycle;
      setSelectedCycle(cycle);
      if (host.current) host.current.dataset.selectedCycle = String(cycle);
    }
    applySelectionDecorations(targetSignalId ? new Set([targetSignalId]) : new Set(), targetSignalId);
    if (target.kind === "annotation" && followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Annotation");
    if (target.kind === "transaction" && followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Transaction");
    if (target.kind === "timeline") viewport.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  function applySelectionDecorations(selected: ReadonlySet<SignalId>, primary: SignalId | undefined): void {
    const rendererHost = host.current;
    if (!rendererHost) return;
    if (primary) rendererHost.dataset.selectedSignalId = primary;
    else delete rendererHost.dataset.selectedSignalId;
    for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]")) {
      const rowId = (row.dataset.rowId ?? row.dataset.signalId) as SignalId | undefined;
      const isSelected = rowId !== undefined && selected.has(rowId);
      row.dataset.selected = String(isSelected);
      row.setAttribute("aria-selected", String(isSelected));
    }
  }

  const clearSelection = () => {
    selectedSpacerRef.current = undefined;
    selectedSignalRef.current = undefined; setSelectedId(undefined); selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set());
    selectedGroupRef.current = undefined; setSelectedGroupId(undefined);
    selectedAnnotationRef.current = undefined; setSelectedAnnotationId(undefined);
    selectedTransactionRef.current = undefined; setSelectedTransactionId(undefined);
    applySelectionDecorations(new Set(), undefined);
  };
  const selectAllSignals = () => {
    const ids = snapshot.document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
    const selected = new Set(ids);
    selectedSignalIdsRef.current = selected;
    setSelectedSignalIds(selected);
    const primary = ids[0];
    selectedSignalRef.current = primary;
    setSelectedId(primary);
    setSelectedGroupId(undefined);
    setSelectedAnnotationId(undefined);
    setSelectedTransactionId(undefined);
    if (primary) {
      const rendererHost = host.current;
      if (rendererHost) {
        applySelectionDecorations(selected, primary);
      }
    }
  };
  const selectedClipboardSignals = () => snapshot.document.signals
    .filter((signal) => selectedSignalIds.has(signal.id))
    .map((signal) => {
      const group = snapshot.document.signalGroups.find((candidate) => candidate.rows.includes(signal.id));
      return group ? { signal, groupId: group.id, index: group.rows.indexOf(signal.id) } : undefined;
    })
    .filter((item): item is { readonly signal: Signal; readonly groupId: GroupId; readonly index: number } => item !== undefined);
  const copySelectedSignal = () => {
    const selectedGroup = selectedGroupRef.current === undefined ? undefined : snapshot.document.signalGroups.find((group) => group.id === selectedGroupRef.current);
    const selectedSpacer = selectedSpacerRef.current === undefined ? undefined : selectedGroup?.spacers?.find((spacer) => spacer.id === selectedSpacerRef.current);
    if (selectedSpacer && selectedGroup) {
      clipboardSpacerRef.current = { spacer: selectedSpacer, groupId: selectedGroup.id, index: selectedGroup.rows.indexOf(selectedSpacer.id) };
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardAnnotationRef.current = undefined;
      clipboardTransactionRef.current = undefined;
      setClipboardAvailable(true);
      setClipboardStatus(`Copied spacer ${selectedSpacer.id}`);
      return;
    }
    if (selectedGroup) {
      const rows = selectedGroup.rows.flatMap((rowId) => snapshot.document.signals.find((signal) => signal.id === rowId) ?? []);
      clipboardGroupRef.current = { group: selectedGroup, rows, sourceIndex: snapshot.document.signalGroups.indexOf(selectedGroup) };
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardAnnotationRef.current = undefined;
      clipboardTransactionRef.current = undefined;
      setClipboardAvailable(true);
      setClipboardStatus(`Copied ${selectedGroup.name} group`);
      return;
    }
    const sources = selectedClipboardSignals();
    const annotation = selectedAnnotationRef.current === undefined ? undefined : snapshot.document.annotations.find((item) => item.id === selectedAnnotationRef.current);
    const transaction = selectedTransactionRef.current === undefined ? undefined : snapshot.document.transactions.find((item) => item.id === selectedTransactionRef.current);
    if (sources.length === 0 && annotation === undefined && transaction === undefined) { setClipboardStatus("Select a signal, Comment Row, Annotation, or Transaction to copy"); return; }
    if (transaction !== undefined && sources.length === 0 && annotation === undefined) {
      clipboardTransactionRef.current = transaction;
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardAnnotationRef.current = undefined;
      setClipboardAvailable(true);
      setClipboardStatus(`Copied ${transaction.name} transaction`);
      return;
    }
    if (annotation !== undefined && sources.length === 0) {
      clipboardAnnotationRef.current = annotation;
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardTransactionRef.current = undefined;
      setClipboardAvailable(true);
      setClipboardStatus(`Copied ${annotation.label || annotation.type} annotation`);
      return;
    }
    clipboardAnnotationRef.current = undefined;
    clipboardTransactionRef.current = undefined;
    clipboardGroupRef.current = undefined;
    clipboardSignalsRef.current = sources;
    clipboardSignalRef.current = sources[0]?.signal;
    setClipboardAvailable(true);
    setClipboardStatus(sources.length === 1 ? `Copied ${sources[0]!.signal.display.name}` : `Copied ${sources.length} signals`);
  };
  copySelectedSignalRef.current = copySelectedSignal;
  const cutSelectedSignal = () => {
    const selectedGroup = selectedGroupRef.current === undefined ? undefined : snapshot.document.signalGroups.find((group) => group.id === selectedGroupRef.current);
    const selectedSpacer = selectedSpacerRef.current === undefined ? undefined : selectedGroup?.spacers?.find((spacer) => spacer.id === selectedSpacerRef.current);
    if (selectedSpacer && selectedGroup) {
      clipboardSpacerRef.current = { spacer: selectedSpacer, groupId: selectedGroup.id, index: selectedGroup.rows.indexOf(selectedSpacer.id) };
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardAnnotationRef.current = undefined;
      clipboardTransactionRef.current = undefined;
      setClipboardAvailable(true);
      const result = execute.current({ id: nextCommandId("cut_spacer"), type: "spacer.delete", spacerId: selectedSpacer.id });
      if (result.ok) {
        selectedSpacerRef.current = undefined;
        setClipboardStatus(`Cut spacer ${selectedSpacer.id}`);
      }
      return;
    }
    if (selectedGroup) {
      const rows = selectedGroup.rows.flatMap((rowId) => snapshot.document.signals.find((signal) => signal.id === rowId) ?? []);
      clipboardGroupRef.current = { group: selectedGroup, rows, sourceIndex: snapshot.document.signalGroups.indexOf(selectedGroup) };
      clipboardAnnotationRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardTransactionRef.current = undefined;
      setClipboardAvailable(true);
      const commands: SemanticCommand[] = [];
      for (const rowId of selectedGroup.rows) {
        if (snapshot.document.signals.some((signal) => signal.id === rowId)) commands.push({ id: nextCommandId("cut_group_signal"), type: "signal.delete", signalId: rowId as SignalId });
        else commands.push({ id: nextCommandId("cut_group_spacer"), type: "spacer.delete", spacerId: rowId as SpacerId });
      }
      commands.push({ id: nextCommandId("cut_group_delete"), type: "group.delete", groupId: selectedGroup.id });
      const result = executeBatch.current(nextCommandId("cut_group"), commands);
      if (result.ok) {
        selectedGroupRef.current = undefined;
        setSelectedGroupId(undefined);
        selectedSignalRef.current = undefined;
        setSelectedId(undefined);
        setSelectedSignalIds(new Set());
        setClipboardStatus(`Cut ${selectedGroup.name} group`);
      }
      return;
    }
    const sources = selectedClipboardSignals();
    const annotation = selectedAnnotationRef.current === undefined ? undefined : snapshot.document.annotations.find((item) => item.id === selectedAnnotationRef.current);
    const transaction = selectedTransactionRef.current === undefined ? undefined : snapshot.document.transactions.find((item) => item.id === selectedTransactionRef.current);
    if (sources.length === 0 && annotation === undefined && transaction === undefined) { setClipboardStatus("Select a signal, Comment Row, Annotation, or Transaction to cut"); return; }
    if (transaction !== undefined && sources.length === 0 && annotation === undefined) {
      clipboardTransactionRef.current = transaction;
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardAnnotationRef.current = undefined;
      setClipboardAvailable(true);
      const result = execute.current({ id: nextCommandId("cut_transaction"), type: "transaction.delete", transactionId: transaction.id });
      if (result.ok) {
        selectedTransactionRef.current = undefined;
        setSelectedTransactionId(undefined);
        setClipboardStatus(`Cut ${transaction.name} transaction`);
      }
      return;
    }
    if (annotation !== undefined && sources.length === 0) {
      clipboardAnnotationRef.current = annotation;
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardTransactionRef.current = undefined;
      setClipboardAvailable(true);
      const result = execute.current({ id: nextCommandId("cut_annotation"), type: "annotation.delete", annotationId: annotation.id });
      if (result.ok) {
        selectedAnnotationRef.current = undefined;
        setSelectedAnnotationId(undefined);
        setClipboardStatus(`Cut ${annotation.label || annotation.type} annotation`);
      }
      return;
    }
    clipboardAnnotationRef.current = undefined;
    clipboardTransactionRef.current = undefined;
    clipboardGroupRef.current = undefined;
    clipboardSignalsRef.current = sources;
    clipboardSignalRef.current = sources[0]?.signal;
    setClipboardAvailable(true);
    const commands = sources.map(({ signal }) => ({ id: nextCommandId("cut_item"), type: "signal.delete", signalId: signal.id } satisfies SemanticCommand));
    const result = executeBatch.current(nextCommandId("cut"), commands);
    if (result.ok) {
      selectedSignalRef.current = undefined;
      setSelectedId(undefined);
      setSelectedSignalIds(new Set());
      setClipboardStatus(sources.length === 1 ? `Cut ${sources[0]!.signal.display.name}` : `Cut ${sources.length} signals`);
    }
  };
  cutSelectedSignalRef.current = cutSelectedSignal;
  const createCopiedSignals = (input: readonly { readonly signal: Signal; readonly groupId: GroupId; readonly index: number }[], operation: "paste" | "duplicate", placement: "current-selection" | "source-group" = "current-selection") => {
    if (input.length === 0) { setClipboardStatus("No signal clipboard available"); return; }
    const document = snapshot.document;
    const selectedGroup = placement === "current-selection" ? document.signalGroups.find((group) => selectedId !== undefined && group.rows.includes(selectedId)) : undefined;
    const commands: SemanticCommand[] = [];
    const created: Signal[] = [];
    const insertedByGroup = new Map<GroupId, number>();
    for (const source of input) {
      const targetGroup = selectedGroup ?? document.signalGroups.find((group) => group.id === source.groupId) ?? document.signalGroups.at(-1);
      if (!targetGroup) continue;
      const id = signalId(nextEntityId(source.signal.type === "commentRow" ? "commentRow" : "signal", { ...document, signals: [...document.signals, ...created] }));
      const name = `${source.signal.display.name}_${operation}${input.length > 1 ? `_${created.length + 1}` : ""}`;
      const signal: Signal = { ...source.signal, id, name, display: { ...source.signal.display, name } };
      created.push(signal);
      const index = targetGroup.rows.length + (insertedByGroup.get(targetGroup.id) ?? 0);
      insertedByGroup.set(targetGroup.id, (insertedByGroup.get(targetGroup.id) ?? 0) + 1);
      commands.push({ id: nextCommandId(`${operation}_item`), type: signal.type === "commentRow" ? "commentRow.create" : "signal.create", ...(signal.type === "commentRow" ? { commentRow: signal } : { signal }), targetGroupId: targetGroup.id, index } as SemanticCommand);
    }
    if (commands.length === 0) return;
    const result = executeBatch.current(nextCommandId(operation), commands);
    if (result.ok) {
      const ids = created.map((signal) => signal.id);
      selectedSignalRef.current = ids[0]; setSelectedId(ids[0]);
      setSelectedSignalIds(new Set(ids));
      selectedGroupRef.current = undefined; setSelectedGroupId(undefined);
      setClipboardStatus(operation === "paste" ? `Pasted ${created.length} signal${created.length === 1 ? "" : "s"}` : `Duplicated ${created.length} signal${created.length === 1 ? "" : "s"}`);
    }
  };
  const createCopiedGroup = (input: { readonly group: SignalGroup; readonly rows: readonly Signal[]; readonly sourceIndex: number }, operation: "paste" | "duplicate") => {
    const document = snapshot.document;
    const newGroupId = groupId(nextEntityId("group", document));
    const group: SignalGroup = { ...input.group, id: newGroupId, rows: [], ...(input.group.spacers === undefined ? {} : { spacers: [] }) };
    const commands: SemanticCommand[] = [{ id: nextCommandId(`${operation}_group`), type: "group.create", group, index: Math.min(document.signalGroups.length, input.sourceIndex + 1) }];
    const createdSignals: Signal[] = [];
    const sourceSpacers = new Map<string, SpacerRow>((input.group.spacers ?? []).map((spacer) => [spacer.id, spacer]));
    for (const rowId of input.group.rows) {
      const source = input.rows.find((signal) => signal.id === rowId);
      if (source) {
        const id = signalId(nextEntityId(source.type === "commentRow" ? "commentRow" : "signal", { ...document, signals: [...document.signals, ...createdSignals] }));
        const signal: Signal = { ...source, id };
        createdSignals.push(signal);
        commands.push({ id: nextCommandId(`${operation}_group_item`), type: signal.type === "commentRow" ? "commentRow.create" : "signal.create", ...(signal.type === "commentRow" ? { commentRow: signal } : { signal }), targetGroupId: newGroupId, index: commands.length - 1 } as SemanticCommand);
      } else {
        const spacer = sourceSpacers.get(rowId);
        if (!spacer) continue;
        const id = spacerId(nextEntityId("spacer", { ...document, signals: [...document.signals, ...createdSignals] }));
        commands.push({ id: nextCommandId(`${operation}_group_spacer`), type: "spacer.create", spacer: { ...spacer, id }, targetGroupId: newGroupId, index: commands.length - 1 });
      }
    }
    const result = executeBatch.current(nextCommandId(`${operation}_group_batch`), commands);
    if (result.ok) {
      selectedGroupRef.current = newGroupId;
      setSelectedGroupId(newGroupId);
      selectedSignalRef.current = undefined;
      setSelectedId(undefined);
        selectedSignalIdsRef.current = new Set();
      setSelectedSignalIds(new Set());
      setClipboardStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${input.group.name} group`);
    }
  };
  const createCopiedAnnotation = (source: Annotation, operation: "paste" | "duplicate") => {
    const annotation = { ...source, id: nextEntityId("annotation", snapshot.document) as AnnotationId };
    const result = execute.current({ id: nextCommandId(`${operation}_annotation`), type: "annotation.create", annotation });
    if (result.ok) {
      selectAnnotation(annotation.id);
      setClipboardStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${annotation.label || annotation.type} annotation`);
    }
  };
  const createCopiedTransaction = (source: Transaction, operation: "paste" | "duplicate") => {
    const transaction: Transaction = { ...source, id: nextEntityId("transaction", snapshot.document) as TransactionId, name: `${source.name} ${operation === "paste" ? "Paste" : "Copy"}` };
    const result = execute.current({ id: nextCommandId(`${operation}_transaction`), type: "transaction.create", transaction });
    if (result.ok) {
      selectTransaction(transaction.id);
      setClipboardStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} ${source.name} transaction`);
    }
  };
  const createCopiedSpacer = (input: { readonly spacer: SpacerRow; readonly groupId: GroupId; readonly index: number }, operation: "paste" | "duplicate") => {
    const targetGroup = snapshot.document.signalGroups.find((group) => group.id === input.groupId) ?? snapshot.document.signalGroups.at(-1);
    if (!targetGroup) return;
    const spacer = { ...input.spacer, id: spacerId(nextEntityId("spacer", snapshot.document)) };
    const result = execute.current({ id: nextCommandId(`${operation}_spacer`), type: "spacer.create", spacer, targetGroupId: targetGroup.id, index: Math.min(input.index, targetGroup.rows.length) });
    if (result.ok) {
      selectedSpacerRef.current = spacer.id;
      selectedGroupRef.current = targetGroup.id;
      setSelectedGroupId(targetGroup.id);
      setClipboardStatus(`${operation === "paste" ? "Pasted" : "Duplicated"} spacer`);
    }
  };
  const pasteSelectedEntity = () => {
    if (clipboardGroupRef.current) createCopiedGroup(clipboardGroupRef.current, "paste");
    else if (clipboardAnnotationRef.current) createCopiedAnnotation(clipboardAnnotationRef.current, "paste");
    else if (clipboardTransactionRef.current) createCopiedTransaction(clipboardTransactionRef.current, "paste");
    else if (clipboardSpacerRef.current) createCopiedSpacer(clipboardSpacerRef.current, "paste");
    else createCopiedSignals(clipboardSignalsRef.current, "paste");
  };
  const duplicateSelectedEntity = () => {
    const selectedSpacer = selectedSpacerRef.current === undefined ? undefined : selectedGroup?.spacers?.find((spacer) => spacer.id === selectedSpacerRef.current);
    if (selectedSpacer && selectedGroup) {
      createCopiedSpacer({ spacer: selectedSpacer, groupId: selectedGroup.id, index: selectedGroup.rows.indexOf(selectedSpacer.id) }, "duplicate");
    } else if (selectedGroup) {
      const rows = selectedGroup.rows.flatMap((rowId) => snapshot.document.signals.find((signal) => signal.id === rowId) ?? []);
      createCopiedGroup({ group: selectedGroup, rows, sourceIndex: snapshot.document.signalGroups.indexOf(selectedGroup) }, "duplicate");
    } else if (selectedAnnotation) createCopiedAnnotation(selectedAnnotation, "duplicate");
    else if (selectedTransaction) createCopiedTransaction(selectedTransaction, "duplicate");
    else createCopiedSignals(selectedClipboardSignals(), "duplicate");
  };
  pasteSelectedSignalRef.current = pasteSelectedEntity;
  const renameSelection = () => {
    const current = selectedSignal?.display.name ?? selectedGroup?.name ?? selectedTransaction?.name;
    if (current === undefined) return;
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
  const setSelectionVisibility = (visible: boolean) => commandRegistry.current.execute("selection.visibility", { visible });
  const moveSelection = (direction: -1 | 1) => {
    const document = snapshot.document;
    if (selectedSignal) {
      const group = document.signalGroups.find((candidate) => candidate.rows.includes(selectedSignal.id));
      const index = group?.rows.indexOf(selectedSignal.id) ?? -1;
      if (group && index >= 0 && index + direction >= 0 && index + direction < group.rows.length) commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("home_move_signal"), type: "signal.move", signalId: selectedSignal.id, targetGroupId: group.id, index: index + direction });
      return;
    }
    if (selectedGroup) {
      const index = document.signalGroups.findIndex((group) => group.id === selectedGroup.id);
      if (index >= 0 && index + direction >= 0 && index + direction < document.signalGroups.length) commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("home_move_group"), type: "group.move", groupId: selectedGroup.id, index: index + direction });
    }
  };
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
    selectedSignalRef.current = id;
    selectedSignalIdsRef.current = new Set([id]);
    setSelectedSignalIds(new Set([id]));
    setSelectedId(id);
    setSelectedGroupId(undefined);
    selectedAnnotationRef.current = undefined;
    setSelectedAnnotationId(undefined);
    selectedTransactionRef.current = undefined;
    setSelectedTransactionId(undefined);
    if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Signal");
    for (const row of host.current?.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]") ?? []) {
      const rowId = row.dataset.rowId ?? row.dataset.signalId;
      const selected = rowId === id;
      row.dataset.selected = String(selected);
      row.setAttribute("aria-selected", String(selected));
    }
  };
  const revealSelectedInHierarchy = () => {
    if (!selectedSignal) return;
    selectedSignalRef.current = selectedSignal.id;
    setSelectedId(selectedSignal.id);
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
    const result = execute.current({ id: nextCommandId("group_create_tree"), type: "group.create", group: { id, name: `Group ${snapshot.document.signalGroups.length + 1}`, rows: [] }, index: snapshot.document.signalGroups.length });
    if (result.ok) {
      selectedGroupRef.current = id;
      setSelectedGroupId(id);
      selectedSignalRef.current = undefined;
      setSelectedId(undefined);
    }
  };
  const addTreeEntity = (kind: "signal" | "clock" | "bus" | "state" | "logic" | "event" | "pulse" | "group" | "spacer" | "commentRow") => {
    const selectedSignalGroup = selectedId === undefined ? undefined : snapshot.document.signalGroups.find((group) => group.rows.includes(selectedId));
    const targetGroup = selectedGroup ?? selectedSignalGroup ?? snapshot.document.signalGroups.at(-1);
    if (kind === "group") {
      const id = groupId(nextEntityId("group", snapshot.document));
      const selectedGroupIndex = selectedGroup === undefined ? -1 : snapshot.document.signalGroups.findIndex((group) => group.id === selectedGroup.id);
      const selectedSignalGroupIndex = selectedSignalGroup === undefined ? -1 : snapshot.document.signalGroups.findIndex((group) => group.id === selectedSignalGroup.id);
      const index = selectedGroupIndex >= 0 ? selectedGroupIndex + 1 : selectedSignalGroupIndex >= 0 ? selectedSignalGroupIndex + 1 : snapshot.document.signalGroups.length;
      const result = commandRegistry.current.execute<SemanticCommand, CommandResult>("semantic.execute", { id: nextCommandId("tree_add_group"), type: "group.create", group: { id, name: `Group ${snapshot.document.signalGroups.length + 1}`, rows: [] }, index });
      if (result.ok) {
        selectedGroupRef.current = id;
        setSelectedGroupId(id);
        selectedSignalRef.current = undefined;
        setSelectedId(undefined);
      }
      return;
    }
    if (!targetGroup) return;
    const selectedRowIndex = selectedId === undefined ? -1 : targetGroup.rows.indexOf(selectedId);
    const index = selectedRowIndex >= 0 ? selectedRowIndex + 1 : targetGroup.rows.length;
    if (kind === "spacer") {
      const spacer = { id: spacerId(nextEntityId("spacer", snapshot.document)), height: 24 };
      const result = execute.current({ id: nextCommandId("tree_add_spacer"), type: "spacer.create", spacer, targetGroupId: targetGroup.id, index });
      if (result.ok) {
        selectedSpacerRef.current = spacer.id;
        selectedGroupRef.current = targetGroup.id;
        setSelectedGroupId(targetGroup.id);
        setSelectedId(undefined);
      }
      return;
    }
    const id = signalId(nextEntityId(kind === "commentRow" ? "commentRow" : "signal", snapshot.document));
    if (kind === "commentRow") {
      const name = `Comment ${snapshot.document.signals.length + 1}`;
      commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_add_comment"), type: "commentRow.create", commentRow: { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" }, targetGroupId: targetGroup.id, index });
      return;
    }
    const name = `${kind === "clock" ? "CLOCK" : kind.toUpperCase()}_${snapshot.document.signals.length + 1}`;
    const signal = kind === "clock"
      ? { id, name, type: "clock" as const, role: "internal" as const, source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0 as 0 | 1, polarity: "positive" as const }, edgeCounter: { show: false, mode: "both" as const, startNumber: 1, countFrom: "signal-start" as const, labelEvery: 1, position: "above" as const, offset: { x: 0, y: -6 } } }
      : valueSignal(id, name, "internal", [{ start: 0, value: kind === "state" ? "IDLE" : kind === "bus" ? "00" : kind === "event" ? "NONE" : 0 }], kind === "bus" ? { type: "bus", width: 8, displayFormat: "hex" } : { type: kind === "signal" ? "binary" : kind });
    commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_add_signal"), type: "signal.create", signal, targetGroupId: targetGroup.id, index });
  };
  const bottomTabs: readonly ("Signal" | "Annotation" | "Transaction" | "Problems" | "JSON")[] = viewMode === "Cycle"
    ? ["Signal", "Annotation", "Problems", "JSON"]
    : viewMode === "Transaction"
      ? ["Transaction", "Annotation", "Problems", "JSON"]
      : ["Signal", "Transaction", "Annotation", "Problems", "JSON"];
  const bottomTabLabels: Readonly<Record<typeof bottomTabs[number], string>> = { Signal: "Signal Editor", Annotation: "Annotations", Transaction: "Transactions", Problems: "Checks", JSON: "JSON" };
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
    const nextWidth = Math.max(160, Math.min(360, resize.startWidth + (event.clientX - resize.startX)));
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
    setFrozenPaneWidth((current) => Math.max(160, Math.min(360, current + delta)));
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

  const hasSelectedSignal = selectedSignalIds.size > 0 && selectedSignal !== undefined;
  const hasSelectedEntity = hasSelectedSignal || selectedGroup !== undefined || selectedTransaction !== undefined || selectedSpacer !== undefined;
  const hasDeletableSelection = hasSelectedEntity || selectedAnnotation !== undefined;
  const restorePendingFileFocus = () => {
    const origin = pendingFileOriginRef.current;
    pendingFileOriginRef.current = null;
    if (origin?.isConnected) requestAnimationFrame(() => origin.focus());
  };
  const cancelPendingFileAction = () => { setPendingFileAction(undefined); restorePendingFileFocus(); };
  const requestFileAction = (action: PendingFileAction) => {
    if (!history.dirty) {
      if (action.kind === "new") newDocument.current();
      else if (action.text !== undefined) openDocument.current(action.text);
      return;
    }
    if (pendingFileOriginRef.current === null) pendingFileOriginRef.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
    setPendingFileAction(action);
  };
  const continuePendingFileAction = (action: PendingFileAction) => {
    setPendingFileAction(undefined);
    if (action.kind === "new") newDocument.current();
    else if (action.text !== undefined) openDocument.current(action.text);
    restorePendingFileFocus();
  };
  const saveAndContinuePendingFileAction = () => {
    const action = pendingFileAction;
    if (!action) return;
    const text = saveDocument.current();
    if (!text) return;
    downloadText(text, `${snapshot.document.document.title || "timing-chart"}.tcd.json`);
    continuePendingFileAction(action);
  };
  const requestNewDocument = () => requestFileAction({ kind: "new" });
  const requestOpenText = (text: string) => requestFileAction({ kind: "open", text });
  const rejectOversizedOpen = (file: File) => {
    const diagnostic = openFileByteBudgetProblem(file);
    setProblem(diagnostic.message);
    setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("open-failure:")), diagnostic]);
    restorePendingFileFocus();
  };
  const hasSelectedClipboard = hasSelectedEntity || selectedAnnotation !== undefined;
  const applyWorkspacePreset = (preset: WorkspacePreset) => {
    setWorkspacePreset(preset);
    if (preset === "waveform") { setInspectorVisible(false); setBottomVisible(false); return; }
    setInspectorVisible(true);
    setBottomVisible(true);
    if (preset === "review") setBottomTab("Problems");
    else if (preset === "transaction") { setViewMode("Transaction"); setBottomTab("Transaction"); }
    else setBottomTab("Signal");
  };
  return <main className="editor-shell" style={{ "--gui-left-width": `${leftPaneWidth}px`, "--gui-frozen-width": `${frozenPaneWidth}px`, "--gui-bottom-height": `${bottomHeight}px`, "--gui-inspector-width": `${inspectorWidth}px` } as React.CSSProperties} data-density={density} data-workspace-preset={workspacePreset} data-inspector-visible={String(inspectorVisible)} data-bottom-visible={String(bottomVisible)} data-ruler-enabled={String(rulerEnabled)} data-minimap-enabled={String(minimapEnabled)} data-signal-tree-visible={String(signalTreeVisible)} data-show-signal-names={String(showSignalNames)} data-show-roles={String(showRoles)} data-show-annotations={String(showAnnotations)} data-show-transactions={String(showTransactions)} data-show-group-background={String(showGroupBackground)} data-left-pane-width={leftPaneWidth} data-frozen-pane-width={frozenPaneWidth} data-bottom-height={bottomHeight} data-inspector-width={inspectorWidth} data-cycle-count={snapshot.document.timeline.cycleCount} data-signal-count={snapshot.document.signals.length} data-transaction-count={snapshot.document.transactions.length}>
    <MinimalCycleViewTitleBar title={snapshot.document.document.title} dirty={history.dirty} />
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
      selectedGroupId={selectedGroup?.id}
      problemsCount={diagnostics.length}
      diagnostics={diagnostics}
      onNavigateProblem={navigateProblem}
      onRefreshChecks={() => setValidationDiagnostics(validateCanonicalDocument(snapshot.document))}
       viewMode={viewMode}
       density={density}
       workspacePreset={workspacePreset}
       onDensityChange={setDensity}
       onWorkspacePresetChange={applyWorkspacePreset}
      selectedTransactionId={selectedTransactionId}
      clipboardStatus={clipboardStatus}
      clipboardAvailable={clipboardAvailable}
      hasSelectedSignal={hasSelectedSignal}
      hasSelectedClipboard={hasSelectedClipboard}
      hasSelectedEntity={hasSelectedEntity}
      hasDeletableSelection={hasDeletableSelection}
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
      onCreateAnnotation={createSelectedAnnotation}
      onArrowPick={() => armArrowPick.current()}
      onZoom={(delta) => changeZoom.current(delta)}
      onFitSelection={() => fitSelection.current()}
      onNavigateBookmark={(cycle) => navigateToCycle.current(cycle)}
      onFitAll={() => fitAll.current()}
      onSetZoom={(zoom) => setZoomAbsolute.current(zoom)}
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
      onSave={() => { const text = saveDocument.current(); if (text) downloadText(text, `${snapshot.document.document.title || "timing-chart"}.tcd.json`); }}
      onSaveAs={() => { dialogOriginLabelRef.current = "Save As"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSaveAsVisible(true); }}
      onRecent={() => { const text = localStorage.getItem("timing-chart-v2.recent"); if (text) openDocument.current(text); else setProblem("No recent document is available."); }}
      onProperties={() => { dialogOriginLabelRef.current = "Properties"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPropertiesVisible(true); }}
      onExport={() => { dialogOriginLabelRef.current = "Export"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setExportVisible(true); }}
      onToggleInspector={() => startTransition(() => setInspectorVisible((value) => !value))}
      onToggleBottom={() => startTransition(() => setBottomVisible((value) => !value))}
      onShowProblems={() => { setBottomTab("Problems"); setBottomVisible(true); }}
      onOpenTimeline={() => setRibbonTab("Timeline")}
      onOpenProperties={() => { dialogOriginLabelRef.current = "Properties"; dialogOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPropertiesVisible(true); }}
    />
    <MinimalCycleViewPanels>
    <div className="desktop-workspace">
      <section className={`cycle-panel mode-${viewMode.toLowerCase()}`} aria-label={`${viewMode} View`} data-view-mode={viewMode}>
         <div className="left-pane-resize-handle" data-testid="left-pane-resizer" role="separator" aria-label="Resize Signal Group pane" aria-orientation="vertical" aria-valuemin={LEFT_PANE_MIN_WIDTH} aria-valuemax={LEFT_PANE_MAX_WIDTH} aria-valuenow={leftPaneWidth} tabIndex={0} onKeyDown={resizeLeftPaneByKeyboard} onPointerDown={startLeftPaneResize} onPointerMove={moveLeftPaneResize} onPointerUp={finishLeftPaneResize} onPointerCancel={finishLeftPaneResize} />
          <div className="frozen-pane-resize-handle" data-testid="frozen-pane-resizer" role="separator" aria-label="Resize Signal label and timing pane" aria-orientation="vertical" aria-valuemin={160} aria-valuemax={360} aria-valuenow={frozenPaneWidth} tabIndex={0} onKeyDown={resizeFrozenPaneByKeyboard} onPointerDown={startFrozenPaneResize} onPointerMove={moveFrozenPaneResize} onPointerUp={finishFrozenPaneResize} onPointerCancel={finishFrozenPaneResize} />
        <div className="column-headings"><span className="left-column-heading"><strong>Signals / Groups</strong><label className="tree-filter-controls"><span className="visually-hidden">Signal tree type filter</span><select data-testid="signal-tree-type-filter" aria-label="Signal tree type filter" value={treeTypeFilter} onChange={(event) => setTreeTypeFilter(event.target.value as TreeTypeFilter)}><option value="all">All</option><option value="input">Input</option><option value="output">Output</option><option value="wire">Wire</option><option value="comment">Comment</option></select><span className="visually-hidden">Signal tree filter</span><input data-testid="signal-tree-search-top" aria-label="Signal tree filter" value={treeFilter} onChange={(event) => setTreeFilter(event.target.value)} placeholder="Filter signals..." />{treeFilter && <button type="button" aria-label="Clear signal tree filter" onMouseDown={(event) => event.preventDefault()} onClick={() => setTreeFilter("")}><EditorIcon name="close" /></button>}</label><span className="left-column-actions"><button type="button" className="tree-add-button" aria-label="Add signal or group" aria-expanded={treeAddMenuOpen} onClick={(event) => { menuOriginRef.current = event.currentTarget; setTreeAddMenuOpen((value) => !value); }}><EditorIcon name="plus" /></button><button type="button" className="tree-more-button" aria-label="More tree actions" aria-expanded={treeMoreMenuOpen} onClick={(event) => { menuOriginRef.current = event.currentTarget; setTreeMoreMenuOpen((value) => !value); }}><EditorIcon name="more" /></button></span>{treeAddMenuOpen && <div className="tree-add-menu" role="menu" aria-label="Add signal or group"><button type="button" role="menuitem" onClick={() => { addTreeEntity("signal"); closeTreeAddMenu(); }}>Signal</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("clock"); closeTreeAddMenu(); }}>Clock</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("bus"); closeTreeAddMenu(); }}>Bus</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("state"); closeTreeAddMenu(); }}>State</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("logic"); closeTreeAddMenu(); }}>Logic</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("event"); closeTreeAddMenu(); }}>Event</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("pulse"); closeTreeAddMenu(); }}>Pulse</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("spacer"); closeTreeAddMenu(); }}>Spacer</button><button type="button" role="menuitem" data-testid="create-group" onClick={() => { addTreeEntity("group"); closeTreeAddMenu(); }}>Group</button><button type="button" role="menuitem" data-testid="bulk-register-open" onClick={() => { setBulkRegistrationGroupId(snapshot.document.signalGroups.at(-1)?.id); setBulkRegistrationVisible(true); closeTreeAddMenu(); }}>Bulk Signal Registration</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("commentRow"); closeTreeAddMenu(); }}>Comment Row</button></div>}{treeMoreMenuOpen && <div className="tree-header-menu" role="menu" aria-label="More tree actions"><button type="button" role="menuitem" onClick={() => { setCollapsedGroups(new Set(snapshot.document.signalGroups.map((group) => group.id))); closeTreeMoreMenu(); }}>Collapse All Groups</button><button type="button" role="menuitem" onClick={() => { setCollapsedGroups(new Set()); closeTreeMoreMenu(); }}>Expand All Groups</button><button type="button" role="menuitem" onClick={() => { setTreeFilter(""); closeTreeMoreMenu(); }}>Clear Filter</button><button type="button" role="menuitem" data-testid="hierarchy-open" onClick={() => { setHierarchyVisible(true); closeTreeMoreMenu(); }}>Hierarchy</button></div>}</span><span className="role-column-heading" aria-label="Role">Role</span><span className="signal-column-heading" aria-label="Signal / Annotation">Signal / Annotation</span><span>{snapshot.document.timeline.referenceClock ? `Time Scale: Cycle    Reference: ${snapshot.document.signals.find((signal) => signal.id === snapshot.document.timeline.referenceClock)?.display.name ?? snapshot.document.timeline.referenceClock}` : "Time Scale: Cycle    Axis: Time"}</span></div>
        <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport" tabIndex={0} aria-label="Timing canvas navigation">
          {viewMode !== "Cycle" && <TransactionLanes document={snapshot.document} zoom={zoom} selectedId={selectedTransactionId} getBoundaryX={(cycle) => transactionBoundaryX.current(cycle)} onSelect={selectTransaction} onSnap={(clientX) => snapTransactionCycle.current(clientX)} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} />}
          <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
          <div className="cycle-ruler" data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled}>
            <div className="cycle-ruler-content" ref={ruler} />
          </div>
          <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band" aria-hidden="true" hidden />
          <LegendView document={snapshot.document} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} />
      <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
        </div>
      </section>
       {bottomVisible && <div className="bottom-resize-track" data-testid="bottom-resizer" role="separator" aria-label="Resize bottom editor" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={420} aria-valuenow={bottomHeight} tabIndex={0} onKeyDown={resizeBottomByKeyboard} onPointerDown={startBottomResize} onPointerMove={moveBottomResize} onPointerUp={finishBottomResize} onPointerCancel={finishBottomResize} />}
      <aside className="left-panel-tail"><span data-testid="left-tree-signal-count">{snapshot.document.signals.length} signals</span>{selectedSignal && <span className="scope-breadcrumb" data-testid="scope-breadcrumb">Scope: {selectedSignal.source.instancePath.length ? selectedSignal.source.instancePath.join(" / ") : "(root)"}</span>}</aside>
      {bottomVisible && <section className="bottom-editor" data-testid="bottom-editor">
        <nav className="bottom-tabs" data-testid="bottom-tabs" role="tablist" aria-label="Bottom context panels">
           {bottomTabs.map((tab) => {
            const active = bottomTab === tab;
            const tabId = `bottom-tab-${tab.toLowerCase()}`;
             return <button type="button" role="tab" key={tab} id={tabId} data-bottom-tab={tab} tabIndex={active ? 0 : -1} aria-label={tab} aria-selected={active} aria-controls="bottom-context-content" className={active ? "active" : ""} onClick={() => selectBottomTab(tab)} onKeyDown={(event) => onBottomTabKeyDown(event, tab)}>{tab}</button>;
          })}
          <span />
          <label><input data-testid="follow-selection" type="checkbox" checked={followSelection} onChange={(event) => setFollowSelection(event.target.checked)} /> Follow Selection</label>
          <button type="button" data-testid="bottom-pin" aria-label={bottomPinned ? "Unpin" : "Pin"} aria-pressed={bottomPinned} onClick={toggleBottomPin}><span className="bottom-pin-label" data-v1-label={bottomPinned ? "Unpin" : "Pin"}>{bottomPinned ? "Unpin" : "Pin"}</span></button>
        </nav>
        <div className="bottom-content" id="bottom-context-content" role="tabpanel" aria-labelledby={`bottom-tab-${bottomTab.toLowerCase()}`}>{bottomTab === "Signal" ? signalEditor : bottomTab === "Annotation" ? annotationEditor : bottomTab === "Transaction" ? transactionEditor : bottomTab === "Problems" ? <ProblemsPanel diagnostics={diagnostics} onNavigate={navigateProblem} /> : <AdvancedJsonPanel document={snapshot.document} selectedSignal={bottomSignal} selectedGroup={bottomGroup} selectedAnnotation={bottomAnnotation} selectedTransaction={bottomTransaction} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onDiagnostic={(next) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("advanced-json:")), ...nextDiagnostics]); }} />}</div>
      </section>}
       {inspectorVisible && <aside className="inspector-shell" data-testid="inspector-shell"><div className="inspector-resize-handle" data-testid="inspector-resizer" role="separator" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={inspectorWidth} tabIndex={0} onKeyDown={resizeInspectorByKeyboard} onPointerDown={startInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={finishInspectorResize} onPointerCancel={finishInspectorResize} /><InspectorPanel key={`${selectedSignal?.id ?? selectedGroup?.id ?? selectedAnnotation?.id ?? selectedTransaction?.id ?? "none"}:${snapshot.revision}:${inspectorResetToken}`} signal={selectedSignal} group={selectedGroup} annotation={selectedAnnotation} transaction={selectedTransaction} collapsedGroup={selectedGroup !== undefined && collapsedGroupIds.has(selectedGroup.id)} onToggleGroupCollapse={selectedGroup === undefined ? undefined : () => toggleCollapsedGroup(selectedGroup.id)} registry={commandRegistry.current} document={snapshot.document} viewport={viewport} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onReveal={revealSelectedInHierarchy} onCancel={() => setInspectorResetToken((value) => value + 1)} /></aside>}
    </div>
    <ContextMenuPanel contextMenu={contextMenu} hasSelectedClipboard={hasSelectedClipboard} clipboardAvailable={clipboardAvailable} hasSelectedEntity={hasSelectedEntity} hasSelectedSignal={hasSelectedSignal} hasDeletableSelection={hasDeletableSelection} copySelectedSignal={copySelectedSignal} cutSelectedSignal={cutSelectedSignal} pasteSelectedEntity={pasteSelectedEntity} duplicateSelectedEntity={duplicateSelectedEntity} moveSelection={moveSelection} setSelectionVisibility={setSelectionVisibility} renameSelection={renameSelection} closeContextMenu={closeContextMenu} deleteSelection={() => commandRegistry.current.execute("selection.delete")} />
    {renameDialogOpen && <div className="modal-backdrop" data-testid="rename-dialog-backdrop"><form ref={renameDialogRef} role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title" className="document-properties rename-dialog" data-testid="rename-dialog" onSubmit={(event) => { event.preventDefault(); applyRename(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setRenameDialogOpen(false); } }}>
      <header><h2 id="rename-dialog-title">Rename</h2><button type="button" aria-label="Close rename dialog" onClick={() => setRenameDialogOpen(false)}><EditorIcon name="close" /></button></header>
      <label>New name<input autoFocus aria-label="New name" value={renameDraft} onChange={(event) => { setRenameDraft(event.target.value); setRenameError(""); }} /></label>
      {renameError && <p role="alert" className="dialog-error">{renameError}</p>}
      <footer><button type="button" onClick={() => setRenameDialogOpen(false)}>Cancel</button><button type="submit" data-testid="apply-rename">Apply</button></footer>
    </form></div>}
    {hierarchyVisible && <HardwareHierarchyBrowser document={snapshot.document} selectedSignalId={selectedSignal?.id} onSelect={selectHierarchySignal} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setHierarchyVisible(false))} />}
    {propertiesVisible && <DocumentProperties document={snapshot.document} onApplyProperties={(commands) => executeBatch.current(nextCommandId("document_properties"), commands)} restoreFocusRef={dialogOriginRef} onClose={() => closeDialog(() => setPropertiesVisible(false))} />}
    {bulkRegistrationVisible && <div className="modal-backdrop"><section ref={bulkRegistrationDialogRef} role="dialog" aria-modal="true" aria-label="Bulk Signal Registration" className="document-properties bulk-registration"><header><h2>Bulk Signal Registration</h2><button type="button" aria-label="Close bulk registration" onClick={() => closeDialog(() => { setBulkRegistrationVisible(false); setBulkRegistrationPreview(undefined); })}><EditorIcon name="close" /></button></header><p>One signal per line: <code>instance.path.signal [binary|bus|state|clock]</code></p><textarea aria-label="Bulk signal definitions" value={bulkRegistrationText} onChange={(event) => { setBulkRegistrationText(event.target.value); setBulkRegistrationPreview(undefined); setBulkRegistrationStatus(""); }} rows={8} /><label>Target Group<select aria-label="Bulk registration target group" value={bulkRegistrationGroupId ?? ""} onChange={(event) => setBulkRegistrationGroupId(event.target.value as GroupId)}>{snapshot.document.signalGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>{bulkRegistrationPreview && <div className={`bulk-preview ${bulkRegistrationPreview.errors.length === 0 ? "valid" : "invalid"}`} data-testid="bulk-register-preview"><strong>{bulkRegistrationPreview.errors.length === 0 ? `Ready to register ${bulkRegistrationPreview.definitions.length} signal${bulkRegistrationPreview.definitions.length === 1 ? "" : "s"}` : "Preview errors"}</strong>{bulkRegistrationPreview.errors.length > 0 ? <ul>{bulkRegistrationPreview.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <ul>{bulkRegistrationPreview.definitions.map((definition) => <li key={definition.path}>{definition.path} · {definition.kind}{definition.width === undefined ? "" : ` · width ${definition.width}`}</li>)}</ul>}</div>}<footer><output>{bulkRegistrationStatus}</output><button type="button" data-testid="bulk-register-preview-button" onClick={previewBulkSignals}>Preview</button><button type="button" data-testid="bulk-register-apply" onClick={registerBulkSignals} disabled={!bulkRegistrationPreview || bulkRegistrationPreview.sourceText !== bulkRegistrationText || bulkRegistrationPreview.errors.length > 0 || bulkRegistrationPreview.definitions.length === 0}>Register Signals</button></footer></section></div>}
    {exportVisible && <ExportDialog snapshot={snapshot} range={timelineRange} restoreFocusRef={dialogOriginRef} onDiagnostic={(next) => setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("export-failure:")), ...(next ? [next] : [])])} onClose={() => closeDialog(() => setExportVisible(false))} />}
     {saveAsVisible && <SaveAsDialog defaultName={snapshot.document.document.title || "timing-chart"} restoreFocusRef={dialogOriginRef} onSave={(name) => { const text = saveDocument.current(); if (text) downloadText(text, `${name}.tcd.json`); closeDialog(() => setSaveAsVisible(false)); }} onClose={() => closeDialog(() => setSaveAsVisible(false))} />}
     {pendingFileAction && <div className="modal-backdrop" data-testid="unsaved-file-dialog"><section ref={unsavedFileDialogRef} className="document-properties unsaved-file-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-file-dialog-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelPendingFileAction(); } }}><header><h2 id="unsaved-file-dialog-title">Unsaved Changes</h2></header><p>Save changes before {pendingFileAction.kind === "new" ? "creating a new document" : "opening another document"}?</p><p className="inspector-note">Your current document has unsaved changes.</p><footer><button type="button" ref={unsavedCancelRef} autoFocus data-testid="unsaved-cancel" onClick={cancelPendingFileAction}>Cancel</button><button type="button" data-testid="unsaved-discard" onClick={() => continuePendingFileAction(pendingFileAction)}>Discard</button><button type="button" data-testid="unsaved-save" onClick={saveAndContinuePendingFileAction}>Save</button></footer></section></div>}
     <input ref={fileInput} hidden type="file" accept=".json,.tcd" onChange={(event) => { const file = event.target.files?.[0]; if (file) { if (file.size > MAX_OPEN_FILE_BYTES) rejectOversizedOpen(file); else { openFileReadStartedAtRef.current = globalThis.performance.now(); void file.text().then(requestOpenText).catch(() => { openFileReadStartedAtRef.current = undefined; setProblem("Open failed."); }); } } event.currentTarget.value = ""; }} />
    <footer className="status-bar" aria-label="Editor status">
      <span data-testid="tool-status">{arrowPickStatus === "idle" ? (rangeSelectionActive ? "Range select active" : "Ready · Tool: Select") : `Arrow pick · ${arrowPickStatus}`}</span>
      <span>Selected: <strong data-testid="selection-status">{selectedSignalIds.size > 1 ? `${selectedSignalIds.size} signals` : selectedTransaction?.name ?? selectedAnnotation?.label ?? selectedSignal?.display.name ?? selectedGroup?.name ?? "None"}</strong></span>
      <span data-testid="signal-count-status">Signals: {snapshot.document.signals.length}</span><span data-testid="annotation-count-status">Annotations: {snapshot.document.annotations.length}</span><span data-testid="range-status">{visualReference ? `Time Range: ${snapshot.document.timeline.start} – ${snapshot.document.timeline.end} cycles` : `Range: [${timelineRange.start}, ${timelineRange.end})`}</span><span data-testid="cycle-status">Cycle {selectedCycle}</span><span data-testid="zoom-status-bar">Zoom: {Math.round(zoom * 100)}%</span><span data-testid="snap-status">Snap: {snapEnabled ? "On" : "Off"}</span><span data-testid="view-mode-status">Mode: {viewMode}</span>
      <span className="status-context" data-testid="status-context">Workspace: {workspacePreset} · {bottomPinned ? "Bottom: Pinned" : followSelection ? "Bottom: Follow" : "Bottom: Fixed"}{selectedSignal ? ` · Scope: ${selectedSignal.source.instancePath.length > 0 ? selectedSignal.source.instancePath.join("/") : "root"}` : ""}</span>
      <span className={visualReference ? "status-detail-hidden" : undefined} data-testid="revision-status">Canonical revision {snapshot.revision}</span>
      <span className={visualReference ? "status-detail-hidden" : undefined} data-testid="history-status">History {history.undoDepth} / Redo {history.redoDepth}</span>
      <span data-testid="time-axis-status">Time Axis: {snapshot.document.timeline.referenceClock ? `Clock · ${snapshot.document.signals.find((signal) => signal.id === snapshot.document.timeline.referenceClock)?.display.name ?? snapshot.document.timeline.referenceClock}` : "Time · No Clock Reference"}</span><span data-testid="dirty-status">{history.dirty ? "Modified" : "Clean"}</span><span data-testid="problems-status">Problems: {diagnostics.length}</span><span data-testid="wavedrom-status">WaveDrom: {waveDromHasError ? "Error" : "Ready"}</span>
    </footer>
    </MinimalCycleViewPanels>
  </main>;
}
