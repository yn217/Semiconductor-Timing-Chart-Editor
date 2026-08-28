import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type SnapKind } from "@timing-chart-v2/geometry";
import { CommandHistorySession, type HistoryState } from "@timing-chart-v2/history";
import { DeterministicExportService } from "@timing-chart-v2/export";
import { buildDisplayTimeMapping, buildHardwareHierarchyEntries, DefaultProjectionService, hardwareHierarchyScopes, remapValueChangesToDisplay, type HardwareHierarchyView, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { StableTimingChartRenderer, type AnnotationOverlayPrimitive, type EdgeCounterOverlayPrimitive, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { parseDocument, serializeCanonicalDocument, validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { Annotation, AnnotationId, AnnotationType, BookmarkId, CanonicalDocument, ClockGenerator, ClockSignal, CommandId, CommentRow, DocumentProblem, EdgeCounterSettings, GroupId, LegendEntry, SemanticAnchor, Signal, SignalGroup, SignalId, SignalRole, SpacerId, SpacerRow, TimeGroupId, Transaction, TransactionId, ValueSignal } from "@timing-chart-v2/schema";
import { mayRouteGlobalShortcut, resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import { ProductionWaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";

const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;
const spacerId = (value: string) => value as SpacerId;

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
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<SignalId | undefined>(() => visualReference ? signalId("sig_cycle_clock") : undefined);
  const [selectedSignalIds, setSelectedSignalIds] = useState<ReadonlySet<SignalId>>(() => visualReference ? new Set([signalId("sig_cycle_clock")]) : new Set());
  const selectedSignalRef = useRef<SignalId | undefined>(undefined);
  const selectedSignalIdsRef = useRef<ReadonlySet<SignalId>>(new Set());
  selectedSignalIdsRef.current = selectedSignalIds;
  selectedSignalRef.current = selectedId;
  const [selectedGroupId, setSelectedGroupId] = useState<GroupId | undefined>();
  const selectedGroupRef = useRef<GroupId | undefined>(undefined);
  selectedGroupRef.current = selectedGroupId;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<AnnotationId | undefined>();
  const selectedAnnotationRef = useRef<AnnotationId | undefined>(undefined);
  selectedAnnotationRef.current = selectedAnnotationId;
  const [selectedTransactionId, setSelectedTransactionId] = useState<TransactionId | undefined>();
  const selectedTransactionRef = useRef<TransactionId | undefined>(undefined);
  selectedTransactionRef.current = selectedTransactionId;
  const [snapshot, setSnapshot] = useState<CanonicalSnapshot>({ revision: 0, document: initialDocument });
  const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, dirty: false });
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
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [bottomTab, setBottomTab] = useState<"Signal" | "Annotation" | "Transaction" | "Problems" | "JSON">("Signal");
  const [viewMode, setViewMode] = useState<"Cycle" | "Transaction" | "Split">("Cycle");
  const [followSelection, setFollowSelection] = useState(true);
  const followSelectionRef = useRef(true);
  followSelectionRef.current = followSelection;
  const [bottomPinned, setBottomPinned] = useState(false);
  const bottomPinnedRef = useRef(false);
  bottomPinnedRef.current = bottomPinned;
  const [pinnedBottomSelection, setPinnedBottomSelection] = useState<{ readonly signalId?: SignalId; readonly annotationId?: AnnotationId; readonly transactionId?: TransactionId }>();
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => visualReference ? 265 : 330);
  const leftPaneResizeRef = useRef<{ readonly startX: number; readonly startWidth: number } | undefined>(undefined);
  const [frozenPaneWidth, setFrozenPaneWidth] = useState(() => visualReference ? 209 : 210);
  const frozenPaneResizeRef = useRef<{ readonly startX: number; readonly startWidth: number } | undefined>(undefined);
  const [inspectorWidth, setInspectorWidth] = useState(() => visualReference ? 297 : 300);
  const inspectorResizeRef = useRef<{ readonly startX: number; readonly startWidth: number } | undefined>(undefined);
  const [bottomVisible, setBottomVisible] = useState(true);
  const [bottomHeight, setBottomHeight] = useState(() => visualReference ? 240 : 270);
  const bottomResizeRef = useRef<{ readonly startY: number; readonly startHeight: number } | undefined>(undefined);
  const [propertiesVisible, setPropertiesVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [hierarchyVisible, setHierarchyVisible] = useState(false);
  const [bulkRegistrationVisible, setBulkRegistrationVisible] = useState(false);
  const [bulkRegistrationText, setBulkRegistrationText] = useState("dut.status binary\ndut.data[7:0] bus\n");
  const [bulkRegistrationGroupId, setBulkRegistrationGroupId] = useState<GroupId | undefined>();
  const [bulkRegistrationStatus, setBulkRegistrationStatus] = useState("");
  const [treeFilter, setTreeFilter] = useState("");
  const [treeAddMenuOpen, setTreeAddMenuOpen] = useState(false);
  const [treeMoreMenuOpen, setTreeMoreMenuOpen] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<GroupId>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ readonly x: number; readonly y: number; readonly target: "signal" | "annotation" } | undefined>();
  const clipboardSignalRef = useRef<Signal | undefined>(undefined);
  const clipboardSignalsRef = useRef<readonly { readonly signal: Signal; readonly groupId: GroupId; readonly index: number }[]>([]);
  const clipboardGroupRef = useRef<{ readonly group: SignalGroup; readonly rows: readonly Signal[]; readonly sourceIndex: number } | undefined>(undefined);
  const clipboardAnnotationRef = useRef<Annotation | undefined>(undefined);
  const copySelectedSignalRef = useRef<() => void>(() => undefined);
  const cutSelectedSignalRef = useRef<() => void>(() => undefined);
  const pasteSelectedSignalRef = useRef<() => void>(() => undefined);
  const [clipboardStatus, setClipboardStatus] = useState("Empty");
  const [clipboardAvailable, setClipboardAvailable] = useState(false);
  const commandRegistry = useRef(new UiCommandRegistry());
  const [timelineRange, setTimelineRange] = useState(() => visualReference ? { start: 0, end: 1 } : { start: 2, end: 4 });
  const [selectedCycle, setSelectedCycle] = useState(() => visualReference ? 0 : 2);
  const selectedCycleRef = useRef(selectedCycle);
  selectedCycleRef.current = selectedCycle;
  const refreshPlayhead = useRef<() => void>(() => undefined);
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
  const selectedAnnotation = snapshot.document.annotations.find((annotation) => annotation.id === selectedAnnotationId);
  const selectedTransaction = snapshot.document.transactions.find((transaction) => transaction.id === selectedTransactionId);
  const bottomSignal = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.signalId === undefined ? undefined : snapshot.document.signals.find((item) => item.id === pinnedBottomSelection.signalId)) : selectedSignal;
  const bottomAnnotation = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.annotationId === undefined ? undefined : snapshot.document.annotations.find((item) => item.id === pinnedBottomSelection.annotationId)) : selectedAnnotation;
  const bottomTransaction = bottomPinned && pinnedBottomSelection ? (pinnedBottomSelection.transactionId === undefined ? undefined : snapshot.document.transactions.find((item) => item.id === pinnedBottomSelection.transactionId)) : selectedTransaction;
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const query = treeFilter.trim().toLocaleLowerCase();
    let matches = 0;
    for (const row of root.querySelectorAll<HTMLElement>("[data-role='left-row'], [data-role='frozen-row'], [data-role='timing-row']")) {
      const text = [row.dataset.name, row.dataset.fullPath, row.dataset.instancePath, row.dataset.signalRole, row.dataset.groupName].filter(Boolean).join(" ").toLocaleLowerCase();
      const visible = query.length === 0 || text.includes(query);
      row.hidden = !visible;
      row.dataset.filteredOut = String(!visible);
      if (visible && row.dataset.kind === "timing" && row.dataset.role === "left-row") matches += 1;
    }
    root.dataset.treeFilter = treeFilter;
    root.dataset.treeFilterMatches = String(matches);
  }, [snapshot.revision, treeFilter]);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    for (const row of root.querySelectorAll<HTMLElement>("[data-role='left-row'], [data-role='frozen-row'], [data-role='timing-row'], [data-role='wave-owner']")) {
      const collapsed = row.dataset.groupId !== undefined && collapsedGroupIds.has(row.dataset.groupId as GroupId) && (row.dataset.role === "wave-owner" || row.dataset.groupStart !== "true");
      row.hidden = collapsed;
      row.dataset.groupCollapsed = String(collapsed);
    }
    root.dataset.collapsedGroups = [...collapsedGroupIds].join(",");
  }, [snapshot.revision, collapsedGroupIds]);
  const diagnostics = [...validationDiagnostics, ...runtimeDiagnostics];
  const waveDromHasError = runtimeDiagnostics.some((item) => item.code === "WAVE_RENDER_ERROR");

  useEffect(() => {
    const registry = commandRegistry.current;
    const unregister = [
      registry.register<SemanticCommand>("semantic.execute", (command) => execute.current(command)),
      registry.register("selection.delete", () => {
        const annotationId = selectedAnnotationRef.current;
        const signalId = selectedSignalRef.current;
        const transactionId = selectedTransactionRef.current;
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
    for (const tick of rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")) {
      const cycle = Number(tick.dataset.cycle);
      tick.dataset.rangeSelected = String(cycle >= timelineRange.start && cycle < timelineRange.end);
    }
  }, [timelineRange, snapshot.revision]);

  useEffect(() => {
    const rendererHost = host.current;
    const viewportElement = viewport.current;
    if (!rendererHost || !viewportElement) return;
    const baseWidth = visualReference
      ? Math.max(160, globalThis.innerWidth - leftPaneWidth - inspectorWidth - frozenPaneWidth)
      : Number.parseFloat(getComputedStyle(viewportElement).getPropertyValue("--wave-width")) || 640;
    const width = leftPaneWidth + frozenPaneWidth + baseWidth * zoom;
    rendererHost.style.width = `${width}px`;
    rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.style.setProperty("width", `${width}px`);
  }, [frozenPaneWidth, inspectorWidth, leftPaneWidth, visualReference, zoom]);

  useEffect(() => {
    const rendererHost = host.current;
    const viewportElement = viewport.current;
    const rulerElement = ruler.current;
    const gridElement = gridLayer.current;
    if (!rendererHost || !viewportElement || !rulerElement || !gridElement) return;

    let session = new CommandHistorySession(initialDocument);
    const adapter = new ProductionWaveDromAdapter();
    const projectionService = new DefaultProjectionService();
    let referenceGeometry: LocalGeometryMap | undefined;
    const geometryMaps = new Map<SignalId, LocalGeometryMap>();
    const provider: WaveformSurfaceProvider = {
      async mountWave(id, owner) {
        const document = session.getSnapshot().document;
        const signal = document.signals.find((candidate) => candidate.id === id);
        if (!signal) throw new Error(`Signal '${id}' is missing.`);
        const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
        const displaySignal = signal.type === "commentRow" ? signal
          : signal.type === "clock" ? { ...signal, ...(signal.enable ? { enable: remapValueChangesToDisplay(signal.enable, mapping) } : {}) }
          : { ...signal, values: remapValueChangesToDisplay(signal.values, mapping) };
        try {
          const rendered = await adapter.renderWave(id, adapter.toWaveJson({ signal: displaySignal, cycleCount: mapping.displayCycleCount }), owner);
          const geometry = adapter.extractLocalGeometry(rendered);
          geometryMaps.set(id, geometry);
          if (id === document.timeline.referenceClock) referenceGeometry = geometry;
          return { waveDromRenders: 1, localGeometryBuilds: 1 };
        } catch (error) {
          geometryMaps.delete(id);
          if (id === document.timeline.referenceClock) referenceGeometry = undefined;
          throw error;
        }
      },
      disposeWave(id) {
        adapter.dispose(id);
        geometryMaps.delete(id);
        if (id === session.getSnapshot().document.timeline.referenceClock) referenceGeometry = undefined;
      },
    };
    const renderer = new StableTimingChartRenderer(provider);
    const snapService = new SemanticSnapCandidateService();
    let snapIndex: ImmutableSnapIndex | undefined;
    const currentSnapIndex = () => {
      if (!snapIndex) {
        snapIndex = buildSnapIndex(session.getSnapshot().document, projection, geometryMaps, snapService);
        publishState();
      }
      return snapIndex;
    };
    renderer.mount(rendererHost);
    const initialSnapshot = session.getSnapshot();
    let window: VirtualizationWindow = viewportWindow(viewportElement, initialSnapshot.document.timeline.referenceClock);
    let projection: RenderProjection = projectionService.project({ snapshot: initialSnapshot, changeSet: { fullDocumentReplace: true }, viewport: window });
    renderer.update(projection);
    const refreshOverlays = (document: CanonicalDocument) => {
      renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps));
      renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, timelineRangeRef.current, selectedCycleRef.current));
      for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-annotation-id]")) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationRef.current);
    };
    const refreshGrid = (document: CanonicalDocument) => {
      renderGeometryGrid(gridElement, referenceGeometry, document, document.timeline.referenceClock, gridEnabledRef.current, projection.totalHeight, visualReference ? Math.max(160, globalThis.innerWidth - leftPaneWidth - inspectorWidth - frozenPaneWidth) : undefined);
    };
    refreshPlayhead.current = () => {
      const cycle = selectedCycleRef.current;
      const tick = rulerElement.querySelector<HTMLElement>(`[data-cycle='${cycle}']`);
      let playhead = rulerElement.querySelector<HTMLElement>("[data-role='playhead']");
      if (!tick) {
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
      playhead.style.left = tick.style.left;
    };
    const refreshRangePreview = () => {
      const preview = rendererHost.dataset.rangePreview;
      let element = rulerElement.querySelector<HTMLElement>("[data-role='range-preview']");
      if (!preview) {
        element?.remove();
        return;
      }
      const [startText, endText] = preview.split(":");
      const start = Number(startText);
      const end = Number(endText);
      const startTick = rulerElement.querySelector<HTMLElement>(`[data-cycle='${start}']`);
      const endTick = rulerElement.querySelector<HTMLElement>(`[data-cycle='${end}']`);
      if (!startTick || !endTick || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
        element?.remove();
        return;
      }
      if (!element) {
        element = rulerElement.ownerDocument.createElement("span");
        element.dataset.role = "range-preview";
        element.dataset.testid = "range-preview";
        element.setAttribute("aria-hidden", "true");
        rulerElement.append(element);
      }
      element.dataset.rangeStart = String(start);
      element.dataset.rangeEnd = String(end);
      element.style.left = startTick.style.left;
      element.style.width = `${Math.max(1, endTick.offsetLeft - startTick.offsetLeft)}px`;
    };

    const publishState = () => {
      rendererHost.dataset.canonicalRevision = String(session.getSnapshot().revision);
      rendererHost.dataset.historyDepth = String(session.historyState().undoDepth);
      rendererHost.dataset.sessionCounters = JSON.stringify({ ...session.metrics(), ...session.historyMetrics(), ...projectionService.diagnostics(), snapIndexBuilds: snapService.metrics().builds, snapCandidateCount: snapService.metrics().candidateCount, waveAdapter: adapter.metrics() });
    };
    let currentZoom = 1;
    const timelineOffset = () => (Number.parseFloat(getComputedStyle(viewportElement).getPropertyValue("--gui-left-width")) || 330) + (Number.parseFloat(getComputedStyle(viewportElement).getPropertyValue("--gui-frozen-width")) || 210);
    const applyZoom = (next: number) => {
      currentZoom = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
      const scalable = [rulerElement, gridElement, ...rendererHost.querySelectorAll<HTMLElement>("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']")];
      for (const element of scalable) {
        element.style.transformOrigin = "0 0";
        element.style.scale = `${currentZoom} 1`;
      }
      viewportElement.style.setProperty("--zoom-x", String(currentZoom));
      const baseWidth = visualReference
        ? Math.max(160, globalThis.innerWidth - leftPaneWidth - inspectorWidth - frozenPaneWidth)
        : Number.parseFloat(getComputedStyle(viewportElement).getPropertyValue("--wave-width")) || 640;
      const width = timelineOffset() + baseWidth * currentZoom;
      rendererHost.style.width = `${width}px`;
      rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.style.setProperty("width", `${width}px`);
      rendererHost.dataset.zoom = String(currentZoom);
      setZoom(currentZoom);
    };
    changeZoom.current = (delta) => applyZoom(currentZoom + delta);
    setZoomAbsolute.current = (zoom) => applyZoom(zoom);
    fitSelection.current = () => {
      const selected = timelineRangeRef.current;
      const startTick = rulerElement.querySelector<HTMLElement>(`[data-cycle='${selected.start}']`);
      const endTick = rulerElement.querySelector<HTMLElement>(`[data-cycle='${selected.end}']`);
      const start = startTick?.offsetLeft ?? 0;
      const end = endTick?.offsetLeft ?? start + 1;
      const span = Math.max(1, end - start);
      const available = Math.max(160, viewportElement.clientWidth - timelineOffset() - 20);
      applyZoom(available / span);
      requestAnimationFrame(() => { viewportElement.scrollLeft = Math.max(0, Math.round(start * currentZoom - timelineOffset())); });
    };
    fitAll.current = () => {
      const startTick = rulerElement.querySelector<HTMLElement>("[data-cycle='0']");
      const endTick = rulerElement.querySelector<HTMLElement>(`[data-cycle='${session.getSnapshot().document.timeline.cycleCount}']`);
      const start = startTick?.offsetLeft ?? 0;
      const end = endTick?.offsetLeft ?? start + 1;
      const span = Math.max(1, end - start);
      const available = Math.max(160, viewportElement.clientWidth - timelineOffset() - 20);
      applyZoom(available / span);
      requestAnimationFrame(() => { viewportElement.scrollLeft = 0; });
    };
    navigateToCycle.current = (cycle) => {
      const document = session.getSnapshot().document;
      if (!Number.isInteger(cycle) || cycle < 0 || cycle > document.timeline.cycleCount) return;
      const tick = rulerElement.querySelector<HTMLElement>(`[data-cycle='${cycle}']`);
      if (!tick) return;
      setSelectedCycle(cycle);
      rendererHost.dataset.selectedCycle = String(cycle);
      if (cycle === document.timeline.cycleCount) setTimelineRange({ start: Math.max(0, cycle - 1), end: cycle });
      else setTimelineRange({ start: cycle, end: cycle + 1 });
      requestAnimationFrame(() => {
        const target = Math.max(0, Math.round(tick.offsetLeft * currentZoom - Math.max(0, viewportElement.clientWidth * 0.35)));
        viewportElement.scrollLeft = target;
      });
      publishState();
    };
    snapTransactionCycle.current = (clientX) => {
      const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
      const referenceId = session.getSnapshot().document.timeline.referenceClock;
      const referenceRow = referenceId ? projection.rowLayout.find((row) => row.rowId === referenceId) : undefined;
      if (!waveLayer || !referenceRow) return undefined;
      const bounds = waveLayer.getBoundingClientRect();
      if (!snapEnabledRef.current) return cycleBoundaryAtX(clientX);
      const snap = currentSnapIndex().nearest({ x: (clientX - bounds.left) / currentZoom, y: referenceRow.y + session.getSnapshot().document.layout.rowHeight / 2 }, 14 / currentZoom, ["cycle-boundary", "clock-edge", "signal-transition", "bus-transition", "marker", "annotation"]);
      return snap?.anchor.cycle;
    };
    publishState();

    void renderer.whenIdle().then(() => {
      if (!rendererHost.isConnected) return;
      buildRuler(rulerElement, referenceGeometry, session.getSnapshot().document, session.getSnapshot().document.timeline.referenceClock, visualReference ? Math.max(160, globalThis.innerWidth - leftPaneWidth - inspectorWidth - frozenPaneWidth) : undefined);
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
      }));
      setRuntimeDiagnostics((current) => [...current.filter((item) => item.code !== "WAVE_RENDER_ERROR"), ...failed]);
      if (failed.length > 0) setProblem(failed[0]!.message);
    };

    const applyResult = (result: ReturnType<CommandHistorySession["execute"]>) => {
      if (!result.ok) {
        setProblem(result.reason === "no-op" ? "" : result.problems.map((item) => item.message).join(" "));
        upsertDiagnostic((item) => item.code === "COMMAND_REJECTED", result.reason === "no-op" ? undefined : { code: "COMMAND_REJECTED", path: "$", message: result.problems.map((item) => item.message).join(" ") });
        return;
      }
      delete rendererHost.dataset.editorIdle;
      projection = projectionService.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: window, previous: projection });
      snapIndex = undefined;
      const changed = result.changeSet;
      const referenceSignalId = result.snapshot.document.timeline.referenceClock;
      const referenceWaveChanged = referenceSignalId !== undefined && (changed.fullDocumentReplace === true || changed.timelineSemantics === true || changed.timeGroupSemantics !== undefined || changed.waveSemantics?.includes(referenceSignalId) === true || changed.geometryLocal?.includes(referenceSignalId) === true);
      const refreshRuler = changed.fullDocumentReplace === true || changed.timelineSemantics === true || changed.timeGroupSemantics !== undefined || changed.bookmarkPosition !== undefined || referenceWaveChanged;
      const refreshGridNow = changed.fullDocumentReplace === true || changed.timelineSemantics === true || changed.timeGroupSemantics !== undefined || referenceWaveChanged;
      const refreshOverlaysNow = refreshRuler || changed.rowOrder !== undefined || changed.rowPresentation !== undefined || changed.geometryScreenY !== undefined || changed.annotationPosition !== undefined || changed.annotationStyle !== undefined || changed.addedSignals !== undefined || changed.removedSignals !== undefined;
      renderer.update(projection);
      setSnapshot(result.snapshot);
      setValidationDiagnostics([]);
      setTimelineRange((range) => {
        const start = Math.min(range.start, result.snapshot.document.timeline.cycleCount - 1);
        return { start, end: Math.max(start + 1, Math.min(range.end, result.snapshot.document.timeline.cycleCount)) };
      });
      setHistory(session.historyState());
      setProblem("");
      upsertDiagnostic((item) => item.code === "COMMAND_REJECTED", undefined);
      publishState();
      void renderer.whenIdle().then(() => {
        if (!rendererHost.isConnected) return;
        if (refreshRuler) buildRuler(rulerElement, referenceGeometry, result.snapshot.document, result.snapshot.document.timeline.referenceClock, visualReference ? Math.max(160, globalThis.innerWidth - leftPaneWidth - inspectorWidth - frozenPaneWidth) : undefined);
        refreshPlayhead.current();
        if (refreshGridNow) refreshGrid(result.snapshot.document);
        applyZoom(currentZoom);
        if (refreshOverlaysNow) refreshOverlays(result.snapshot.document);
        collectWaveErrors();
        publishState();
        rendererHost.dataset.editorIdle = "true";
      });
    };
    execute.current = (command) => { const result = session.execute(command); applyResult(result); return result; };
    executeBatch.current = (id, commands) => { const result = session.executeBatch(id, commands); applyResult(result); return result; };
    undo.current = () => applyResult(session.undo());
    redo.current = () => applyResult(session.redo());
    const replaceDocument = (document: CanonicalDocument, migrationWarnings: readonly { code: string; path: string; message: string }[] = []) => {
      delete rendererHost.dataset.editorIdle;
      session = new CommandHistorySession(document);
      geometryMaps.clear();
      snapIndex = undefined;
      referenceGeometry = undefined;
      window = viewportWindow(viewportElement, document.timeline.referenceClock);
      projection = projectionService.project({ snapshot: session.getSnapshot(), changeSet: { fullDocumentReplace: true }, viewport: window });
      renderer.update(projection);
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
        buildRuler(rulerElement, referenceGeometry, session.getSnapshot().document, session.getSnapshot().document.timeline.referenceClock, visualReference ? Math.max(160, globalThis.innerWidth - leftPaneWidth - inspectorWidth - frozenPaneWidth) : undefined);
        refreshPlayhead.current();
        refreshGrid(session.getSnapshot().document);
        applyZoom(currentZoom);
        refreshOverlays(session.getSnapshot().document);
        collectWaveErrors();
        publishState();
        rendererHost.dataset.editorIdle = "true";
      });
    };
    openDocument.current = (text) => {
      const parsed = parseDocument(text);
      if (!parsed.ok) {
        setProblem(parsed.problems.map((item) => item.message).join(" "));
        upsertDiagnostic((item) => item.code === "OPEN_FAILED", { code: "OPEN_FAILED", path: "$", message: parsed.problems.map((item) => item.message).join(" ") });
        return;
      }
      replaceDocument(parsed.document, parsed.warnings);
    };
    newDocument.current = () => replaceDocument({ ...cycleDocument, document: { ...cycleDocument.document, id: `document_${Date.now()}`, title: "Untitled Timing Chart" }, annotations: [], bookmarks: [], timeGroups: [], transactions: [] });
    saveDocument.current = () => {
      try {
        const text = serializeCanonicalDocument(session.getSnapshot().document);
        localStorage.setItem("timing-chart-v2.recent", text);
        session.markClean();
        setHistory(session.historyState());
        return text;
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "Save failed.");
        return undefined;
      }
    };

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = viewportWindow(viewportElement, session.getSnapshot().document.timeline.referenceClock);
        if (next.viewportStartY === window.viewportStartY && next.viewportEndY === window.viewportEndY) return;
        window = next;
        projection = projectionService.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport: window, previous: projection });
        snapIndex = undefined;
        renderer.update(projection);
        rendererHost.dataset.viewportStartY = String(window.viewportStartY);
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
    const onSelect = (event: MouseEvent) => {
      const collapseOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='tree-collapse'][data-group-id]") : null;
      if (collapseOwner?.dataset.groupId) {
        event.preventDefault();
        event.stopPropagation();
        const groupId = collapseOwner.dataset.groupId as GroupId;
        setCollapsedGroupIds((current) => { const next = new Set(current); if (next.has(groupId)) next.delete(groupId); else next.add(groupId); return next; });
        return;
      }
      const visibilityOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='tree-visibility'][data-tree-signal-id]") : null;
      if (visibilityOwner?.dataset.treeSignalId) {
        event.preventDefault();
        event.stopPropagation();
        const signalId = visibilityOwner.dataset.treeSignalId as SignalId;
        const signal = session.getSnapshot().document.signals.find((candidate) => candidate.id === signalId);
        if (signal) commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_visibility"), type: "signal.setVisibility", signalId, visible: signal.display.visible === false });
        return;
      }
      const groupOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='tree-branch'][data-group-id]") : null;
      if (groupOwner?.dataset.groupId) {
        setSelectedGroupId(groupOwner.dataset.groupId as GroupId);
        selectedGroupRef.current = groupOwner.dataset.groupId as GroupId;
        setSelectedId(undefined);
        selectedSignalRef.current = undefined;
        selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set());
        setSelectedAnnotationId(undefined);
        selectedAnnotationRef.current = undefined;
        setSelectedTransactionId(undefined);
        selectedTransactionRef.current = undefined;
        return;
      }
      const annotationOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]") : null;
      if (annotationOwner?.dataset.annotationId) {
        const id = annotationOwner.dataset.annotationId as AnnotationId;
        selectedAnnotationRef.current = id;
        setSelectedAnnotationId(id);
        setSelectedId(undefined);
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
        const snap = currentSnapIndex().nearest({ x: (event.clientX - bounds.left) / currentZoom, y: event.clientY - bounds.top }, 12 / currentZoom, ["clock-edge", "signal-transition", "bus-transition"]);
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
        commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_transition_arrow"), type: "annotation.create", annotation });
        selectedAnnotationRef.current = annotation.id;
        setSelectedAnnotationId(annotation.id);
        setSelectedId(undefined);
        selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set());
        setSelectedGroupId(undefined);
        setSelectedTransactionId(undefined);
        selectedTransactionRef.current = undefined;
        if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Annotation");
        pendingArrow = undefined;
        setArrowPickStatus("idle");
        delete rendererHost.dataset.arrowPick;
        rendererHost.dataset.snapKind = snap.kind;
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
      const id = target?.dataset.rowId;
      if (!id) return;
      const signal = session.getSnapshot().document.signals.find((candidate) => candidate.id === id);
      if (!signal) return;
      const nextSelected = event.ctrlKey || event.metaKey ? new Set(selectedSignalIdsRef.current) : new Set<SignalId>();
      if (nextSelected.has(signal.id)) nextSelected.delete(signal.id); else nextSelected.add(signal.id);
      if (nextSelected.size === 0) nextSelected.add(signal.id);
      selectedSignalIdsRef.current = nextSelected;
      setSelectedSignalIds(nextSelected);
      const primary = nextSelected.has(signal.id) ? signal.id : [...nextSelected][0];
      for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]")) {
        const rowId = (row.dataset.rowId ?? row.dataset.signalId) as SignalId | undefined;
        const selected = rowId !== undefined && nextSelected.has(rowId);
        row.dataset.selected = String(selected);
        row.setAttribute("aria-selected", String(selected));
      }
      if (primary) { rendererHost.dataset.selectedSignalId = primary; setSelectedId(primary); selectedSignalRef.current = primary; }
      setSelectedGroupId(undefined);
      selectedAnnotationRef.current = undefined;
      setSelectedAnnotationId(undefined);
      selectedTransactionRef.current = undefined;
      setSelectedTransactionId(undefined);
      if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Signal");
      publishState();
    };
    const applyCanvasCycleSelection = (cycle: number, shiftKey: boolean) => {
      const cycleCount = session.getSnapshot().document.timeline.cycleCount;
      if (cycle < 0 || cycle > cycleCount) return false;
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
      if (!(event.target instanceof Element) || !event.target.closest("[data-role='stable-waveform-surface']")) return false;
      const cycle = cycleBoundaryAtX(event.clientX);
      return cycle === undefined ? false : applyCanvasCycleSelection(cycle, event.shiftKey);
    };
    const onRulerSelect = (event: MouseEvent) => {
      const tick = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cycle]") : null;
      if (!tick) return;
      const cycle = Number(tick.dataset.cycle);
      if (!Number.isInteger(cycle) || cycle > session.getSnapshot().document.timeline.cycleCount) return;
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
    let rangeDrag: { readonly start: number; readonly anchor: number; readonly startClientX: number; moved: boolean } | undefined;
    let suppressCanvasClick = false;
    const cycleBoundaryAtX = (clientX: number): number | undefined => {
      const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
      if (!waveLayer) return undefined;
      const bounds = waveLayer.getBoundingClientRect();
      const x = (clientX - bounds.left) / currentZoom;
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
    const rangeFromBoundaries = (first: number, second: number, cycleCount: number) => {
      const start = Math.min(first, second);
      const endBoundary = Math.max(first, second);
      return { start: Math.max(0, Math.min(start, cycleCount - 1)), end: Math.max(1, Math.min(cycleCount, endBoundary > start ? endBoundary : start + 1)) };
    };
    const onRangePointerDown = (event: PointerEvent) => {
      if (rendererHost.dataset.arrowPick) return;
      if (event.button !== 0 || !(event.target instanceof Element) || !event.target.closest("[data-role='stable-waveform-surface']")) return;
      const cycle = cycleBoundaryAtX(event.clientX);
      if (cycle === undefined || cycle > session.getSnapshot().document.timeline.cycleCount) return;
      rangeDrag = { start: cycle, anchor: event.shiftKey ? timelineRangeRef.current.start : cycle, startClientX: event.clientX, moved: false };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onRangePointerMove = (event: PointerEvent) => {
      if (!rangeDrag) return;
      const cycle = cycleBoundaryAtX(event.clientX);
      if (cycle === undefined) return;
      if (!rangeDrag.moved && Math.abs(event.clientX - rangeDrag.startClientX) < 4) return;
      rangeDrag.moved = true;
      rendererHost.dataset.rangePreview = `${Math.min(rangeDrag.anchor, cycle)}:${Math.max(rangeDrag.anchor, cycle)}`;
      rendererHost.dataset.rangeDrag = "active";
      refreshRangePreview();
      event.preventDefault();
    };
    const onRangePointerUp = (event: PointerEvent) => {
      if (!rangeDrag) return;
      const cycle = cycleBoundaryAtX(event.clientX) ?? rangeDrag.start;
      if (!rangeDrag.moved) {
        rangeDrag = undefined;
        delete rendererHost.dataset.rangeDrag;
        delete rendererHost.dataset.rangePreview;
        refreshRangePreview();
        suppressCanvasClick = true;
        const clickCycle = cycleBoundaryAtX(event.clientX);
        if (clickCycle !== undefined) applyCanvasCycleSelection(clickCycle, event.shiftKey);
        requestAnimationFrame(() => { suppressCanvasClick = false; });
        event.preventDefault();
        return;
      }
      const next = rangeFromBoundaries(rangeDrag.anchor, cycle, session.getSnapshot().document.timeline.cycleCount);
      setTimelineRange(next);
      setSelectedCycle(Math.min(next.start, session.getSnapshot().document.timeline.cycleCount));
      rendererHost.dataset.selectedCycle = String(Math.min(next.start, session.getSnapshot().document.timeline.cycleCount));
      delete rendererHost.dataset.rangeDrag;
      delete rendererHost.dataset.rangePreview;
      refreshRangePreview();
      rangeDrag = undefined;
      suppressCanvasClick = true;
      requestAnimationFrame(() => { suppressCanvasClick = false; });
      event.preventDefault();
    };
    const onRangePointerCancel = () => {
      if (!rangeDrag) return;
      rangeDrag = undefined;
      delete rendererHost.dataset.rangeDrag;
      delete rendererHost.dataset.rangePreview;
      refreshRangePreview();
    };
    const onRangeKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !rangeDrag) return;
      rangeDrag = undefined;
      delete rendererHost.dataset.rangeDrag;
      delete rendererHost.dataset.rangePreview;
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
    let annotationDrag: { readonly annotationId: AnnotationId; readonly field?: typeof annotationFields[number]; readonly label: boolean; readonly startX: number; readonly startY: number; readonly owner: HTMLElement; readonly snapIndex?: ImmutableSnapIndex } | undefined;
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
        ...(field ? { field, snapIndex: currentSnapIndex() } : {}),
        label,
        startX: event.clientX,
        startY: event.clientY,
        owner,
      };
      publishState();
      owner.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onAnnotationPointerMove = (event: PointerEvent) => {
      if (!annotationDrag) return;
      const screenDx = Math.round(event.clientX - annotationDrag.startX);
      const dx = Math.round(screenDx / currentZoom);
      const dy = Math.round(event.clientY - annotationDrag.startY);
      annotationDrag.owner.style.translate = `${screenDx}px ${dy}px`;
      if (!annotationDrag.field || annotationDrag.label) return;
      const document = session.getSnapshot().document;
      const annotation = document.annotations.find((item) => item.id === annotationDrag?.annotationId);
      const anchor = annotation?.[annotationDrag.field];
      const point = resolveAnchorPoint(anchor, document, projection, geometryMaps, buildDisplayTimeMapping(document.timeline, document.timeGroups));
      if (!annotation || !anchor || !point) return;
      const desired = { x: point.x + dx, y: point.y + dy };
      const snap = snapEnabledRef.current ? annotationDrag.snapIndex?.nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
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
      rendererHost.dataset.snapDistance = String(Math.round(snap.distance * 100) / 100);
      rendererHost.dataset.snapCycle = String(snap.anchor.cycle);
    };
    const onAnnotationPointerUp = (event: PointerEvent) => {
      const drag = annotationDrag;
      if (!drag) return;
      const dx = Math.round((event.clientX - drag.startX) / currentZoom);
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
      const point = resolveAnchorPoint(anchor, session.getSnapshot().document, projection, geometryMaps, buildDisplayTimeMapping(snapshot.document.timeline, snapshot.document.timeGroups));
      if (!field || !anchor || !point) return;
      const desired = { x: point.x + dx, y: point.y + dy };
      const snap = snapEnabledRef.current ? drag.snapIndex?.nearest(desired, 8 / currentZoom, undefined, preferredSnapKinds(annotation.type)) : undefined;
      const nextAnchor = snap ? withSnapOffset(snap.anchor, desired, snap.point) : withAddedOffset(anchor, dx, dy);
      if (snap) {
        rendererHost.dataset.snapKind = snap.kind;
        rendererHost.dataset.snapDistance = String(snap.distance);
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
      if (!(event.target instanceof Element) || !event.target.closest("[data-row-id], [data-annotation-id]")) return;
      event.preventDefault();
      onSelect(event);
      setContextMenu({ x: event.clientX, y: event.clientY, target: event.target instanceof Element && event.target.closest("[data-annotation-id]") ? "annotation" : "signal" });
    };
    const onCanvasClick = (event: MouseEvent) => { if (suppressCanvasClick) { suppressCanvasClick = false; return; } if (rendererHost.dataset.arrowPick) onSelect(event); else if (!selectCanvasCycle(event)) onSelect(event); };
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
    rulerElement.addEventListener("click", onRulerSelect);
    rendererHost.addEventListener("pointerdown", onAnnotationPointerDown);
    rendererHost.addEventListener("pointermove", onAnnotationPointerMove);
    rendererHost.addEventListener("pointerup", onAnnotationPointerUp);
    rendererHost.addEventListener("pointercancel", clearAnnotationPreview);
    rendererHost.addEventListener("contextmenu", onContextMenu);
    rendererHost.ownerDocument.addEventListener("keydown", onAnnotationKeyDown);
    return () => {
      refreshPlayhead.current = () => undefined;
      navigateToCycle.current = () => undefined;
      cancelAnimationFrame(frame);
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
      rulerElement.removeEventListener("click", onRulerSelect);
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
      renderer.dispose();
    };
  }, []);

  useEffect(() => { refreshPlayhead.current(); }, [selectedCycle, snapshot.revision]);

  useEffect(() => {
    const linked = new Set(selectedTransaction?.linkedSignals ?? []);
    for (const row of host.current?.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]") ?? []) {
      const id = row.dataset.rowId ?? row.dataset.signalId;
      row.dataset.transactionLinked = String(id !== undefined && linked.has(id as SignalId));
    }
  }, [selectedTransactionId, snapshot.revision]);

  const createSelectedAnnotation = (annotation: Annotation) => {
    commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_create"), type: "annotation.create", annotation });
    selectedAnnotationRef.current = annotation.id;
    setSelectedAnnotationId(annotation.id);
    setSelectedId(undefined);
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
    if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Annotation");
  };
  const signalEditor = <SignalEditor
    key={`${bottomSignal?.id ?? "none"}:${snapshot.revision}`}
    signal={bottomSignal}
    cycleCount={snapshot.document.timeline.cycleCount}
    history={history}
    groups={snapshot.document.signalGroups}
    problem={problem}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onVisibility={(_signalId, visible) => commandRegistry.current.execute("selection.visibility", { visible })}
    onDuplicate={() => { if (bottomSignal) createCopiedSignals(selectedClipboardSignals(), "duplicate"); }}
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
    key={`${bottomAnnotation.id}:${snapshot.revision}`}
    annotation={bottomAnnotation}
    annotations={snapshot.document.annotations}
    document={snapshot.document}
    history={history}
    problem={problem}
    onSelect={selectAnnotation}
    onCreate={(type) => { if (annotationTargetSignalId) createSelectedAnnotation(createAnnotation(type, annotationTargetSignalId, timelineRange, snapshot.document)); }}
    onDuplicate={(source) => {
      const duplicate = { ...source, id: nextEntityId("annotation", snapshot.document) as AnnotationId };
      commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_duplicate"), type: "annotation.create", annotation: duplicate });
      selectAnnotation(duplicate.id);
    }}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={() => commandRegistry.current.execute("selection.delete")}
  /> : <><AnnotationList annotations={snapshot.document.annotations} selectedId={undefined} onSelect={selectAnnotation} /><div className="empty-editor">Select or create an Annotation.</div></>;
  const selectTransaction = (id: TransactionId) => {
    selectedTransactionRef.current = id;
    setSelectedTransactionId(id);
    selectedSignalRef.current = undefined; setSelectedId(undefined);
    selectedGroupRef.current = undefined; setSelectedGroupId(undefined);
    selectedAnnotationRef.current = undefined; setSelectedAnnotationId(undefined);
    if (followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Transaction");
  };
  const transactionEditor = <TransactionEditor
    key={`${bottomTransaction?.id ?? "none"}:${snapshot.revision}`}
    transaction={bottomTransaction}
    document={snapshot.document}
    history={history}
    onSelect={selectTransaction}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
  />;
  const navigateProblem = (path: string) => {
    const target = resolveProblemTarget(path, snapshot.document);
    setSelectedId(target.kind === "signal" ? target.id as SignalId : undefined);
    selectedSignalRef.current = target.kind === "signal" ? target.id as SignalId : undefined;
    setSelectedGroupId(target.kind === "group" ? target.id as GroupId : undefined);
    selectedGroupRef.current = target.kind === "group" ? target.id as GroupId : undefined;
    setSelectedAnnotationId(target.kind === "annotation" ? target.id as AnnotationId : undefined);
    selectedAnnotationRef.current = target.kind === "annotation" ? target.id as AnnotationId : undefined;
    setSelectedTransactionId(target.kind === "transaction" ? target.id as TransactionId : undefined);
    selectedTransactionRef.current = target.kind === "transaction" ? target.id as TransactionId : undefined;
    if (target.kind === "annotation" && followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Annotation");
    if (target.kind === "transaction" && followSelectionRef.current && !bottomPinnedRef.current) setBottomTab("Transaction");
    if (target.kind === "timeline") viewport.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  const clearSelection = () => {
    selectedSignalRef.current = undefined; setSelectedId(undefined); selectedSignalIdsRef.current = new Set(); setSelectedSignalIds(new Set());
    selectedGroupRef.current = undefined; setSelectedGroupId(undefined);
    selectedAnnotationRef.current = undefined; setSelectedAnnotationId(undefined);
    selectedTransactionRef.current = undefined; setSelectedTransactionId(undefined);
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
        rendererHost.dataset.selectedSignalId = primary;
        for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]")) {
          const rowId = (row.dataset.rowId ?? row.dataset.signalId) as SignalId | undefined;
          row.dataset.selected = String(rowId !== undefined && selected.has(rowId));
          row.setAttribute("aria-selected", String(rowId !== undefined && selected.has(rowId)));
        }
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
    if (selectedGroup) {
      const rows = selectedGroup.rows.flatMap((rowId) => snapshot.document.signals.find((signal) => signal.id === rowId) ?? []);
      clipboardGroupRef.current = { group: selectedGroup, rows, sourceIndex: snapshot.document.signalGroups.indexOf(selectedGroup) };
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      clipboardAnnotationRef.current = undefined;
      setClipboardAvailable(true);
      setClipboardStatus(`Copied ${selectedGroup.name} group`);
      return;
    }
    const sources = selectedClipboardSignals();
    const annotation = selectedAnnotationRef.current === undefined ? undefined : snapshot.document.annotations.find((item) => item.id === selectedAnnotationRef.current);
    if (sources.length === 0 && annotation === undefined) { setClipboardStatus("Select a signal, Comment Row, or Annotation to copy"); return; }
    if (annotation !== undefined && sources.length === 0) {
      clipboardAnnotationRef.current = annotation;
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
      setClipboardAvailable(true);
      setClipboardStatus(`Copied ${annotation.label || annotation.type} annotation`);
      return;
    }
    clipboardAnnotationRef.current = undefined;
    clipboardGroupRef.current = undefined;
    clipboardSignalsRef.current = sources;
    clipboardSignalRef.current = sources[0]?.signal;
    setClipboardAvailable(true);
    setClipboardStatus(sources.length === 1 ? `Copied ${sources[0]!.signal.display.name}` : `Copied ${sources.length} signals`);
  };
  copySelectedSignalRef.current = copySelectedSignal;
  const cutSelectedSignal = () => {
    const selectedGroup = selectedGroupRef.current === undefined ? undefined : snapshot.document.signalGroups.find((group) => group.id === selectedGroupRef.current);
    if (selectedGroup) {
      const rows = selectedGroup.rows.flatMap((rowId) => snapshot.document.signals.find((signal) => signal.id === rowId) ?? []);
      clipboardGroupRef.current = { group: selectedGroup, rows, sourceIndex: snapshot.document.signalGroups.indexOf(selectedGroup) };
      clipboardAnnotationRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
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
    if (sources.length === 0 && annotation === undefined) { setClipboardStatus("Select a signal, Comment Row, or Annotation to cut"); return; }
    if (annotation !== undefined && sources.length === 0) {
      clipboardAnnotationRef.current = annotation;
      clipboardGroupRef.current = undefined;
      clipboardSignalsRef.current = [];
      clipboardSignalRef.current = undefined;
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
  const createCopiedSignals = (input: readonly { readonly signal: Signal; readonly groupId: GroupId; readonly index: number }[], operation: "paste" | "duplicate") => {
    if (input.length === 0) { setClipboardStatus("No signal clipboard available"); return; }
    const document = snapshot.document;
    const selectedGroup = document.signalGroups.find((group) => selectedId !== undefined && group.rows.includes(selectedId));
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
  const pasteSelectedEntity = () => {
    if (clipboardGroupRef.current) createCopiedGroup(clipboardGroupRef.current, "paste");
    else if (clipboardAnnotationRef.current) createCopiedAnnotation(clipboardAnnotationRef.current, "paste");
    else createCopiedSignals(clipboardSignalsRef.current, "paste");
  };
  const duplicateSelectedEntity = () => {
    if (selectedGroup) {
      const rows = selectedGroup.rows.flatMap((rowId) => snapshot.document.signals.find((signal) => signal.id === rowId) ?? []);
      createCopiedGroup({ group: selectedGroup, rows, sourceIndex: snapshot.document.signalGroups.indexOf(selectedGroup) }, "duplicate");
    } else if (selectedAnnotation) createCopiedAnnotation(selectedAnnotation, "duplicate");
    else createCopiedSignals(selectedClipboardSignals(), "duplicate");
  };
  pasteSelectedSignalRef.current = pasteSelectedEntity;
  const renameSelection = () => {
    const current = selectedSignal?.display.name ?? selectedGroup?.name;
    const name = current === undefined ? null : window.prompt("Rename", current);
    if (name?.trim()) commandRegistry.current.execute("selection.rename", { name: name.trim() });
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
    const rows = bulkRegistrationText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const signals: Signal[] = [];
    for (const [index, row] of rows.entries()) {
      const [path, kind = "binary"] = row.split(/\s+/);
      if (!path) continue;
      const parts = path.split(".").filter(Boolean);
      const signalName = parts.pop();
      if (!signalName) continue;
      const type = kind.toLowerCase() === "bus" ? "bus" : kind.toLowerCase() === "state" ? "state" : "binary";
      const id = signalId(`${nextEntityId("signal", snapshot.document)}_bulk_${index}`);
      signals.push(valueSignal(id, signalName, "internal", [{ start: 0, value: type === "state" ? "IDLE" : type === "bus" ? "00" : 0 }], type === "bus" ? { type, width: 8, displayFormat: "hex" } : { type }));
      signals[signals.length - 1] = { ...signals[signals.length - 1]!, source: { ...signals[signals.length - 1]!.source, instancePath: parts } };
    }
    const result = commandRegistry.current.execute<SemanticCommand, ReturnType<CommandHistorySession["execute"]>>("semantic.execute", { id: nextCommandId("bulk_register_signals"), type: "signal.bulkCreate", signals, targetGroupId, index: snapshot.document.signalGroups.find((group) => group.id === targetGroupId)?.rows.length ?? 0 });
    if (result.ok) { setBulkRegistrationStatus(`Registered ${signals.length} signal${signals.length === 1 ? "" : "s"} in one operation`); setBulkRegistrationVisible(false); }
    else setBulkRegistrationStatus(result.problems.map((item) => item.message).join(" "));
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
  const addTreeEntity = (kind: "signal" | "clock" | "bus" | "state" | "group" | "commentRow") => {
    const targetGroup = snapshot.document.signalGroups.at(-1);
    if (kind === "group") {
      const id = groupId(nextEntityId("group", snapshot.document));
      commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_add_group"), type: "group.create", group: { id, name: `Group ${snapshot.document.signalGroups.length + 1}`, rows: [] }, index: snapshot.document.signalGroups.length });
      return;
    }
    if (!targetGroup) return;
    const id = signalId(nextEntityId(kind === "commentRow" ? "commentRow" : "signal", snapshot.document));
    if (kind === "commentRow") {
      const name = `Comment ${snapshot.document.signals.length + 1}`;
      commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_add_comment"), type: "commentRow.create", commentRow: { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" }, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
      return;
    }
    const name = `${kind === "clock" ? "CLOCK" : "SIGNAL"}_${snapshot.document.signals.length + 1}`;
    const signal = kind === "clock"
      ? { id, name, type: "clock" as const, role: "internal" as const, source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0 as 0 | 1, polarity: "positive" as const }, edgeCounter: { show: false, mode: "both" as const, startNumber: 1, countFrom: "signal-start" as const, labelEvery: 1, position: "above" as const, offset: { x: 0, y: -6 } } }
      : valueSignal(id, name, "internal", [{ start: 0, value: kind === "state" ? "IDLE" : kind === "bus" ? "00" : 0 }], kind === "bus" ? { type: "bus", width: 8, displayFormat: "hex" } : { type: kind === "state" ? "state" : "binary" });
    commandRegistry.current.execute("semantic.execute", { id: nextCommandId("tree_add_signal"), type: "signal.create", signal, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const bottomTabs: readonly ("Signal" | "Annotation" | "Transaction" | "Problems" | "JSON")[] = viewMode === "Cycle"
    ? ["Signal", "Annotation", "Problems", "JSON"]
    : viewMode === "Transaction"
      ? ["Transaction", "Annotation", "Problems", "JSON"]
      : ["Signal", "Transaction", "Annotation", "Problems", "JSON"];
  const bottomTabLabels: Readonly<Record<typeof bottomTabs[number], string>> = visualReference
    ? { Signal: "Signal Editor", Annotation: "Annotations", Transaction: "Transactions", Problems: "Checks", JSON: "JSON" }
    : { Signal: "信号", Annotation: "注釈", Transaction: "トランザクション", Problems: "問題", JSON: "JSON" };
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
  const startLeftPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    leftPaneResizeRef.current = { startX: event.clientX, startWidth: leftPaneWidth };
  };
  const moveLeftPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = leftPaneResizeRef.current;
    if (!resize) return;
    const nextWidth = Math.max(280, Math.min(420, resize.startWidth + (event.clientX - resize.startX)));
    if (nextWidth !== leftPaneWidth) setLeftPaneWidth(nextWidth);
  };
  const finishLeftPaneResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!leftPaneResizeRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    leftPaneResizeRef.current = undefined;
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

  const hasSelectedSignal = (selectedSignalIds.size > 0 && selectedSignal !== undefined) || selectedAnnotation !== undefined;
  const hasSelectedEntity = hasSelectedSignal || selectedGroup !== undefined;
  const hasSelectedClipboard = hasSelectedEntity;
  return <main className="editor-shell" style={{ "--gui-left-width": `${leftPaneWidth}px`, "--gui-frozen-width": `${frozenPaneWidth}px`, "--gui-bottom-height": `${bottomHeight}px`, "--gui-inspector-width": `${inspectorWidth}px` } as React.CSSProperties} data-visual-reference={String(visualReference)} data-inspector-visible={String(inspectorVisible)} data-bottom-visible={String(bottomVisible)} data-ruler-enabled={String(rulerEnabled)} data-minimap-enabled={String(minimapEnabled)} data-left-pane-width={leftPaneWidth} data-frozen-pane-width={frozenPaneWidth} data-bottom-height={bottomHeight} data-inspector-width={inspectorWidth}>
    <header className="app-titlebar"><span className="appmark">∿</span><h1>{snapshot.document.document.title}</h1><span className="save-state">{history.dirty ? "Modified" : "Saved"}</span><span className="view-title">Cycle View</span><span className="window-controls">—　□　×</span></header>
    <nav className="ribbon-tabs" aria-label="Ribbon tabs">
      {([{ key: "File", label: "ファイル" }, { key: "Home", label: "ホーム" }, { key: "Insert", label: "挿入" }, { key: "Timeline", label: "Transaction", compatibilityLabel: "Timeline" }, { key: "Annotation", label: "注釈" }, { key: "View", label: "表示" }, { key: "Review", label: "Check", compatibilityLabel: "Review" }, { key: "AI", label: "AI" }] as const).map((tab) => <button type="button" key={tab.key} aria-label={"compatibilityLabel" in tab ? tab.compatibilityLabel : tab.key} className={ribbonTab === tab.key ? "active" : ""} onClick={() => setRibbonTab(tab.key)}>{visualReference ? ({ File: "File", Home: "Home", Insert: "Insert", Timeline: "Transaction", Annotation: "Annotation", View: "View", Review: "Check", AI: "AI" } as Record<string, string>)[tab.key] : tab.label}</button>)}
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
      arrowPickStatus={arrowPickStatus}
      selectedSignalId={annotationTargetSignalId}
      problemsCount={diagnostics.length}
      viewMode={viewMode}
      selectedTransactionId={selectedTransactionId}
      clipboardStatus={clipboardStatus}
      clipboardAvailable={clipboardAvailable}
      hasSelectedSignal={hasSelectedSignal}
      hasSelectedClipboard={hasSelectedClipboard}
      hasSelectedEntity={hasSelectedEntity}
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
      onRange={setTimelineRange}
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
      onUndo={() => commandRegistry.current.execute("history.undo")}
      onRedo={() => commandRegistry.current.execute("history.redo")}
      onDelete={() => commandRegistry.current.execute("selection.delete")}
      onNew={() => newDocument.current()}
      onOpen={() => fileInput.current?.click()}
      onSave={() => { const text = saveDocument.current(); if (text) downloadText(text, `${snapshot.document.document.title || "timing-chart"}.tcd.json`); }}
      onSaveAs={() => setSaveAsVisible(true)}
      onRecent={() => { const text = localStorage.getItem("timing-chart-v2.recent"); if (text) openDocument.current(text); else setProblem("No recent document is available."); }}
      onProperties={() => setPropertiesVisible(true)}
      onExport={() => setExportVisible(true)}
      onToggleInspector={() => setInspectorVisible((value) => !value)}
      onToggleBottom={() => setBottomVisible((value) => !value)}
      onShowProblems={() => { setBottomTab("Problems"); setBottomVisible(true); }}
      onOpenTimeline={() => setRibbonTab("Timeline")}
      onOpenProperties={() => setPropertiesVisible(true)}
    />
    <div className="desktop-workspace">
      <section className={`cycle-panel mode-${viewMode.toLowerCase()}`} aria-label={`${viewMode} View`} data-view-mode={viewMode}>
         <div className="left-pane-resize-handle" data-testid="left-pane-resizer" role="separator" aria-label="Resize Signal Group pane" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={420} aria-valuenow={leftPaneWidth} tabIndex={0} onPointerDown={startLeftPaneResize} onPointerMove={moveLeftPaneResize} onPointerUp={finishLeftPaneResize} onPointerCancel={finishLeftPaneResize} />
         <div className="frozen-pane-resize-handle" data-testid="frozen-pane-resizer" role="separator" aria-label="Resize Signal label and timing pane" aria-orientation="vertical" aria-valuemin={160} aria-valuemax={360} aria-valuenow={frozenPaneWidth} tabIndex={0} onPointerDown={startFrozenPaneResize} onPointerMove={moveFrozenPaneResize} onPointerUp={finishFrozenPaneResize} onPointerCancel={finishFrozenPaneResize} />
        <div className="column-headings"><span className="left-column-heading"><strong>{visualReference ? "Signals / Groups" : "信号 / グループ"}</strong><label><span className="visually-hidden">Signal tree filter</span><input data-testid="signal-tree-search-top" aria-label="Signal tree filter" value={treeFilter} onChange={(event) => setTreeFilter(event.target.value)} placeholder={visualReference ? "Filter signals..." : "name / path / role"} /><button type="button" aria-label="Clear signal tree filter" onClick={() => setTreeFilter("")}>×</button></label><button type="button" className="tree-add-button" aria-label="Add signal or group" aria-expanded={treeAddMenuOpen} onClick={() => setTreeAddMenuOpen((value) => !value)}>＋</button>{treeAddMenuOpen && <div className="tree-add-menu" role="menu" aria-label="Add signal or group"><button type="button" role="menuitem" onClick={() => { addTreeEntity("signal"); setTreeAddMenuOpen(false); }}>Signal</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("clock"); setTreeAddMenuOpen(false); }}>Clock</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("bus"); setTreeAddMenuOpen(false); }}>Bus</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("state"); setTreeAddMenuOpen(false); }}>State</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("group"); setTreeAddMenuOpen(false); }}>Group</button><button type="button" role="menuitem" onClick={() => { addTreeEntity("commentRow"); setTreeAddMenuOpen(false); }}>Comment Row</button></div>}<button type="button" className="tree-more-button" aria-label="More tree actions" aria-expanded={treeMoreMenuOpen} onClick={() => setTreeMoreMenuOpen((value) => !value)}>•••</button>{treeMoreMenuOpen && <div className="tree-header-menu" role="menu" aria-label="More tree actions"><button type="button" role="menuitem" onClick={() => { setCollapsedGroupIds(new Set(snapshot.document.signalGroups.map((group) => group.id))); setTreeMoreMenuOpen(false); }}>Collapse All Groups</button><button type="button" role="menuitem" onClick={() => { setCollapsedGroupIds(new Set()); setTreeMoreMenuOpen(false); }}>Expand All Groups</button><button type="button" role="menuitem" onClick={() => { setTreeFilter(""); setTreeMoreMenuOpen(false); }}>Clear Filter</button></div>}</span>{visualReference ? <><span className="role-column-heading" aria-label="Role">Role</span><span className="signal-column-heading" aria-label="Signal / Annotation">Signal / Annotation</span><span>{"Time Scale: Cycle    Reference: clk"}</span></> : <><span aria-label="Role / signal">Role / 信号</span><span>Cycle waveform</span></>}</div>
        <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport" tabIndex={0} aria-label="Timing canvas navigation">
          {viewMode !== "Cycle" && <TransactionLanes document={snapshot.document} zoom={zoom} selectedId={selectedTransactionId} onSelect={selectTransaction} onSnap={(clientX) => snapTransactionCycle.current(clientX)} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} />}
          <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
          <div className="cycle-ruler" ref={ruler} data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled} />
          <LegendView document={snapshot.document} />
      <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
        </div>
      </section>
      <aside className="left-panel-tail"><button type="button" data-testid="hierarchy-open" onClick={() => setHierarchyVisible(true)}>Hierarchy</button><button type="button" data-testid="create-group" onClick={createSignalGroup}>＋ Group</button><button type="button" data-testid="bulk-register-open" onClick={() => { setBulkRegistrationGroupId(snapshot.document.signalGroups.at(-1)?.id); setBulkRegistrationVisible(true); }}>＋ Signal</button><span>{snapshot.document.signals.length} signals</span>{selectedSignal && <span data-testid="scope-breadcrumb">Scope: {selectedSignal.source.instancePath.length ? selectedSignal.source.instancePath.join(" / ") : "(root)"}</span>}<div className="empty-group-list" aria-label="Empty signal groups">{snapshot.document.signalGroups.filter((group) => group.rows.length === 0).map((group) => <button type="button" key={group.id} data-role="empty-group" data-group-id={group.id} onClick={() => { selectedGroupRef.current = group.id; setSelectedGroupId(group.id); selectedSignalRef.current = undefined; setSelectedId(undefined); }}>{group.name}</button>)}</div></aside>
      {bottomVisible && <section className="bottom-editor" data-testid="bottom-editor">
        <div className="bottom-resize-handle" data-testid="bottom-resizer" role="separator" aria-label="Resize bottom editor" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={420} aria-valuenow={bottomHeight} tabIndex={0} onPointerDown={startBottomResize} onPointerMove={moveBottomResize} onPointerUp={finishBottomResize} onPointerCancel={finishBottomResize} />
        <nav className="bottom-tabs" data-testid="bottom-tabs">
          {bottomTabs.map((tab) => <button type="button" key={tab} data-bottom-tab={tab} aria-label={tab} className={bottomTab === tab ? "active" : ""} onClick={() => setBottomTab(tab)}>{bottomTabLabels[tab]}</button>)}
          <span />
          <label><input data-testid="follow-selection" type="checkbox" checked={followSelection} onChange={(event) => setFollowSelection(event.target.checked)} /> {visualReference ? "Follow Selection" : "選択に追従"}</label>
          <button type="button" data-testid="bottom-pin" aria-label={bottomPinned ? "Unpin" : "Pin"} aria-pressed={bottomPinned} onClick={toggleBottomPin}><span className="bottom-pin-label" data-v1-label={bottomPinned ? "ピン解除" : "ピン留め"}>{bottomPinned ? "Unpin" : visualReference ? "Pin" : "Pin"}</span></button>
        </nav>
        <div className="bottom-content">{bottomTab === "Signal" ? signalEditor : bottomTab === "Annotation" ? annotationEditor : bottomTab === "Transaction" ? transactionEditor : bottomTab === "Problems" ? <ProblemsPanel diagnostics={diagnostics} onNavigate={navigateProblem} /> : <AdvancedJsonPanel document={snapshot.document} selectedSignal={bottomSignal} selectedGroup={selectedGroup} selectedAnnotation={bottomAnnotation} selectedTransaction={bottomTransaction} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} />}</div>
      </section>}
      {inspectorVisible && <aside className="inspector-shell" data-testid="inspector-shell"><div className="inspector-resize-handle" data-testid="inspector-resizer" role="separator" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={inspectorWidth} tabIndex={0} onPointerDown={startInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={finishInspectorResize} onPointerCancel={finishInspectorResize} /><InspectorPanel key={`${selectedSignal?.id ?? selectedGroup?.id ?? selectedAnnotation?.id ?? selectedTransaction?.id ?? "none"}:${snapshot.revision}`} signal={selectedSignal} group={selectedGroup} annotation={selectedAnnotation} transaction={selectedTransaction} collapsedGroup={selectedGroup !== undefined && collapsedGroupIds.has(selectedGroup.id)} onToggleGroupCollapse={selectedGroup === undefined ? undefined : () => setCollapsedGroupIds((current) => { const next = new Set(current); if (next.has(selectedGroup.id)) next.delete(selectedGroup.id); else next.add(selectedGroup.id); return next; })} registry={commandRegistry.current} document={snapshot.document} viewport={viewport} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onReveal={revealSelectedInHierarchy} /></aside>}
    </div>
    {contextMenu && <div className="context-menu" role="menu" aria-label="Signal context menu" data-testid="signal-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      <button type="button" role="menuitem" onClick={() => { copySelectedSignal(); setContextMenu(undefined); }} disabled={!hasSelectedClipboard}>Copy</button>
      <button type="button" role="menuitem" onClick={() => { cutSelectedSignal(); setContextMenu(undefined); }} disabled={!hasSelectedClipboard}>Cut</button>
      <button type="button" role="menuitem" onClick={() => { pasteSelectedEntity(); setContextMenu(undefined); }} disabled={!clipboardAvailable}>Paste</button>
      <button type="button" role="menuitem" onClick={() => { duplicateSelectedEntity(); setContextMenu(undefined); }} disabled={!hasSelectedClipboard}>Duplicate</button>
      <button type="button" role="menuitem" onClick={() => { moveSelection(-1); setContextMenu(undefined); }} disabled={!hasSelectedEntity}>Move Up</button>
      <button type="button" role="menuitem" onClick={() => { moveSelection(1); setContextMenu(undefined); }} disabled={!hasSelectedEntity}>Move Down</button>
      <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(true); setContextMenu(undefined); }} disabled={!hasSelectedSignal}>Show</button>
      <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(false); setContextMenu(undefined); }} disabled={!hasSelectedSignal}>Hide</button>
      <button type="button" role="menuitem" onClick={() => { renameSelection(); setContextMenu(undefined); }} disabled={!hasSelectedEntity}>Rename</button>
      <button type="button" role="menuitem" onClick={() => { commandRegistry.current.execute("selection.delete"); setContextMenu(undefined); }} disabled={!hasSelectedEntity && selectedAnnotation === undefined}>Delete</button>
    </div>}
    {hierarchyVisible && <HardwareHierarchyBrowser document={snapshot.document} selectedSignalId={selectedSignal?.id} onSelect={selectHierarchySignal} onClose={() => setHierarchyVisible(false)} />}
    {propertiesVisible && <DocumentProperties document={snapshot.document} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} onClose={() => setPropertiesVisible(false)} />}
    {bulkRegistrationVisible && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Bulk Signal Registration" className="document-properties bulk-registration"><header><h2>Bulk Signal Registration</h2><button type="button" aria-label="Close bulk registration" onClick={() => setBulkRegistrationVisible(false)}>×</button></header><p>One signal per line: <code>instance.path.signal [binary|bus|state]</code></p><textarea aria-label="Bulk signal definitions" value={bulkRegistrationText} onChange={(event) => setBulkRegistrationText(event.target.value)} rows={8} /><label>Target Group<select aria-label="Bulk registration target group" value={bulkRegistrationGroupId ?? ""} onChange={(event) => setBulkRegistrationGroupId(event.target.value as GroupId)}>{snapshot.document.signalGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><footer><output>{bulkRegistrationStatus}</output><button type="button" data-testid="bulk-register-apply" onClick={registerBulkSignals}>Register Signals</button></footer></section></div>}
    {exportVisible && <ExportDialog snapshot={snapshot} range={timelineRange} onClose={() => setExportVisible(false)} />}
    {saveAsVisible && <SaveAsDialog defaultName={snapshot.document.document.title || "timing-chart"} onSave={(name) => { const text = saveDocument.current(); if (text) downloadText(text, `${name}.tcd.json`); setSaveAsVisible(false); }} onClose={() => setSaveAsVisible(false)} />}
    <input ref={fileInput} hidden type="file" accept=".json,.tcd" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => openDocument.current(text)); event.currentTarget.value = ""; }} />
    <footer className="status-bar" aria-label="Editor status">
      <span data-testid="tool-status">{visualReference ? "Ready" : "Ready · Tool: Select"}</span>
      <span>Selected: <strong data-testid="selection-status">{selectedSignalIds.size > 1 ? `${selectedSignalIds.size} signals` : selectedTransaction?.name ?? selectedAnnotation?.label ?? selectedSignal?.display.name ?? selectedGroup?.name ?? "None"}</strong></span>
      <span data-testid="signal-count-status">Signals: {snapshot.document.signals.length}</span><span data-testid="annotation-count-status">Annotations: {snapshot.document.annotations.length}</span><span data-testid="range-status">{visualReference ? `Time Range: 0 – ${snapshot.document.timeline.cycleCount} cycles` : `Range: [${timelineRange.start}, ${timelineRange.end})`}</span><span data-testid="cycle-status" className={visualReference ? "status-detail-hidden" : undefined}>Cycle {selectedCycle}</span><span data-testid="zoom-status-bar">Zoom: {Math.round(zoom * 100)}%</span><span data-testid="snap-status" className={visualReference ? "status-detail-hidden" : undefined}>Snap: {snapEnabled ? "On" : "Off"}</span><span data-testid="view-mode-status" className={visualReference ? "status-detail-hidden" : undefined}>Mode: {viewMode}</span>
      <span data-testid="revision-status" className={visualReference ? "status-detail-hidden" : undefined}>Canonical revision {snapshot.revision}</span>
      <span data-testid="history-status" className={visualReference ? "status-detail-hidden" : undefined}>History {history.undoDepth} / Redo {history.redoDepth}</span>
      <span data-testid="dirty-status" className={visualReference ? "status-detail-hidden" : undefined}>{history.dirty ? "Modified" : "Clean"}</span><span data-testid="problems-status" className={visualReference ? "status-detail-hidden" : undefined}>Problems: {diagnostics.length}</span><span data-testid="wavedrom-status" className={visualReference ? "status-detail-hidden" : undefined}>WaveDrom: {waveDromHasError ? "Error" : "Ready"}</span>
    </footer>
  </main>;
}

