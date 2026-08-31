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
import { buildRuler } from "./runtime/build-ruler.js";
import { displayBoundaryForSource } from "./runtime/display-boundary.js";
import { buildSnapIndex } from "./runtime/snap-index.js";
import { annotationFields, projectAnnotationOverlays } from "./runtime/annotation-overlays.js";

const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;
const spacerId = (value: string) => value as SpacerId;
const LEFT_PANE_MIN_WIDTH = 265;
const LEFT_PANE_MAX_WIDTH = 420;
type DensityMode = "compact" | "comfortable";
type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
type TreeTypeFilter = "all" | "input" | "output" | "wire" | "comment";
type PendingFileAction = Readonly<{ kind: "new" | "open"; text?: string }>;

const clock: ClockSignal = {
  id: signalId("sig_cycle_clock"), name: "CLOCK", type: "clock", role: "input",
  source: { instancePath: ["dut"], signalName: "clock" }, display: { name: "CLOCK" },
  generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
  edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

function valueSignal(id: string, name: string, role: SignalRole, values: ValueSignal["values"], options: Pick<ValueSignal, "type" | "width" | "displayFormat"> = { type: "binary" }): ValueSignal {
  return {
    id: signalId(id), name, role, type: options.type,
    source: { instancePath: ["dut"], signalName: name.toLowerCase() }, display: { name }, values,
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.displayFormat === undefined ? {} : { displayFormat: options.displayFormat }),
  };
}

const signals: readonly (ClockSignal | ValueSignal)[] = [
  clock,
  valueSignal("sig_cycle_reset_n", "RESET_N", "input", [{ start: 0, value: 0 }, { start: 2, value: 1 }]),
  valueSignal("sig_cycle_request", "REQUEST", "input", [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }]),
  valueSignal("sig_cycle_ready", "READY", "output", [{ start: 0, value: 0 }, { start: 5, value: 1 }, { start: 8, value: 0 }]),
  valueSignal("sig_cycle_valid", "VALID", "output", [{ start: 0, value: 0 }, { start: 6, value: 1 }, { start: 9, value: 0 }]),
  valueSignal("sig_cycle_data", "DATA[7:0]", "input", [{ start: 0, value: "00" }, { start: 3, value: "A5" }, { start: 7, value: "5A" }], { type: "bus", width: 8, displayFormat: "hex" }),
  valueSignal("sig_cycle_result", "RESULT[7:0]", "output", [{ start: 0, value: "00" }, { start: 6, value: "A5" }, { start: 9, value: "5A" }], { type: "bus", width: 8, displayFormat: "hex" }),
  valueSignal("sig_cycle_state", "STATE", "internal", [{ start: 0, value: "IDLE" }, { start: 3, value: "WAIT" }, { start: 6, value: "DONE" }], { type: "state" }),
];

const cycleDocument: CanonicalDocument = {
  formatVersion: 2,
  document: {
    id: "minimal-cycle-view", title: "Semiconductor Timing Chart",
    header: { subtitle: "Canonical document preview", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
    footer: { figureNumber: "", revision: "V2", text: "" },
  },
  timeline: { start: 0, end: 24, cycleCount: 24, timeBase: "cycle", referenceClock: clock.id, edge: "rising", labelAnchors: [] },
  signalGroups: [
    { id: groupId("grp_cycle_control"), name: "Control", rows: signals.slice(0, 5).map((signal) => signal.id), spacingAfter: 8 },
    { id: groupId("grp_cycle_payload"), name: "Payload", rows: signals.slice(5).map((signal) => signal.id), spacingBefore: 4 },
    { id: groupId("grp_cycle_scratch"), name: "Scratch", rows: [] },
  ],
  signals,
  bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
};

const v1ReferenceComment: CommentRow = {
  id: signalId("sig_v1_reference_comment"), type: "commentRow", name: "Address phase", role: "internal",
  source: { instancePath: ["dut"], signalName: "address_phase" }, display: { name: "Address phase" },
  title: "Address phase", body: "Address phase (req_valid = 1.0 period)",
};

const v8ReferenceProcessingComment: CommentRow = {
  id: signalId("sig_v8_reference_processing_comment"), type: "commentRow", name: "Processing note", role: "internal",
  source: { instancePath: ["dut"], signalName: "processing_note" }, display: { name: "Processing note" },
  title: "Processing note", body: "Processing: New request is latched",
};

const v8ReferenceLatencyComment: CommentRow = {
  id: signalId("sig_v8_reference_latency_comment"), type: "commentRow", name: "Read latency", role: "internal",
  source: { instancePath: ["dut"], signalName: "read_latency" }, display: { name: "Read latency" },
  title: "Read latency", body: "Read data available 5 cycles after request accepted",
};

const v8ReferenceClock: ClockSignal = { ...clock, name: "clk", source: { instancePath: [], signalName: "clk" }, display: { name: "clk" }, generator: { ...clock.generator, period: 1 } };
const v8ReferenceSignals: readonly (ClockSignal | ValueSignal)[] = [
  valueSignal("sig_cycle_reset_n", "req_valid", "input", [{ start: 0, value: 0 }, { start: 3, value: 1 }]),
  valueSignal("sig_cycle_request", "req_addr[7:0]", "input", [{ start: 0, value: "00" }, { start: 3, value: "12" }, { start: 7, value: "34" }], { type: "bus", width: 8, displayFormat: "hex" }),
  v8ReferenceClock,
  valueSignal("sig_cycle_ready", "busy", "internal", [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }]),
  valueSignal("sig_cycle_valid", "state[1:0]", "internal", [{ start: 0, value: "IDLE" }, { start: 2, value: "REQ" }, { start: 6, value: "WAIT" }, { start: 8, value: "RESP" }], { type: "bus", width: 2 }),
  valueSignal("sig_cycle_data", "ready", "output", [{ start: 0, value: 0 }, { start: 8, value: 1 }]),
  valueSignal("sig_cycle_result", "rdata[15:0]", "output", [{ start: 0, value: "XXXX" }, { start: 7, value: "0000" }], { type: "bus", width: 16, displayFormat: "hex" }),
];