const iconSprite = new URL("../../../../gui-mockup/icons.svg", import.meta.url).href;

function RibbonIcon({ name }: { readonly name: string }) {
  return <svg aria-hidden="true"><use href={`${iconSprite}#${name}`} /></svg>;
}

function HardwareHierarchyBrowser({ document, selectedSignalId, onSelect, onClose }: { readonly document: CanonicalDocument; readonly selectedSignalId: SignalId | undefined; readonly onSelect: (id: SignalId) => void; readonly onClose: () => void }) {
  const [view, setView] = useState<HardwareHierarchyView>("group");
  const [scope, setScope] = useState<string>("all");
  const scopes = hardwareHierarchyScopes(document);
  const entries = buildHardwareHierarchyEntries(document, view, scope === "all" ? undefined : scope);
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Hardware Hierarchy" className="hierarchy-browser" data-testid="hierarchy-browser">
    <header><h2>Hardware Hierarchy</h2><button type="button" aria-label="Close hierarchy" onClick={onClose}>×</button></header>
    <p>Derived from canonical Signal source paths. Group placement does not change hardware identity.</p>
    <div className="hierarchy-toolbar" role="toolbar" aria-label="Hierarchy view controls">
      <span>View</span><button type="button" data-testid="hierarchy-group-view" aria-pressed={view === "group"} onClick={() => setView("group")}>Group View</button><button type="button" data-testid="hierarchy-path-view" aria-pressed={view === "hierarchy"} onClick={() => setView("hierarchy")}>Hierarchy View</button>
      <label>Scope<select aria-label="Hierarchy scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All scopes</option>{scopes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <table><thead><tr><th>Scope</th><th>Instance Path</th><th>Relative Path</th><th>Signal</th><th>Full Path</th><th>Role</th><th>Type</th><th>Width</th><th>Group</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.signalId} data-hierarchy-row-id={entry.signalId} data-selected={String(entry.signalId === selectedSignalId)}><td>{entry.scope}</td><td>{entry.instancePath}</td><td>{entry.relativePath}</td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td><td>{entry.fullPath}</td><td>{entry.role}</td><td>{entry.type}</td><td>{entry.width}</td><td>{entry.groupName}</td></tr>)}</tbody></table>
  </section></div>;
}

function DocumentProperties({ document, onCommand, onClose }: { readonly document: CanonicalDocument; readonly onCommand: (command: SemanticCommand) => void; readonly onClose: () => void }) {
  const [title, setTitle] = useState(document.document.title);
  const [subtitle, setSubtitle] = useState(document.document.header.subtitle);
  const [description, setDescription] = useState(document.document.header.description);
  const [notes, setNotes] = useState(document.document.header.notes);
  const [preconditions, setPreconditions] = useState(document.document.header.preconditions.join("\n"));
  const [constraints, setConstraints] = useState(document.document.header.constraints.join("\n"));
  const [exceptions, setExceptions] = useState(document.document.header.exceptions.join("\n"));
  const [figureNumber, setFigureNumber] = useState(document.document.footer.figureNumber);
  const [revision, setRevision] = useState(document.document.footer.revision);
  const [footerText, setFooterText] = useState(document.document.footer.text);
  const [legendShow, setLegendShow] = useState(document.legend.show);
  const [legendOrientation, setLegendOrientation] = useState(document.legend.orientation);
  const [legendUsedRolesOnly, setLegendUsedRolesOnly] = useState(document.legend.usedRolesOnly);
  const [legendItemsText, setLegendItemsText] = useState(() => JSON.stringify(document.legend.items ?? [...new Set(document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.role))].map((role, order) => ({ id: `legend_${role}`, role, label: role, visible: true, order })), null, 2));
  const [legendStatus, setLegendStatus] = useState("");
  const legendEntries = (() => {
    try {
      const parsed: unknown = JSON.parse(legendItemsText);
      if (!Array.isArray(parsed)) return [] as LegendEntry[];
      return parsed.filter((entry): entry is LegendEntry => typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string" && typeof (entry as { role?: unknown }).role === "string" && typeof (entry as { label?: unknown }).label === "string" && typeof (entry as { visible?: unknown }).visible === "boolean" && Number.isInteger((entry as { order?: unknown }).order));
    } catch {
      return [] as LegendEntry[];
    }
  })();
  const updateLegendEntries = (next: readonly LegendEntry[]) => setLegendItemsText(JSON.stringify(next.map((entry, order) => ({ ...entry, order })), null, 2));
  const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return <div className="modal-backdrop"><form className="document-properties" role="dialog" aria-modal="true" aria-label="Document Properties" onSubmit={(event) => {
    event.preventDefault();
    onCommand({ id: nextCommandId("document_metadata"), type: "document.updateMetadata", title, header: { subtitle, description, notes, preconditions: lines(preconditions), constraints: lines(constraints), exceptions: lines(exceptions) }, footer: { figureNumber, revision, text: footerText } });
  }}>
    <header><h2>Document Properties</h2><button type="button" aria-label="Close properties" onClick={onClose}>×</button></header>
    <section><h3>Document</h3><label>Title<input aria-label="Document title" value={title} onChange={(event) => setTitle(event.target.value)} /></label><dl><dt>ID</dt><dd>{document.document.id}</dd><dt>Signals</dt><dd>{document.signals.length}</dd><dt>Cycles</dt><dd>{document.timeline.cycleCount}</dd></dl></section>
    <section><h3>Header</h3><label>Subtitle<input aria-label="Document subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label><label>Description<textarea aria-label="Document description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label><label>Notes<textarea aria-label="Document notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></label><label>Preconditions<textarea aria-label="Document preconditions" value={preconditions} onChange={(event) => setPreconditions(event.target.value)} rows={2} placeholder="One item per line" /></label><label>Constraints<textarea aria-label="Document constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} rows={2} placeholder="One item per line" /></label><label>Exceptions<textarea aria-label="Document exceptions" value={exceptions} onChange={(event) => setExceptions(event.target.value)} rows={2} placeholder="One item per line" /></label></section>
    <section><h3>Footer</h3><label>Figure Number<input aria-label="Footer figure number" value={figureNumber} onChange={(event) => setFigureNumber(event.target.value)} /></label><label>Revision<input aria-label="Footer revision" value={revision} onChange={(event) => setRevision(event.target.value)} /></label><label>Text<textarea aria-label="Footer text" value={footerText} onChange={(event) => setFooterText(event.target.value)} rows={2} /></label></section>
    <section><h3>Legend</h3><label className="checkline">Show Legend<input aria-label="Legend show" type="checkbox" checked={legendShow} onChange={(event) => setLegendShow(event.target.checked)} /></label><label>Orientation<select aria-label="Legend orientation" value={legendOrientation} onChange={(event) => setLegendOrientation(event.target.value as typeof legendOrientation)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label><label className="checkline">Used Roles Only<input aria-label="Legend used roles only" type="checkbox" checked={legendUsedRolesOnly} onChange={(event) => setLegendUsedRolesOnly(event.target.checked)} /></label><div className="legend-entry-editor" data-testid="legend-entry-editor"><strong>Entries</strong>{legendEntries.map((entry, index) => <div className="legend-entry-row" key={entry.id} data-legend-entry-id={entry.id}><code>{entry.id}</code><input aria-label={`Legend label ${entry.id}`} value={entry.label} onChange={(event) => updateLegendEntries(legendEntries.map((item) => item.id === entry.id ? { ...item, label: event.target.value } : item))} /><label className="checkline"><span>Visible</span><input aria-label={`Legend visibility ${entry.id}`} type="checkbox" checked={entry.visible} onChange={(event) => updateLegendEntries(legendEntries.map((item) => item.id === entry.id ? { ...item, visible: event.target.checked } : item))} /></label><button type="button" aria-label={`Move ${entry.id} up`} disabled={index === 0} onClick={() => { const next = [...legendEntries]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; updateLegendEntries(next); }}>↑</button><button type="button" aria-label={`Move ${entry.id} down`} disabled={index === legendEntries.length - 1} onClick={() => { const next = [...legendEntries]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; updateLegendEntries(next); }}>↓</button></div>)}</div><label>Entries (stable ID / label / visibility / order)<textarea aria-label="Legend entries JSON" rows={5} value={legendItemsText} onChange={(event) => setLegendItemsText(event.target.value)} spellCheck={false} /></label><button type="button" data-testid="apply-legend" onClick={() => { try { const parsed = JSON.parse(legendItemsText) as unknown; if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "object" || entry === null || typeof (entry as { id?: unknown }).id !== "string" || typeof (entry as { role?: unknown }).role !== "string" || typeof (entry as { label?: unknown }).label !== "string" || typeof (entry as { visible?: unknown }).visible !== "boolean" || !Number.isInteger((entry as { order?: unknown }).order))) throw new Error("Legend entries must be an array of {id,role,label,visible,order} objects."); onCommand({ id: nextCommandId("legend_update"), type: "legend.update", legend: { ...document.legend, show: legendShow, orientation: legendOrientation, usedRolesOnly: legendUsedRolesOnly, items: parsed as NonNullable<typeof document.legend.items> } }); setLegendStatus("Legend applied"); } catch (error) { setLegendStatus(error instanceof Error ? error.message : "Invalid legend entries"); } }}>Apply Legend</button>{legendStatus && <output role="status" data-testid="legend-status">{legendStatus}</output>}</section>
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" data-testid="apply-document-properties">Apply Document Properties</button></footer>
  </form></div>;
}