const v1ReferenceDocument: CanonicalDocument = {
  ...cycleDocument,
  timeline: { ...cycleDocument.timeline, end: 10, cycleCount: 10 },
  document: { ...cycleDocument.document, title: "AXI-lite Read Timing.tmr — Timing Editor Pro", header: { ...cycleDocument.document.header, subtitle: "Protocol timing reference" } },
  signals: [...v8ReferenceSignals, v1ReferenceComment, v8ReferenceProcessingComment, v8ReferenceLatencyComment],
  signalGroups: [
    { id: groupId("grp_cycle_control"), name: "Input", rows: ["sig_cycle_reset_n", "sig_cycle_request", v1ReferenceComment.id, "sig_cycle_clock"] as SignalId[], spacingAfter: 5 },
    { id: groupId("grp_cycle_payload"), name: "Internal Control", rows: ["sig_cycle_ready", "sig_cycle_valid", v8ReferenceProcessingComment.id] as SignalId[], spacingAfter: 5 },
    { id: groupId("grp_cycle_scratch"), name: "Output", rows: ["sig_cycle_data", "sig_cycle_result", v8ReferenceLatencyComment.id] as SignalId[] },
  ],
  // The approved V8 Home Golden is the neutral Cycle state: overlays and the
  // editable legend are available in production, but not visible in this
  // reference fixture unless the Golden explicitly shows them.
  annotations: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { ...cycleDocument.layout, rowHeight: 30, signalSpacing: 1 },
};

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
    const rendererHost = host.current;
    const viewportElement = viewport.current;
    if (!rendererHost || !viewportElement) return;
    const metrics = viewMetricsOwner.snapshot();
    const availableWidth = metrics.viewportWidth > 0 ? metrics.viewportWidth : globalThis.innerWidth;
    const baseWidth = Math.max(160, availableWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth);
    const width = metrics.leftPaneWidth + metrics.frozenPaneWidth + baseWidth * metrics.zoom;
    rendererHost.style.width = `${width}px`;
    const timingSurface = rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']");
    timingSurface?.style.setProperty("width", `${width}px`);
    timingSurface?.style.setProperty("grid-template-columns", `${metrics.leftPaneWidth}px ${metrics.frozenPaneWidth}px var(--wave-width, 640px)`);
    rendererHost.querySelector<HTMLElement>("[data-role='frozen-label-rows']")?.style.setProperty("left", `${metrics.leftPaneWidth}px`, "important");
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
    function sourceBoundaryLocalX(document: CanonicalDocument, cycle: number): number | undefined {
      const axis = resolveTimeAxisGeometry(document, geometryMaps);
      if (!axis.geometry || axis.ownerSignalId === undefined) return undefined;
      const mapping = mappingCache.get(document.timeline, document.timeGroups);
      const displayCycle = displayBoundaryForSource(mapping, cycle, document.timeline.cycleCount);
      if (displayCycle === undefined) return undefined;
      const point = axis.geometry.find({ signalId: axis.ownerSignalId, cycle: displayCycle, point: "cycle-start" })?.point;
      return point === undefined ? undefined : point.x * screenGeometryScale;
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
    <header className="app-titlebar"><span className="appmark">∿</span><h1>{snapshot.document.document.title}</h1><span className="save-state">{history.dirty ? "Modified" : "Saved"}</span><span className="view-title">Cycle View</span></header>
    <nav className="ribbon-tabs" aria-label="Ribbon tabs">
      {([{ key: "File", label: "File" }, { key: "Home", label: "Home" }, { key: "Insert", label: "Insert" }, { key: "Timeline", label: "Timeline", compatibilityLabel: "Timeline" }, { key: "Annotation", label: "Annotation", compatibilityLabel: "Annotation", compatibilityOnly: true }, { key: "View", label: "View" }, { key: "Review", label: "Check", compatibilityLabel: "Review" }, { key: "AI", label: "AI" }] as const).map((tab) => <button type="button" key={tab.key} aria-label={"compatibilityLabel" in tab ? tab.compatibilityLabel : tab.key} className={`${ribbonTab === tab.key ? "active" : ""}${"compatibilityOnly" in tab && tab.compatibilityOnly ? " compatibility-tab" : ""}`} onClick={() => startTransition(() => setRibbonTab(tab.key))}>{tab.label}</button>)}
      <div className="view-mode"><span>View Mode:</span>{(["Cycle", "Transaction", "Split"] as const).map((mode) => <button type="button" key={mode} className={viewMode === mode ? "active" : ""} onClick={() => { setViewMode(mode); if (mode === "Cycle" && bottomTab === "Transaction") setBottomTab("Signal"); if (mode === "Transaction" && bottomTab === "Signal") setBottomTab("Transaction"); }}>{mode}</button>)}</div>
    </nav>
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
    {contextMenu && <ContextMenuSurface anchor={contextMenu} target={contextMenu.target} label={contextMenu.target === "group" ? "Group context menu" : contextMenu.target === "annotation" ? "Annotation context menu" : "Signal context menu"}>
      <button type="button" role="menuitem" onClick={() => { copySelectedSignal(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Copy</button>
      <button type="button" role="menuitem" onClick={() => { cutSelectedSignal(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Cut</button>
      <button type="button" role="menuitem" onClick={() => { pasteSelectedEntity(); closeContextMenu(); }} disabled={!clipboardAvailable}>Paste</button>
      <button type="button" role="menuitem" onClick={() => { duplicateSelectedEntity(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Duplicate</button>
      <button type="button" role="menuitem" onClick={() => { moveSelection(-1); closeContextMenu(); }} disabled={!hasSelectedEntity}>Move Up</button>
      <button type="button" role="menuitem" onClick={() => { moveSelection(1); closeContextMenu(); }} disabled={!hasSelectedEntity}>Move Down</button>
      <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(true); closeContextMenu(); }} disabled={!hasSelectedSignal}>Show</button>
      <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(false); closeContextMenu(); }} disabled={!hasSelectedSignal}>Hide</button>
      <button type="button" role="menuitem" onClick={() => { renameSelection(); closeContextMenu(); }} disabled={!hasSelectedEntity}>Rename</button>
      <button type="button" role="menuitem" onClick={() => { commandRegistry.current.execute("selection.delete"); closeContextMenu(); }} disabled={!hasDeletableSelection}>Delete</button>
    </ContextMenuSurface>}
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
  </main>;
}

function Ribbon({ tab, document, revision, range, history, zoom, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground, signalTreeVisible, inspectorVisible, bottomVisible, arrowPickStatus, selectedSignalId, selectedGroupId, problemsCount, diagnostics, onNavigateProblem, onRefreshChecks, viewMode, density, workspacePreset, onDensityChange, onWorkspacePresetChange, selectedTransactionId, clipboardStatus, clipboardAvailable, hasSelectedSignal, hasSelectedClipboard, hasSelectedEntity, hasDeletableSelection, onRange, onCommand, onCreateAnnotation, onArrowPick, onZoom, onFitSelection, onFitAll, onSetZoom, onNavigateBookmark, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onToggleSignalNames, onToggleRoles, onToggleAnnotations, onToggleTransactions, onToggleGroupBackground, onToggleSignalTree, onUndo, onRedo, onDelete, onNew, onOpen, onSave, onSaveAs, onRecent, onProperties, onExport, onToggleInspector, onToggleBottom, onShowProblems, onCopy, onCut, onPaste, onDuplicate, onRename, onClearSelection, onSelectAll, onMoveUp, onMoveDown, onVisibility, onOpenTimeline, onOpenProperties }: {
  readonly tab: string; readonly document: CanonicalDocument; readonly revision: number; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly zoom: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly minimapEnabled: boolean; readonly showSignalNames: boolean; readonly showRoles: boolean; readonly showAnnotations: boolean; readonly showTransactions: boolean; readonly showGroupBackground: boolean; readonly signalTreeVisible: boolean; readonly inspectorVisible: boolean; readonly bottomVisible: boolean; readonly arrowPickStatus: "idle" | "from" | "to"; readonly selectedSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly problemsCount: number; readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly onNavigateProblem: (path: string) => void; readonly onRefreshChecks: () => void; readonly viewMode: "Cycle" | "Transaction" | "Split"; readonly density: DensityMode; readonly workspacePreset: WorkspacePreset; readonly onDensityChange: (density: DensityMode) => void; readonly onWorkspacePresetChange: (preset: WorkspacePreset) => void; readonly selectedTransactionId: TransactionId | undefined;
  readonly clipboardStatus: string; readonly clipboardAvailable: boolean; readonly hasSelectedSignal: boolean; readonly hasSelectedClipboard: boolean; readonly hasSelectedEntity: boolean; readonly hasDeletableSelection: boolean;
  readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCreateAnnotation: (annotation: Annotation) => void; readonly onArrowPick: () => void; readonly onZoom: (delta: number) => void; readonly onFitSelection: () => void; readonly onFitAll: () => void; readonly onSetZoom: (zoom: number) => void; readonly onNavigateBookmark: (cycle: number) => void;
  readonly onToggleGrid: () => void; readonly onToggleSnap: () => void; readonly onToggleRuler: () => void; readonly onToggleMinimap: () => void; readonly onToggleSignalNames: () => void; readonly onToggleRoles: () => void; readonly onToggleAnnotations: () => void; readonly onToggleTransactions: () => void; readonly onToggleGroupBackground: () => void; readonly onToggleSignalTree: () => void; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onNew: () => void; readonly onOpen: () => void; readonly onSave: () => void; readonly onSaveAs: () => void; readonly onRecent: () => void; readonly onProperties: () => void; readonly onExport: () => void; readonly onToggleInspector: () => void; readonly onToggleBottom: () => void; readonly onShowProblems: () => void; readonly onCopy: () => void; readonly onCut: () => void; readonly onPaste: () => void; readonly onDuplicate: () => void; readonly onRename: () => void; readonly onClearSelection: () => void; readonly onSelectAll: () => void; readonly onMoveUp: () => void; readonly onMoveDown: () => void; readonly onVisibility: (visible: boolean) => void; readonly onOpenTimeline: () => void; readonly onOpenProperties: () => void;
}) {
  const [homeOverflowOpen, setHomeOverflowOpen] = useState(false);
  const [homeOverflowPosition, setHomeOverflowPosition] = useState<{ readonly left: number; readonly top: number; readonly height: number; readonly maxHeight: number }>();
  const homeOverflowTriggerRef = useRef<HTMLButtonElement>(null);
  const homeOverflowMenuRef = useRef<HTMLDivElement>(null);
  const [compactCycleCount] = useState(2);
  useLayoutEffect(() => {
    if (!homeOverflowOpen) {
      setHomeOverflowPosition(undefined);
      return;
    }
    const updatePosition = () => {
      const trigger = homeOverflowTriggerRef.current;
      const menu = homeOverflowMenuRef.current;
      if (!trigger || !menu) return;
      const margin = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const maxHeight = Math.max(120, window.innerHeight - margin * 2);
      const menuHeight = Math.min(menu.scrollHeight, maxHeight);
      const menuWidth = Math.min(menuRect.width, Math.max(220, window.innerWidth - margin * 2));
      const left = Math.max(margin, Math.min(triggerRect.right - menuWidth, window.innerWidth - margin - menuWidth));
      const belowTop = triggerRect.bottom + margin;
      const aboveTop = triggerRect.top - margin - menuHeight;
      const top = belowTop + menuHeight <= window.innerHeight - margin
        ? belowTop
        : Math.max(margin, aboveTop);
      setHomeOverflowPosition({ left, top, height: menuHeight, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [homeOverflowOpen]);
  useEffect(() => {
    if (!homeOverflowOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (homeOverflowMenuRef.current?.contains(target) || homeOverflowTriggerRef.current?.contains(target)) return;
      setHomeOverflowOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setHomeOverflowOpen(false);
      requestAnimationFrame(() => homeOverflowTriggerRef.current?.focus());
    };
    window.document.addEventListener("pointerdown", onPointerDown, true);
    window.document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown, true);
      window.document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [homeOverflowOpen]);
  useEffect(() => {
    if (!homeOverflowOpen) return;
    const frame = requestAnimationFrame(() => homeOverflowMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [homeOverflowOpen]);
  useLayoutEffect(() => {
    if (tab !== "Home") return;
    const root = window.document.querySelector<HTMLElement>("[data-testid='ribbon']");
    if (!root) return;
    const labels: Record<string, string> = { New: "新規", Open: "開く", Save: "保存", "Save As": "名前を付けて保存", Undo: "元に戻す", Redo: "やり直し", Copy: "コピー", Cut: "切取", Paste: "貼付", Duplicate: "複製", Delete: "削除", Rename: "名前変更", Clear: "クリア", "Select All": "すべて選択", Show: "表示", Hide: "非表示", "Move Up": "上へ", "Move Down": "下へ", "Zoom −": "ズーム－", "Zoom +": "ズーム＋", "Fit Selection": "選択に合わせる" };
    for (const button of root.querySelectorAll<HTMLButtonElement>(".ribbon-tool")) {
      const span = button.querySelector("span");
      const label = span?.textContent?.trim();
      const v1Label = label === undefined ? undefined : labels[label];
      if (label && v1Label) {
        button.setAttribute("aria-label", label);
        span?.setAttribute("data-v1-label", v1Label);
      }
    }
  });
  const insertValueSignal = (type: "binary" | "bus" | "state" | "logic" | "event" | "pulse") => {
    const targetGroup = document.signalGroups.find((group) => group.id === selectedGroupId) ?? document.signalGroups.at(-1);
    if (!targetGroup) return;
    const id = nextEntityId("signal", document);
    const name = type === "event" || type === "pulse" ? `${type.toUpperCase()}_${document.signals.length + 1}` : `SIGNAL_${document.signals.length + 1}`;
    const signal = type === "bus" ? valueSignal(id, name, "internal", [{ start: 0, value: "00" }], { type: "bus", width: 8, displayFormat: "hex" })
      : type === "state" ? valueSignal(id, name, "internal", [{ start: 0, value: "IDLE" }], { type: "state" })
      : type === "event" ? valueSignal(id, name, "internal", [{ start: 0, value: "NONE" }], { type: "event" })
      : valueSignal(id, name, "internal", [{ start: 0, value: 0 }], { type });
    onCommand({ id: nextCommandId("insert_signal"), type: "signal.create", signal, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertClockSignal = () => {
    const targetGroup = document.signalGroups.at(-1);
    if (!targetGroup) return;
    const id = signalId(nextEntityId("signal", document));
    const name = `CLOCK_${document.signals.length + 1}`;
    const signal: ClockSignal = { id, name, type: "clock", role: "internal", source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } };
    onCommand({ id: nextCommandId("insert_clock"), type: "signal.create", signal, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertGroup = () => {
    const id = groupId(nextEntityId("group", document));
    onCommand({ id: nextCommandId("insert_group"), type: "group.create", group: { id, name: `Group ${document.signalGroups.length + 1}`, rows: [] }, index: document.signalGroups.length });
  };
  const insertCommentRow = () => {
    const targetGroup = document.signalGroups.at(-1);
    if (!targetGroup) return;
    const id = signalId(nextEntityId("commentRow", document));
    const name = `Comment ${document.signals.length + 1}`;
    const commentRow: CommentRow = { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" };
    onCommand({ id: nextCommandId("insert_comment_row"), type: "commentRow.create", commentRow, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertSpacer = () => {
    const targetGroup = document.signalGroups.find((group) => group.id === selectedGroupId) ?? document.signalGroups.at(-1);
    if (!targetGroup) return;
    onCommand({ id: nextCommandId("insert_spacer"), type: "spacer.create", spacer: { id: spacerId(nextEntityId("spacer", document)), height: 24 }, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertAnnotation = (type: AnnotationType) => {
    if (!selectedSignalId) return;
    onCreateAnnotation(createAnnotation(type, selectedSignalId, range, document));
  };
  const addTransaction = () => {
    const id = nextEntityId("transaction", document) as TransactionId;
    onCommand({ id: nextCommandId("home_transaction_create"), type: "transaction.create", transaction: { id, name: `Transaction ${document.transactions.length + 1}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), laneId: "lane_0" } });
  };
  const duplicateTransaction = () => {
    const source = selectedTransactionId === undefined ? undefined : document.transactions.find((item) => item.id === selectedTransactionId);
    if (!source) return;
    onCommand({ id: nextCommandId("home_transaction_duplicate"), type: "transaction.create", transaction: { ...source, id: nextEntityId("transaction", document) as TransactionId, name: `${source.name} Copy` } });
  };
  const homeOverflowMenu = homeOverflowOpen ? createPortal(<div ref={homeOverflowMenuRef} id="home-overflow-menu" className="home-overflow-menu" role="menu" aria-label="More Home Commands" style={{ left: `${homeOverflowPosition?.left ?? 0}px`, top: `${homeOverflowPosition?.top ?? 0}px`, height: homeOverflowPosition ? `${homeOverflowPosition.height}px` : "auto", maxHeight: `${homeOverflowPosition?.maxHeight ?? 120}px`, visibility: homeOverflowPosition ? "visible" : "hidden" }}>
    <strong>File</strong><button type="button" onClick={() => { onNew(); setHomeOverflowOpen(false); }}>New</button><button type="button" onClick={() => { onOpen(); setHomeOverflowOpen(false); }}>Open</button><button type="button" onClick={() => { onSave(); setHomeOverflowOpen(false); }}>Save</button><button type="button" onClick={() => { onSaveAs(); setHomeOverflowOpen(false); }}>Save As</button><button type="button" onClick={() => { onRecent(); setHomeOverflowOpen(false); }}>Recent</button>
    <strong>History</strong><button type="button" onClick={() => { onUndo(); setHomeOverflowOpen(false); }} disabled={!history.canUndo}>Undo</button><button type="button" onClick={() => { onRedo(); setHomeOverflowOpen(false); }} disabled={!history.canRedo}>Redo</button>
    <strong>Clipboard</strong><button type="button" onClick={() => { onCopy(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Copy</button><button type="button" onClick={() => { onCut(); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Cut</button><button type="button" onClick={() => { onPaste(); setHomeOverflowOpen(false); }} disabled={!clipboardAvailable}>Paste</button><button type="button" onClick={() => { onDuplicate(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Duplicate</button>
    <strong>Edit / Selection</strong><button type="button" onClick={() => { onDelete(); setHomeOverflowOpen(false); }} disabled={!hasDeletableSelection}>Delete</button><button type="button" onClick={() => { onRename(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Rename</button><button type="button" onClick={() => { onClearSelection(); setHomeOverflowOpen(false); }}>Clear Selection</button><button type="button" onClick={() => { onSelectAll(); setHomeOverflowOpen(false); }} disabled={document.signals.every((signal) => signal.type === "commentRow")}>Select All</button>
    <strong>Visibility / Arrange</strong><button type="button" onClick={() => { onVisibility(true); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Show</button><button type="button" onClick={() => { onVisibility(false); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Hide</button><button type="button" onClick={() => { onMoveUp(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Move Up</button><button type="button" onClick={() => { onMoveDown(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Move Down</button>
    <strong>View</strong><button type="button" onClick={() => { onZoom(-0.25); setHomeOverflowOpen(false); }}>Zoom −</button><button type="button" onClick={() => { onZoom(0.25); setHomeOverflowOpen(false); }}>Zoom +</button><button type="button" onClick={() => { onSetZoom(0.5); setHomeOverflowOpen(false); }}>Zoom 50%</button><button type="button" onClick={() => { onSetZoom(1); setHomeOverflowOpen(false); }}>Zoom 100%</button><button type="button" onClick={() => { onSetZoom(1.5); setHomeOverflowOpen(false); }}>Zoom 150%</button><button type="button" onClick={() => { onSetZoom(2); setHomeOverflowOpen(false); }}>Zoom 200%</button><button type="button" onClick={() => { onFitSelection(); setHomeOverflowOpen(false); }}>Fit Selection</button><button type="button" onClick={() => { onFitAll(); setHomeOverflowOpen(false); }}>Fit All</button><button type="button" onClick={() => { onToggleGrid(); setHomeOverflowOpen(false); }}>Grid</button><button type="button" onClick={() => { onToggleSnap(); setHomeOverflowOpen(false); }}>Snap</button><button type="button" onClick={() => { onToggleRuler(); setHomeOverflowOpen(false); }}>Ruler</button><button type="button" onClick={() => { onToggleMinimap(); setHomeOverflowOpen(false); }}>MiniMap</button>
    <strong>Document</strong><button type="button" role="menuitem" onClick={() => { onProperties(); setHomeOverflowOpen(false); }}>Document Properties</button><button type="button" role="menuitem" onClick={() => { onShowProblems(); setHomeOverflowOpen(false); }}>Problems</button><button type="button" role="menuitem" onClick={() => { onExport(); setHomeOverflowOpen(false); }}>SVG / PNG / PDF</button><strong>Timeline</strong><button type="button" role="menuitem" onClick={() => { onOpenTimeline(); setHomeOverflowOpen(false); }}>Timeline Editor</button>
  </div>, window.document.body) : null;
  return <section className="ribbon" aria-label={`${tab} Ribbon`} data-testid="ribbon">
    {tab === "File" && <div className="ribbon-group file-group">
      <button type="button" className="ribbon-tool" onClick={onNew}><RibbonIcon name="i-new" /><span>New</span></button>
      <button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span>Open</span></button>
      <button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span>Save</span></button>
      <button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span>Save As</span></button>
      <div className="ribbon-toggles"><button type="button" onClick={onRecent} title="Open the most recently saved document">Recent</button><button type="button" onClick={onProperties} title={`${document.document.title} · ${document.signals.length} signals`}>Properties</button><button type="button" onClick={onExport}>Export</button></div><b>File</b>
    </div>}
      {tab === "Home" && <>
      <div className="ribbon-major-group" data-major-group="File" aria-label="File commands">
       <div className="ribbon-group home-file-group" aria-label="File"><button type="button" className="ribbon-tool" onClick={onNew}><RibbonIcon name="i-new" /><span data-v1-label="新規">New</span></button><button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span data-v1-label="開く">Open</span></button><button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span data-v1-label="保存">Save</span></button><button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span data-v1-label="名前を付けて保存">Save As</span></button><b>File</b></div>
      </div>
       <div className="ribbon-major-group" data-major-group="Edit" aria-label="Edit commands">
       <div className="ribbon-group home-edit-group" aria-label="Edit"><button type="button" className="ribbon-tool" onClick={onUndo} disabled={!history.canUndo}><RibbonIcon name="i-undo" /><span data-v1-label="元に戻す">Undo</span></button><button type="button" className="ribbon-tool" onClick={onRedo} disabled={!history.canRedo}><RibbonIcon name="i-redo" /><span data-v1-label="やり直し">Redo</span></button><button type="button" className="ribbon-tool" onClick={onCut} disabled={!hasSelectedClipboard}><RibbonIcon name="i-cut" /><span data-v1-label="切取">Cut</span></button><button type="button" className="ribbon-tool" onClick={onCopy} disabled={!hasSelectedClipboard} title="Copy is view-only"><RibbonIcon name="i-copy" /><span data-v1-label="コピー">Copy</span></button><button type="button" className="ribbon-tool" onClick={onPaste} disabled={!clipboardAvailable} title={clipboardStatus}><RibbonIcon name="i-paste" /><span data-v1-label="貼付">貼付</span></button><button type="button" className="ribbon-tool" onClick={onDelete} disabled={!hasDeletableSelection}><RibbonIcon name="i-delete" /><span data-v1-label="削除">Delete</span></button><button type="button" className="ribbon-tool" onClick={onDuplicate} disabled={!hasSelectedClipboard}><RibbonIcon name="i-duplicate" /><span data-v1-label="複製">複製</span></button><small data-testid="clipboard-status">{clipboardStatus}</small><b>Edit</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Time" aria-label="Time commands">
       <div className="ribbon-group home-timeline-group" aria-label="Timeline"><button type="button" className="ribbon-tool" aria-label="Move selected row up" onClick={onMoveUp} disabled={!hasSelectedEntity}><RibbonIcon name="i-up" /><span>Up</span></button><button type="button" className="ribbon-tool" aria-label="Move selected row down" onClick={onMoveDown} disabled={!hasSelectedEntity}><RibbonIcon name="i-down" /><span>Down</span></button><button type="button" className="ribbon-tool" aria-label="Insert one cycle" onClick={() => onCommand({ id: nextCommandId("timeline_insert_one"), type: "timeline.insert", at: range.start, count: 1 })}><RibbonIcon name="i-plus" /><span>Cycle<br />Insert</span></button><button type="button" className="ribbon-tool" aria-label="Delete one cycle" onClick={() => onCommand({ id: nextCommandId("timeline_delete_one"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + 1) })}><RibbonIcon name="i-delete" /><span>Cycle<br />Delete</span></button><button type="button" className="ribbon-tool" aria-label={`Insert ${compactCycleCount} cycles`} onClick={() => onCommand({ id: nextCommandId("timeline_insert_many"), type: "timeline.insert", at: range.start, count: compactCycleCount })}><RibbonIcon name="i-plus" /><span>N Cycle<br />Insert</span></button><button type="button" className="ribbon-tool" aria-label={`Delete ${compactCycleCount} cycles`} onClick={() => onCommand({ id: nextCommandId("timeline_delete_many"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + compactCycleCount) })}><RibbonIcon name="i-delete" /><span>N Cycle<br />Delete</span></button><b>Time</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Transaction" aria-label="Transaction commands">
        <div className="ribbon-group transaction-home-group" aria-label="Transaction"><button type="button" className="ribbon-tool" aria-label="Transaction" onClick={addTransaction}><RibbonIcon name="i-plus" /><span>Transaction<br />Create</span></button><button type="button" className="ribbon-tool" aria-label="Duplicate" onClick={duplicateTransaction} disabled={!selectedTransactionId}><RibbonIcon name="i-duplicate" /><span>Transaction<br />Duplicate</span></button><b>Transaction</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Layout" aria-label="Layout commands">
         <div className="ribbon-group v8-compact-time-group home-layout-group" aria-label="Layout"><button type="button" className="ribbon-tool" aria-label="Align interval" onClick={onOpenTimeline}><RibbonIcon name="i-align-interval" /><span>Align<br />Interval</span></button><button type="button" className="ribbon-tool" aria-label="Group" onClick={() => onCommand({ id: nextCommandId("home_time_group"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), presentation: { collapsed: false, foldStyle: "none" } } })}><RibbonIcon name="i-group" /><span>Group</span></button><button type="button" className="ribbon-tool" aria-label="Auto Layout" onClick={() => onCommand({ id: nextCommandId("home_auto_layout"), type: "document.updateLayout", layout: { ...document.layout, rowHeight: Math.max(24, document.layout.rowHeight), signalSpacing: Math.max(2, document.layout.signalSpacing) } })}><RibbonIcon name="i-auto-layout" /><span>Auto<br />Layout</span></button><b>Layout</b></div>
       </div>
      <div className="ribbon-major-group" data-major-group="Zoom" aria-label="Zoom commands">
       <div className="ribbon-group home-view-group" aria-label="Zoom"><div className="home-zoom-controls"><button type="button" className="ribbon-tool" onClick={() => onZoom(-0.25)}><RibbonIcon name="i-zoom-out" /><span data-v1-label="ズーム−">Zoom<br />Out</span></button><output data-testid="home-zoom-status">{Math.round(zoom * 100)}%</output><button type="button" className="ribbon-tool" onClick={() => onZoom(0.25)}><RibbonIcon name="i-zoom-in" /><span data-v1-label="ズーム＋">Zoom<br />In</span></button><button type="button" className="ribbon-tool" onClick={onFitAll}><RibbonIcon name="i-fit" /><span data-v1-label="全体表示">Fit<br />All</span></button></div><b>Zoom</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Display" aria-label="Display commands">
        <div className="ribbon-group home-display-group" aria-label="Display"><div className="home-display-toggles"><label className="home-toggle"><input data-testid="home-grid-toggle" type="checkbox" checked={gridEnabled} onChange={onToggleGrid} /> Grid</label><label className="home-toggle"><input data-testid="home-minimap-toggle" type="checkbox" checked={minimapEnabled} onChange={onToggleMinimap} /> MiniMap</label><label className="home-toggle"><input data-testid="home-snap-toggle" type="checkbox" checked={snapEnabled} onChange={onToggleSnap} /> Snap</label><label className="home-toggle"><input data-testid="home-ruler-toggle" type="checkbox" checked={rulerEnabled} onChange={onToggleRuler} /> Ruler</label></div><b>Display</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Options" aria-label="Options commands">
        <div className="ribbon-group home-overflow-group" aria-label="More Home Commands">
        <button ref={homeOverflowTriggerRef} type="button" className="ribbon-tool home-overflow-trigger" aria-expanded={homeOverflowOpen} aria-controls={homeOverflowOpen ? "home-overflow-menu" : undefined} onClick={() => setHomeOverflowOpen((value) => !value)}><RibbonIcon name="i-more" /><span>More</span></button>
         <b>Options</b>
        </div>
       </div>
    </>}
    {homeOverflowMenu}
    {tab === "Insert" && <div className="insert-ribbon insert-group" data-testid="insert-ribbon">
      <div className="ribbon-major-group insert-slot-group" data-major-group="Signals" aria-label="Signals commands"><DsRibbonGroup ariaLabel="Signals" className="insert-signals-group" label="Signals">
        <DsRibbonButton icon={<RibbonIcon name="i-plus" />} onClick={() => insertValueSignal("binary")}>Signal</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="clock" />} onClick={insertClockSignal}>Clock</DsRibbonButton><DsRibbonButton icon={<RibbonIcon name="i-grid" />} onClick={() => insertValueSignal("bus")}>Bus</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="state" />} onClick={() => insertValueSignal("state")}>State</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="event" />} onClick={() => insertValueSignal("event")}>Event</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="pulse" />} onClick={() => insertValueSignal("pulse")}>Pulse</DsRibbonButton>
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Structure" aria-label="Structure commands"><DsRibbonGroup ariaLabel="Structure" className="insert-structure-group" label="Structure"><DsRibbonButton icon={<RibbonIcon name="i-group" />} onClick={insertGroup}>Group</DsRibbonButton><DsRibbonButton icon={<RibbonIcon name="i-spacing" />} onClick={insertSpacer}>Spacer</DsRibbonButton></DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Annotation" aria-label="Annotation commands"><DsRibbonGroup ariaLabel="Annotation" className="insert-annotation-group" label="Annotation">
        <DsRibbonButton icon={<RibbonIcon name="i-comment" />} onClick={insertCommentRow}>Comment</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-more" />} onClick={() => insertAnnotation("marker")}>Marker</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-select-fit" />} onClick={() => insertAnnotation("range")}>Range</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="text" />} onClick={() => insertAnnotation("text")}>Text</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-filter" />} onClick={() => insertAnnotation("dependency")}>Dependency</DsRibbonButton>
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="More" aria-label="More Insert commands"><DsRibbonGroup ariaLabel="More" className="insert-more-group" label="More">
        <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-ruler" />} onClick={() => insertAnnotation("measurement")}>Measurement</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-grid" />} onClick={() => insertAnnotation("highlight")}>Highlight</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-gap" />} onClick={() => insertAnnotation("bracket")}>Bracket</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-ruler" />} onClick={() => insertAnnotation("verticalLine")}>Vertical Line</DsRibbonButton>
      </DsRibbonGroup></div>
    </div>}
    {tab === "Timeline" && <div className="ribbon-group timeline-group"><TimelineToolbar document={document} range={range} onRange={onRange} onCommand={onCommand} onNavigateBookmark={onNavigateBookmark} /><b>Timeline</b></div>}
    {tab === "Annotation" && <div className="ribbon-group annotation-group"><AnnotationToolbar document={document} range={range} signalId={selectedSignalId} onCreate={onCreateAnnotation} arrowPickStatus={arrowPickStatus} onArmArrow={onArrowPick} /><b>Annotation</b></div>}
    {tab === "View" && <>
      <div className="ribbon-major-group view-slot-group" data-major-group="Show" aria-label="Show commands"><DsRibbonGroup ariaLabel="Show" className="view-show-group" label="Show"><div className="view-display-subgroup" data-display-kind="labels" aria-label="Labels and structure"><span>Labels / Structure</span><DsRibbonToggle dataTestId="view-show-signal-names" checked={showSignalNames} label="Signal Names" onChange={onToggleSignalNames} /><DsRibbonToggle dataTestId="view-show-roles" checked={showRoles} label="Roles" onChange={onToggleRoles} /><DsRibbonToggle dataTestId="view-show-group-background" checked={showGroupBackground} label="Group Background" onChange={onToggleGroupBackground} /></div><div className="view-display-subgroup" data-display-kind="overlays" aria-label="Overlays"><span>Overlays</span><DsRibbonToggle dataTestId="view-show-annotations" checked={showAnnotations} label="Annotations" onChange={onToggleAnnotations} /><DsRibbonToggle dataTestId="view-show-transactions" checked={showTransactions} label="Transactions" onChange={onToggleTransactions} /></div></DsRibbonGroup></div>
       <div className="ribbon-major-group view-slot-group" data-major-group="Panels" aria-label="Panels commands"><DsRibbonGroup ariaLabel="Panels" className="view-panels-group" label="Panels"><DsRibbonToggleButton className="view-mini-tool" ariaLabel="Inspector" checked={inspectorVisible} icon={<RibbonIcon name="i-settings" />} onClick={onToggleInspector}>Inspector</DsRibbonToggleButton><DsRibbonToggleButton className="view-mini-tool" ariaLabel="Bottom Editor" checked={bottomVisible} icon={<RibbonIcon name="i-preview" />} onClick={onToggleBottom}><span>Bottom</span><span>Editor</span></DsRibbonToggleButton><DsRibbonToggleButton dataTestId="view-panel-tree" ariaLabel="Signal Tree" checked={signalTreeVisible} icon={<RibbonIcon name="i-group" />} onClick={onToggleSignalTree}>Signal Tree</DsRibbonToggleButton><DsRibbonToggleButton dataTestId="view-panel-minimap" ariaLabel="MiniMap" checked={minimapEnabled} icon={<RibbonIcon name="i-preview" />} onClick={onToggleMinimap}>MiniMap</DsRibbonToggleButton></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group" data-major-group="Guides" aria-label="Guides commands"><DsRibbonGroup ariaLabel="Guides" className="view-guides-group" label="Guides"><DsRibbonToggle dataTestId="grid-toggle" checked={gridEnabled} label="Grid" onChange={onToggleGrid} /><DsRibbonToggle dataTestId="snap-toggle" checked={snapEnabled} label="Snap" onChange={onToggleSnap} /><DsRibbonToggle dataTestId="ruler-toggle" checked={rulerEnabled} label="Ruler" onChange={onToggleRuler} /></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group view-zoom-slot" data-major-group="Zoom" aria-label="Zoom commands"><DsRibbonGroup ariaLabel="Zoom" className="view-zoom-group" label="Zoom"><DsRibbonButton className="view-mini-tool" ariaLabel="Zoom Out" icon={<RibbonIcon name="i-zoom-out" />} onClick={() => onZoom(-0.25)}><span>Zoom</span><span>Out</span></DsRibbonButton><DsRibbonSelect ariaLabel="Zoom preset" value={String(Math.round(zoom * 100))} onChange={(event) => onSetZoom(Number(event.target.value) / 100)}><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></DsRibbonSelect><output className="view-zoom-status visually-hidden" data-testid="zoom-status" aria-label="Current zoom">{Math.round(zoom * 100)}%</output><DsRibbonButton className="view-mini-tool" ariaLabel="Zoom In" icon={<RibbonIcon name="i-zoom-in" />} onClick={() => onZoom(0.25)}><span>Zoom</span><span>In</span></DsRibbonButton><div className="view-zoom-fit-actions" aria-label="Fit commands"><DsRibbonButton className="view-mini-tool" ariaLabel="Fit All" icon={<RibbonIcon name="i-fit" />} onClick={onFitAll}><span>Fit</span><span>All</span></DsRibbonButton><DsRibbonButton className="view-mini-tool" ariaLabel="Fit Selection" icon={<RibbonIcon name="i-fit" />} onClick={onFitSelection}><span>Fit</span><span>Selection</span></DsRibbonButton></div></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group" data-major-group="Workspace" aria-label="Workspace commands"><DsRibbonGroup ariaLabel="Workspace" className="view-workspace-group" label="Workspace"><div className="view-workspace-settings" aria-label="Workspace settings"><label>Workspace<DsRibbonSelect ariaLabel="Workspace preset" value={workspacePreset} onChange={(event) => onWorkspacePresetChange(event.target.value as WorkspacePreset)}><option value="edit">Edit</option><option value="waveform">Waveform Focus</option><option value="review">Review</option><option value="transaction">Transaction</option></DsRibbonSelect></label><label>Density<DsRibbonSelect ariaLabel="UI density" value={density} onChange={(event) => onDensityChange(event.target.value as DensityMode)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></DsRibbonSelect></label></div><div className="view-workspace-actions" aria-label="Workspace layout actions"><DsRibbonButton className="view-mini-tool" ariaLabel="Reset Layout" icon={<RibbonIcon name="i-settings" />} onClick={() => onWorkspacePresetChange("edit")}><span>Reset</span><span>Layout</span></DsRibbonButton><DsRibbonButton className="view-mini-tool" ariaLabel="Focus Waveform" icon={<RibbonIcon name="i-preview" />} onClick={() => onWorkspacePresetChange("waveform")}><span>Focus</span><span>Waveform</span></DsRibbonButton></div></DsRibbonGroup></div>
    </>}
    {tab === "Review" && <div className="ribbon-group review-group"><ReviewWorkflow diagnostics={diagnostics} document={document} selectedSignalId={selectedSignalId} selectedGroupId={selectedGroupId} onNavigate={onNavigateProblem} onShowProblems={onShowProblems} onRefreshChecks={onRefreshChecks} /><output data-testid="review-problems-count">{problemsCount}</output><b>Review</b></div>}
    {tab === "AI" && <div className="ribbon-group ai-group"><AIOperationPanel document={document} revision={revision} selectedSignalId={selectedSignalId} onCommand={onCommand} icon={<RibbonIcon name="i-ai" />} /><b>AI</b></div>}
  </section>;
}

function InspectorPanel({ signal, group, annotation, transaction, collapsedGroup, onToggleGroupCollapse, registry, document, viewport, onCommand, onReveal, onCancel }: { readonly signal: Signal | undefined; readonly group: SignalGroup | undefined; readonly annotation: Annotation | undefined; readonly transaction: Transaction | undefined; readonly collapsedGroup: boolean; readonly onToggleGroupCollapse: (() => void) | undefined; readonly registry: UiCommandRegistry; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onReveal: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState(signal?.name ?? "");
  const [groupName, setGroupName] = useState(group?.name ?? "");
  const [spacingBefore, setSpacingBefore] = useState(group?.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(group?.spacingAfter ?? 0);
  const [groupShowBackground, setGroupShowBackground] = useState(group?.style?.showBackground ?? false);
  const [groupBackground, setGroupBackground] = useState(group?.style?.background ?? "#eef5fc");
  const [groupOpacity, setGroupOpacity] = useState(group?.style?.opacity ?? 1);
  const [groupBorder, setGroupBorder] = useState(group?.style?.border ?? "#d8e0e9");
  const [groupShowBorder, setGroupShowBorder] = useState(Boolean(group?.style?.border));
  const [groupExtend, setGroupExtend] = useState<"label" | "waveform" | "both">(group?.style?.extend ?? "both");
  const [groupShowHeader, setGroupShowHeader] = useState(group?.style?.showHeader ?? true);
  const [visible, setVisible] = useState(signal?.display.visible !== false);
  const [edgeCounter, setEdgeCounter] = useState<EdgeCounterSettings | undefined>(signal?.type === "clock" ? signal.edgeCounter : undefined);
  const [transactionName, setTransactionName] = useState(transaction?.name ?? "");
  const [transactionStart, setTransactionStart] = useState(transaction?.start ?? 0);
  const [transactionEnd, setTransactionEnd] = useState(transaction?.end ?? 1);
  const [transactionLane, setTransactionLane] = useState(transaction?.laneId ?? "lane_0");
  const [transactionPhases, setTransactionPhases] = useState(JSON.stringify(transaction?.phases ?? [], null, 2));
  const [transactionStatus, setTransactionStatus] = useState("");
  if (Boolean(signal)) return <InspectorSignalEditor signal={signal as Signal} document={document} viewport={viewport} onCommand={onCommand} onReveal={onReveal} onCancel={onCancel} />;
  if (Boolean(annotation)) return <InspectorAnnotationEditor annotation={annotation as Annotation} document={document} viewport={viewport} onCommand={onCommand} onDelete={() => registry.execute("selection.delete")} onCancel={onCancel} />;
  if (!group && !transaction) return <LayoutInspector document={document} viewport={viewport} onCommand={onCommand} onCancel={onCancel} />;
  const spacerMoveEditor = group ? <section data-testid="spacer-reorder"><h3>Spacer Reorder</h3>{(group.spacers ?? []).map((spacer) => { const index = group.rows.indexOf(spacer.id); return <div key={spacer.id} data-spacer-reorder-id={spacer.id}><code>{spacer.id}</code><button type="button" aria-label={`Move spacer ${spacer.id} up`} disabled={index <= 0} onClick={() => onCommand({ id: nextCommandId("spacer_move_up"), type: "spacer.move", spacerId: spacer.id, targetGroupId: group.id, index: index - 1 })}>Up</button><button type="button" aria-label={`Move spacer ${spacer.id} down`} disabled={index < 0 || index >= group.rows.length - 1} onClick={() => onCommand({ id: nextCommandId("spacer_move_down"), type: "spacer.move", spacerId: spacer.id, targetGroupId: group.id, index: index + 1 })}>Down</button></div>})}</section> : null;
  const spacerEditor = group ? <section data-testid="inspector-spacers"><h3>Spacer Rows</h3><button type="button" data-testid="add-spacer" onClick={() => onCommand({ id: nextCommandId("spacer_create"), type: "spacer.create", spacer: { id: spacerId(nextEntityId("spacer", document)), height: 24 }, targetGroupId: group.id, index: group.rows.length })}>Add Spacer</button>{(group.spacers ?? []).map((spacer) => <form key={spacer.id} data-spacer-id={spacer.id} onSubmit={(event) => { event.preventDefault(); const height = Number(new FormData(event.currentTarget).get("height")); onCommand({ id: nextCommandId("spacer_update"), type: "spacer.update", spacerId: spacer.id, height }); }}><code>{spacer.id}</code><label>Height<input name="height" aria-label={`Spacer height ${spacer.id}`} type="number" min="1" step="1" defaultValue={spacer.height} /></label><button type="submit">Apply Height</button><button type="button" onClick={() => onCommand({ id: nextCommandId("spacer_delete"), type: "spacer.delete", spacerId: spacer.id })}>Delete</button></form>)}</section> : null;
  return <aside className="inspector" data-testid="inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><span>Inspector</span></header>{(group || transaction) && <button type="button" data-testid="cancel-inspector-draft" onClick={onCancel}>Cancel</button>}
    {!signal && !group && !annotation && !transaction && <section className="inspector-empty">No selection</section>}
    {spacerEditor}
    {spacerMoveEditor}
    {signal && <>
      <section><h3>Signal</h3><div className="property-row"><span>Type</span><b>{signal.type}</b></div><label>Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== signal.name) registry.execute("selection.rename", { name }); }} /></label><label>Role<select aria-label="Inspector signal role" value={signal.role} disabled><option>{signal.role}</option></select></label><label>Width<input value={signal.type === "bus" ? signal.width ?? "" : 1} readOnly /></label><label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => { setVisible(event.target.checked); registry.execute("selection.visibility", { visible: event.target.checked }); }} /></label><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Signal</button></section>
      <section><h3>Layout</h3><div className="property-row"><span>Row height</span><span>{document.layout.rowHeight}px</span></div><div className="property-row"><span>Spacing</span><span>{document.layout.signalSpacing}px</span></div></section>
      {signal.type === "clock" && edgeCounter && <section><h3>Edge Numbers</h3><label className="checkline">Show<input aria-label="Edge Numbers show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Edge Numbers mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start number<input aria-label="Edge Numbers start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count from<select aria-label="Edge Numbers count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Edge Numbers every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Edge Numbers position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Edge Numbers X" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Edge Numbers Y" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="button" onClick={() => onCommand({ id: nextCommandId("edge_counter"), type: "signal.updateEdgeCounter", signalId: signal.id, edgeCounter })}>Apply Edge Numbers</button></section>}
    </>}
    {group && <section><h3>Group</h3><label>Name<InlineNameInput value={group.name} ariaLabel="Inspector group name" onRename={(name) => onCommand({ id: nextCommandId("group_rename"), type: "group.rename", groupId: group.id, name })} onCommitted={setGroupName} /></label><label>Spacing Before<input aria-label="Group spacing before" type="number" min="0" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Group spacing after" type="number" min="0" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label><label className="checkline">Show Background<input aria-label="Group show background" type="checkbox" checked={groupShowBackground} onChange={(event) => setGroupShowBackground(event.target.checked)} /></label><label>Background<input aria-label="Group background" type="color" value={groupBackground} onChange={(event) => setGroupBackground(event.target.value)} /></label><label>Opacity<input aria-label="Group opacity" type="number" min="0" max="1" step="0.05" value={groupOpacity} onChange={(event) => setGroupOpacity(Number(event.target.value))} /></label><label className="checkline">Border<input aria-label="Group show border" type="checkbox" checked={groupShowBorder} onChange={(event) => setGroupShowBorder(event.target.checked)} /></label><label>Border Color<input aria-label="Group border" value={groupBorder} onChange={(event) => setGroupBorder(event.target.value)} /></label><label>Extend<select aria-label="Group extend" value={groupExtend} onChange={(event) => setGroupExtend(event.target.value as typeof groupExtend)}><option value="label">Label</option><option value="waveform">Waveform</option><option value="both">Both</option></select></label><label className="checkline">Show Header<input aria-label="Group show header" type="checkbox" checked={groupShowHeader} onChange={(event) => setGroupShowHeader(event.target.checked)} /></label><button type="button" data-testid="apply-group-properties" onClick={() => onCommand({ id: nextCommandId("group_properties"), type: "group.updateProperties", groupId: group.id, name: groupName, spacingBefore, spacingAfter, style: { showBackground: groupShowBackground, background: groupBackground, opacity: groupOpacity, extend: groupExtend, ...(groupShowBorder ? { border: groupBorder } : {}), showHeader: groupShowHeader } })}>Apply Group Properties</button><div className="property-row"><span>Rows</span><span>{group.rows.length}</span></div><label className="checkline">Collapsed<input aria-label="Inspector group collapsed" type="checkbox" checked={collapsedGroup} onChange={() => onToggleGroupCollapse?.()} /></label><small className="inspector-note">Collapse is a view-only layout preference; it does not change Canonical, History, or Dirty state.</small></section>}
    {transaction && <section><h3>Transaction</h3><label>Name<input aria-label="Transaction name" value={transactionName} onChange={(event) => setTransactionName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={transactionEnd - 1} value={transactionStart} onChange={(event) => setTransactionStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={transactionStart + 1} max={document.timeline.cycleCount} value={transactionEnd} onChange={(event) => setTransactionEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={transactionLane} onChange={(event) => setTransactionLane(event.target.value)} /></label><label>Phases JSON<textarea aria-label="Transaction phases" rows={5} value={transactionPhases} onChange={(event) => setTransactionPhases(event.target.value)} spellCheck={false} /></label><button type="button" data-testid="apply-transaction-properties" onClick={() => { try { const phases = JSON.parse(transactionPhases) as unknown; if (!Array.isArray(phases) || phases.some((phase) => typeof phase !== "object" || phase === null || typeof (phase as { name?: unknown }).name !== "string" || !Number.isInteger((phase as { start?: unknown }).start) || !Number.isInteger((phase as { end?: unknown }).end))) throw new Error("Phases must be an array of {name,start,end} objects."); setTransactionStatus(""); onCommand({ id: nextCommandId("transaction_update"), type: "transaction.update", transactionId: transaction.id, name: transactionName, start: transactionStart, end: transactionEnd, laneId: transactionLane, phases }); } catch (error) { setTransactionStatus(error instanceof Error ? error.message : "Invalid phases JSON"); } }}>{"Apply Transaction"}</button>{transactionStatus && <output role="status">{transactionStatus}</output>}<TransactionLinkedSignals transaction={transaction} document={document} onCommand={onCommand} nextCommandId={nextCommandId} renderUnlinkButton={(label, onClick) => <EditorIconButton label={label} icon="close" onClick={onClick} />} /><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Transaction</button></section>}
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

function InspectorAnnotationEditor({ annotation, document, viewport, onCommand, onDelete, onCancel }: { readonly annotation: Annotation; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onDelete: () => void; readonly onCancel: () => void }) {
  type AnchorField = "anchor" | "start" | "end" | "from" | "to";
  const anchorFields: readonly AnchorField[] = (["anchor", "start", "end", "from", "to"] as const).filter((field) => (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[field] !== undefined);
  const firstAnchorField = anchorFields[0] ?? "anchor";
  const [label, setLabel] = useState(annotation.label);
  const [color, setColor] = useState(annotation.color ?? "#d04a36");
  const [visible, setVisible] = useState(annotation.visible);
  const [lineType, setLineType] = useState<NonNullable<Annotation["lineType"]>>(annotation.lineType ?? "straight");
  const [arrowhead, setArrowhead] = useState<NonNullable<Annotation["arrowhead"]>>(annotation.arrowhead ?? "end");
  const [anchorField, setAnchorField] = useState<AnchorField>(firstAnchorField);
  const initialAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[firstAnchorField];
  const [anchorX, setAnchorX] = useState(initialAnchor?.offset?.x ?? 0);
  const [anchorY, setAnchorY] = useState(initialAnchor?.offset?.y ?? 0);
  const [anchorCycle, setAnchorCycle] = useState(initialAnchor?.cycle ?? 0);
  const [anchorSignalId, setAnchorSignalId] = useState<SignalId | undefined>(initialAnchor?.signalId);
  const [anchorPoint, setAnchorPoint] = useState<SemanticAnchor["point"]>(initialAnchor?.point ?? "cycle-start");
  const selectedAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[anchorField];
  return <aside className="inspector" data-testid="inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><span>Inspector</span><b>Annotation</b></header>
    <form className="inspector-annotation-properties" aria-label="Inspector Annotation" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("inspector_annotation_properties"), type: "annotation.updateProperties", annotationId: annotation.id, label, visible, color, ...(annotation.type === "arrow" ? { lineType, arrowhead } : {}) });
    }}>
      <section><h3>Annotation</h3><div className="property-row"><span>Type</span><b>{annotation.type}</b></div><label>Label<input aria-label="Inspector annotation label" value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Color<input aria-label="Inspector annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label className="checkline">Visible<input aria-label="Inspector annotation visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>{annotation.type === "arrow" && <><label>Line<select aria-label="Inspector annotation line type" value={lineType} onChange={(event) => setLineType(event.target.value as typeof lineType)}><option value="straight">Straight</option><option value="orthogonal">Orthogonal</option><option value="curve">Curve</option><option value="diagonal">Diagonal</option></select></label><label>Arrow<select aria-label="Inspector annotation arrowhead" value={arrowhead} onChange={(event) => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">End</option><option value="start">Start</option><option value="bidirectional">Both</option><option value="none">None</option></select></label></>}</section>
      <section><div className="property-row"><span>Anchor</span><span>{selectedAnchor?.point ?? "—"}</span></div><div className="annotation-anchor-editor" aria-label="Inspector Annotation Anchor"><label>Endpoint<select aria-label="Inspector annotation endpoint" value={anchorField} onChange={(event) => { const nextField = event.target.value as AnchorField; const nextAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[nextField]; setAnchorField(nextField); setAnchorX(nextAnchor?.offset?.x ?? 0); setAnchorY(nextAnchor?.offset?.y ?? 0); setAnchorCycle(nextAnchor?.cycle ?? 0); setAnchorSignalId(nextAnchor?.signalId); setAnchorPoint(nextAnchor?.point ?? "cycle-start"); }}>{anchorFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label><label>Signal<select aria-label="Inspector annotation anchor signal" value={anchorSignalId ?? ""} onChange={(event) => setAnchorSignalId((event.target.value || undefined) as SignalId | undefined)}><option value="">(none)</option>{document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label><label>Cycle<input aria-label="Inspector annotation anchor cycle" type="number" min="0" max={document.timeline.cycleCount - 1} value={anchorCycle} onChange={(event) => setAnchorCycle(Number(event.target.value))} /></label><label>Point<select aria-label="Inspector annotation anchor point" value={anchorPoint} onChange={(event) => setAnchorPoint(event.target.value as SemanticAnchor["point"])}>{(["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"] as const).map((point) => <option key={point} value={point}>{point}</option>)}</select></label><label>X offset<input aria-label="Inspector annotation anchor X" type="number" value={anchorX} onChange={(event) => setAnchorX(Number(event.target.value))} /></label><label>Y offset<input aria-label="Inspector annotation anchor Y" type="number" value={anchorY} onChange={(event) => setAnchorY(Number(event.target.value))} /></label><button type="button" data-testid="apply-inspector-annotation-anchor" disabled={!selectedAnchor} onClick={() => { if (selectedAnchor) onCommand({ id: nextCommandId("inspector_annotation_anchor"), type: "annotation.setAnchor", annotationId: annotation.id, field: anchorField, anchor: { ...selectedAnchor, ...(anchorSignalId === undefined ? {} : { signalId: anchorSignalId }), cycle: anchorCycle, point: anchorPoint, offset: { x: anchorX, y: anchorY } } }); }}>Apply Anchor</button></div><button type="submit" data-testid="apply-inspector-annotation">Apply Annotation</button><button type="button" className="danger" onClick={onDelete}>Delete Annotation</button></section>
      <button type="button" data-testid="cancel-inspector-draft" onClick={onCancel}>Cancel</button>
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

function InspectorSignalEditor({ signal, document, viewport, onCommand, onReveal, onCancel }: { readonly signal: Signal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onReveal: () => void; readonly onCancel: () => void }) {
  if (signal.type === "clock") return <InspectorClockEditor signal={signal} document={document} viewport={viewport} onCommand={onCommand} onReveal={onReveal} onCancel={onCancel} />;
  if (signal.type === "commentRow") return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span></header><section><h3>Comment Row</h3><div className="property-row"><span>Title</span><b>{signal.title}</b></div><div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div><p className="inspector-note">Comment Row editing is owned by the Bottom Context Editor.</p></section><MiniMap document={document} viewport={viewport} /></aside>;
  return <InspectorValueSignalEditor signal={signal} document={document} viewport={viewport} onCommand={onCommand} onReveal={onReveal} onCancel={onCancel} />;
}

function InspectorValueSignalEditor({ signal, document, viewport, onCommand, onReveal, onCancel }: { readonly signal: ValueSignal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onReveal: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState(signal.display.name);
  const [role, setRole] = useState<SignalRole>(signal.role);
  const [signalType, setSignalType] = useState<ValueSignal["type"]>(signal.type);
  const [width, setWidth] = useState(signal.width ?? 1);
  const [format, setFormat] = useState<"hex" | "binary" | "symbolic">(signal.displayFormat ?? "hex");
  const [visible, setVisible] = useState(signal.display.visible !== false);
  const [spacingBefore, setSpacingBefore] = useState(signal.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal.spacingAfter ?? 0);
  const [align, setAlign] = useState<NonNullable<Signal["display"]["align"]>>(signal.display.align ?? "left");
  const [overflow, setOverflow] = useState<NonNullable<Signal["display"]["overflow"]>>(signal.display.overflow ?? "ellipsis");
  const [style, setStyle] = useState(JSON.stringify(signal.display.style ?? {}));
  const styleObject = signal.display.style ?? {};
  const styleString = (key: string, fallback: string) => typeof styleObject[key] === "string" ? styleObject[key] as string : fallback;
  const styleNumber = (key: string, fallback: number) => typeof styleObject[key] === "number" ? styleObject[key] as number : fallback;
  const [textColor, setTextColor] = useState(styleString("color", "#152033"));
  const [rowBackground, setRowBackground] = useState(styleString("background", "#ffffff"));
  const [fontFamily, setFontFamily] = useState(styleString("fontFamily", "Segoe UI"));
  const [fontSize, setFontSize] = useState(styleNumber("fontSize", 12));
  const [bold, setBold] = useState(styleObject.fontWeight === "bold");
  const [italic, setItalic] = useState(styleObject.fontStyle === "italic");
  const [underline, setUnderline] = useState(styleString("textDecoration", "").includes("underline"));
  const [strikethrough, setStrikethrough] = useState(styleString("textDecoration", "").includes("line-through"));
  const [waveformColor, setWaveformColor] = useState(styleString("waveformColor", "#111111"));
  const [waveformBackground, setWaveformBackground] = useState(styleString("waveformBackground", "#ffffff"));
  const [problem, setProblem] = useState("");
  const { state: sections, toggle } = useInspectorAccordion("value-signal", { "signal-properties": true, hierarchy: true, "label-style": false, waveform: true });
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    let parsed: Signal["display"]["style"];
    try {
      const value: unknown = JSON.parse(style || "{}");
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Style must be a JSON object.");
      parsed = value as Signal["display"]["style"];
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Style must be valid JSON.");
      return;
    }
    setProblem("");
    const parsedStyle = parsed ?? {};
    const decorations = [underline ? "underline" : "", strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
    const structuredStyle = { color: typeof parsedStyle.color === "string" ? parsedStyle.color : textColor, background: typeof parsedStyle.background === "string" ? parsedStyle.background : rowBackground, fontFamily: typeof parsedStyle.fontFamily === "string" ? parsedStyle.fontFamily : fontFamily, fontSize: typeof parsedStyle.fontSize === "number" ? parsedStyle.fontSize : fontSize, fontWeight: typeof parsedStyle.fontWeight === "string" ? parsedStyle.fontWeight : (bold ? "bold" : "normal"), fontStyle: typeof parsedStyle.fontStyle === "string" ? parsedStyle.fontStyle : (italic ? "italic" : "normal"), textDecoration: typeof parsedStyle.textDecoration === "string" ? parsedStyle.textDecoration : decorations, waveformColor: typeof parsedStyle.waveformColor === "string" ? parsedStyle.waveformColor : waveformColor, waveformBackground: typeof parsedStyle.waveformBackground === "string" ? parsedStyle.waveformBackground : waveformBackground };
    onCommand({ id: nextCommandId("inspector_signal_properties"), type: "signal.updateProperties", signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}), visible, ...(signal.spacingBefore === undefined && spacingBefore === 0 ? {} : { spacingBefore }), ...(signal.spacingAfter === undefined && spacingAfter === 0 ? {} : { spacingAfter }), displayAlign: align, displayOverflow: overflow, displayStyle: { ...parsedStyle, ...structuredStyle } });
  };
  const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".") || signal.source.signalName;
  return <aside className="inspector" data-testid="inspector" data-inspector-context="signal" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><span>Inspector</span><b>Signal</b></header>
    <form className="inspector-signal-properties" data-testid="inspector-signal-properties" onSubmit={apply}>
      <InspectorSection sectionId="signal-properties" title="Signal Properties" open={sections["signal-properties"] ?? true} onToggle={() => toggle("signal-properties")}>
         <label>Display Name<InlineNameInput value={signal.display.name} ariaLabel="Inspector signal name" onRename={(nextName) => onCommand({ id: nextCommandId("inspector_signal_rename"), type: "signal.rename", signalId: signal.id, name: nextName })} onCommitted={setName} /></label>
        <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Inspector signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Logic</option><option value="event">Event</option><option value="pulse">Pulse</option></select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Inspector signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Bus format<select aria-label="Inspector bus format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label></>}
        <label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>
        <label>Spacing Before<input aria-label="Inspector signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
        <label>Spacing After<input aria-label="Inspector signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
      </InspectorSection>
      <InspectorSection sectionId="hierarchy" title="Source / Hierarchy" open={sections.hierarchy ?? true} onToggle={() => toggle("hierarchy")}><div className="property-row"><span>Instance Path</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div><div className="property-row"><span>Signal Name</span><span>{signal.source.signalName}</span></div><div className="property-row"><span>Full Path</span><span title={fullPath}>{fullPath}</span></div><div className="property-row"><span>Bus Range</span><span>{signal.source.msb === undefined ? "—" : `[${signal.source.msb}:${signal.source.lsb ?? 0}]`}</span></div><button type="button" data-testid="reveal-in-hierarchy" onClick={onReveal}>Reveal in Hierarchy</button></InspectorSection>
      <InspectorSection sectionId="label-style" title="Label Style" open={sections["label-style"] ?? false} onToggle={() => toggle("label-style")}><label>Text Color<input aria-label="Inspector text color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label>Background<input aria-label="Inspector label background" type="color" value={rowBackground} onChange={(event) => setRowBackground(event.target.value)} /></label><label>Font<input aria-label="Inspector label font" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label><label>Size<input aria-label="Inspector label size" type="number" min="6" max="48" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><div className="inspector-style-checks"><label className="checkline">Bold<input aria-label="Inspector label bold" type="checkbox" checked={bold} onChange={(event) => setBold(event.target.checked)} /></label><label className="checkline">Italic<input aria-label="Inspector label italic" type="checkbox" checked={italic} onChange={(event) => setItalic(event.target.checked)} /></label><label className="checkline">Underline<input aria-label="Inspector label underline" type="checkbox" checked={underline} onChange={(event) => setUnderline(event.target.checked)} /></label><label className="checkline">Strikethrough<input aria-label="Inspector label strikethrough" type="checkbox" checked={strikethrough} onChange={(event) => setStrikethrough(event.target.checked)} /></label></div><label>Align<select aria-label="Inspector label align" value={align} onChange={(event) => setAlign(event.target.value as typeof align)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overflow<select aria-label="Inspector label overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label></InspectorSection>
      <InspectorSection sectionId="waveform" title="Waveform / Row Style" open={sections.waveform ?? true} onToggle={() => toggle("waveform")}><label>Waveform Color<input aria-label="Inspector waveform color" type="color" value={waveformColor} onChange={(event) => setWaveformColor(event.target.value)} /></label><label>Row Background<input aria-label="Inspector waveform background" type="color" value={waveformBackground} onChange={(event) => setWaveformBackground(event.target.value)} /></label><label>Advanced Style JSON<textarea aria-label="Inspector waveform row style" value={style} onChange={(event) => setStyle(event.target.value)} rows={3} /></label></InspectorSection>
      {problem && <div className="editor-problem" role="alert">{problem}</div>}
      <button type="submit" data-testid="apply-inspector-signal">Apply Signal Properties</button><button type="button" data-testid="cancel-inspector-draft" onClick={onCancel}>Cancel</button>
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

function InspectorClockEditor({ signal, document, viewport, onCommand, onReveal, onCancel }: { readonly signal: ClockSignal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onReveal: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState(signal.name);
  const [problem, setProblem] = useState("");
  const [role, setRole] = useState<SignalRole>(signal.role);
  const [visible, setVisible] = useState(signal.display.visible !== false);
  const [spacingBefore, setSpacingBefore] = useState(signal.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal.spacingAfter ?? 0);
  const [align, setAlign] = useState<NonNullable<Signal["display"]["align"]>>(signal.display.align ?? "left");
  const [overflow, setOverflow] = useState<NonNullable<Signal["display"]["overflow"]>>(signal.display.overflow ?? "ellipsis");
  const styleObject = signal.display.style ?? {};
  const styleString = (key: string, fallback: string) => typeof styleObject[key] === "string" ? styleObject[key] as string : fallback;
  const styleNumber = (key: string, fallback: number) => typeof styleObject[key] === "number" ? styleObject[key] as number : fallback;
  const [textColor, setTextColor] = useState(styleString("color", "#152033"));
  const [rowBackground, setRowBackground] = useState(styleString("background", "#ffffff"));
  const [fontFamily, setFontFamily] = useState(styleString("fontFamily", "Inter"));
  const [fontSize, setFontSize] = useState(styleNumber("fontSize", 12));
  const [bold, setBold] = useState(styleObject.fontWeight === "bold");
  const [italic, setItalic] = useState(styleObject.fontStyle === "italic");
  const [underline, setUnderline] = useState(styleString("textDecoration", "").includes("underline"));
  const [strikethrough, setStrikethrough] = useState(styleString("textDecoration", "").includes("line-through"));
  const [waveformColor, setWaveformColor] = useState(styleString("waveformColor", "#111111"));
  const [waveformBackground, setWaveformBackground] = useState(styleString("waveformBackground", "#ffffff"));
  const [generator, setGenerator] = useState<ClockGenerator>(signal.generator);
  const [edgeCounter, setEdgeCounter] = useState<EdgeCounterSettings>(signal.edgeCounter);
  const [conversionTarget, setConversionTarget] = useState<"binary" | "bus" | "state">("binary");
  const [conversionConfirm, setConversionConfirm] = useState(false);
  const [referenceEdge, setReferenceEdge] = useState<"rising" | "falling">(document.timeline.edge);
  const { state: sections, toggle } = useInspectorAccordion("clock-signal", { "signal-properties": true, hierarchy: true, "label-style": false, waveform: true, generator: true, "edge-counter": true });
  const number = (key: "start" | "period" | "duty" | "phase", value: string) => setGenerator({ ...generator, [key]: Number(value) });
  const applyProperties = (event: React.FormEvent) => {
    event.preventDefault();
    const decorations = [underline ? "underline" : "", strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
     onCommand({ id: nextCommandId("inspector_clock_properties"), type: "signal.updateProperties", signalId: signal.id, name, role, visible, spacingBefore, spacingAfter, displayAlign: align, displayOverflow: overflow, displayStyle: { ...styleObject, color: textColor, background: rowBackground, fontFamily, fontSize, fontWeight: bold ? "bold" : "normal", fontStyle: italic ? "italic" : "normal", textDecoration: decorations, waveformColor, waveformBackground } });
  };
  const convertClock = () => {
    const result = onCommand({ id: nextCommandId("convert_clock"), type: "signal.convertClock", signalId: signal.id, targetType: conversionTarget });
    if (!result.ok) setProblem(result.problems[0]?.message ?? "Clock conversion was rejected.");
    else setConversionConfirm(false);
  };
  return <aside className="inspector" data-testid="inspector" data-inspector-context="clock" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); if (conversionConfirm) setConversionConfirm(false); else onCancel(); } }}><header><span>Inspector</span><b>Clock</b></header><button type="button" data-testid="cancel-inspector-draft" onClick={onCancel}>Cancel</button>
    <div className="inspector-scroll">
    <InspectorSection sectionId="signal-properties" title="Signal Properties" open={sections["signal-properties"] ?? true} onToggle={() => toggle("signal-properties")}><form className="inspector-clock-properties" aria-label="Inspector Clock Properties" onSubmit={applyProperties}>
       <label>Name<InlineNameInput value={signal.display.name} ariaLabel="Inspector signal name" onRename={(nextName) => onCommand({ id: nextCommandId("inspector_clock_rename"), type: "signal.rename", signalId: signal.id, name: nextName })} onCommitted={setName} /></label>
      <label>Type<select aria-label="Inspector signal type" value="clock" disabled><option value="clock">Clock</option></select></label>
      <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
      <label className="checkline">Show in waveform<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>
      <button type="button" data-testid="set-reference-clock" onClick={() => onCommand({ id: nextCommandId("set_reference_clock"), type: "timeline.setReferenceClock", referenceClock: signal.id })} disabled={document.timeline.referenceClock === signal.id}>Use as Reference Clock</button>
      <label>Reference Edge<select aria-label="Reference Edge" value={referenceEdge} onChange={(event) => setReferenceEdge(event.target.value as "rising" | "falling")}><option value="rising">Rising</option><option value="falling">Falling</option></select></label><button type="button" data-testid="apply-reference-edge" onClick={() => onCommand({ id: nextCommandId("set_reference_edge"), type: "timeline.setReferenceEdge", edge: referenceEdge })}>Apply Reference Edge</button>
      <label>Spacing Before<input aria-label="Inspector signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
      <label>Spacing After<input aria-label="Inspector signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
      <button type="submit" data-testid="apply-inspector-clock-properties">Apply Properties</button>
    </form></InspectorSection>
    <section data-testid="clock-convert-section"><h3>Convert Type</h3><p className="inspector-note">Converting discards the Clock generator, enable waveform, and Edge Counter state.</p>{!conversionConfirm ? <><label>Target Type<select aria-label="Clock conversion target" value={conversionTarget} onChange={(event) => setConversionTarget(event.target.value as typeof conversionTarget)}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option></select></label><button type="button" data-testid="open-clock-conversion" onClick={() => setConversionConfirm(true)}>Convert Clock</button></> : <div role="alertdialog" aria-label="Confirm Clock conversion"><p>Clock-only generator, enable waveform, and Edge Counter state will be discarded.</p><button type="button" data-testid="confirm-clock-conversion" onClick={convertClock}>Apply Conversion</button><button type="button" data-testid="cancel-clock-conversion" onClick={() => setConversionConfirm(false)}>Cancel</button></div>}</section>
    <InspectorSection sectionId="hierarchy" title="Source / Hierarchy" open={sections.hierarchy ?? true} onToggle={() => toggle("hierarchy")}><div className="property-row"><span>Instance Path</span><span>{signal.source.instancePath.join(".") || "(top)"}</span></div><div className="property-row"><span>Leaf Signal</span><span>{signal.source.signalName}</span></div><div className="property-row"><span>Bus Range</span><span>—</span></div><button type="button" data-testid="reveal-in-hierarchy" onClick={onReveal}>Reveal in Hierarchy</button></InspectorSection>
    <InspectorSection sectionId="label-style" title="Label Style" open={sections["label-style"] ?? false} onToggle={() => toggle("label-style")}><label>Text Color<input aria-label="Inspector text color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label>Background<input aria-label="Inspector label background" type="color" value={rowBackground} onChange={(event) => setRowBackground(event.target.value)} /></label><label>Font<input aria-label="Inspector label font" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label><label>Size<input aria-label="Inspector label size" type="number" min="6" max="48" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><div className="inspector-style-checks"><label className="checkline">Bold<input aria-label="Inspector label bold" type="checkbox" checked={bold} onChange={(event) => setBold(event.target.checked)} /></label><label className="checkline">Italic<input aria-label="Inspector label italic" type="checkbox" checked={italic} onChange={(event) => setItalic(event.target.checked)} /></label><label className="checkline">Underline<input aria-label="Inspector label underline" type="checkbox" checked={underline} onChange={(event) => setUnderline(event.target.checked)} /></label><label className="checkline">Strikethrough<input aria-label="Inspector label strikethrough" type="checkbox" checked={strikethrough} onChange={(event) => setStrikethrough(event.target.checked)} /></label></div><label>Align<select aria-label="Inspector label align" value={align} onChange={(event) => setAlign(event.target.value as typeof align)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overflow<select aria-label="Inspector label overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label></InspectorSection>
    <InspectorSection sectionId="waveform" title="Waveform / Timing" open={sections.waveform ?? true} onToggle={() => toggle("waveform")}><label>Waveform Color<input aria-label="Inspector waveform color" type="color" value={waveformColor} onChange={(event) => setWaveformColor(event.target.value)} /></label><label>Row Background<input aria-label="Inspector waveform background" type="color" value={waveformBackground} onChange={(event) => setWaveformBackground(event.target.value)} /></label></InspectorSection>
    <InspectorSection sectionId="generator" title="Clock Generator" open={sections.generator ?? true} onToggle={() => toggle("generator")}><form className="inspector-clock-generator" aria-label="Inspector Clock Generator" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("inspector_clock_generator"), type: "signal.updateClockGenerator", signalId: signal.id, generator }); }}>
      <label>Start<input aria-label="Inspector clock start" type="number" min="0" step="1" value={generator.start} onChange={(event) => number("start", event.target.value)} /></label><label>Period<input aria-label="Inspector clock period" type="number" min="1" step="1" value={generator.period} onChange={(event) => number("period", event.target.value)} /></label><label>Duty<input aria-label="Inspector clock duty" type="number" min="0.01" max="1" step="0.01" value={generator.duty} onChange={(event) => number("duty", event.target.value)} /></label><label>Phase<input aria-label="Inspector clock phase" type="number" step="0.5" value={generator.phase} onChange={(event) => number("phase", event.target.value)} /></label><label>Initial<select aria-label="Inspector clock initial" value={generator.initial} onChange={(event) => setGenerator({ ...generator, initial: Number(event.target.value) as 0 | 1 })}><option value="0">0</option><option value="1">1</option></select></label><label>Polarity<select aria-label="Inspector clock polarity" value={generator.polarity} onChange={(event) => setGenerator({ ...generator, polarity: event.target.value as ClockGenerator["polarity"] })}><option value="positive">Positive</option><option value="negative">Negative</option></select></label><button type="submit" data-testid="apply-inspector-clock">Apply Clock Generator</button>
    </form></InspectorSection>
    <InspectorSection sectionId="edge-counter" title="Edge Counter" open={sections["edge-counter"] ?? true} onToggle={() => toggle("edge-counter")}><form className="inspector-edge-counter" aria-label="Inspector Edge Counter" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("inspector_edge_counter"), type: "signal.updateEdgeCounter", signalId: signal.id, edgeCounter }); }}>
      <label className="checkline">Show<input aria-label="Inspector edge counter show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Inspector edge counter mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start Number<input aria-label="Inspector edge counter start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count From<select aria-label="Inspector edge counter count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Inspector edge counter every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Inspector edge counter position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Inspector edge counter X offset" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Inspector edge counter Y offset" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="submit" data-testid="apply-inspector-edge-counter">Apply Edge Counter</button>
    </form></InspectorSection>
    {problem && <div className="editor-problem" role="alert" data-testid="clock-conversion-problem">{problem}</div>}</div><MiniMap document={document} viewport={viewport} />
  </aside>;
}




function AdvancedJsonPanel({ document, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction, onCommand, onDiagnostic }: { readonly document: CanonicalDocument; readonly selectedSignal: Signal | undefined; readonly selectedGroup: SignalGroup | undefined; readonly selectedAnnotation: Annotation | undefined; readonly selectedTransaction: Transaction | undefined; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onDiagnostic: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void }) {
  const text = useMemo(() => serializeCanonicalDocument(document), [document]);
  const [advanced, setAdvanced] = useState(false);
  const [scope, setScope] = useState<"selected" | "document">("document");
  const [draft, setDraft] = useState(text);
  const [status, setStatus] = useState("Read only");
  const selected = selectedSignal ?? selectedGroup ?? selectedAnnotation ?? selectedTransaction;
  useEffect(() => { setDraft(scope === "selected" ? JSON.stringify(selected ?? {}, null, 2) : text); }, [scope, selected, text]);
  const parseDraft = (): unknown => {
    try { const value = JSON.parse(draft); onDiagnostic(undefined); return value; } catch (error) {
      const diagnostic = scanJsonSyntax(draft);
      const detail = error instanceof Error ? error.message : "Invalid JSON.";
      const parserDetail = diagnostic ? `${detail}; excerpt: ${diagnostic.excerpt}; caret: ${diagnostic.caret}` : detail;
      onDiagnostic({ code: diagnostic?.code ?? "JSON_PARSE_ERROR", path: diagnostic ? `$@${diagnostic.line}:${diagnostic.column}` : "$", message: diagnostic?.message ?? detail, ...(diagnostic ? { line: diagnostic.line, column: diagnostic.column, offset: diagnostic.offset, excerpt: diagnostic.excerpt, caret: diagnostic.caret } : {}), severity: "error", operation: "document.json.parse", operationLabel: "Parse Advanced JSON", source: "parser", stage: "parse", recommendation: "Fix the JSON syntax in the indicated line and column, then retry.", detail: `advanced-json:parse;${parserDetail}` });
      setStatus(diagnostic ? `Invalid JSON · line ${diagnostic.line}, column ${diagnostic.column} · ${diagnostic.message} · ${diagnostic.excerpt}` : `Invalid JSON · ${detail}`);
      return undefined;
    }
  };
  const format = () => {
    const value = parseDraft();
    if (value !== undefined) { setDraft(JSON.stringify(value, null, 2)); setStatus("Formatted"); }
  };
  const validate = () => {
    const value = parseDraft();
    if (value === undefined) return;
    if (scope === "document") { const problems = validateCanonicalDocument(value as CanonicalDocument); if (problems.length === 0) { onDiagnostic(undefined); setStatus("Valid"); } else { const diagnostics = problems.map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported path and validate again.", detail: `advanced-json:validate:${index}` })); const problem = problems[0]!; onDiagnostic(diagnostics); setStatus(`Invalid: ${problem.code} · ${problem.path}`); } }
    else if (!selected) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_REQUIRED", "$", "Select an object before validating selected JSON.")); setStatus("No selected object"); }
    else if (typeof value !== "object" || value === null || Array.isArray(value)) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_SHAPE", "$", "Selected JSON must be an object.")); setStatus("Invalid selected object"); }
    else if ((value as { id?: unknown }).id !== selected.id) { onDiagnostic(selectedJsonProblem("SELECTED_OBJECT_ID_MISMATCH", "$.id", "Selected object ID cannot change.")); setStatus("Invalid selected object ID"); }
    else { const problems = validateCanonicalDocument(replaceSelectedJsonObject(document, value, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction)); if (problems.length === 0) { onDiagnostic(undefined); setStatus("Valid"); } else { const diagnostics = problems.map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported path and validate again.", detail: `advanced-json:validate:${index}` })); const problem = problems[0]!; onDiagnostic(diagnostics); setStatus(`Invalid: ${problem.code} · ${problem.path}`); } }
  };
  const copy = async () => {
    if (!navigator.clipboard) { setStatus("Copy failed: Clipboard API unavailable"); return; }
    try {
      await navigator.clipboard.writeText(draft);
      setStatus("Copied");
    } catch (error) {
      setStatus(`Copy failed: ${error instanceof Error ? error.message : "Clipboard permission denied"}`);
    }
  };
  const apply = () => {
    if (!advanced) return;
    const value = parseDraft();
    if (value === undefined || typeof value !== "object" || value === null || Array.isArray(value)) { setStatus("JSON object required"); return; }
    let next = value as CanonicalDocument;
    if (scope === "selected") {
      if (!selected) { setStatus("No selected object"); return; }
      if ((value as { id?: unknown }).id !== selected.id) { setStatus("Selected object ID cannot change"); return; }
      next = replaceSelectedJsonObject(document, value, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction);
    }
    const problems = validateCanonicalDocument(next);
    const resourceProblems = problems.length === 0 ? validateDocumentResourceBudget(next) : [];
    if (problems.length > 0 || resourceProblems.length > 0) {
      const diagnostics = [...problems, ...resourceProblems].map((problem, index) => ({ ...problem, severity: "error" as const, operation: "document.json.validate", operationLabel: "Validate Advanced JSON", source: "validation" as const, stage: "validate" as const, recommendation: "Correct the reported document or resource limits, then apply again.", detail: `advanced-json:validate:${index}` }));
      const problem = diagnostics[0]!;
      onDiagnostic(diagnostics);
      setStatus(`Invalid: ${problem.code} · ${problem.path}`);
      return;
    }
    onDiagnostic(undefined);
    const result = onCommand({ id: nextCommandId("json_replace"), type: "document.replace", document: next });
    if (!result.ok) { setStatus(`Apply failed: ${result.reason}`); return; }
    setAdvanced(false);
    setStatus("Applied");
  };
  return <section className="json-panel" data-testid="json-panel"><div className="json-toolbar"><strong>JSON</strong><button type="button" data-testid="json-advanced-toggle" aria-pressed={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "Read Only" : "Advanced Editable"}</button><span aria-label="JSON editing mode">{advanced ? "Advanced" : "Read only"}</span><select aria-label="JSON scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="selected">Selected Object</option><option value="document">Whole Document</option></select><button type="button" onClick={format}>Format</button><button type="button" onClick={validate}>Validate</button><button type="button" onClick={() => void copy()}>Copy</button>{advanced && <button type="button" data-testid="apply-advanced-json" onClick={apply}>Apply JSON</button>}<output>{status}</output></div>{advanced ? <textarea aria-label="Advanced JSON" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /> : <pre>{text}</pre>}</section>;
}

function TransactionLanes({ document, zoom, selectedId, getBoundaryX, onSelect, onSnap, onCommand }: { readonly document: CanonicalDocument; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly getBoundaryX: (cycle: number) => number | undefined; readonly onSelect: (id: TransactionId) => void; readonly onSnap: (clientX: number) => number | undefined; readonly onCommand: (command: SemanticCommand) => void }) {
  const lanes = [...new Set(["lane_0", ...document.transactions.map((transaction) => transaction.laneId ?? "lane_0")])].sort();
  const [drag, setDrag] = useState<{ id: TransactionId; edge: "body" | "start" | "end"; startX: number }>();
  const owner = useRef<HTMLElement>(null);
  const relevantCycles = [...new Set(document.transactions.flatMap((transaction) => [transaction.start, transaction.end]))].sort((left, right) => left - right);
  const cycleXs = relevantCycles.flatMap((cycle) => { const x = getBoundaryX(cycle); return x === undefined ? [] : [{ cycle, x }]; });
  const finish = (event: React.PointerEvent, transaction: Transaction) => {
    if (!drag || drag.id !== transaction.id) return;
    setDrag(undefined);
    if (event.clientX === drag.startX) return;
    const cycle = onSnap(event.clientX);
    if (cycle === undefined) return;
    if (drag.edge === "body") {
      const duration = transaction.end - transaction.start;
      const start = Math.max(0, Math.min(document.timeline.cycleCount - duration, cycle));
      if (start !== transaction.start) onCommand({ id: nextCommandId("transaction_snap_move"), type: "transaction.move", transactionId: transaction.id, start });
    } else {
      const value = drag.edge === "start" ? Math.min(cycle, transaction.end - 1) : Math.max(cycle, transaction.start + 1);
      if (value !== transaction[drag.edge]) onCommand({ id: nextCommandId("transaction_snap_resize"), type: "transaction.resize", transactionId: transaction.id, edge: drag.edge, value });
    }
  };
  const capture = (event: React.PointerEvent, next: { id: TransactionId; edge: "body" | "start" | "end" }) => { event.stopPropagation(); event.currentTarget.parentElement?.setPointerCapture(event.pointerId); setDrag({ ...next, startX: event.clientX }); };
  const x = (cycle: number) => cycleXs.find((value) => value.cycle === cycle)?.x;
  return <section ref={owner} className="transaction-lanes" data-testid="transaction-lanes" style={{ "--transaction-zoom": zoom } as React.CSSProperties}><div className="transaction-lane-labels">{lanes.map((lane) => <span key={lane}>{lane}</span>)}</div><div className="transaction-track">{lanes.map((lane, laneIndex) => <div className="transaction-lane" key={lane} style={{ top: laneIndex * 28 }}>{cycleXs.map((value) => <i className="transaction-geometry-line" aria-hidden="true" key={`cycle-${value.cycle}`} data-cycle={value.cycle} style={{ left: value.x }} />)}{document.transactions.filter((transaction) => (transaction.laneId ?? "lane_0") === lane).map((transaction) => { const startX = x(transaction.start); const endX = x(transaction.end); if (startX === undefined || endX === undefined) return null; return <button type="button" key={transaction.id} data-transaction-id={transaction.id} data-selected={String(selectedId === transaction.id)} style={{ left: startX, width: endX - startX }} onClick={() => onSelect(transaction.id)} onPointerUp={(event) => finish(event, transaction)}><i data-edge="start" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "start" })} /><span onPointerDown={(event) => capture(event, { id: transaction.id, edge: "body" })}>{transaction.name}</span><i data-edge="end" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "end" })} /></button>; })}</div>)}</div></section>;
}

function LayoutInspector({ document, viewport, onCommand, onCancel }: { readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onCancel: () => void }) {
  const [roleColumnWidth, setRoleColumnWidth] = useState(document.layout.roleColumnWidth);
  const [signalNameWidth, setSignalNameWidth] = useState(document.layout.signalNameWidth);
  const [signalNameAlign, setSignalNameAlign] = useState(document.layout.signalNameAlign);
  const [overflow, setOverflow] = useState(document.layout.overflow);
  const [rowHeight, setRowHeight] = useState(document.layout.rowHeight);
  const [signalSpacing, setSignalSpacing] = useState(document.layout.signalSpacing);
  const [error, setError] = useState("");
  useEffect(() => {
    setRoleColumnWidth(document.layout.roleColumnWidth);
    setSignalNameWidth(document.layout.signalNameWidth);
    setSignalNameAlign(document.layout.signalNameAlign);
    setOverflow(document.layout.overflow);
    setRowHeight(document.layout.rowHeight);
    setSignalSpacing(document.layout.signalSpacing);
    setError("");
  }, [document.layout]);
  const resetDraft = () => {
    setRoleColumnWidth(document.layout.roleColumnWidth);
    setSignalNameWidth(document.layout.signalNameWidth);
    setSignalNameAlign(document.layout.signalNameAlign);
    setOverflow(document.layout.overflow);
    setRowHeight(document.layout.rowHeight);
    setSignalSpacing(document.layout.signalSpacing);
    setError("");
  };
  const apply = () => {
    if (![roleColumnWidth, signalNameWidth, rowHeight, signalSpacing].every(Number.isFinite) || roleColumnWidth < 16 || roleColumnWidth > 240 || signalNameWidth < 40 || signalNameWidth > 600 || rowHeight < 12 || signalSpacing < 0) {
      setError("Layout dimensions must be finite and within the supported range.");
      return;
    }
    onCommand({ id: nextCommandId("layout_properties"), type: "document.updateLayout", layout: { ...document.layout, roleColumnWidth, signalNameWidth, signalNameAlign, rowHeight, signalSpacing, overflow } });
  };
  const autoFit = () => {
    const labels = Array.from(globalThis.document.querySelectorAll<HTMLElement>("[data-role='tree-signal-name'], [data-role='frozen-signal-name'], [data-role='annotation-label']"));
    const canvas = globalThis.document.createElement("canvas");
    const context = canvas.getContext("2d");
    const widths = labels.filter((label) => label.textContent?.trim() && label.getClientRects().length > 0).map((label) => {
      if (!context) return label.scrollWidth;
      const style = globalThis.getComputedStyle(label);
      context.font = style.font;
      return context.measureText(label.textContent?.trim() ?? "").width;
    });
    const contentWidth = Math.max(0, ...widths);
    const fittedWidth = Math.min(600, Math.max(40, Math.ceil(contentWidth + 24)));
    if (fittedWidth === document.layout.signalNameWidth) return;
    onCommand({ id: nextCommandId("layout_autofit"), type: "document.updateLayout", layout: { ...document.layout, signalNameWidth: fittedWidth } });
  };
  return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span><b>Layout</b></header><form className="inspector-layout-editor" data-testid="inspector-layout-editor" onSubmit={(event) => { event.preventDefault(); apply(); }}><section><h3>Layout</h3><label>Role column width<input aria-label="Inspector role column width" type="number" min="16" max="240" step="1" value={roleColumnWidth} onChange={(event) => setRoleColumnWidth(Number(event.target.value))} /></label><label>Signal name width<input aria-label="Inspector signal name width" type="number" min="40" max="600" step="1" value={signalNameWidth} onChange={(event) => setSignalNameWidth(Number(event.target.value))} /></label><label>Signal name alignment<select aria-label="Inspector signal name alignment" value={signalNameAlign} onChange={(event) => setSignalNameAlign(event.target.value as typeof signalNameAlign)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Signal name overflow<select aria-label="Inspector signal name overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label><label>Row height<input aria-label="Inspector row height" type="number" min="12" step="1" value={rowHeight} onChange={(event) => setRowHeight(Number(event.target.value))} /></label><label>Signal spacing<input aria-label="Inspector signal spacing" type="number" min="0" step="1" value={signalSpacing} onChange={(event) => setSignalSpacing(Number(event.target.value))} /></label><p className="inspector-note">Applied to the derived RowLayout; absolute screen geometry is never stored.</p>{error && <p className="editor-problem" role="alert">{error}</p>}<button type="button" data-testid="auto-fit-inspector-layout" onClick={autoFit}>Auto Fit Signal/Annotation Column</button><button type="submit" data-testid="apply-inspector-layout">Apply Layout</button><button type="button" data-testid="cancel-inspector-layout" onClick={() => { resetDraft(); onCancel(); }}>Cancel</button></section></form><MiniMap document={document} viewport={viewport} /></aside>;
}

function TransactionEditor({ transaction, document, history, onSelect, onCommand, onUndo, onRedo, onDelete, onCancel }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument; readonly history: HistoryState; readonly onSelect: (id: TransactionId) => void; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState("Transaction");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.min(5, document.timeline.cycleCount));
  const [laneId, setLaneId] = useState("lane_0");
  const [editName, setEditName] = useState(transaction?.name ?? "");
  const [editStart, setEditStart] = useState(transaction?.start ?? 0);
  const [editEnd, setEditEnd] = useState(transaction?.end ?? 1);
  const [editLaneId, setEditLaneId] = useState(transaction?.laneId ?? "lane_0");
  useEffect(() => {
    setEditName(transaction?.name ?? "");
    setEditStart(transaction?.start ?? 0);
    setEditEnd(transaction?.end ?? 1);
    setEditLaneId(transaction?.laneId ?? "lane_0");
  }, [transaction?.id, transaction?.name, transaction?.start, transaction?.end, transaction?.laneId]);
  return <section className="transaction-editor" data-testid="transaction-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><strong>{transaction ? `Editing: ${transaction.name}` : "Transaction Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button>{transaction && <><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="button" className="danger" data-testid="delete-bottom-transaction" onClick={onDelete}>Delete Transaction</button></>}</header>{transaction ? <form onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("bottom_transaction_update"), type: "transaction.update", transactionId: transaction.id, name: editName.trim() || "Transaction", start: editStart, end: editEnd, laneId: editLaneId, ...(transaction.phases === undefined ? {} : { phases: transaction.phases }) }); }}><label>Name<input aria-label="Transaction name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={editEnd - 1} value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={editStart + 1} max={document.timeline.cycleCount} value={editEnd} onChange={(event) => setEditEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={editLaneId} onChange={(event) => setEditLaneId(event.target.value)} /></label><button type="submit" data-testid="apply-transaction-properties">Apply Transaction</button></form> : <form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction", document) as TransactionId; const result = onCommand({ id: nextCommandId("transaction_create"), type: "transaction.create", transaction: { id, name: name.trim() || "Transaction", start, end, laneId } }); if (result.ok) onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Start<input aria-label="New Transaction start" type="number" min="0" max={end - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End<input aria-label="New Transaction end" type="number" min={start + 1} max={document.timeline.cycleCount} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /></label><button type="submit">Create Transaction</button></form>}<div className="transaction-list">{document.transactions.map((item) => <button type="button" key={item.id} data-selected={String(item.id === transaction?.id)} onClick={() => onSelect(item.id)}><b>{item.name}</b><span>{item.start}–{item.end}</span><span>{item.laneId ?? "lane_0"}</span><span>{item.linkedSignals?.length ?? 0} links</span></button>)}</div></section>;
}

function AnnotationEditor({ annotation, annotations, document, history, problem, onSelect, onCreate, onDuplicate, onCommand, onUndo, onRedo, onDelete, onCancel }: { readonly annotation: Annotation; readonly annotations: readonly Annotation[]; readonly document: CanonicalDocument; readonly history: HistoryState; readonly problem: string; readonly onSelect: (id: AnnotationId) => void; readonly onCreate: (type: AnnotationType) => void; readonly onDuplicate: (annotation: Annotation) => void; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void }) {
  const [label, setLabel] = useState(annotation.label);
  const [color, setColor] = useState(annotation.color ?? "#d04a36");
  const [visible, setVisible] = useState(annotation.visible);
  const [lineType, setLineType] = useState<NonNullable<Annotation["lineType"]>>(annotation.lineType ?? "straight");
  const [arrowhead, setArrowhead] = useState<NonNullable<Annotation["arrowhead"]>>(annotation.arrowhead ?? "end");
  const [labelX, setLabelX] = useState(annotation.labelOffset?.x ?? 0);
  const [labelY, setLabelY] = useState(annotation.labelOffset?.y ?? -14);
  const [opacity, setOpacity] = useState(annotation.opacity ?? (annotation.type === "ghostTrace" ? 0.55 : 0.16));
  const [traceOffsetCycles, setTraceOffsetCycles] = useState(annotation.traceOffsetCycles ?? 0);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [importStatus, setImportStatus] = useState("Import annotations JSON");
  const fileInput = useRef<HTMLInputElement>(null);
  const importAnnotations = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "annotations" in parsed ? (parsed as { annotations: unknown }).annotations : undefined);
      if (!Array.isArray(items) || items.some((item) => item === null || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string")) throw new Error("Expected an annotation array with stable IDs.");
      const result = onCommand({ id: nextCommandId("annotation_import"), type: "document.replace", document: { ...document, annotations: items as Annotation[] } });
      if (!result.ok) {
        setImportStatus(result.problems[0]?.message ?? "Annotation import was rejected.");
        return;
      }
      const first = items[0] as { id?: unknown } | undefined;
      if (typeof first?.id === "string") onSelect(first.id as AnnotationId);
      setImportStatus(`Imported ${items.length} annotation${items.length === 1 ? "" : "s"}`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Invalid annotations JSON");
    }
  };
  return <section className="signal-editor annotation-editor" aria-label="Annotation Editor" data-testid="annotation-editor" data-bottom-target-id={annotation.id} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <div className="editor-tabbar">
      <button type="button" className="editor-tab">Signal</button><button type="button" className="editor-tab active">Annotation</button>
      <span className="editor-selection">{annotation.label} · {annotation.type}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button>
      <button type="button" onClick={onDelete} data-testid="delete-annotation">Delete</button>
    </div>
    <div className="annotation-context-toolbar" role="toolbar" aria-label="Annotation operations" data-testid="annotation-context-toolbar">
      <button type="button" aria-label="Create context annotation" onClick={() => onCreate("text")}>＋ Add Annotation</button>
      <button type="button" onClick={() => onDuplicate(annotation)}>Duplicate</button>
      <button type="button" onClick={onDelete}>Delete</button>
      <button type="button" onClick={() => setPreviewRevision((value) => value + 1)}>⟳ Preview Update</button>
      <button type="button" onClick={() => downloadText(JSON.stringify(annotations, null, 2), "annotations.json")}>Export</button>
      <button type="button" onClick={() => fileInput.current?.click()}>Import</button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import annotations" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importAnnotations(file); event.currentTarget.value = ""; }} />
      <output data-testid="annotation-preview-status">Preview {previewRevision > 0 ? `updated ${previewRevision}` : "ready"}</output>
      <output data-testid="annotation-import-status">{importStatus}</output>
    </div>
    <AnnotationList annotations={annotations} selectedId={annotation.id} onSelect={onSelect} />
    {problem && <div className="editor-problem" role="alert">{problem}</div>}
    <form className="annotation-properties" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("annotation_style"), type: "annotation.updateProperties", annotationId: annotation.id, label, visible, color, ...(annotation.type === "arrow" ? { lineType, arrowhead } : {}), ...(["timingRegion", "ghostTrace"].includes(annotation.type) ? { opacity } : {}), ...(annotation.type === "ghostTrace" ? { sourceSignalId: annotation.sourceSignalId, traceOffsetCycles } : {}) });
    }}>
      <label>Label<input aria-label="Annotation label" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
      <label>Color<input aria-label="Annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label className="check-label"><input aria-label="Annotation visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />Visible</label>
      {(["timingRegion", "ghostTrace"] as const).includes(annotation.type as "timingRegion") && <label>Opacity<input aria-label="Annotation opacity" type="number" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>}
      {annotation.type === "ghostTrace" && <><div className="property-row"><span>Source Signal</span><b data-testid="ghost-source-signal">{annotation.sourceSignalId ?? "Missing"}</b></div><label>Cycle Offset<input aria-label="Ghost Trace cycle offset" type="number" step="1" value={traceOffsetCycles} onChange={(event) => setTraceOffsetCycles(Number(event.target.value))} /></label></>}
      {annotation.type === "arrow" && <><label>Line<select aria-label="Annotation line type" value={lineType} onChange={(event) => setLineType(event.target.value as typeof lineType)}><option value="straight">Straight</option><option value="orthogonal">Orthogonal</option><option value="curve">Curve</option><option value="diagonal">Diagonal</option></select></label><label>Arrow<select aria-label="Annotation arrowhead" value={arrowhead} onChange={(event) => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">End</option><option value="start">Start</option><option value="bidirectional">Both</option><option value="none">None</option></select></label></>}
      <button type="submit" data-testid="apply-annotation-properties">Apply</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("annotation_reset_offsets"), type: "annotation.resetOffsets", annotationId: annotation.id })}>Reset offsets</button>
    </form>
    <form className="annotation-properties" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("annotation_label_offset"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: labelX, y: labelY } }); }}>
      <strong>Label offset</strong>
      <label>X<input aria-label="Annotation label X" type="number" value={labelX} onChange={(event) => setLabelX(Number(event.target.value))} /></label>
      <label>Y<input aria-label="Annotation label Y" type="number" value={labelY} onChange={(event) => setLabelY(Number(event.target.value))} /></label>
      <button type="submit">Move label</button>
      <span className="annotation-hint">Arrow keys nudge 1 px; Shift+Arrow nudges 10 px. Drag endpoints to snap.</span>
    </form>
  </section>;
}

function TimelineToolbar({ document, range, onRange, onCommand, onNavigateBookmark }: { readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => void; readonly onNavigateBookmark: (cycle: number) => void }) {
  const [count, setCount] = useState(1);
  const [destination, setDestination] = useState(8);
  const [editingGroupId, setEditingGroupId] = useState<TimeGroupId>();
  const editingGroup = document.timeGroups.find((group) => group.id === editingGroupId);
  const [groupName, setGroupName] = useState("");
  const [groupStart, setGroupStart] = useState(0);
  const [groupEnd, setGroupEnd] = useState(1);
  const [groupComment, setGroupComment] = useState("");
  const [groupFoldLabel, setGroupFoldLabel] = useState("");
  const [groupCollapsed, setGroupCollapsed] = useState(true);
  const [editingBookmarkId, setEditingBookmarkId] = useState<BookmarkId>();
  const editingBookmark = document.bookmarks.find((bookmark) => bookmark.id === editingBookmarkId);
  const [bookmarkName, setBookmarkName] = useState("");
  const [bookmarkStart, setBookmarkStart] = useState(0);
  const [bookmarkComment, setBookmarkComment] = useState("");
  const bookmarkListRef = useRef<HTMLDivElement>(null);
  const navigateBookmark = (direction: -1 | 1) => {
    const ordered = [...document.bookmarks].sort((left, right) => left.start - right.start);
    if (ordered.length === 0) return;
    const next = direction < 0
      ? [...ordered].reverse().find((bookmark) => bookmark.start < range.start) ?? ordered.at(-1)
      : ordered.find((bookmark) => bookmark.start >= range.end) ?? ordered[0];
    if (next) onNavigateBookmark(next.start);
  };
  const applyBookmark = () => {
    if (!editingBookmark) return;
    onCommand({ id: nextCommandId("bookmark_update"), type: "bookmark.update", bookmarkId: editingBookmark.id, name: bookmarkName, start: bookmarkStart, comment: bookmarkComment });
    setEditingBookmarkId(undefined);
  };
  const applyTimeGroup = () => {
    if (!editingGroup) return;
    onCommand({ id: nextCommandId("time_group_update"), type: "timeGroup.update", timeGroupId: editingGroup.id, name: groupName, start: groupStart, end: groupEnd, comment: groupComment, presentation: { ...(editingGroup.presentation ?? {}), collapsed: groupCollapsed, foldStyle: groupCollapsed ? "axis-break" : "none", foldLabel: groupFoldLabel || groupName } });
    setEditingGroupId(undefined);
  };
  const setBoundary = (key: "start" | "end", value: number) => {
    if (key === "start") onRange({ start: Math.max(0, Math.min(value, range.end - 1)), end: range.end });
    else onRange({ start: range.start, end: Math.min(document.timeline.cycleCount, Math.max(value, range.start + 1)) });
  };
  return <div className="timeline-toolbar" aria-label="Timeline Editor" data-testid="timeline-editor">
    <div className="timeline-subgroup timeline-range-group" data-timeline-group="Range" aria-label="Range commands">
      <label>Start cycle<input aria-label="Timeline range start" type="number" min="0" max={document.timeline.cycleCount - 1} value={range.start} onChange={(event) => setBoundary("start", Number(event.target.value))} /></label>
      <label>End cycle<input aria-label="Timeline range end" type="number" min="1" max={document.timeline.cycleCount} value={range.end} onChange={(event) => setBoundary("end", Number(event.target.value))} /></label>
      <output className="timeline-range-length" data-testid="timeline-selected-length">Length {Math.max(0, range.end - range.start)}</output>
      <b>Range</b>
    </div>
    <div className="timeline-subgroup timeline-insert-group" data-timeline-group="Insert" aria-label="Insert timeline commands">
      <label>Count<input aria-label="Timeline insert count" type="number" min="1" step="1" value={count} onChange={(event) => setCount(Math.max(1, Number(event.target.value)))} /></label>
      <button type="button" data-v1-label="サイクル挿入" onClick={() => onCommand({ id: nextCommandId("timeline_before"), type: "timeline.insert", at: range.start, count })}>Insert before</button>
      <button type="button" data-v1-label="後に挿入" onClick={() => onCommand({ id: nextCommandId("timeline_after"), type: "timeline.insert", at: range.end, count })}>Insert after</button>
      <b>Insert</b>
    </div>
    <div className="timeline-subgroup timeline-range-edit-group" data-timeline-group="Range Edit" aria-label="Range edit commands">
      <label>From<output aria-label="Range edit from">{range.start}</output></label>
      <button type="button" data-v1-label="範囲削除" onClick={() => onCommand({ id: nextCommandId("timeline_delete"), type: "timeline.delete", start: range.start, end: range.end })}>Delete range</button>
      <label>To<input aria-label="Timeline destination" type="number" min="0" max={document.timeline.cycleCount} step="1" value={destination} onChange={(event) => setDestination(Math.max(0, Number(event.target.value)))} /></label>
      <button type="button" data-v1-label="範囲複製" onClick={() => onCommand({ id: nextCommandId("timeline_duplicate"), type: "timeline.duplicateRange", start: range.start, end: range.end, at: destination })}>Duplicate to</button>
      <button type="button" data-v1-label="範囲移動" onClick={() => onCommand({ id: nextCommandId("timeline_move"), type: "timeline.moveRange", start: range.start, end: range.end, to: destination })}>Move to</button>
      <b>Range Edit</b>
    </div>
    <div className="timeline-subgroup timeline-bookmark-group" data-timeline-group="Bookmark" aria-label="Bookmark commands">
      <button type="button" aria-label="Previous bookmark" onClick={() => navigateBookmark(-1)} disabled={document.bookmarks.length === 0}>Previous</button>
      <button type="button" data-v1-label="ブックマーク" onClick={() => onCommand({ id: nextCommandId("marker"), type: "bookmark.create", bookmark: { id: nextEntityId("bookmark", document) as BookmarkId, name: `Marker ${range.start}`, start: range.start } })}>Add marker</button>
      <button type="button" aria-label="Next bookmark" onClick={() => navigateBookmark(1)} disabled={document.bookmarks.length === 0}>Next</button>
      <button type="button" aria-label="List bookmarks" onClick={() => bookmarkListRef.current?.focus()}>List</button>
      <div className="timeline-objects" ref={bookmarkListRef} tabIndex={-1}>
      {document.bookmarks.map((bookmark) => <span className="timeline-bookmark" key={bookmark.id} data-bookmark-id={bookmark.id}><button type="button" data-testid={`bookmark-jump-${bookmark.id}`} onClick={() => onNavigateBookmark(bookmark.start)} title={`Jump to cycle ${bookmark.start}`}>◆ {bookmark.name}</button><button type="button" data-testid={`bookmark-edit-${bookmark.id}`} aria-label={`Edit ${bookmark.name}`} onClick={() => { setEditingBookmarkId(bookmark.id); setBookmarkName(bookmark.name); setBookmarkStart(bookmark.start); setBookmarkComment(bookmark.comment ?? ""); }}>Edit</button><EditorIconButton label={`Delete ${bookmark.name}`} icon="close" onClick={() => onCommand({ id: nextCommandId("marker_delete"), type: "bookmark.delete", bookmarkId: bookmark.id })} /></span>)}
      </div>
      <b>Bookmark</b>
    </div>
    <div className="timeline-subgroup timeline-fold-group" data-timeline-group="Fold / Break" aria-label="Fold and break commands">
      <button type="button" data-v1-label="軸ブレーク" onClick={() => onCommand({ id: nextCommandId("gap"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Gap ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "GAP" } } })}>Axis Break</button>
      <div className="timeline-objects timeline-time-groups">
        {document.timeGroups.map((group) => <span className="timeline-time-group" key={group.id} data-time-group-id={group.id}><button type="button" data-testid={`time-group-edit-${group.id}`} onClick={() => { setEditingGroupId(group.id); setGroupName(group.name); setGroupStart(group.start); setGroupEnd(group.end); setGroupComment(group.comment ?? ""); setGroupFoldLabel(group.presentation?.foldLabel ?? ""); setGroupCollapsed(group.presentation?.collapsed ?? false); }} title={`Edit ${group.name}`}>// {group.name}</button><EditorIconButton label={`Delete ${group.name}`} icon="close" onClick={() => onCommand({ id: nextCommandId("gap_delete"), type: "timeGroup.delete", timeGroupId: group.id })} /></span>)}
      </div>
      <b>Fold / Break</b>
    </div>
    {editingGroup && <form className="time-group-editor" aria-label="Time Group Editor" data-testid="time-group-editor" onSubmit={(event) => { event.preventDefault(); }}><label>Name<input aria-label="Time Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><label>Start<input aria-label="Time Group start" type="number" min="0" max={document.timeline.cycleCount - 1} value={groupStart} onChange={(event) => setGroupStart(Number(event.target.value))} /></label><label>End<input aria-label="Time Group end" type="number" min="1" max={document.timeline.cycleCount} value={groupEnd} onChange={(event) => setGroupEnd(Number(event.target.value))} /></label><label>Comment<input aria-label="Time Group comment" value={groupComment} onChange={(event) => setGroupComment(event.target.value)} /></label><label>Fold label<input aria-label="Time Group fold label" value={groupFoldLabel} onChange={(event) => setGroupFoldLabel(event.target.value)} /></label><label className="check-label"><input aria-label="Time Group collapsed" type="checkbox" checked={groupCollapsed} onChange={(event) => setGroupCollapsed(event.target.checked)} />Collapsed</label><button type="button" data-testid="apply-time-group" onClick={applyTimeGroup}>Apply</button><button type="button" onClick={() => setEditingGroupId(undefined)}>Cancel</button></form>}
    {editingBookmark && <form className="bookmark-editor" aria-label="Bookmark Editor" data-testid="bookmark-editor" onSubmit={(event) => { event.preventDefault(); }}><label>Name<input aria-label="Bookmark name" value={bookmarkName} onChange={(event) => setBookmarkName(event.target.value)} /></label><label>Cycle<input aria-label="Bookmark cycle" type="number" min="0" max={document.timeline.cycleCount - 1} value={bookmarkStart} onChange={(event) => setBookmarkStart(Number(event.target.value))} /></label><label>Comment<input aria-label="Bookmark comment" value={bookmarkComment} onChange={(event) => setBookmarkComment(event.target.value)} /></label><button type="button" data-testid="apply-bookmark" onClick={applyBookmark}>Apply</button><button type="button" onClick={() => setEditingBookmarkId(undefined)}>Cancel</button></form>}
  </div>;
}

interface SignalEditorProps {
  readonly signal: Signal | undefined;
  readonly cycleCount: number;
  readonly history: HistoryState;
  readonly groups: readonly SignalGroup[];
  readonly problem: string;
  readonly onCommand: (command: SemanticCommand) => CommandResult;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onVisibility: (signalId: SignalId, visible: boolean) => void;
  readonly onDelete: () => void;
  readonly onDuplicate: (signalId: SignalId) => void;
  readonly onDropToGroup: (kind: "signal" | "group", id: string, targetGroupId: GroupId) => void;
  readonly onCancel: () => void;
}

function SignalEditor({ signal, cycleCount, history, groups, problem, onCommand, onUndo, onRedo, onVisibility, onDelete, onDuplicate, onDropToGroup, onCancel }: SignalEditorProps) {
  const [name, setName] = useState(signal?.display.name ?? "");
  const [role, setRole] = useState<SignalRole>(signal?.role ?? "internal");
  const [signalType, setSignalType] = useState<ValueSignal["type"]>(signal?.type === "clock" || signal?.type === "commentRow" ? "binary" : signal?.type ?? "binary");
  const [width, setWidth] = useState(signal?.type === "bus" ? signal.width ?? 1 : 1);
  const [format, setFormat] = useState<"hex" | "binary" | "symbolic">(signal?.type === "bus" ? signal.displayFormat ?? "hex" : "hex");
  const [spacingBefore, setSpacingBefore] = useState(signal?.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal?.spacingAfter ?? 0);
  return <section className="signal-editor" aria-label="Signal Editor" data-testid="signal-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <div className="editor-tabbar">
      <button type="button" className="editor-tab active">Signal</button>
      <span className="editor-selection">{signal ? `${signal.display.name} · ${signal.type}` : "Select a signal to edit"}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
      {signal && <><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="button" onClick={() => onVisibility(signal.id, signal.display.visible === false)} data-testid="signal-visibility">{signal.display.visible === false ? "Show signal" : "Hide signal"}</button><button type="button" className="danger" onClick={onDelete} data-testid="signal-delete">Delete signal</button></>}
    </div>
    <div className="group-drop-targets" role="list" aria-label="Signal groups">
      <span>Drop into group</span>
      {groups.map((group) => <button
        type="button"
        role="listitem"
        key={group.id}
        data-group-target={group.id}
        onDragOver={(event) => { event.preventDefault(); event.currentTarget.dataset.dropActive = "true"; }}
        onDragLeave={(event) => { delete event.currentTarget.dataset.dropActive; }}
        onDrop={(event) => {
          event.preventDefault();
          delete event.currentTarget.dataset.dropActive;
          const payload = event.dataTransfer.getData("text/plain");
          const separator = payload.indexOf(":");
          const kind = payload.slice(0, separator);
          if (separator > 0 && (kind === "signal" || kind === "group")) onDropToGroup(kind, payload.slice(separator + 1), group.id);
        }}
      >{group.name}<small>{group.rows.length}</small></button>)}
    </div>
    {problem && <div className="editor-problem" role="alert" data-testid="editor-problem">{problem}</div>}
    {!signal ? <div className="editor-empty">Choose a row in Signal Tree or Role / Signal to open its canonical data.</div> : <>
      <form className="signal-properties" onSubmit={(event) => {
        event.preventDefault();
        onCommand({ id: nextCommandId("properties"), type: "signal.updateProperties", signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}), spacingBefore, spacingAfter });
      }}>
        <label>Name<InlineNameInput value={signal?.display.name ?? ""} ariaLabel="Signal name" onRename={(nextName) => signal ? onCommand({ id: nextCommandId("bottom_signal_rename"), type: "signal.rename", signalId: signal.id, name: nextName }) : { ok: false, reason: "no-op", problems: [] }} onCommitted={setName} /></label>
        <label>Role<select aria-label="Signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Logic</option><option value="event">Event</option><option value="pulse">Pulse</option></select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Display<select aria-label="Bus display format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label></>}
        {signal.type !== "commentRow" && <><label>Spacing Before<input aria-label="Signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label></>}
        <button type="submit" data-testid="save-signal-properties">Apply properties</button>
      </form>
      {signal.type === "clock" ? <ClockGeneratorEditor signal={signal} onCommand={onCommand} onDuplicate={onDuplicate} /> : signal.type === "commentRow" ? <CommentRowEditor signal={signal} onCommand={onCommand} onCancel={onCancel} nextCommandId={nextCommandId} /> : <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} />}
    </>}
  </section>;
}