function LegendView({ document }: { readonly document: CanonicalDocument }) {
  if (!document.legend.show) return null;
  const defaultRoles = document.legend.usedRolesOnly ? [...new Set(document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.role))] : ["input", "output", "internal"];
  const entries = document.legend.items?.length ? [...document.legend.items].filter((entry) => entry.visible).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)).map((entry) => ({ id: entry.id, role: entry.role, label: entry.label })) : defaultRoles.map((role) => ({ id: `legend_${role}`, role, label: role }));
  return <aside className={`editor-legend ${document.legend.orientation}`} data-testid="editor-legend" aria-label="Legend"><strong>Legend</strong>{entries.map((entry) => <span key={entry.id} data-legend-id={entry.id} data-legend-role={entry.role}><i />{entry.label}</span>)}</aside>;
}

function AIOperationPanel({ document, revision, selectedSignalId, onCommand }: { readonly document: CanonicalDocument; readonly revision: number; readonly selectedSignalId: SignalId | undefined; readonly onCommand: (command: SemanticCommand) => void }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ readonly baseRevision: number; readonly command: SemanticCommand; readonly summary: string }>();
  const [status, setStatus] = useState("Ready");
  const selected = document.signals.find((signal) => signal.id === selectedSignalId && signal.type !== "commentRow");
  const buildPreview = () => {
    const text = query.trim();
    if (!selected) { setPreview(undefined); setStatus("Select a timing Signal first."); return; }
    const rename = /^rename(?: selected)?(?: signal)? to (.+)$/i.exec(text);
    const command: SemanticCommand | undefined = rename
      ? { id: nextCommandId("ai_rename"), type: "signal.rename", signalId: selected.id, name: rename[1]!.trim() }
      : /^(hide|show)(?: selected)?(?: signal)?$/i.test(text)
        ? { id: nextCommandId("ai_visibility"), type: "signal.setVisibility", signalId: selected.id, visible: text.toLowerCase().startsWith("show") }
        : undefined;
    if (!command) { setPreview(undefined); setStatus("Supported intents: rename selected signal to <name>, hide selected signal, show selected signal."); return; }
    setPreview({ baseRevision: revision, command, summary: command.type === "signal.rename" ? `Rename ${selected.display.name} to ${(command as Extract<SemanticCommand, { type: "signal.rename" }>).name}` : `${(command as Extract<SemanticCommand, { type: "signal.setVisibility" }>).visible ? "Show" : "Hide"} ${selected.display.name}` });
    setStatus("Preview ready · no document mutation");
  };
  const applyPreview = () => {
    if (!preview) { setStatus("Create a preview first."); return; }
    if (preview.baseRevision !== revision) { setPreview(undefined); setStatus(`Conflict · preview revision ${preview.baseRevision}, current revision ${revision}`); return; }
    onCommand(preview.command);
    setPreview(undefined);
    setStatus("Applied · one SemanticCommand");
  };
  return <section className="ai-operation-panel" data-testid="ai-operation-panel"><div className="ai-query-row"><RibbonIcon name="i-ai" /><label>Semantic query<input aria-label="AI semantic query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="rename selected signal to REQ" /></label><button type="button" onClick={buildPreview}>Preview</button></div><div className="ai-scope">Scope: selected Signal · Revision: {revision} · Canonical read-only query</div>{preview && <div className="ai-preview" data-testid="ai-preview"><strong>{preview.summary}</strong><span>Base revision {preview.baseRevision}</span><button type="button" onClick={applyPreview}>Apply Preview</button><button type="button" onClick={() => { setPreview(undefined); setStatus("Preview cancelled · no document mutation"); }}>Cancel</button></div>}<output role="status" data-testid="ai-status">{status}</output></section>;
}

function Ribbon({ tab, document, revision, range, history, zoom, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, arrowPickStatus, selectedSignalId, problemsCount, viewMode, selectedTransactionId, clipboardStatus, clipboardAvailable, hasSelectedSignal, hasSelectedClipboard, hasSelectedEntity, onRange, onCommand, onCreateAnnotation, onArrowPick, onZoom, onFitSelection, onFitAll, onSetZoom, onNavigateBookmark, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onUndo, onRedo, onDelete, onNew, onOpen, onSave, onSaveAs, onRecent, onProperties, onExport, onToggleInspector, onToggleBottom, onShowProblems, onCopy, onCut, onPaste, onDuplicate, onRename, onClearSelection, onSelectAll, onMoveUp, onMoveDown, onVisibility, onOpenTimeline, onOpenProperties }: {
  readonly tab: string; readonly document: CanonicalDocument; readonly revision: number; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly zoom: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly minimapEnabled: boolean; readonly arrowPickStatus: "idle" | "from" | "to"; readonly selectedSignalId: SignalId | undefined; readonly problemsCount: number; readonly viewMode: "Cycle" | "Transaction" | "Split"; readonly selectedTransactionId: TransactionId | undefined;
  readonly clipboardStatus: string; readonly clipboardAvailable: boolean; readonly hasSelectedSignal: boolean; readonly hasSelectedClipboard: boolean; readonly hasSelectedEntity: boolean;
  readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => void; readonly onCreateAnnotation: (annotation: Annotation) => void; readonly onArrowPick: () => void; readonly onZoom: (delta: number) => void; readonly onFitSelection: () => void; readonly onFitAll: () => void; readonly onSetZoom: (zoom: number) => void; readonly onNavigateBookmark: (cycle: number) => void;
  readonly onToggleGrid: () => void; readonly onToggleSnap: () => void; readonly onToggleRuler: () => void; readonly onToggleMinimap: () => void; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onNew: () => void; readonly onOpen: () => void; readonly onSave: () => void; readonly onSaveAs: () => void; readonly onRecent: () => void; readonly onProperties: () => void; readonly onExport: () => void; readonly onToggleInspector: () => void; readonly onToggleBottom: () => void; readonly onShowProblems: () => void; readonly onCopy: () => void; readonly onCut: () => void; readonly onPaste: () => void; readonly onDuplicate: () => void; readonly onRename: () => void; readonly onClearSelection: () => void; readonly onSelectAll: () => void; readonly onMoveUp: () => void; readonly onMoveDown: () => void; readonly onVisibility: (visible: boolean) => void; readonly onOpenTimeline: () => void; readonly onOpenProperties: () => void;
}) {
  const [homeOverflowOpen, setHomeOverflowOpen] = useState(false);
  const visualReference = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("visual-reference");
  const [compactCycleCount] = useState(2);
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
  const insertValueSignal = (type: "binary" | "bus" | "state") => {
    const targetGroup = document.signalGroups.at(-1);
    if (!targetGroup) return;
    const id = nextEntityId("signal", document);
    const name = `SIGNAL_${document.signals.length + 1}`;
    const signal = type === "bus" ? valueSignal(id, name, "internal", [{ start: 0, value: "00" }], { type: "bus", width: 8, displayFormat: "hex" })
      : type === "state" ? valueSignal(id, name, "internal", [{ start: 0, value: "IDLE" }], { type: "state" })
      : valueSignal(id, name, "internal", [{ start: 0, value: 0 }]);
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
  const addTransaction = () => {
    const id = nextEntityId("transaction", document) as TransactionId;
    onCommand({ id: nextCommandId("home_transaction_create"), type: "transaction.create", transaction: { id, name: `Transaction ${document.transactions.length + 1}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), laneId: "lane_0" } });
  };
  const duplicateTransaction = () => {
    const source = selectedTransactionId === undefined ? undefined : document.transactions.find((item) => item.id === selectedTransactionId);
    if (!source) return;
    onCommand({ id: nextCommandId("home_transaction_duplicate"), type: "transaction.create", transaction: { ...source, id: nextEntityId("transaction", document) as TransactionId, name: `${source.name} Copy` } });
  };
  return <section className="ribbon" aria-label={`${tab} Ribbon`} data-testid="ribbon">
    {tab === "File" && <div className="ribbon-group file-group">
      <button type="button" className="ribbon-tool" onClick={onNew}><RibbonIcon name="i-new" /><span>New</span></button>
      <button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span>Open</span></button>
      <button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span>Save</span></button>
      <button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span>Save As</span></button>
      <div className="ribbon-toggles"><button type="button" onClick={onRecent} title="Open the most recently saved document">Recent</button><button type="button" onClick={onProperties} title={`${document.document.title} · ${document.signals.length} signals`}>Properties</button><button type="button" onClick={onExport}>Export</button></div><b>File</b>
    </div>}
      {tab === "Home" && (visualReference ? <V8GoldenHomeRibbon document={document} range={range} history={history} gridEnabled={gridEnabled} snapEnabled={snapEnabled} rulerEnabled={rulerEnabled} minimapEnabled={minimapEnabled} hasSelectedSignal={hasSelectedSignal} hasSelectedClipboard={hasSelectedClipboard} hasSelectedEntity={hasSelectedEntity} onCommand={onCommand} onNew={onNew} onOpen={onOpen} onSave={onSave} onSaveAs={onSaveAs} onUndo={onUndo} onRedo={onRedo} onCopy={onCopy} onCut={onCut} onPaste={onPaste} onDelete={onDelete} onDuplicate={onDuplicate} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onZoom={onZoom} onFitAll={onFitAll} onToggleGrid={onToggleGrid} onToggleSnap={onToggleSnap} onToggleRuler={onToggleRuler} onToggleMinimap={onToggleMinimap} onOpenTimeline={onOpenTimeline} onOpenProperties={onProperties} onShowProblems={onShowProblems} /> : <>
      <div className="ribbon-major-group" data-major-group="File" aria-label="File commands">
       <div className="ribbon-group home-file-group" aria-label="File"><button type="button" className="ribbon-tool" onClick={onNew}><RibbonIcon name="i-new" /><span data-v1-label="新規">New</span></button><button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span data-v1-label="開く">Open</span></button><button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span data-v1-label="保存">Save</span></button><button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span data-v1-label="名前を付けて保存">Save As</span></button><b>File</b></div>
      </div>
      <div className="ribbon-major-group" data-major-group="History" aria-label="History commands">
       <div className="ribbon-group history-group" aria-label="History"><button type="button" className="ribbon-tool" onClick={onUndo} disabled={!history.canUndo}><RibbonIcon name="i-undo" /><span data-v1-label="元に戻す">Undo</span></button><button type="button" className="ribbon-tool" onClick={onRedo} disabled={!history.canRedo}><RibbonIcon name="i-redo" /><span data-v1-label="やり直し">Redo</span></button><b>History</b></div>
      </div>
      <div className="ribbon-major-group" data-major-group="Clipboard" aria-label="Clipboard commands">
       <div className="ribbon-group clipboard-group" aria-label="Clipboard"><button type="button" className="ribbon-tool" onClick={onCut} disabled={!hasSelectedClipboard}><RibbonIcon name="i-cut" /><span data-v1-label="切取">Cut</span></button><button type="button" className="ribbon-tool" onClick={onCopy} disabled={!hasSelectedClipboard} title="Copy is view-only"><RibbonIcon name="i-copy" /><span data-v1-label="コピー">Copy</span></button><button type="button" className="ribbon-tool" onClick={onPaste} disabled={!clipboardAvailable} title={clipboardStatus}><RibbonIcon name="i-paste" /><span data-v1-label="貼付">Paste</span></button>{!visualReference && <button type="button" className="ribbon-tool" onClick={onDuplicate} disabled={!hasSelectedClipboard}><RibbonIcon name="i-duplicate" /><span data-v1-label="複製">Duplicate</span></button>}<small data-testid="clipboard-status">{clipboardStatus}</small><b>Clipboard</b></div>
      </div>
      <div className="ribbon-major-group" data-major-group="Edit" aria-label="Edit commands">
       <div className="ribbon-group edit-group" aria-label="Edit"><button type="button" className="ribbon-tool" onClick={onDelete}><RibbonIcon name="i-delete" /><span data-v1-label="削除">Delete</span></button>{visualReference ? <button type="button" className="ribbon-tool" onClick={onDuplicate} disabled={!hasSelectedSignal}><RibbonIcon name="i-duplicate" /><span>Duplicate</span></button> : <button type="button" className="ribbon-tool" onClick={onRename} disabled={!hasSelectedEntity}><RibbonIcon name="i-edit" /><span data-v1-label="名前変更">Rename</span></button>}<b>Edit</b></div>
      </div>
      <div className="ribbon-major-group" data-major-group="Layout" aria-label="Layout commands">
       <div className="ribbon-group selection-group" aria-label="Selection"><button type="button" className="ribbon-tool" onClick={onClearSelection}><RibbonIcon name="i-clear" /><span data-v1-label="クリア">Clear</span></button><button type="button" className="ribbon-tool" onClick={onSelectAll} disabled={document.signals.every((signal) => signal.type === "commentRow")} title="Select all timing signals"><RibbonIcon name="i-select-all" /><span data-v1-label="すべて選択">Select All</span></button><b>Selection</b></div>
       <div className="ribbon-group visibility-group" aria-label="Visibility"><button type="button" className="ribbon-tool" onClick={() => onVisibility(true)} disabled={!hasSelectedSignal}><RibbonIcon name="i-eye" /><span data-v1-label="表示">Show</span></button><button type="button" className="ribbon-tool" onClick={() => onVisibility(false)} disabled={!hasSelectedSignal}><RibbonIcon name="i-eye-off" /><span data-v1-label="非表示">Hide</span></button><b>Visibility</b></div>
       <div className="ribbon-group arrange-group" aria-label="Arrange"><button type="button" className="ribbon-tool" onClick={onMoveUp} disabled={!hasSelectedEntity}><RibbonIcon name="i-up" /><span data-v1-label="上へ">Move Up</span></button><button type="button" className="ribbon-tool" onClick={onMoveDown} disabled={!hasSelectedEntity}><RibbonIcon name="i-down" /><span data-v1-label="下へ">Move Down</span></button><b>Arrange</b></div>
      </div>
      {viewMode !== "Cycle" && <div className="ribbon-major-group" data-major-group="Transaction" aria-label="Transaction commands">
       <div className="ribbon-group transaction-home-group" aria-label="Transaction"><button type="button" className="ribbon-tool" onClick={addTransaction}><RibbonIcon name="i-plus" /><span>Transaction<br />Add</span></button><button type="button" className="ribbon-tool" onClick={duplicateTransaction} disabled={selectedTransactionId === undefined}><RibbonIcon name="i-duplicate" /><span>Duplicate</span></button><button type="button" className="ribbon-tool" onClick={onDelete} disabled={selectedTransactionId === undefined}><RibbonIcon name="i-delete" /><span>Delete</span></button><b>Transaction</b></div>
      </div>}
      <div className="ribbon-major-group" data-major-group="Time" aria-label="Time commands">
      <div className={`ribbon-group home-timeline-group${visualReference ? " v8-compact-time-group" : ""}`} aria-label="Timeline">{visualReference ? <>
        <button type="button" className="ribbon-tool" aria-label="Move selected row up" onClick={onMoveUp} disabled={!hasSelectedEntity}><RibbonIcon name="i-up" /><span>Up</span></button>
        <button type="button" className="ribbon-tool" aria-label="Move selected row down" onClick={onMoveDown} disabled={!hasSelectedEntity}><RibbonIcon name="i-down" /><span>Down</span></button>
        <button type="button" className="ribbon-tool" aria-label="Insert one cycle" onClick={() => onCommand({ id: nextCommandId("v8_cycle_insert"), type: "timeline.insert", at: range.start, count: 1 })}><RibbonIcon name="i-plus" /><span>Cycle<br />Insert</span></button>
        <button type="button" className="ribbon-tool" aria-label="Delete one cycle" onClick={() => onCommand({ id: nextCommandId("v8_cycle_delete"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + 1) })}><RibbonIcon name="i-delete" /><span>Cycle<br />Delete</span></button>
        <button type="button" className="ribbon-tool" aria-label={`Insert ${compactCycleCount} cycles`} onClick={() => onCommand({ id: nextCommandId("v8_n_cycle_insert"), type: "timeline.insert", at: range.start, count: compactCycleCount })}><RibbonIcon name="i-plus" /><span>N Cycle<br />Insert</span></button>
        <button type="button" className="ribbon-tool" aria-label={`Delete ${compactCycleCount} cycles`} onClick={() => onCommand({ id: nextCommandId("v8_n_cycle_delete"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + compactCycleCount) })}><RibbonIcon name="i-delete" /><span>N Cycle<br />Delete</span></button>
        <b>Time</b>
      </> : <><TimelineToolbar document={document} range={range} onRange={onRange} onCommand={onCommand} onNavigateBookmark={onNavigateBookmark} /><b>Timeline</b></>}</div>
      </div>
      <div className="ribbon-major-group" data-major-group="Zoom" aria-label="Zoom commands">
       <div className="ribbon-group home-view-group" aria-label="View"><div className="home-zoom-controls"><button type="button" className="ribbon-tool" onClick={() => onZoom(-0.25)}><RibbonIcon name="i-zoom-out" /><span data-v1-label="ズーム−">Zoom −</span></button><output data-testid="home-zoom-status">{Math.round(zoom * 100)}%</output><button type="button" className="ribbon-tool" onClick={() => onZoom(0.25)}><RibbonIcon name="i-zoom-in" /><span data-v1-label="ズーム＋">Zoom +</span></button><button type="button" className="ribbon-tool" onClick={onFitSelection}><RibbonIcon name="i-fit" /><span data-v1-label="選択に合わせる">Fit Selection</span></button><button type="button" className="ribbon-tool" onClick={onFitAll}><RibbonIcon name="i-fit" /><span data-v1-label="全体表示">Fit All</span></button></div>{!visualReference && <div className="home-display-subgroup" aria-label="Display"><div className="home-display-toggles"><label className="home-toggle"><input data-testid="home-grid-toggle" type="checkbox" checked={gridEnabled} onChange={onToggleGrid} /> Grid</label><label className="home-toggle"><input data-testid="home-minimap-toggle" type="checkbox" checked={minimapEnabled} onChange={onToggleMinimap} /> MiniMap</label><label className="home-toggle"><input data-testid="home-snap-toggle" type="checkbox" checked={snapEnabled} onChange={onToggleSnap} /> Snap</label><label className="home-toggle"><input data-testid="home-ruler-toggle" type="checkbox" checked={rulerEnabled} onChange={onToggleRuler} /> Ruler</label></div></div>}<b>View</b></div>
      </div>
      {visualReference && <div className="ribbon-major-group" data-major-group="Display" aria-label="Display commands">
       <div className="ribbon-group home-display-group" aria-label="Display"><div className="home-display-toggles"><label className="home-toggle"><input data-testid="home-grid-toggle" type="checkbox" checked={gridEnabled} onChange={onToggleGrid} /> Grid</label><label className="home-toggle"><input data-testid="home-minimap-toggle" type="checkbox" checked={minimapEnabled} onChange={onToggleMinimap} /> MiniMap</label><label className="home-toggle"><input data-testid="home-snap-toggle" type="checkbox" checked={snapEnabled} onChange={onToggleSnap} /> Snap</label><label className="home-toggle"><input data-testid="home-ruler-toggle" type="checkbox" checked={rulerEnabled} onChange={onToggleRuler} /> Ruler</label></div><b>Display</b></div>
      </div>}
      <div className="ribbon-major-group" data-major-group="Options" aria-label="Options commands">
       <div className="ribbon-group properties-group" aria-label="Properties"><button type="button" className="ribbon-tool" onClick={onProperties}><RibbonIcon name="i-properties" /><span data-v1-label="設定">Properties</span></button><b>Properties</b></div>
       <div className="ribbon-group home-review-group" aria-label="Review"><button type="button" className="ribbon-tool" aria-label="Problems" onClick={onShowProblems}><RibbonIcon name="i-filter" /><span data-v1-label="問題">Problems</span></button><output>{problemsCount}</output><b>Review</b></div>
       <div className="ribbon-group home-export-group" aria-label="Export"><button type="button" className="ribbon-tool" aria-label="SVG / PNG / PDF" onClick={onExport}><RibbonIcon name="i-export" /><span data-v1-label="SVG / PNG / PDF">SVG / PNG / PDF</span></button><b>Export</b></div>
      </div>
      <div className="home-overflow-group" aria-label="More Home Commands">
        <button type="button" className="ribbon-tool home-overflow-trigger" aria-expanded={homeOverflowOpen} onClick={() => setHomeOverflowOpen((value) => !value)}><RibbonIcon name="i-more" /><span>More</span></button>
        {homeOverflowOpen && <div className="home-overflow-menu" role="menu" aria-label="More Home Commands">
          <strong>File</strong><button type="button" onClick={() => { onNew(); setHomeOverflowOpen(false); }}>New</button><button type="button" onClick={() => { onOpen(); setHomeOverflowOpen(false); }}>Open</button><button type="button" onClick={() => { onSave(); setHomeOverflowOpen(false); }}>Save</button><button type="button" onClick={() => { onSaveAs(); setHomeOverflowOpen(false); }}>Save As</button><button type="button" onClick={() => { onRecent(); setHomeOverflowOpen(false); }}>Recent</button>
          <strong>History</strong><button type="button" onClick={() => { onUndo(); setHomeOverflowOpen(false); }} disabled={!history.canUndo}>Undo</button><button type="button" onClick={() => { onRedo(); setHomeOverflowOpen(false); }} disabled={!history.canRedo}>Redo</button>
          <strong>Clipboard</strong><button type="button" onClick={() => { onCopy(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Copy</button><button type="button" onClick={() => { onCut(); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Cut</button><button type="button" onClick={() => { onPaste(); setHomeOverflowOpen(false); }} disabled={!clipboardAvailable}>Paste</button><button type="button" onClick={() => { onDuplicate(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Duplicate</button>
          <strong>Edit / Selection</strong><button type="button" onClick={() => { onDelete(); setHomeOverflowOpen(false); }}>Delete</button><button type="button" onClick={() => { onRename(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Rename</button><button type="button" onClick={() => { onClearSelection(); setHomeOverflowOpen(false); }}>Clear Selection</button><button type="button" onClick={() => { onSelectAll(); setHomeOverflowOpen(false); }} disabled={document.signals.every((signal) => signal.type === "commentRow")}>Select All</button>
          <strong>Visibility / Arrange</strong><button type="button" onClick={() => { onVisibility(true); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Show</button><button type="button" onClick={() => { onVisibility(false); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Hide</button><button type="button" onClick={() => { onMoveUp(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Move Up</button><button type="button" onClick={() => { onMoveDown(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Move Down</button>
           <strong>View</strong><button type="button" onClick={() => { onZoom(-0.25); setHomeOverflowOpen(false); }}>Zoom −</button><button type="button" onClick={() => { onZoom(0.25); setHomeOverflowOpen(false); }}>Zoom +</button><button type="button" onClick={() => { onSetZoom(0.5); setHomeOverflowOpen(false); }}>Zoom 50%</button><button type="button" onClick={() => { onSetZoom(1); setHomeOverflowOpen(false); }}>Zoom 100%</button><button type="button" onClick={() => { onSetZoom(1.5); setHomeOverflowOpen(false); }}>Zoom 150%</button><button type="button" onClick={() => { onSetZoom(2); setHomeOverflowOpen(false); }}>Zoom 200%</button><button type="button" onClick={() => { onFitSelection(); setHomeOverflowOpen(false); }}>Fit Selection</button><button type="button" onClick={() => { onFitAll(); setHomeOverflowOpen(false); }}>Fit All</button><button type="button" onClick={() => { onToggleGrid(); setHomeOverflowOpen(false); }}>Grid</button><button type="button" onClick={() => { onToggleSnap(); setHomeOverflowOpen(false); }}>Snap</button><button type="button" onClick={() => { onToggleRuler(); setHomeOverflowOpen(false); }}>Ruler</button><button type="button" onClick={() => { onToggleMinimap(); setHomeOverflowOpen(false); }}>MiniMap</button>
          <strong>Document</strong><button type="button" onClick={() => { onProperties(); setHomeOverflowOpen(false); }}>Properties</button><button type="button" onClick={() => { onShowProblems(); setHomeOverflowOpen(false); }}>Problems</button><button type="button" onClick={() => { onExport(); setHomeOverflowOpen(false); }}>SVG / PNG / PDF</button>
        </div>}
        <b>More</b>
      </div>
    </>) }
    {tab === "Insert" && <div className="ribbon-group insert-group">
      <button type="button" className="ribbon-tool" onClick={() => insertValueSignal("binary")}><RibbonIcon name="i-plus" /><span>Signal</span></button>
      <button type="button" className="ribbon-tool" onClick={insertClockSignal}><RibbonIcon name="i-clock" /><span>Clock</span></button>
      <button type="button" className="ribbon-tool" onClick={() => insertValueSignal("bus")}><RibbonIcon name="i-plus" /><span>Bus</span></button>
      <button type="button" className="ribbon-tool" onClick={() => insertValueSignal("state")}><RibbonIcon name="i-plus" /><span>State</span></button>
      <button type="button" className="ribbon-tool" onClick={insertGroup}><RibbonIcon name="i-plus" /><span>Group</span></button>
      <button type="button" className="ribbon-tool" onClick={insertCommentRow}><RibbonIcon name="i-comment" /><span>Comment Row</span></button>
      <b>Insert</b>
    </div>}
    {tab === "Timeline" && <div className="ribbon-group timeline-group"><TimelineToolbar document={document} range={range} onRange={onRange} onCommand={onCommand} onNavigateBookmark={onNavigateBookmark} /><b>Timeline</b></div>}
    {tab === "Annotation" && <div className="ribbon-group annotation-group"><AnnotationToolbar document={document} range={range} signalId={selectedSignalId} onCreate={onCreateAnnotation} arrowPickStatus={arrowPickStatus} onArmArrow={onArrowPick} /><b>Annotation</b></div>}
    {tab === "View" && <div className="ribbon-group view-group"><button type="button" className="ribbon-tool" onClick={() => onZoom(-0.25)}><RibbonIcon name="i-zoom-out" /><span data-v1-label="ズーム−">Zoom out</span></button><output data-testid="zoom-status">{Math.round(zoom * 100)}%</output><select aria-label="Zoom preset" value={String(Math.round(zoom * 100))} onChange={(event) => onSetZoom(Number(event.target.value) / 100)}><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></select><button type="button" className="ribbon-tool" onClick={() => onZoom(0.25)}><RibbonIcon name="i-zoom-in" /><span data-v1-label="ズーム＋">Zoom in</span></button><button type="button" className="ribbon-tool" aria-label="Fit Selection" onClick={onFitSelection}><RibbonIcon name="i-fit" /><span data-v1-label="選択に合わせる">Fit Selection</span></button><button type="button" className="ribbon-tool" aria-label="Fit All" onClick={onFitAll}><RibbonIcon name="i-fit" /><span data-v1-label="全体表示">Fit All</span></button><div className="ribbon-toggles"><button type="button" onClick={onToggleInspector}>Inspector</button><button type="button" onClick={onToggleBottom}>Bottom Editor</button><label><input data-testid="grid-toggle" type="checkbox" checked={gridEnabled} onChange={onToggleGrid} /> Grid</label><label><input data-testid="snap-toggle" type="checkbox" checked={snapEnabled} onChange={onToggleSnap} /> Snap</label><label><input data-testid="ruler-toggle" type="checkbox" checked={rulerEnabled} onChange={onToggleRuler} /> Ruler</label><label><input data-testid="minimap-toggle" type="checkbox" checked={minimapEnabled} onChange={onToggleMinimap} /> MiniMap</label></div><b>View</b></div>}
    {tab === "Review" && <div className="ribbon-group review-group"><button type="button" className="ribbon-tool" onClick={onShowProblems}><RibbonIcon name="i-filter" /><span>Problems</span></button><output data-testid="review-problems-count">{problemsCount}</output><b>Review</b></div>}
    {tab === "AI" && <div className="ribbon-group ai-group"><AIOperationPanel document={document} revision={revision} selectedSignalId={selectedSignalId} onCommand={onCommand} /><b>AI</b></div>}
  </section>;
}

function V8GoldenHomeRibbon({ document, range, history, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, hasSelectedSignal, hasSelectedClipboard, hasSelectedEntity, onCommand, onNew, onOpen, onSave, onSaveAs, onUndo, onRedo, onCopy, onCut, onPaste, onDelete, onDuplicate, onMoveUp, onMoveDown, onZoom, onFitAll, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onOpenTimeline, onOpenProperties, onShowProblems }: {
  readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState;
  readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly minimapEnabled: boolean;
  readonly hasSelectedSignal: boolean; readonly hasSelectedClipboard: boolean; readonly hasSelectedEntity: boolean;
  readonly onCommand: (command: SemanticCommand) => void; readonly onNew: () => void; readonly onOpen: () => void; readonly onSave: () => void; readonly onSaveAs: () => void;
  readonly onUndo: () => void; readonly onRedo: () => void; readonly onCopy: () => void; readonly onCut: () => void; readonly onPaste: () => void; readonly onDelete: () => void; readonly onDuplicate: () => void; readonly onMoveUp: () => void; readonly onMoveDown: () => void; readonly onZoom: (delta: number) => void; readonly onFitAll: () => void;
  readonly onToggleGrid: () => void; readonly onToggleSnap: () => void; readonly onToggleRuler: () => void; readonly onToggleMinimap: () => void; readonly onOpenTimeline: () => void; readonly onOpenProperties: () => void; readonly onShowProblems: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const cycleCommand = (type: "timeline.insert" | "timeline.delete", count: number) => {
    if (type === "timeline.insert") onCommand({ id: nextCommandId("v8_timeline_insert"), type, at: range.start, count });
    else onCommand({ id: nextCommandId("v8_timeline_delete"), type, start: range.start, end: Math.min(document.timeline.cycleCount, range.start + count) });
  };
  const tool = (label: string, icon: string, action: () => void, disabled = false) => <button type="button" className="ribbon-tool v8-golden-tool" aria-label={label} onClick={action} disabled={disabled}><RibbonIcon name={icon} /><span>{label}</span></button>;
  return <>
    <div className="ribbon-major-group v8-golden-major" data-major-group="File" aria-label="File commands">{tool("New", "i-new", onNew)}{tool("Open", "i-open", onOpen)}{tool("Save", "i-save", onSave)}{tool("Save As", "i-save", onSaveAs)}<b>File</b></div>
    <div className="ribbon-major-group v8-golden-major" data-major-group="Edit" aria-label="Edit commands">{tool("Undo", "i-undo", onUndo, !history.canUndo)}{tool("Redo", "i-redo", onRedo, !history.canRedo)}{tool("Cut", "i-cut", onCut, !hasSelectedClipboard)}{tool("Copy", "i-copy", onCopy, !hasSelectedClipboard)}{tool("Paste", "i-paste", onPaste, !history.canUndo && !history.canRedo)}{tool("Delete", "i-delete", onDelete)}{tool("Duplicate", "i-duplicate", onDuplicate, !hasSelectedClipboard)}<b>Edit</b></div>
    <div className="ribbon-major-group v8-golden-major" data-major-group="Layout" aria-label="Layout commands">{tool("Up", "i-up", onMoveUp, !hasSelectedEntity)}{tool("Down", "i-down", onMoveDown, !hasSelectedEntity)}{tool("Cycle Insert", "i-plus", () => cycleCommand("timeline.insert", 1))}{tool("Cycle Delete", "i-delete", () => cycleCommand("timeline.delete", 1))}{tool("N Cycle Insert", "i-plus", () => cycleCommand("timeline.insert", 2))}{tool("N Cycle Delete", "i-delete", () => cycleCommand("timeline.delete", 2))}<b>Layout</b></div>
    <div className="ribbon-major-group v8-golden-major v8-compact-time-group" data-major-group="Time" aria-label="Time commands">{tool("Align interval", "i-align", onOpenTimeline)}{tool("Group", "i-group", () => onCommand({ id: nextCommandId("v8_time_group"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), presentation: { collapsed: false, foldStyle: "none" } } }))}{tool("Auto Layout", "i-layout", () => onCommand({ id: nextCommandId("v8_auto_layout"), type: "document.updateLayout", layout: { ...document.layout, rowHeight: Math.max(24, document.layout.rowHeight), signalSpacing: Math.max(2, document.layout.signalSpacing) } }))}<b>Time</b></div>
    <div className="ribbon-major-group v8-golden-major" data-major-group="Zoom" aria-label="Zoom commands">{tool("Zoom Out", "i-zoom-out", () => onZoom(-0.25))}<output>100%</output>{tool("Zoom In", "i-zoom-in", () => onZoom(0.25))}{tool("Fit All", "i-fit", onFitAll)}<b>Zoom</b></div>
    <div className="ribbon-major-group v8-golden-major" data-major-group="Display" aria-label="Display commands"><label><input data-testid="home-grid-toggle" type="checkbox" checked={gridEnabled} onChange={onToggleGrid} /> Grid</label><label><input data-testid="home-minimap-toggle" type="checkbox" checked={minimapEnabled} onChange={onToggleMinimap} /> MiniMap</label><label><input data-testid="home-snap-toggle" type="checkbox" checked={snapEnabled} onChange={onToggleSnap} /> Snap</label><label><input data-testid="home-ruler-toggle" type="checkbox" checked={rulerEnabled} onChange={onToggleRuler} /> Ruler</label><b>Display</b></div>
    <div className="ribbon-major-group v8-golden-major v8-golden-options" data-major-group="Options" aria-label="Options commands">{tool("More", "i-more", () => setMoreOpen((value) => !value))}{moreOpen && <div className="v8-more-menu" role="menu" aria-label="More Home Commands"><button type="button" role="menuitem" onClick={() => { onOpenProperties(); setMoreOpen(false); }}>Document Properties</button><button type="button" role="menuitem" onClick={() => { onShowProblems(); setMoreOpen(false); }}>Problems</button><button type="button" role="menuitem" onClick={() => { onOpenTimeline(); setMoreOpen(false); }}>Timeline Editor</button></div>}<b>Options</b></div>
  </>;
}

function InspectorPanel({ signal, group, annotation, transaction, collapsedGroup, onToggleGroupCollapse, registry, document, viewport, onCommand, onReveal }: { readonly signal: Signal | undefined; readonly group: SignalGroup | undefined; readonly annotation: Annotation | undefined; readonly transaction: Transaction | undefined; readonly collapsedGroup: boolean; readonly onToggleGroupCollapse: (() => void) | undefined; readonly registry: UiCommandRegistry; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onReveal: () => void }) {
  const [name, setName] = useState(signal?.name ?? "");
  const [groupName, setGroupName] = useState(group?.name ?? "");
  const [spacingBefore, setSpacingBefore] = useState(group?.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(group?.spacingAfter ?? 0);
  const [groupShowBackground, setGroupShowBackground] = useState(group?.style?.showBackground ?? false);
  const [groupBackground, setGroupBackground] = useState(group?.style?.background ?? "#eef5fc");
  const [groupOpacity, setGroupOpacity] = useState(group?.style?.opacity ?? 1);
  const [groupBorder, setGroupBorder] = useState(group?.style?.border ?? "#d8e0e9");
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
  if (Boolean(signal)) return <InspectorSignalEditor signal={signal as Signal} document={document} viewport={viewport} onCommand={onCommand} onReveal={onReveal} />;
  if (Boolean(annotation)) return <InspectorAnnotationEditor annotation={annotation as Annotation} document={document} viewport={viewport} onCommand={onCommand} onDelete={() => registry.execute("selection.delete")} />;
  if (!group && !transaction) return <LayoutInspector document={document} viewport={viewport} onCommand={onCommand} />;
  const spacerEditor = group ? <section data-testid="inspector-spacers"><h3>Spacer Rows</h3><button type="button" data-testid="add-spacer" onClick={() => onCommand({ id: nextCommandId("spacer_create"), type: "spacer.create", spacer: { id: spacerId(nextEntityId("spacer", document)), height: 24 }, targetGroupId: group.id, index: group.rows.length })}>Add Spacer</button>{(group.spacers ?? []).map((spacer) => <form key={spacer.id} data-spacer-id={spacer.id} onSubmit={(event) => { event.preventDefault(); const height = Number(new FormData(event.currentTarget).get("height")); onCommand({ id: nextCommandId("spacer_update"), type: "spacer.update", spacerId: spacer.id, height }); }}><code>{spacer.id}</code><label>Height<input name="height" aria-label={`Spacer height ${spacer.id}`} type="number" min="1" step="1" defaultValue={spacer.height} /></label><button type="submit">Apply Height</button><button type="button" onClick={() => onCommand({ id: nextCommandId("spacer_delete"), type: "spacer.delete", spacerId: spacer.id })}>Delete</button></form>)}</section> : null;
  return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span><button type="button">•••</button></header>
    {!signal && !group && !annotation && !transaction && <section className="inspector-empty">No selection</section>}
    {spacerEditor}
    {signal && <>
      <section><h3>Signal</h3><div className="property-row"><span>Type</span><b>{signal.type}</b></div><label>Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== signal.name) registry.execute("selection.rename", { name }); }} /></label><label>Role<select aria-label="Inspector signal role" value={signal.role} disabled><option>{signal.role}</option></select></label><label>Width<input value={signal.type === "bus" ? signal.width ?? "" : 1} readOnly /></label><label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => { setVisible(event.target.checked); registry.execute("selection.visibility", { visible: event.target.checked }); }} /></label><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Signal</button></section>
      <section><h3>Layout</h3><div className="property-row"><span>Row height</span><span>{document.layout.rowHeight}px</span></div><div className="property-row"><span>Spacing</span><span>{document.layout.signalSpacing}px</span></div></section>
      {signal.type === "clock" && edgeCounter && <section><h3>Edge Numbers</h3><label className="checkline">Show<input aria-label="Edge Numbers show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Edge Numbers mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start number<input aria-label="Edge Numbers start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count from<select aria-label="Edge Numbers count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Edge Numbers every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Edge Numbers position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Edge Numbers X" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Edge Numbers Y" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="button" onClick={() => onCommand({ id: nextCommandId("edge_counter"), type: "signal.updateEdgeCounter", signalId: signal.id, edgeCounter })}>Apply Edge Numbers</button></section>}
    </>}
    {group && <section><h3>Group</h3><label>Name<input aria-label="Inspector group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><label>Spacing Before<input aria-label="Group spacing before" type="number" min="0" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Group spacing after" type="number" min="0" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label><label className="checkline">Show Background<input aria-label="Group show background" type="checkbox" checked={groupShowBackground} onChange={(event) => setGroupShowBackground(event.target.checked)} /></label><label>Background<input aria-label="Group background" type="color" value={groupBackground} onChange={(event) => setGroupBackground(event.target.value)} /></label><label>Opacity<input aria-label="Group opacity" type="number" min="0" max="1" step="0.05" value={groupOpacity} onChange={(event) => setGroupOpacity(Number(event.target.value))} /></label><label>Border<input aria-label="Group border" value={groupBorder} onChange={(event) => setGroupBorder(event.target.value)} /></label><label>Extend<select aria-label="Group extend" value={groupExtend} onChange={(event) => setGroupExtend(event.target.value as typeof groupExtend)}><option value="label">Label</option><option value="waveform">Waveform</option><option value="both">Both</option></select></label><label className="checkline">Show Header<input aria-label="Group show header" type="checkbox" checked={groupShowHeader} onChange={(event) => setGroupShowHeader(event.target.checked)} /></label><button type="button" data-testid="apply-group-properties" onClick={() => onCommand({ id: nextCommandId("group_properties"), type: "group.updateProperties", groupId: group.id, name: groupName, spacingBefore, spacingAfter, style: { showBackground: groupShowBackground, background: groupBackground, opacity: groupOpacity, extend: groupExtend, border: groupBorder, showHeader: groupShowHeader } })}>Apply Group Properties</button><div className="property-row"><span>Rows</span><span>{group.rows.length}</span></div><label className="checkline">Collapsed<input aria-label="Inspector group collapsed" type="checkbox" checked={collapsedGroup} onChange={() => onToggleGroupCollapse?.()} /></label><small className="inspector-note">Collapse is a view-only layout preference; it does not change Canonical, History, or Dirty state.</small></section>}
    {transaction && <section><h3>Transaction</h3><label>Name<input aria-label="Transaction name" value={transactionName} onChange={(event) => setTransactionName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={transactionEnd - 1} value={transactionStart} onChange={(event) => setTransactionStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={transactionStart + 1} max={document.timeline.cycleCount} value={transactionEnd} onChange={(event) => setTransactionEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={transactionLane} onChange={(event) => setTransactionLane(event.target.value)} /></label><label>Phases JSON<textarea aria-label="Transaction phases" rows={5} value={transactionPhases} onChange={(event) => setTransactionPhases(event.target.value)} spellCheck={false} /></label><button type="button" data-testid="apply-transaction-properties" onClick={() => { try { const phases = JSON.parse(transactionPhases) as unknown; if (!Array.isArray(phases) || phases.some((phase) => typeof phase !== "object" || phase === null || typeof (phase as { name?: unknown }).name !== "string" || !Number.isInteger((phase as { start?: unknown }).start) || !Number.isInteger((phase as { end?: unknown }).end))) throw new Error("Phases must be an array of {name,start,end} objects."); setTransactionStatus(""); onCommand({ id: nextCommandId("transaction_update"), type: "transaction.update", transactionId: transaction.id, name: transactionName, start: transactionStart, end: transactionEnd, laneId: transactionLane, phases }); } catch (error) { setTransactionStatus(error instanceof Error ? error.message : "Invalid phases JSON"); } }}>Apply Transaction</button>{transactionStatus && <output role="status">{transactionStatus}</output>}<h3>Linked Signals</h3>{document.signals.filter((item) => item.type !== "commentRow").map((item) => <label className="checkline" key={item.id}>{item.display.name}<input aria-label={`Link ${item.display.name}`} type="checkbox" checked={transaction.linkedSignals?.includes(item.id) ?? false} onChange={(event) => onCommand({ id: nextCommandId("transaction_link"), type: event.target.checked ? "transaction.linkSignal" : "transaction.unlinkSignal", transactionId: transaction.id, signalId: item.id })} /></label>)}<button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Transaction</button></section>}
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

function InspectorAnnotationEditor({ annotation, document, viewport, onCommand, onDelete }: { readonly annotation: Annotation; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onDelete: () => void }) {
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
  return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span><b>Annotation</b></header>
    <form className="inspector-annotation-properties" aria-label="Inspector Annotation" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("inspector_annotation_properties"), type: "annotation.updateProperties", annotationId: annotation.id, label, visible, color, ...(annotation.type === "arrow" ? { lineType, arrowhead } : {}) });
    }}>
      <section><h3>Annotation</h3><div className="property-row"><span>Type</span><b>{annotation.type}</b></div><label>Label<input aria-label="Inspector annotation label" value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Color<input aria-label="Inspector annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label className="checkline">Visible<input aria-label="Inspector annotation visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>{annotation.type === "arrow" && <><label>Line<select aria-label="Inspector annotation line type" value={lineType} onChange={(event) => setLineType(event.target.value as typeof lineType)}><option value="straight">Straight</option><option value="orthogonal">Orthogonal</option><option value="curve">Curve</option><option value="diagonal">Diagonal</option></select></label><label>Arrow<select aria-label="Inspector annotation arrowhead" value={arrowhead} onChange={(event) => setArrowhead(event.target.value as typeof arrowhead)}><option value="end">End</option><option value="start">Start</option><option value="bidirectional">Both</option><option value="none">None</option></select></label></>}</section>
      <section><div className="property-row"><span>Anchor</span><span>{selectedAnchor?.point ?? "—"}</span></div><div className="annotation-anchor-editor" aria-label="Inspector Annotation Anchor"><label>Endpoint<select aria-label="Inspector annotation endpoint" value={anchorField} onChange={(event) => { const nextField = event.target.value as AnchorField; const nextAnchor = (annotation as Partial<Record<AnchorField, SemanticAnchor>>)[nextField]; setAnchorField(nextField); setAnchorX(nextAnchor?.offset?.x ?? 0); setAnchorY(nextAnchor?.offset?.y ?? 0); setAnchorCycle(nextAnchor?.cycle ?? 0); setAnchorSignalId(nextAnchor?.signalId); setAnchorPoint(nextAnchor?.point ?? "cycle-start"); }}>{anchorFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label><label>Signal<select aria-label="Inspector annotation anchor signal" value={anchorSignalId ?? ""} onChange={(event) => setAnchorSignalId((event.target.value || undefined) as SignalId | undefined)}><option value="">(none)</option>{document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label><label>Cycle<input aria-label="Inspector annotation anchor cycle" type="number" min="0" max={document.timeline.cycleCount - 1} value={anchorCycle} onChange={(event) => setAnchorCycle(Number(event.target.value))} /></label><label>Point<select aria-label="Inspector annotation anchor point" value={anchorPoint} onChange={(event) => setAnchorPoint(event.target.value as SemanticAnchor["point"])}>{(["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"] as const).map((point) => <option key={point} value={point}>{point}</option>)}</select></label><label>X offset<input aria-label="Inspector annotation anchor X" type="number" value={anchorX} onChange={(event) => setAnchorX(Number(event.target.value))} /></label><label>Y offset<input aria-label="Inspector annotation anchor Y" type="number" value={anchorY} onChange={(event) => setAnchorY(Number(event.target.value))} /></label><button type="button" data-testid="apply-inspector-annotation-anchor" disabled={!selectedAnchor} onClick={() => { if (selectedAnchor) onCommand({ id: nextCommandId("inspector_annotation_anchor"), type: "annotation.setAnchor", annotationId: annotation.id, field: anchorField, anchor: { ...selectedAnchor, ...(anchorSignalId === undefined ? {} : { signalId: anchorSignalId }), cycle: anchorCycle, point: anchorPoint, offset: { x: anchorX, y: anchorY } } }); }}>Apply Anchor</button></div><button type="submit" data-testid="apply-inspector-annotation">Apply Annotation</button><button type="button" className="danger" onClick={onDelete}>Delete Annotation</button></section>
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

function InspectorSignalEditor({ signal, document, viewport, onCommand, onReveal }: { readonly signal: Signal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onReveal: () => void }) {
  if (signal.type === "clock") return <InspectorClockEditor signal={signal} document={document} viewport={viewport} onCommand={onCommand} onReveal={onReveal} />;
  if (signal.type === "commentRow") return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span></header><section><h3>Comment Row</h3><div className="property-row"><span>Title</span><b>{signal.title}</b></div><div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div><p className="inspector-note">Comment Row editing is owned by the Bottom Context Editor.</p></section><MiniMap document={document} viewport={viewport} /></aside>;
  return <InspectorValueSignalEditor signal={signal} document={document} viewport={viewport} onCommand={onCommand} onReveal={onReveal} />;
}

function InspectorValueSignalEditor({ signal, document, viewport, onCommand, onReveal }: { readonly signal: ValueSignal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onReveal: () => void }) {
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
     onCommand({ id: nextCommandId("inspector_signal_properties"), type: "signal.updateProperties", signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}), visible, spacingBefore, spacingAfter, displayAlign: align, displayOverflow: overflow, displayStyle: { ...parsedStyle, ...structuredStyle } });
  };
  const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".") || signal.source.signalName;
  return <aside className="inspector" data-testid="inspector" data-inspector-context="signal"><header><span>Inspector</span><b>Signal</b></header>
    <form className="inspector-signal-properties" data-testid="inspector-signal-properties" onSubmit={apply}>
      <section><h3>Signal</h3>
        <label>Display Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Inspector signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Logic</option><option value="event">Event</option><option value="pulse">Pulse</option></select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Inspector signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Bus format<select aria-label="Inspector bus format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label></>}
        <label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>
        <label>Spacing Before<input aria-label="Inspector signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
        <label>Spacing After<input aria-label="Inspector signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
      </section>
      <section><h3>Hierarchy</h3><div className="property-row"><span>Instance Path</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div><div className="property-row"><span>Signal Name</span><span>{signal.source.signalName}</span></div><div className="property-row"><span>Full Path</span><span title={fullPath}>{fullPath}</span></div><div className="property-row"><span>Bus Range</span><span>{signal.source.msb === undefined ? "—" : `[${signal.source.msb}:${signal.source.lsb ?? 0}]`}</span></div><button type="button" data-testid="reveal-in-hierarchy" onClick={onReveal}>Reveal in Hierarchy</button></section>
      <section><h3>Label Style</h3><label>Text Color<input aria-label="Inspector text color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label>Background<input aria-label="Inspector label background" type="color" value={rowBackground} onChange={(event) => setRowBackground(event.target.value)} /></label><label>Font<input aria-label="Inspector label font" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label><label>Size<input aria-label="Inspector label size" type="number" min="6" max="48" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><div className="inspector-style-checks"><label className="checkline">Bold<input aria-label="Inspector label bold" type="checkbox" checked={bold} onChange={(event) => setBold(event.target.checked)} /></label><label className="checkline">Italic<input aria-label="Inspector label italic" type="checkbox" checked={italic} onChange={(event) => setItalic(event.target.checked)} /></label><label className="checkline">Underline<input aria-label="Inspector label underline" type="checkbox" checked={underline} onChange={(event) => setUnderline(event.target.checked)} /></label><label className="checkline">Strikethrough<input aria-label="Inspector label strikethrough" type="checkbox" checked={strikethrough} onChange={(event) => setStrikethrough(event.target.checked)} /></label></div><label>Align<select aria-label="Inspector label align" value={align} onChange={(event) => setAlign(event.target.value as typeof align)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overflow<select aria-label="Inspector label overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label></section>
      <section><h3>Waveform / Row Style</h3><label>Waveform Color<input aria-label="Inspector waveform color" type="color" value={waveformColor} onChange={(event) => setWaveformColor(event.target.value)} /></label><label>Row Background<input aria-label="Inspector waveform background" type="color" value={waveformBackground} onChange={(event) => setWaveformBackground(event.target.value)} /></label><label>Advanced Style JSON<textarea aria-label="Inspector waveform row style" value={style} onChange={(event) => setStyle(event.target.value)} rows={3} /></label></section>
      {problem && <div className="editor-problem" role="alert">{problem}</div>}
      <button type="submit" data-testid="apply-inspector-signal">Apply Signal Properties</button>
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

function InspectorClockEditor({ signal, document, viewport, onCommand, onReveal }: { readonly signal: ClockSignal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void; readonly onReveal: () => void }) {
  const [name, setName] = useState(signal.name);
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
  const number = (key: "start" | "period" | "duty" | "phase", value: string) => setGenerator({ ...generator, [key]: Number(value) });
  const applyProperties = (event: React.FormEvent) => {
    event.preventDefault();
    const decorations = [underline ? "underline" : "", strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
     onCommand({ id: nextCommandId("inspector_clock_properties"), type: "signal.updateProperties", signalId: signal.id, name, role, visible, spacingBefore, spacingAfter, displayAlign: align, displayOverflow: overflow, displayStyle: { ...styleObject, color: textColor, background: rowBackground, fontFamily, fontSize, fontWeight: bold ? "bold" : "normal", fontStyle: italic ? "italic" : "normal", textDecoration: decorations, waveformColor, waveformBackground } });
  };
  return <aside className="inspector" data-testid="inspector" data-inspector-context="clock"><header><span>Inspector</span><b>Clock</b></header>
    <div className="inspector-scroll">
    <section><h3>Signal Properties</h3><form className="inspector-clock-properties" aria-label="Inspector Clock Properties" onSubmit={applyProperties}>
      <label>Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Type<select aria-label="Inspector signal type" value="clock" disabled><option value="clock">Clock</option></select></label>
      <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
      <label className="checkline">Show in waveform<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>
      <label>Spacing Before<input aria-label="Inspector signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
      <label>Spacing After<input aria-label="Inspector signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
      <button type="submit" data-testid="apply-inspector-clock-properties">Apply Properties</button>
    </form></section>
    <section><h3>Source / Hierarchy</h3><div className="property-row"><span>Instance Path</span><span>{signal.source.instancePath.join(".") || "(top)"}</span></div><div className="property-row"><span>Leaf Signal</span><span>{signal.source.signalName}</span></div><div className="property-row"><span>Bus Range</span><span>—</span></div><button type="button" data-testid="reveal-in-hierarchy" onClick={onReveal}>Reveal in Hierarchy</button></section>
    <section><h3>Label Style</h3><label>Text Color<input aria-label="Inspector text color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label>Background<input aria-label="Inspector label background" type="color" value={rowBackground} onChange={(event) => setRowBackground(event.target.value)} /></label><label>Font<input aria-label="Inspector label font" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label><label>Size<input aria-label="Inspector label size" type="number" min="6" max="48" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><div className="inspector-style-checks"><label className="checkline">Bold<input aria-label="Inspector label bold" type="checkbox" checked={bold} onChange={(event) => setBold(event.target.checked)} /></label><label className="checkline">Italic<input aria-label="Inspector label italic" type="checkbox" checked={italic} onChange={(event) => setItalic(event.target.checked)} /></label><label className="checkline">Underline<input aria-label="Inspector label underline" type="checkbox" checked={underline} onChange={(event) => setUnderline(event.target.checked)} /></label><label className="checkline">Strikethrough<input aria-label="Inspector label strikethrough" type="checkbox" checked={strikethrough} onChange={(event) => setStrikethrough(event.target.checked)} /></label></div><label>Align<select aria-label="Inspector label align" value={align} onChange={(event) => setAlign(event.target.value as typeof align)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overflow<select aria-label="Inspector label overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label></section>
    <section><h3>Waveform / Timing</h3><label>Waveform Color<input aria-label="Inspector waveform color" type="color" value={waveformColor} onChange={(event) => setWaveformColor(event.target.value)} /></label><label>Row Background<input aria-label="Inspector waveform background" type="color" value={waveformBackground} onChange={(event) => setWaveformBackground(event.target.value)} /></label></section>
    <section><h3>Clock Generator</h3><form className="inspector-clock-generator" aria-label="Inspector Clock Generator" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("inspector_clock_generator"), type: "signal.updateClockGenerator", signalId: signal.id, generator }); }}>
      <label>Start<input aria-label="Inspector clock start" type="number" min="0" step="1" value={generator.start} onChange={(event) => number("start", event.target.value)} /></label><label>Period<input aria-label="Inspector clock period" type="number" min="1" step="1" value={generator.period} onChange={(event) => number("period", event.target.value)} /></label><label>Duty<input aria-label="Inspector clock duty" type="number" min="0.01" max="1" step="0.01" value={generator.duty} onChange={(event) => number("duty", event.target.value)} /></label><label>Phase<input aria-label="Inspector clock phase" type="number" step="0.5" value={generator.phase} onChange={(event) => number("phase", event.target.value)} /></label><label>Initial<select aria-label="Inspector clock initial" value={generator.initial} onChange={(event) => setGenerator({ ...generator, initial: Number(event.target.value) as 0 | 1 })}><option value="0">0</option><option value="1">1</option></select></label><label>Polarity<select aria-label="Inspector clock polarity" value={generator.polarity} onChange={(event) => setGenerator({ ...generator, polarity: event.target.value as ClockGenerator["polarity"] })}><option value="positive">Positive</option><option value="negative">Negative</option></select></label><button type="submit" data-testid="apply-inspector-clock">Apply Clock Generator</button>
    </form></section>
    <section><h3>Edge Counter</h3><form className="inspector-edge-counter" aria-label="Inspector Edge Counter" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("inspector_edge_counter"), type: "signal.updateEdgeCounter", signalId: signal.id, edgeCounter }); }}>
      <label className="checkline">Show<input aria-label="Inspector edge counter show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Inspector edge counter mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start Number<input aria-label="Inspector edge counter start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count From<select aria-label="Inspector edge counter count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Inspector edge counter every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Inspector edge counter position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Inspector edge counter X offset" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Inspector edge counter Y offset" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="submit" data-testid="apply-inspector-edge-counter">Apply Edge Counter</button>
    </form></section>
    </div><MiniMap document={document} viewport={viewport} />
  </aside>;
}

function ProblemsPanel({ diagnostics, onNavigate }: { readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly onNavigate: (path: string) => void }) {
  const [filter, setFilter] = useState("");
  const visible = diagnostics.filter((item) => `${item.code} ${item.path} ${item.message}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="problems-panel" data-testid="problems-panel"><header><strong>Problems</strong><span>{diagnostics.length} diagnostics</span><input aria-label="Filter problems" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter" /><button type="button" onClick={() => setFilter("")}>Refresh</button></header>{visible.length === 0 ? <p>{diagnostics.length === 0 ? "No validation problems." : "No matching problems."}</p> : <table><thead><tr><th>Code</th><th>Path</th><th>Message</th></tr></thead><tbody>{visible.map((item, index) => <tr key={`${item.code}:${index}`}><td><button type="button" onClick={() => onNavigate(item.path)}>{item.code}</button></td><td>{item.path}</td><td>{item.message}</td></tr>)}</tbody></table>}</section>;
}

function JsonPanel({ document }: { readonly document: CanonicalDocument }) {
  const text = useMemo(() => serializeCanonicalDocument(document), [document]);
  const [status, setStatus] = useState("Read only");
  return <section className="json-panel" data-testid="json-panel"><div className="json-toolbar"><strong>Generated JSON</strong><span aria-label="JSON read-only status">Read only</span><button type="button" onClick={() => setStatus("Formatted")}>Format</button><button type="button" onClick={() => setStatus(validateCanonicalDocument(document).length === 0 ? "Valid" : "Invalid")}>Validate</button><button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setStatus("Copied"); }}>Copy</button><select aria-label="JSON scope"><option>Selected Object</option><option>Whole Document</option></select><output>{status}</output></div><pre>{text}</pre></section>;
}

function AdvancedJsonPanel({ document, selectedSignal, selectedGroup, selectedAnnotation, selectedTransaction, onCommand }: { readonly document: CanonicalDocument; readonly selectedSignal: Signal | undefined; readonly selectedGroup: SignalGroup | undefined; readonly selectedAnnotation: Annotation | undefined; readonly selectedTransaction: Transaction | undefined; readonly onCommand: (command: SemanticCommand) => void }) {
  const text = useMemo(() => serializeCanonicalDocument(document), [document]);
  const [advanced, setAdvanced] = useState(false);
  const [scope, setScope] = useState<"selected" | "document">("document");
  const [draft, setDraft] = useState(text);
  const [status, setStatus] = useState("Read only");
  const selected = selectedSignal ?? selectedGroup ?? selectedAnnotation ?? selectedTransaction;
  useEffect(() => { setDraft(scope === "selected" ? JSON.stringify(selected ?? {}, null, 2) : text); }, [scope, selected, text]);
  const parseDraft = (): unknown => {
    try { return JSON.parse(draft); } catch { setStatus("Invalid JSON"); return undefined; }
  };
  const format = () => {
    const value = parseDraft();
    if (value !== undefined) { setDraft(JSON.stringify(value, null, 2)); setStatus("Formatted"); }
  };
  const validate = () => {
    const value = parseDraft();
    if (value === undefined) return;
    if (scope === "document") setStatus(validateCanonicalDocument(value as CanonicalDocument).length === 0 ? "Valid" : "Invalid");
    else setStatus(selected && typeof value === "object" && value !== null && !Array.isArray(value) && (value as { id?: unknown }).id === selected.id ? "Valid" : "Invalid selected object");
  };
  const apply = () => {
    if (!advanced) return;
    const value = parseDraft();
    if (value === undefined || typeof value !== "object" || value === null || Array.isArray(value)) { setStatus("JSON object required"); return; }
    let next = value as CanonicalDocument;
    if (scope === "selected") {
      if (!selected) { setStatus("No selected object"); return; }
      if ((value as { id?: unknown }).id !== selected.id) { setStatus("Selected object ID cannot change"); return; }
      if (selectedSignal) next = { ...document, signals: document.signals.map((item) => item.id === selectedSignal.id ? value as Signal : item) };
      else if (selectedAnnotation) next = { ...document, annotations: document.annotations.map((item) => item.id === selectedAnnotation.id ? value as Annotation : item) };
      else if (selectedGroup) next = { ...document, signalGroups: document.signalGroups.map((item) => item.id === selectedGroup.id ? value as SignalGroup : item) };
      else next = { ...document, transactions: document.transactions.map((item) => item.id === selectedTransaction?.id ? value as Transaction : item) };
    }
    const problems = validateCanonicalDocument(next);
    if (problems.length > 0) { setStatus(`Invalid: ${problems[0]?.code ?? "validation"}`); return; }
    onCommand({ id: nextCommandId("json_replace"), type: "document.replace", document: next });
    setAdvanced(false);
    setStatus("Applied");
  };
  return <section className="json-panel" data-testid="json-panel"><div className="json-toolbar"><strong>JSON</strong><button type="button" data-testid="json-advanced-toggle" aria-pressed={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "Read Only" : "Advanced Editable"}</button><span aria-label="JSON editing mode">{advanced ? "Advanced" : "Read only"}</span><select aria-label="JSON scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="selected">Selected Object</option><option value="document">Whole Document</option></select><button type="button" onClick={format}>Format</button><button type="button" onClick={validate}>Validate</button><button type="button" onClick={() => { void navigator.clipboard?.writeText(draft); setStatus("Copied"); }}>Copy</button>{advanced && <button type="button" data-testid="apply-advanced-json" onClick={apply}>Apply JSON</button>}<output>{status}</output></div>{advanced ? <textarea aria-label="Advanced JSON" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /> : <pre>{text}</pre>}</section>;
}

function TransactionLanes({ document, zoom, selectedId, onSelect, onSnap, onCommand }: { readonly document: CanonicalDocument; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly onSelect: (id: TransactionId) => void; readonly onSnap: (clientX: number) => number | undefined; readonly onCommand: (command: SemanticCommand) => void }) {
  const lanes = [...new Set(["lane_0", ...document.transactions.map((transaction) => transaction.laneId ?? "lane_0")])].sort();
  const [drag, setDrag] = useState<{ id: TransactionId; edge: "body" | "start" | "end"; startX: number }>();
  const owner = useRef<HTMLElement>(null);
  const [cycleXs, setCycleXs] = useState<readonly number[]>([]);
  useEffect(() => {
    let frame = 0; let attempts = 0;
    const read = () => {
      const ruler = owner.current?.parentElement?.querySelector<HTMLElement>(".cycle-ruler");
      const values = Array.from(ruler?.querySelectorAll<HTMLElement>("[data-cycle]") ?? []).map((tick) => Number.parseFloat(tick.style.left));
      if (values.length >= document.timeline.cycleCount) {
        if (values.length === document.timeline.cycleCount && values.length > 1) values.push(values.at(-1)! + values.at(-1)! - values.at(-2)!);
        setCycleXs(values);
      }
      else if (attempts++ < 20) frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read); return () => cancelAnimationFrame(frame);
  }, [document.timeline.cycleCount, document.transactions, zoom]);
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
  const x = (cycle: number) => cycleXs[cycle];
  return <section ref={owner} className="transaction-lanes" data-testid="transaction-lanes" style={{ "--transaction-zoom": zoom } as React.CSSProperties}><div className="transaction-lane-labels">{lanes.map((lane) => <span key={lane}>{lane}</span>)}</div><div className="transaction-track">{lanes.map((lane, laneIndex) => <div className="transaction-lane" key={lane} style={{ top: laneIndex * 28 }}>{cycleXs.slice(0, document.timeline.cycleCount + 1).map((left, cycle) => <i className="transaction-geometry-line" aria-hidden="true" key={`cycle-${cycle}`} style={{ left }} />)}{document.transactions.filter((transaction) => (transaction.laneId ?? "lane_0") === lane).map((transaction) => { const startX = x(transaction.start); const endX = x(transaction.end); if (startX === undefined || endX === undefined) return null; return <button type="button" key={transaction.id} data-transaction-id={transaction.id} data-selected={String(selectedId === transaction.id)} style={{ left: startX, width: endX - startX }} onClick={() => onSelect(transaction.id)} onPointerUp={(event) => finish(event, transaction)}><i data-edge="start" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "start" })} /><span onPointerDown={(event) => capture(event, { id: transaction.id, edge: "body" })}>{transaction.name}</span><i data-edge="end" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "end" })} /></button>; })}</div>)}</div></section>;
}

function LayoutInspector({ document, viewport, onCommand }: { readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => void }) {
  const [rowHeight, setRowHeight] = useState(document.layout.rowHeight);
  const [signalSpacing, setSignalSpacing] = useState(document.layout.signalSpacing);
  useEffect(() => { setRowHeight(document.layout.rowHeight); setSignalSpacing(document.layout.signalSpacing); }, [document.layout.rowHeight, document.layout.signalSpacing]);
  return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span><b>Layout</b></header><form className="inspector-layout-editor" data-testid="inspector-layout-editor" onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("layout_properties"), type: "document.updateLayout", layout: { ...document.layout, rowHeight, signalSpacing } }); }}><section><h3>Layout</h3><label>Row height<input aria-label="Inspector row height" type="number" min="12" step="1" value={rowHeight} onChange={(event) => setRowHeight(Number(event.target.value))} /></label><label>Signal spacing<input aria-label="Inspector signal spacing" type="number" min="0" step="1" value={signalSpacing} onChange={(event) => setSignalSpacing(Number(event.target.value))} /></label><p className="inspector-note">Applied to the derived RowLayout; absolute screen Y is never stored.</p><button type="submit" data-testid="apply-inspector-layout">Apply Layout</button></section></form><MiniMap document={document} viewport={viewport} /></aside>;
}

function TransactionEditor({ transaction, document, history, onSelect, onCommand, onUndo, onRedo }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument; readonly history: HistoryState; readonly onSelect: (id: TransactionId) => void; readonly onCommand: (command: SemanticCommand) => void; readonly onUndo: () => void; readonly onRedo: () => void }) {
  const [name, setName] = useState("Transaction");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.min(5, document.timeline.cycleCount));
  const [laneId, setLaneId] = useState("lane_0");
  return <section className="transaction-editor" data-testid="transaction-editor"><header><strong>{transaction ? `Editing: ${transaction.name}` : "Transaction Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button></header><form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction", document) as TransactionId; onCommand({ id: nextCommandId("transaction_create"), type: "transaction.create", transaction: { id, name: name.trim() || "Transaction", start, end, laneId } }); onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Start<input aria-label="New Transaction start" type="number" min="0" max={end - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End<input aria-label="New Transaction end" type="number" min={start + 1} max={document.timeline.cycleCount} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /></label><button type="submit">Create Transaction</button></form><div className="transaction-list">{document.transactions.map((item) => <button type="button" key={item.id} data-selected={String(item.id === transaction?.id)} onClick={() => onSelect(item.id)}><b>{item.name}</b><span>{item.start}–{item.end}</span><span>{item.laneId ?? "lane_0"}</span><span>{item.linkedSignals?.length ?? 0} links</span></button>)}</div></section>;
}

function SaveAsDialog({ defaultName, onSave, onClose }: { readonly defaultName: string; readonly onSave: (name: string) => void; readonly onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState("");
  return <div className="modal-backdrop"><form className="save-as-dialog" role="dialog" aria-modal="true" aria-label="Save As" onSubmit={(event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === "." || trimmed === ".." || /[\\/:*?"<>|]/.test(trimmed)) { setError("Enter a valid filename."); return; }
    onSave(trimmed);
  }}><header><h2>Save As</h2><button type="button" aria-label="Close Save As" onClick={onClose}>×</button></header><label>Filename<input aria-label="Save As filename" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} autoFocus /></label>{error && <output role="alert">{error}</output>}<footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" data-testid="save-as-submit">Save</button></footer></form></div>;
}

function ExportDialog({ snapshot, range, onClose }: { readonly snapshot: CanonicalSnapshot; readonly range: { start: number; end: number }; readonly onClose: () => void }) {
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg");
  const [scope, setScope] = useState<"document" | "selected-range">("document");
  const [scale, setScale] = useState(2);
  const [pageSize, setPageSize] = useState<"A4" | "Letter" | "wide">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [margin, setMargin] = useState(24);
  const [fit, setFit] = useState<"width" | "page">("width");
  const [pageEnabled, setPageEnabled] = useState(false);
  const [foldPolicy, setFoldPolicy] = useState<"respect" | "expand">("respect");
  const [status, setStatus] = useState("");
  const settings = () => ({ scope, ...(scope === "selected-range" ? { range } : {}), scale, ...(pageEnabled ? { page: { size: pageSize, orientation, margin, fit } } : {}), foldPolicy });
  const exportNow = async () => {
    setStatus("Generating…");
    try {
      const bytes = await new DeterministicExportService().export({ format, snapshot, settings: settings() });
      downloadBytes(bytes, `${snapshot.document.document.title || "timing-chart"}.${format}`, format === "svg" ? "image/svg+xml" : format === "png" ? "image/png" : "application/pdf");
      setStatus(`${format.toUpperCase()} ready`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Export failed"); }
  };
  const copyNow = async (copyFormat: "svg" | "png") => {
    setStatus("Copying…");
    try {
      const bytes = await new DeterministicExportService().export({ format: copyFormat, snapshot, settings: settings() });
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard API is unavailable in this browser.");
      const mime = copyFormat === "svg" ? "image/svg+xml" : "image/png";
      const blobBytes = bytes.slice().buffer as ArrayBuffer;
      const blob = new Blob([blobBytes], { type: mime });
      const items = copyFormat === "svg" ? { "image/svg+xml": blob, "text/plain": new Blob([new TextDecoder().decode(bytes)], { type: "text/plain" }) } : { "image/png": blob };
      await navigator.clipboard.write([new ClipboardItem(items)]);
      setStatus(`${copyFormat.toUpperCase()} copied`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Clipboard export failed"); }
  };
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Export Timing Chart" className="export-dialog"><header><h2>Export</h2><button type="button" aria-label="Close export" onClick={onClose}>×</button></header><label>Format<select aria-label="Export format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="svg">SVG</option><option value="png">PNG</option><option value="pdf">PDF</option></select></label><label>Scope<select aria-label="Export scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="document">Entire Document</option><option value="selected-range">Selected Range</option></select></label><label>Page Size<select aria-label="Export page size" value={pageSize} onChange={(event) => { setPageEnabled(true); setPageSize(event.target.value as typeof pageSize); }}><option value="A4">A4</option><option value="Letter">Letter</option><option value="wide">Wide</option></select></label><label>Orientation<select aria-label="Export orientation" value={orientation} onChange={(event) => { setPageEnabled(true); setOrientation(event.target.value as typeof orientation); }}><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><label>Fit<select aria-label="Export fit" value={fit} onChange={(event) => { setPageEnabled(true); setFit(event.target.value as typeof fit); }}><option value="width">Fit Width</option><option value="page">Fit Page</option></select></label><label>Margin<input aria-label="Export margin" type="number" min="0" step="1" value={margin} onChange={(event) => { setPageEnabled(true); setMargin(Number(event.target.value)); }} /></label><label>Fold Policy<select aria-label="Export fold policy" value={foldPolicy} onChange={(event) => setFoldPolicy(event.target.value as typeof foldPolicy)}><option value="respect">Respect Axis Break</option><option value="expand">Expand Folded Ranges</option></select></label>{format === "png" && <label>Scale<select aria-label="PNG scale" value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value="1">1x</option><option value="2">2x</option><option value="3">3x</option></select></label>}<div className="export-summary">Canonical source · {snapshot.document.signals.length} signals · {snapshot.document.transactions.length} transactions</div><footer><output>{status}</output><button type="button" onClick={() => void copyNow("svg")}>Copy SVG</button><button type="button" onClick={() => void copyNow("png")}>Copy PNG</button><button type="button" onClick={() => void exportNow()}>Export {format.toUpperCase()}</button></footer></section></div>;
}

function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderGeometryGrid(element: HTMLElement, geometry: LocalGeometryMap | undefined, document: CanonicalDocument, referenceSignalId: SignalId | undefined, visible: boolean, height: number, screenWidth?: number): void {
  element.dataset.gridEnabled = String(visible);
  element.style.height = `${height}px`;
  if (!geometry || !referenceSignalId) return;
  const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
  const terminal = geometry.find({ signalId: referenceSignalId, cycle: mapping.displayCycleCount, point: "cycle-start" })?.point.x ?? 0;
  const scale = screenWidth === undefined || terminal <= 0 ? 1 : screenWidth / Math.max(1, terminal + 24);
  const lines: HTMLElement[] = [];
  for (let displayCycle = 0; displayCycle <= mapping.displayCycleCount; displayCycle += 1) {
    const anchor = geometry.find({ signalId: referenceSignalId, cycle: displayCycle, point: "cycle-start" });
    if (!anchor) continue;
    const line = element.ownerDocument.createElement("span");
    line.dataset.role = "geometry-grid-line";
    line.className = "geometry-grid-line";
    line.dataset.cycle = String(mapping.labelFor(displayCycle));
    line.style.left = `${anchor.point.x * scale}px`;
    line.style.height = `${height}px`;
    lines.push(line);
  }
  element.replaceChildren(...lines);
}

function MiniMap({ document, viewport }: { readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null> }) {
  const [metrics, setMetrics] = useState({ top: 0, ratio: 1, left: 0, width: 1 });
  const dragging = useRef(false);
  const sync = () => {
    const element = viewport.current;
    if (!element) return;
    const scrollable = Math.max(1, element.scrollHeight);
    const maxScrollTop = Math.max(1, scrollable - element.clientHeight);
    const ratio = Math.min(1, element.clientHeight / scrollable);
    const horizontalScrollable = Math.max(1, element.scrollWidth);
    const maxScrollLeft = Math.max(1, horizontalScrollable - element.clientWidth);
    const width = Math.min(1, element.clientWidth / horizontalScrollable);
    setMetrics({ top: Math.min(1 - ratio, element.scrollTop / maxScrollTop), ratio, left: Math.min(1 - width, element.scrollLeft / maxScrollLeft), width });
  };
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    sync();
    element.addEventListener("scroll", sync, { passive: true });
    return () => element.removeEventListener("scroll", sync);
  }, [document.signals.length, document.signalGroups.length]);
  const pan = (clientX: number, clientY: number) => {
    const element = viewport.current;
    const minimap = documentRef.current;
    if (!element || !minimap) return;
    const bounds = minimap.getBoundingClientRect();
    const verticalRatio = Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
    const horizontalRatio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    element.scrollTop = verticalRatio * Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollLeft = horizontalRatio * Math.max(0, element.scrollWidth - element.clientWidth);
    sync();
  };
  const documentRef = useRef<HTMLDivElement>(null);
  const rows = document.signalGroups.flatMap((group) => group.rows);
  const cycleCount = Math.max(1, document.timeline.cycleCount);
  const segmentStyle = (start: number, end: number) => ({ left: `${Math.max(0, Math.min(100, start / cycleCount * 100))}%`, width: `${Math.max(0.5, Math.min(100, (end - start) / cycleCount * 100))}%` });
  const previewSegments = (signal: Signal | undefined) => {
    if (!signal || signal.type === "commentRow") return [{ start: 0, end: cycleCount, tone: "comment" as const }];
    if (signal.type === "clock") return [{ start: 0, end: cycleCount, tone: "clock" as const }];
    return signal.values.map((change, index) => ({ start: change.start, end: signal.values[index + 1]?.start ?? cycleCount, tone: String(change.value).toLowerCase() === "0" ? "low" as const : "high" as const }));
  };
  return <div ref={documentRef} className="minimap" data-testid="minimap" aria-label="MiniMap" data-viewport-top={String(metrics.top)} data-viewport-ratio={String(metrics.ratio)} data-viewport-left={String(metrics.left)} data-viewport-width={String(metrics.width)} onPointerDown={(event) => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); pan(event.clientX, event.clientY); }} onPointerMove={(event) => { if (dragging.current) pan(event.clientX, event.clientY); }} onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragging.current = false; }}><div className="minimap-overview-frame"><div className="minimap-rows">{rows.map((rowId, rowIndex) => <span key={rowId} data-row-id={rowId} style={{ "--minimap-row-index": rowIndex } as React.CSSProperties}>{previewSegments(document.signals.find((signal) => signal.id === rowId)).map((segment, index) => <i key={`${rowId}-${index}`} className={`minimap-segment minimap-segment-${segment.tone}`} style={segmentStyle(segment.start, segment.end)} />)}</span>)}</div></div><i data-testid="minimap-viewport" style={{ "--minimap-left": `${metrics.left * 100}%`, "--minimap-width": `${Math.max(4, metrics.width * 100)}%`, top: `${metrics.top * 100}%`, height: `${Math.max(4, metrics.ratio * 100)}%` } as React.CSSProperties} /></div>;
}

function AnnotationToolbar({ document, range, signalId, onCreate, arrowPickStatus, onArmArrow }: { readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly signalId: SignalId | undefined; readonly onCreate: (annotation: Annotation) => void; readonly arrowPickStatus: "idle" | "from" | "to"; readonly onArmArrow: () => void }) {
  const [type, setType] = useState<AnnotationType>("text");
  const [measurementThreshold, setMeasurementThreshold] = useState<"none" | "30-70">("none");
  const thresholdPair = measurementThreshold === "30-70" ? { start: 0.3, end: 0.7 } : undefined;
  return <div className="annotation-toolbar" aria-label="Annotation tools" data-testid="annotation-toolbar">
    <strong>Annotation</strong>
    <select aria-label="Annotation type" value={type} onChange={(event) => setType(event.target.value as AnnotationType)}>
      {(["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace"] as const).map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    {type === "measurement" && <label>Threshold<select aria-label="Measurement threshold" value={measurementThreshold} onChange={(event) => setMeasurementThreshold(event.target.value as "none" | "30-70")}><option value="none">Cycle anchors</option><option value="30-70">30% → 70%</option></select></label>}
    <button type="button" disabled={!signalId} title={signalId ? undefined : "No timing Signal is available in this document to anchor an Annotation."} onClick={() => signalId && onCreate(createAnnotation(type, signalId, range, document, thresholdPair))}>Add annotation</button>
    <button type="button" className={arrowPickStatus === "idle" ? "" : "active"} onClick={onArmArrow}>Pick arrow endpoints</button>
    {arrowPickStatus !== "idle" && <b data-testid="arrow-pick-status">Click {arrowPickStatus} transition</b>}
    <span>Uses selected Signal and Timeline range · drag handles snap to rendered geometry</span>
  </div>;
}

function createAnnotation(type: AnnotationType, signalId: SignalId, range: { readonly start: number; readonly end: number }, document: CanonicalDocument, thresholdPair?: { readonly start: number; readonly end: number }): Annotation {
  const id = nextEntityId("annotation", document) as AnnotationId;
  const first: SemanticAnchor = { signalId, cycle: range.start, point: thresholdPair ? "transition-center" : "cycle-start", ...(thresholdPair ? { threshold: thresholdPair.start } : {}) };
  const second: SemanticAnchor = { signalId, cycle: Math.max(range.start, range.end - 1), point: thresholdPair ? "transition-center" : "cycle-end", ...(thresholdPair ? { threshold: thresholdPair.end } : {}) };
  const base = { id, type, label: `${type} ${range.start}`, visible: true, color: type === "ghostTrace" ? "#64748b" : "#d04a36", ...(type === "timingRegion" ? { opacity: 0.16 } : {}), ...(type === "ghostTrace" ? { sourceSignalId: signalId, traceOffsetCycles: 0, opacity: 0.55 } : {}) } as const;
  if (type === "arrow" || type === "dependency") return { ...base, from: first, to: second, lineType: "straight", arrowhead: "end" };
  if (["range", "bracket", "highlight", "measurement", "timingRegion", "ghostTrace"].includes(type)) return { ...base, start: first, end: second };
  return { ...base, anchor: first };
}

function AnnotationList({ annotations, selectedId, onSelect }: { readonly annotations: readonly Annotation[]; readonly selectedId: AnnotationId | undefined; readonly onSelect: (id: AnnotationId) => void }) {
  const anchorText = (anchor: SemanticAnchor | undefined) => anchor ? `${anchor.signalId ?? "cycle"} @ ${anchor.cycle}` : "—";
  return <div className="annotation-list" role="table" aria-label="Annotations" data-testid="annotation-list">
    <div className="annotation-list-row annotation-list-header" role="row"><span>#</span><span>Type</span><span>Start</span><span>End</span><span>Label / Text</span><span>Target</span><span>X</span><span>Y</span></div>
    {annotations.map((item, index) => <button type="button" role="row" key={item.id} data-annotation-list-id={item.id} data-annotation-row={item.id} data-selected={String(item.id === selectedId)} aria-label={`Select annotation ${item.label || item.type}`} onClick={() => onSelect(item.id)}><span className="annotation-list-index">{index + 1}</span><span className="annotation-list-type">{item.type}</span><span>{anchorText(item.start ?? item.from ?? item.anchor)}</span><span>{anchorText(item.end ?? item.to)}</span><span className="annotation-list-label">{item.label || "(untitled)"}</span><span>canvas</span><span>{item.labelOffset?.x ?? 0}</span><span>{item.labelOffset?.y ?? 0}</span></button>)}
  </div>;
}

function AnnotationEditor({ annotation, annotations, document, history, problem, onSelect, onCreate, onDuplicate, onCommand, onUndo, onRedo, onDelete }: { readonly annotation: Annotation; readonly annotations: readonly Annotation[]; readonly document: CanonicalDocument; readonly history: HistoryState; readonly problem: string; readonly onSelect: (id: AnnotationId) => void; readonly onCreate: (type: AnnotationType) => void; readonly onDuplicate: (annotation: Annotation) => void; readonly onCommand: (command: SemanticCommand) => void; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void }) {
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
      onCommand({ id: nextCommandId("annotation_import"), type: "document.replace", document: { ...document, annotations: items as Annotation[] } });
      const first = items[0] as { id?: unknown } | undefined;
      if (typeof first?.id === "string") onSelect(first.id as AnnotationId);
      setImportStatus(`Imported ${items.length} annotation${items.length === 1 ? "" : "s"}`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Invalid annotations JSON");
    }
  };
  return <section className="signal-editor annotation-editor" aria-label="Annotation Editor" data-testid="annotation-editor">
    <div className="editor-tabbar">
      <button type="button" className="editor-tab">Signal</button><button type="button" className="editor-tab active">Annotation</button>
      <span className="editor-selection">{annotation.label} · {annotation.type}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
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
    <strong>Timeline</strong>
    <label>Start<input aria-label="Timeline range start" type="number" min="0" max={document.timeline.cycleCount - 1} value={range.start} onChange={(event) => setBoundary("start", Number(event.target.value))} /></label>
    <label>End<input aria-label="Timeline range end" type="number" min="1" max={document.timeline.cycleCount} value={range.end} onChange={(event) => setBoundary("end", Number(event.target.value))} /></label>
    <label>Count<input aria-label="Timeline insert count" type="number" min="1" step="1" value={count} onChange={(event) => setCount(Math.max(1, Number(event.target.value)))} /></label>
    <label>To<input aria-label="Timeline destination" type="number" min="0" max={document.timeline.cycleCount} step="1" value={destination} onChange={(event) => setDestination(Math.max(0, Number(event.target.value)))} /></label>
    <div className="timeline-actions">
       <button type="button" data-v1-label="サイクル挿入" onClick={() => onCommand({ id: nextCommandId("timeline_before"), type: "timeline.insert", at: range.start, count })}>Insert before</button>
       <button type="button" data-v1-label="後に挿入" onClick={() => onCommand({ id: nextCommandId("timeline_after"), type: "timeline.insert", at: range.end, count })}>Insert after</button>
       <button type="button" data-v1-label="範囲削除" onClick={() => onCommand({ id: nextCommandId("timeline_delete"), type: "timeline.delete", start: range.start, end: range.end })}>Delete range</button>
       <button type="button" data-v1-label="範囲複製" onClick={() => onCommand({ id: nextCommandId("timeline_duplicate"), type: "timeline.duplicateRange", start: range.start, end: range.end, at: destination })}>Duplicate to</button>
       <button type="button" data-v1-label="範囲移動" onClick={() => onCommand({ id: nextCommandId("timeline_move"), type: "timeline.moveRange", start: range.start, end: range.end, to: destination })}>Move to</button>
       <button type="button" data-v1-label="ブックマーク" onClick={() => onCommand({ id: nextCommandId("marker"), type: "bookmark.create", bookmark: { id: nextEntityId("bookmark", document) as BookmarkId, name: `Marker ${range.start}`, start: range.start } })}>Add marker</button>
       <button type="button" data-v1-label="軸ブレーク" onClick={() => onCommand({ id: nextCommandId("gap"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Gap ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "GAP" } } })}>Add gap</button>
    </div>
    <div className="timeline-objects">
      {document.bookmarks.map((bookmark) => <span className="timeline-bookmark" key={bookmark.id} data-bookmark-id={bookmark.id}><button type="button" data-testid={`bookmark-jump-${bookmark.id}`} onClick={() => onNavigateBookmark(bookmark.start)} title={`Jump to cycle ${bookmark.start}`}>◆ {bookmark.name}</button><button type="button" data-testid={`bookmark-edit-${bookmark.id}`} aria-label={`Edit ${bookmark.name}`} onClick={() => { setEditingBookmarkId(bookmark.id); setBookmarkName(bookmark.name); setBookmarkStart(bookmark.start); setBookmarkComment(bookmark.comment ?? ""); }}>Edit</button><button type="button" aria-label={`Delete ${bookmark.name}`} onClick={() => onCommand({ id: nextCommandId("marker_delete"), type: "bookmark.delete", bookmarkId: bookmark.id })}>×</button></span>)}
      {document.timeGroups.map((group) => <span className="timeline-time-group" key={group.id} data-time-group-id={group.id}><button type="button" data-testid={`time-group-edit-${group.id}`} onClick={() => { setEditingGroupId(group.id); setGroupName(group.name); setGroupStart(group.start); setGroupEnd(group.end); setGroupComment(group.comment ?? ""); setGroupFoldLabel(group.presentation?.foldLabel ?? ""); setGroupCollapsed(group.presentation?.collapsed ?? false); }} title={`Edit ${group.name}`}>// {group.name}</button><button type="button" aria-label={`Delete ${group.name}`} onClick={() => onCommand({ id: nextCommandId("gap_delete"), type: "timeGroup.delete", timeGroupId: group.id })}>×</button></span>)}
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
  readonly onCommand: (command: SemanticCommand) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onVisibility: (signalId: SignalId, visible: boolean) => void;
  readonly onDuplicate: () => void;
  readonly onDropToGroup: (kind: "signal" | "group", id: string, targetGroupId: GroupId) => void;
}

function SignalEditor({ signal, cycleCount, history, groups, problem, onCommand, onUndo, onRedo, onVisibility, onDuplicate, onDropToGroup }: SignalEditorProps) {
  const [name, setName] = useState(signal?.display.name ?? "");
  const [role, setRole] = useState<SignalRole>(signal?.role ?? "internal");
  const [signalType, setSignalType] = useState<ValueSignal["type"]>(signal?.type === "clock" || signal?.type === "commentRow" ? "binary" : signal?.type ?? "binary");
  const [width, setWidth] = useState(signal?.type === "bus" ? signal.width ?? 1 : 1);
  const [format, setFormat] = useState<"hex" | "binary" | "symbolic">(signal?.type === "bus" ? signal.displayFormat ?? "hex" : "hex");
  return <section className="signal-editor" aria-label="Signal Editor" data-testid="signal-editor">
    <div className="editor-tabbar">
      <button type="button" className="editor-tab active">Signal</button>
      <span className="editor-selection">{signal ? `${signal.display.name} · ${signal.type}` : "Select a signal to edit"}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
      {signal && <button type="button" onClick={() => onVisibility(signal.id, signal.display.visible === false)} data-testid="signal-visibility">{signal.display.visible === false ? "Show signal" : "Hide signal"}</button>}
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
        onCommand({ id: nextCommandId("properties"), type: "signal.updateProperties", signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}) });
      }}>
        <label>Name<input aria-label="Signal name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Role<select aria-label="Signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Logic</option><option value="event">Event</option><option value="pulse">Pulse</option></select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Display<select aria-label="Bus display format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label></>}
        <button type="submit" data-testid="save-signal-properties">Apply properties</button>
      </form>
      {signal.type === "clock" ? <ClockGeneratorEditor signal={signal} onCommand={onCommand} onDuplicate={onDuplicate} /> : signal.type === "commentRow" ? <CommentRowEditor signal={signal} onCommand={onCommand} /> : <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} />}
    </>}
  </section>;
}

function CommentRowEditor({ signal, onCommand }: { readonly signal: CommentRow; readonly onCommand: (command: SemanticCommand) => void }) {
  const [title, setTitle] = useState(signal.title);
  const [body, setBody] = useState(signal.body);
  const [spacingBefore, setSpacingBefore] = useState(signal.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal.spacingAfter ?? 0);
  return <form className="comment-row-editor" aria-label="Comment Row Editor" data-testid="comment-row-editor" onSubmit={(event) => {
    event.preventDefault();
    onCommand({ id: nextCommandId("comment_row_update"), type: "commentRow.update", signalId: signal.id, title, body, spacingBefore, spacingAfter });
  }}>
    <h2>Comment Row</h2>
    <div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div>
    <label>Title<input aria-label="Comment Row title" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Body<textarea aria-label="Comment Row body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} /></label>
    <label>Spacing Before<input aria-label="Comment Row spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
    <label>Spacing After<input aria-label="Comment Row spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
    <button type="submit" data-testid="apply-comment-row">Apply Comment Row</button>
  </form>;
}

function ClockGeneratorEditor({ signal, onCommand, onDuplicate }: { readonly signal: ClockSignal; readonly onCommand: (command: SemanticCommand) => void; readonly onDuplicate: () => void }) {
  const [generator, setGenerator] = useState<ClockGenerator>(signal.generator);
  const [edgeCounter, setEdgeCounter] = useState<EdgeCounterSettings>(signal.edgeCounter);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const number = (key: "start" | "period" | "duty" | "phase", value: string) => setGenerator({ ...generator, [key]: Number(value) });
  const exportSettings = () => { const blob = new Blob([JSON.stringify({ signalId: signal.id, name: signal.name, generator, edgeCounter }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${signal.name || signal.id}-clock.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importSettings = (file: File) => { const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)) as { generator?: ClockGenerator; edgeCounter?: EdgeCounterSettings }; if (parsed.generator) setGenerator(parsed.generator); if (parsed.edgeCounter) setEdgeCounter(parsed.edgeCounter); } catch { /* Invalid imports remain transient and do not enter the command path. */ } }; reader.readAsText(file); };
  return <div className="clock-editor">
    <div className="event-toolbar" role="toolbar" aria-label="Clock context commands" data-testid="clock-context-toolbar">
      <button type="button" className="bottom-action" onClick={() => setPresetsOpen((current) => !current)} aria-pressed={presetsOpen} data-testid="clock-presets"><RibbonIcon name="i-settings" /><span>Presets</span></button>
      <button type="button" className="bottom-action" onClick={onDuplicate} data-testid="clock-duplicate"><RibbonIcon name="i-duplicate" /><span>Duplicate</span></button>
      <button type="button" className="bottom-action" onClick={() => fileInput.current?.click()} data-testid="clock-import"><RibbonIcon name="i-import" /><span>Import...</span></button>
      <button type="button" className="bottom-action" onClick={exportSettings} data-testid="clock-export"><RibbonIcon name="i-export" /><span>Export...</span></button>
      <button type="button" className="bottom-action" onClick={() => setPreview((current) => !current)} aria-pressed={preview} data-testid="clock-preview"><RibbonIcon name="i-preview" /><span>Preview</span></button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import clock settings" onChange={(event) => { const file = event.target.files?.[0]; if (file) importSettings(file); event.currentTarget.value = ""; }} />
      {presetsOpen && <div className="event-presets" role="group" aria-label="Clock presets"><button type="button" onClick={() => setGenerator({ ...generator, duty: 0.5 })}>50% duty</button><button type="button" onClick={() => setGenerator({ ...generator, duty: 0.25 })}>25% duty</button></div>}
      {preview && <output className="event-preview" data-testid="clock-preview-status">Preview only · canonical data unchanged</output>}
    </div>
    <form className="clock-generator" aria-label="Clock Generator" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("clock"), type: "signal.updateClockGenerator", signalId: signal.id, generator });
    }}>
      <h2>Clock Generator</h2>
      <label>Start<input aria-label="Clock start" type="number" min="0" step="1" value={generator.start} onChange={(event) => number("start", event.target.value)} /></label>
      <label>Period<input aria-label="Clock period" type="number" min="1" step="1" value={generator.period} onChange={(event) => number("period", event.target.value)} /></label>
      <label>Duty<input aria-label="Clock duty" type="number" min="0.01" max="1" step="0.01" value={generator.duty} onChange={(event) => number("duty", event.target.value)} /></label>
      <label>Phase<input aria-label="Clock phase" type="number" step="0.5" value={generator.phase} onChange={(event) => number("phase", event.target.value)} /></label>
      <label>Initial<select aria-label="Clock initial" value={generator.initial} onChange={(event) => setGenerator({ ...generator, initial: Number(event.target.value) as 0 | 1 })}><option value="0">0</option><option value="1">1</option></select></label>
      <label>Polarity<select aria-label="Clock polarity" value={generator.polarity} onChange={(event) => setGenerator({ ...generator, polarity: event.target.value as ClockGenerator["polarity"] })}><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
      <button type="submit" data-testid="apply-clock-generator">Apply generator</button>
    </form>
    <form className="clock-edge-counter" aria-label="Clock Edge Counter" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("edge_counter"), type: "signal.updateEdgeCounter", signalId: signal.id, edgeCounter });
    }}>
      <h2>Edge Counter</h2>
      <label className="check-label">Show<input aria-label="Clock edge counter show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label>
      <label>Mode<select aria-label="Clock edge counter mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label>
      <label>Start Number<input aria-label="Clock edge counter start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label>
      <label>Count From<select aria-label="Clock edge counter count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label>
      <label>Every N<input aria-label="Clock edge counter every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label>
      <label>Position<select aria-label="Clock edge counter position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label>
      <label>X Offset<input aria-label="Clock edge counter X offset" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label>
      <label>Y Offset<input aria-label="Clock edge counter Y offset" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label>
      <button type="submit" data-testid="apply-clock-edge-counter">Apply edge counter</button>
    </form>
  </div>;
}

function EventTable({ signal, cycleCount, onCommand }: { readonly signal: ValueSignal; readonly cycleCount: number; readonly onCommand: (command: SemanticCommand) => void }) {
  const [start, setStart] = useState(0);
  const [value, setValue] = useState(quickValue(signal));
  const [selectedStart, setSelectedStart] = useState<number | undefined>(signal.values[0]?.start);
  const [preview, setPreview] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = signal.values.find((change) => change.start === selectedStart);
  const nextStart = Array.from({ length: cycleCount }, (_, cycle) => cycle).find((cycle) => !signal.values.some((item) => item.start === cycle)) ?? Math.max(0, cycleCount - 1);
  const emitValue = (nextValues: readonly ValueSignal["values"][number][]) => onCommand({ id: nextCommandId("replace_values"), type: "signal.replaceValues", signalId: signal.id, values: nextValues });
  const addRow = () => onCommand({ id: nextCommandId("add_value"), type: "signal.updateValue", signalId: signal.id, start: nextStart, value });
  const duplicateRow = () => {
    if (!selected) return;
    const duplicateStart = Array.from({ length: cycleCount }, (_, cycle) => cycle).find((cycle) => !signal.values.some((item) => item.start === cycle));
    if (duplicateStart === undefined) return;
    onCommand({ id: nextCommandId("duplicate_value"), type: "signal.updateValue", signalId: signal.id, start: duplicateStart, value: selected.value, ...(selected.comment === undefined ? {} : { comment: selected.comment }) });
  };
  const exportValues = () => {
    const blob = new Blob([JSON.stringify({ signalId: signal.id, name: signal.name, values: signal.values }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${signal.name || signal.id}-events.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importValues = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        const values = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "values" in parsed ? (parsed as { values: unknown }).values : undefined);
        if (!Array.isArray(values) || values.length === 0 || values.some((item) => !item || typeof item !== "object" || !Number.isInteger((item as { start?: unknown }).start) || !((item as { value?: unknown }).value === undefined || typeof (item as { value?: unknown }).value === "string" || typeof (item as { value?: unknown }).value === "number"))) return;
        emitValue(values as ValueSignal["values"]);
      } catch { /* Invalid files remain view-only and do not enter the command path. */ }
    };
    reader.readAsText(file);
  };
  return <div className="event-editor">
    <div className="event-heading"><h2>Event Table</h2><span>End and duration are derived</span></div>
    <div className="event-toolbar" role="toolbar" aria-label="Signal event commands" data-testid="signal-event-toolbar">
      <button type="button" className="bottom-action" onClick={() => setPresetsOpen((current) => !current)} aria-pressed={presetsOpen} data-testid="event-presets"><RibbonIcon name="i-settings" /><span>Presets</span></button>
      <button type="button" className="bottom-action" onClick={duplicateRow} disabled={!selected || nextStart >= cycleCount} data-testid="event-duplicate"><RibbonIcon name="i-duplicate" /><span>Duplicate</span></button>
      <button type="button" className="bottom-action" onClick={() => fileInput.current?.click()} data-testid="event-import-action"><RibbonIcon name="i-import" /><span>Import...</span></button>
      <button type="button" className="bottom-action" onClick={exportValues} data-testid="event-export-action"><RibbonIcon name="i-export" /><span>Export...</span></button>
      <button type="button" className="bottom-action" onClick={() => setPreview((current) => !current)} aria-pressed={preview} data-testid="event-preview-action"><RibbonIcon name="i-preview" /><span>Preview</span></button>
      <button type="button" onClick={addRow} data-testid="event-add-row">Add Row</button>
      <button type="button" onClick={duplicateRow} disabled={!selected || nextStart >= cycleCount} data-testid="event-duplicate-row">Duplicate</button>
      <button type="button" onClick={() => selected && onCommand({ id: nextCommandId("remove_value"), type: "signal.removeValue", signalId: signal.id, start: selected.start })} disabled={!selected || signal.values.length === 1} data-testid="event-delete-row">Delete</button>
      <button type="button" onClick={() => fileInput.current?.click()} data-testid="event-import">Import</button>
      <button type="button" onClick={exportValues} data-testid="event-export">Export</button>
      <button type="button" onClick={() => setPreview((current) => !current)} data-testid="event-preview">Preview Update</button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import signal events" onChange={(event) => { const file = event.target.files?.[0]; if (file) importValues(file); event.currentTarget.value = ""; }} />
      {presetsOpen && <div className="event-presets" role="group" aria-label="Event value presets"><QuickValues signal={signal} setValue={setValue} /></div>}
      {preview && <output className="event-preview" data-testid="event-preview-status">Preview only · canonical data unchanged</output>}
    </div>
    <div className="event-table" role="table" aria-label="Signal events">
      <div className="event-row event-columns" role="row"><span>Start</span><span>Value</span><span>End</span><span>Duration</span><span>Comment</span><span>Actions</span></div>
      {signal.values.map((change, index) => <EventRow key={change.start} signal={signal} change={change} end={signal.values[index + 1]?.start ?? cycleCount} selected={change.start === selectedStart} onSelect={setSelectedStart} onCommand={onCommand} />)}
    </div>
    <form className="event-add" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("add_value"), type: "signal.updateValue", signalId: signal.id, start, value });
    }}>
      <label>Start<input aria-label="New event start" type="number" min="0" max={cycleCount - 1} step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
      <label>Value<input aria-label="New event value" value={value} onChange={(event) => setValue(event.target.value)} /></label>
      <QuickValues signal={signal} setValue={setValue} />
      <button type="submit" data-testid="add-signal-event">Add / replace event</button>
    </form>
  </div>;
}

function EventRow({ signal, change, end, selected, onSelect, onCommand }: { readonly signal: ValueSignal; readonly change: ValueSignal["values"][number]; readonly end: number; readonly selected: boolean; readonly onSelect: (start: number) => void; readonly onCommand: (command: SemanticCommand) => void }) {
  const [start, setStart] = useState(change.start);
  const [value, setValue] = useState(String(change.value));
  const [comment, setComment] = useState(change.comment ?? "");
  return <form className={`event-row${selected ? " selected" : ""}`} role="row" data-event-start={change.start} onClick={() => onSelect(change.start)} onSubmit={(event) => {
    event.preventDefault();
    onCommand({ id: nextCommandId("replace_value"), type: "signal.replaceValue", signalId: signal.id, fromStart: change.start, start, value, ...(comment ? { comment } : {}) });
  }}>
    <input aria-label={`Start ${change.start}`} type="number" min="0" step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} />
    <input aria-label={`Value ${change.start}`} value={value} onChange={(event) => setValue(event.target.value)} />
    <output>{end}</output><output>{end - change.start}</output>
    <input aria-label={`Comment ${change.start}`} value={comment} onChange={(event) => setComment(event.target.value)} />
    <span className="event-actions"><button type="submit">Save</button><button type="button" onClick={() => onCommand({ id: nextCommandId("remove_value"), type: "signal.removeValue", signalId: signal.id, start: change.start })}>Remove</button></span>
  </form>;
}

function QuickValues({ signal, setValue }: { readonly signal: ValueSignal; readonly setValue: (value: string) => void }) {
  const values = signal.type === "binary" || signal.type === "logic" ? ["0", "1", "X", "Z"] : signal.type === "bus" ? ["Hex", "Binary", "Symbol", "X", "Z"] : ["IDLE", "ACTIVE", "X", "Z"];
  return <div className="quick-values" role="group" aria-label="Quick values">{values.map((item) => <button type="button" key={item} onClick={() => setValue(item === "Hex" ? "00" : item === "Binary" ? "00000000" : item === "Symbol" ? "VALUE" : item)}>{item}</button>)}</div>;
}

function quickValue(signal: ValueSignal): string {
  if (signal.type === "bus") return signal.displayFormat === "binary" ? "00000000" : "00";
  if (signal.type === "state") return "IDLE";
  return "0";
}

let commandSequence = 0;
function nextCommandId(scope: string): CommandId {
  commandSequence += 1;
  return `cmd_phase7_${scope}_${commandSequence}` as CommandId;
}

let entitySequence = 0;
function nextEntityId(scope: "bookmark" | "time" | "annotation" | "transaction" | "signal" | "group" | "commentRow" | "spacer", document: CanonicalDocument): string {
  const used = new Set<string>([
    ...document.signals.map((item) => item.id),
    ...document.signalGroups.map((item) => item.id),
    ...document.signalGroups.flatMap((item) => item.spacers?.map((spacer) => spacer.id) ?? []),
    ...document.annotations.map((item) => item.id),
    ...document.transactions.map((item) => item.id),
    ...document.bookmarks.map((item) => item.id),
    ...document.timeGroups.map((item) => item.id),
    ...document.timeline.labelAnchors.map((item) => item.id),
    ...document.constraints.map((item) => item.id),
  ]);
  let candidate: string;
  do {
    entitySequence += 1;
    candidate = `${scope}_phase9_${entitySequence}`;
  } while (used.has(candidate));
  return candidate;
}

const annotationFields = ["anchor", "start", "end", "from", "to"] as const;

function resolveAnchorPoint(anchor: SemanticAnchor | undefined, document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups)): Point | undefined {
  if (!anchor) return undefined;
  const signalId = anchor.signalId ?? document.timeline.referenceClock;
  if (!signalId) return undefined;
  const renderedCycle = anchor.cycle === document.timeline.cycleCount ? mapping.displayCycleCount : mapping.sourceToDisplay[anchor.cycle];
  if (renderedCycle === undefined) return undefined;
  const local = maps.get(signalId)?.find({ ...anchor, signalId, cycle: renderedCycle });
  if (!local) return undefined;
  const row = anchor.signalId ? projection.rowLayout.find((item) => item.rowId === anchor.signalId) : undefined;
  if (anchor.signalId && !row) return undefined;
  const rowY = row?.y ?? 0;
  return { x: local.point.x, y: rowY + local.point.y };
}

function projectAnnotationOverlays(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>): AnnotationOverlayPrimitive[] {
  const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
  return document.annotations.flatMap((annotation) => {
    const anchors = annotationFields.flatMap((field) => {
      const point = resolveAnchorPoint(annotation[field], document, projection, maps, mapping);
      return point ? [{ field, ...point, ...(annotation[field]?.threshold === undefined ? {} : { threshold: annotation[field]!.threshold }) }] : [];
    });
    if (anchors.length === 0) return [];
    const firstAnchor = annotation.start ?? annotation.anchor;
    const lastAnchor = annotation.end ?? annotation.anchor;
    const tracePoints = annotation.type === "ghostTrace" && annotation.sourceSignalId && firstAnchor && lastAnchor
      ? (() => {
        const sourceMap = maps.get(annotation.sourceSignalId);
        const sourceRowY = projection.rowLayout.find((row) => row.rowId === annotation.sourceSignalId)?.y;
        if (!sourceMap || sourceRowY === undefined) return [];
        const offset = annotation.traceOffsetCycles ?? 0;
        const points: Point[] = [];
        const start = Math.max(0, Math.floor(Math.min(firstAnchor.cycle, lastAnchor.cycle)));
        const end = Math.min(document.timeline.cycleCount, Math.ceil(Math.max(firstAnchor.cycle, lastAnchor.cycle)));
        for (let cycle = start; cycle <= end; cycle += 1) {
          const sourceCycle = cycle + offset;
          if (sourceCycle < 0 || sourceCycle > document.timeline.cycleCount) continue;
          const renderedCycle = mapping.sourceToDisplay[sourceCycle];
          if (renderedCycle === undefined) continue;
          for (const point of ["cycle-start", "transition-center"] as const) {
            const local = sourceMap.find({ signalId: annotation.sourceSignalId, cycle: renderedCycle, point });
            if (local) points.push({ x: local.point.x, y: sourceRowY + local.point.y });
          }
        }
        return points;
      })()
      : undefined;
    const shape: AnnotationOverlayPrimitive["shape"] = annotation.type === "verticalLine" ? "vertical"
      : ["range", "highlight", "timingRegion"].includes(annotation.type) ? "range"
      : annotation.type === "ghostTrace" ? "trace"
      : ["arrow", "dependency", "measurement", "bracket"].includes(annotation.type) ? "line" : "point";
    return [{
      id: annotation.id,
      type: annotation.type,
      shape,
      label: annotation.type === "measurement" && annotation.start && annotation.end ? `${annotation.label} · ${annotation.start.threshold === undefined || annotation.end.threshold === undefined ? "cycle anchors" : `${Math.round(annotation.start.threshold * 100)}%→${Math.round(annotation.end.threshold * 100)}%`} · Δ ${Math.abs(annotation.end.cycle - annotation.start.cycle)} cycles` : annotation.label,
      visible: annotation.visible,
      ...(annotation.opacity === undefined ? {} : { opacity: annotation.opacity }),
      ...(annotation.sourceSignalId === undefined ? {} : { sourceSignalId: annotation.sourceSignalId }),
      ...(annotation.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: annotation.traceOffsetCycles }),
      ...(annotation.color === undefined ? {} : { color: annotation.color }),
      anchors,
      ...(annotation.labelOffset === undefined ? {} : { labelOffset: annotation.labelOffset }),
      ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }),
      ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }),
      ...(tracePoints === undefined ? {} : { tracePoints }),
      surfaceHeight: projection.totalHeight,
    }];
  });
}

function projectEdgeCounters(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, visibleRange: Readonly<{ start: number; end: number }>, selectedCycle: number): EdgeCounterOverlayPrimitive[] {
  return document.signals.flatMap((signal) => {
    if (signal.type !== "clock" || !signal.edgeCounter.show) return [];
    const map = maps.get(signal.id);
    const rowY = projection.rowLayout.find((row) => row.rowId === signal.id)?.y ?? 0;
    if (!map) return [];
    const edges: { readonly x: number; readonly y: number; readonly kind: "rising" | "falling"; readonly cycle: number }[] = [];
    for (let cycle = 0; cycle < document.timeline.cycleCount; cycle += 1) {
      for (const kind of ["rising", "falling"] as const) {
        if (signal.edgeCounter.mode !== "both" && signal.edgeCounter.mode !== kind) continue;
        const local = map.find({ signalId: signal.id, cycle, point: kind === "rising" ? "rising-edge" : "falling-edge" });
        if (local) edges.push({ x: local.point.x, y: rowY + local.point.y, kind, cycle });
      }
    }
    edges.sort((left, right) => left.x - right.x || left.kind.localeCompare(right.kind));
    const countFrom = signal.edgeCounter.countFrom === "visible-range-start" ? visibleRange.start
      : signal.edgeCounter.countFrom === "selected-edge" ? selectedCycle
        : signal.edgeCounter.countFrom === "marker" ? Math.min(...document.bookmarks.map((bookmark) => bookmark.start), Number.POSITIVE_INFINITY)
          : Number.NEGATIVE_INFINITY;
    const counted = edges.filter((edge) => edge.cycle >= countFrom);
    return counted.flatMap((edge, index) => index % Math.max(1, signal.edgeCounter.labelEvery) === 0 ? [{ id: `edge:${signal.id}:${edge.kind}:${edge.cycle}`, signalId: signal.id, x: edge.x + signal.edgeCounter.offset.x, y: edge.y + signal.edgeCounter.offset.y + (signal.edgeCounter.position === "above" ? -6 : 10), label: String(signal.edgeCounter.startNumber + index) }] : []);
  });
}

function buildSnapIndex(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, service = new SemanticSnapCandidateService()): ImmutableSnapIndex {
  const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
  return service.build({
    document,
    geometryMaps: maps,
    rowY: new Map(projection.rowLayout.flatMap((row) => document.signals.some((signal) => signal.id === row.rowId) ? [[row.rowId as SignalId, row.y] as const] : [])),
    renderedCycleCount: mapping.displayCycleCount,
    sourceCycleForRenderedCycle: (renderedCycle) => renderedCycle === mapping.displayCycleCount ? document.timeline.cycleCount : mapping.displayToSource[renderedCycle],
    renderedCycleForSourceCycle: (sourceCycle) => mapping.sourceToDisplay[sourceCycle],
  });
}

function preferredSnapKinds(type: AnnotationType): readonly SnapKind[] {
  if (type === "dependency" || type === "arrow") return ["clock-edge", "signal-transition", "bus-transition", "value-boundary", "cycle-boundary"];
  if (type === "verticalLine" || type === "marker") return ["cycle-boundary", "clock-edge"];
  return ["annotation", "marker", "value-boundary", "cycle-boundary", "cycle-center", "signal-row"];
}

function withAddedOffset(anchor: SemanticAnchor, x: number, y: number): SemanticAnchor {
  return { ...anchor, offset: { x: (anchor.offset?.x ?? 0) + x, y: (anchor.offset?.y ?? 0) + y } };
}

function withSnapOffset(anchor: SemanticAnchor, desired: Point, snapped: Point): SemanticAnchor {
  const residual = { x: Math.round(desired.x - snapped.x), y: Math.round(desired.y - snapped.y) };
  if (residual.x === 0 && residual.y === 0) return anchor;
  return { ...anchor, offset: { x: (anchor.offset?.x ?? 0) + residual.x, y: (anchor.offset?.y ?? 0) + residual.y } };
}

function viewportWindow(viewport: HTMLElement, referenceClock?: SignalId): VirtualizationWindow {
  const bodyTop = Math.max(0, viewport.scrollTop - 34);
  return {
    viewportStartY: bodyTop,
    viewportEndY: bodyTop + viewport.clientHeight,
    overscanBefore: 48,
    overscanAfter: 48,
    pinnedRowIds: referenceClock ? [referenceClock] : [],
  };
}

function buildRuler(element: HTMLElement, geometry: LocalGeometryMap | undefined, document: CanonicalDocument, referenceSignalId: SignalId | undefined, screenWidth?: number): void {
  if (!geometry || !referenceSignalId) {
    element.dataset.geometryError = "Reference-clock geometry unavailable";
    element.replaceChildren();
    return;
  }
  const mapping = buildDisplayTimeMapping(document.timeline, document.timeGroups);
  const ticks: HTMLElement[] = [];
  const terminalPoint = geometry.find({ signalId: referenceSignalId, cycle: mapping.displayCycleCount, point: "cycle-start" })?.point;
  const scale = screenWidth === undefined || terminalPoint === undefined ? 1 : screenWidth / Math.max(1, terminalPoint.x + 24);
  let finalX = 0;
  for (let display = 0; display <= mapping.displayCycleCount; display += 1) {
    const point = geometry.find({ signalId: referenceSignalId, cycle: display, point: "cycle-start" })?.point;
    if (!point) continue;
    const tick = element.ownerDocument.createElement("span");
    tick.dataset.cycle = String(mapping.labelFor(display));
    tick.className = "cycle-tick";
    tick.style.left = `${point.x * scale}px`;
    tick.textContent = String(mapping.labelFor(display));
    ticks.push(tick);
    finalX = point.x;
  }
  const overlays: HTMLElement[] = [];
  for (const bookmark of document.bookmarks) {
    const displayCycle = mapping.sourceToDisplay[bookmark.start];
    if (displayCycle === undefined) continue;
    const point = geometry.find({ signalId: referenceSignalId, cycle: displayCycle, point: "cycle-start" })?.point;
    if (!point) continue;
    const marker = element.ownerDocument.createElement("span");
    marker.className = "timeline-marker";
    marker.dataset.bookmarkId = bookmark.id;
    marker.style.left = `${point.x}px`;
    marker.textContent = `◆ ${bookmark.name}`;
    overlays.push(marker);
  }
  for (const group of document.timeGroups.filter((item) => item.presentation?.collapsed)) {
    const anchorDisplay = (group.end < document.timeline.cycleCount ? mapping.sourceToDisplay[group.end] : undefined)
      ?? (group.start > 0 ? mapping.sourceToDisplay[group.start - 1] : undefined);
    if (anchorDisplay === undefined) continue;
    const point = geometry.find({ signalId: referenceSignalId, cycle: anchorDisplay, point: "cycle-start" })?.point;
    if (!point) continue;
    const gap = element.ownerDocument.createElement("span");
    gap.className = "timeline-gap";
    gap.dataset.timeGroupId = group.id;
    gap.style.left = `${point.x}px`;
    gap.textContent = group.presentation?.foldLabel ?? group.name;
    overlays.push(gap);
  }
  element.replaceChildren(...ticks, ...overlays);
  element.dataset.source = "local-geometry";
  const targetWidth = screenWidth === undefined ? Math.ceil(finalX + 24) : Math.ceil(screenWidth);
  element.parentElement?.style.setProperty("--wave-width", `${targetWidth}px`);
}
