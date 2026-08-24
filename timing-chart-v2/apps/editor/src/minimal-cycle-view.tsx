import { useEffect, useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type SnapKind } from "@timing-chart-v2/geometry";
import { CommandHistorySession, type HistoryState } from "@timing-chart-v2/history";
import { DeterministicExportService } from "@timing-chart-v2/export";
import { DefaultProjectionService, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { StableTimingChartRenderer, type AnnotationOverlayPrimitive, type EdgeCounterOverlayPrimitive, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { parseDocument, serializeCanonicalDocument, validateCanonicalDocument } from "@timing-chart-v2/schema";
import type { Annotation, AnnotationId, AnnotationType, BookmarkId, CanonicalDocument, ClockGenerator, ClockSignal, CommandId, EdgeCounterSettings, GroupId, SemanticAnchor, Signal, SignalGroup, SignalId, SignalRole, TimeGroupId, Transaction, TransactionId, ValueSignal } from "@timing-chart-v2/schema";
import { mayRouteGlobalShortcut, resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import { ProductionWaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";

const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;

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

export function MinimalCycleView() {
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const execute = useRef<(command: SemanticCommand) => void>(() => undefined);
  const undo = useRef<() => void>(() => undefined);
  const redo = useRef<() => void>(() => undefined);
  const armArrowPick = useRef<() => void>(() => undefined);
  const changeZoom = useRef<(delta: number) => void>(() => undefined);
  const openDocument = useRef<(text: string) => void>(() => undefined);
  const newDocument = useRef<() => void>(() => undefined);
  const saveDocument = useRef<() => string | undefined>(() => undefined);
  const snapTransactionCycle = useRef<(clientX: number) => number | undefined>(() => undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<SignalId | undefined>();
  const selectedSignalRef = useRef<SignalId | undefined>(undefined);
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
  const [snapshot, setSnapshot] = useState<CanonicalSnapshot>({ revision: 0, document: cycleDocument });
  const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, dirty: false });
  const [problem, setProblem] = useState("");
  const [arrowPickStatus, setArrowPickStatus] = useState<"idle" | "from" | "to">("idle");
  const [zoom, setZoom] = useState(1);
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [bottomTab, setBottomTab] = useState<"Signal" | "Annotation" | "Transaction" | "Problems" | "JSON">("Signal");
  const [viewMode, setViewMode] = useState<"Cycle" | "Transaction" | "Split">("Cycle");
  const [followSelection, setFollowSelection] = useState(true);
  const followSelectionRef = useRef(true);
  followSelectionRef.current = followSelection;
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [bottomVisible, setBottomVisible] = useState(true);
  const [propertiesVisible, setPropertiesVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ readonly x: number; readonly y: number } | undefined>();
  const commandRegistry = useRef(new UiCommandRegistry());
  const [timelineRange, setTimelineRange] = useState({ start: 2, end: 4 });
  const timelineRangeRef = useRef(timelineRange);
  timelineRangeRef.current = timelineRange;
  const selectedSignal = snapshot.document.signals.find((signal) => signal.id === selectedId);
  const selectedGroup = snapshot.document.signalGroups.find((group) => group.id === selectedGroupId);
  const selectedAnnotation = snapshot.document.annotations.find((annotation) => annotation.id === selectedAnnotationId);
  const selectedTransaction = snapshot.document.transactions.find((transaction) => transaction.id === selectedTransactionId);
  const diagnostics = validateCanonicalDocument(snapshot.document);

  useEffect(() => {
    const registry = commandRegistry.current;
    const unregister = [
      registry.register<SemanticCommand>("semantic.execute", (command) => execute.current(command)),
      registry.register("selection.delete", () => {
        const annotationId = selectedAnnotationRef.current;
        const signalId = selectedSignalRef.current;
        const transactionId = selectedTransactionRef.current;
        if (transactionId) {
          execute.current({ id: nextCommandId("route_delete_transaction"), type: "transaction.delete", transactionId });
          selectedTransactionRef.current = undefined;
          setSelectedTransactionId(undefined);
        } else if (annotationId) {
          execute.current({ id: nextCommandId("route_delete_annotation"), type: "annotation.delete", annotationId });
          selectedAnnotationRef.current = undefined;
          setSelectedAnnotationId(undefined);
        } else if (signalId) {
          execute.current({ id: nextCommandId("route_delete_signal"), type: "signal.delete", signalId });
          selectedSignalRef.current = undefined;
          setSelectedId(undefined);
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
    const rulerElement = ruler.current;
    if (!rendererHost || !viewportElement || !rulerElement) return;

    let session = new CommandHistorySession(cycleDocument);
    const adapter = new ProductionWaveDromAdapter();
    const projectionService = new DefaultProjectionService();
    let referenceGeometry: LocalGeometryMap | undefined;
    const geometryMaps = new Map<SignalId, LocalGeometryMap>();
    const provider: WaveformSurfaceProvider = {
      async mountWave(id, owner) {
        const document = session.getSnapshot().document;
        const signal = document.signals.find((candidate) => candidate.id === id);
        if (!signal) throw new Error(`Signal '${id}' is missing.`);
        const rendered = await adapter.renderWave(id, adapter.toWaveJson({ signal, cycleCount: document.timeline.cycleCount }), owner);
        const geometry = adapter.extractLocalGeometry(rendered);
        geometryMaps.set(id, geometry);
        if (id === document.timeline.referenceClock) referenceGeometry = geometry;
        return { waveDromRenders: 1, localGeometryBuilds: 1 };
      },
      disposeWave(id) { adapter.dispose(id); },
    };
    const renderer = new StableTimingChartRenderer(provider);
    const snapService = new SemanticSnapCandidateService();
    renderer.mount(rendererHost);
    const initialSnapshot = session.getSnapshot();
    let window: VirtualizationWindow = viewportWindow(viewportElement);
    let projection: RenderProjection = projectionService.project({ snapshot: initialSnapshot, changeSet: { fullDocumentReplace: true }, viewport: window });
    renderer.update(projection);
    const refreshOverlays = (document: CanonicalDocument) => {
      renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps));
      renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps));
      for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-annotation-id]")) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationRef.current);
    };

    const publishState = () => {
      rendererHost.dataset.canonicalRevision = String(session.getSnapshot().revision);
      rendererHost.dataset.historyDepth = String(session.historyState().undoDepth);
      rendererHost.dataset.sessionCounters = JSON.stringify({ ...session.metrics(), ...session.historyMetrics(), ...projectionService.diagnostics(), snapIndexBuilds: snapService.metrics().builds, snapCandidateCount: snapService.metrics().candidateCount, waveAdapter: adapter.metrics() });
    };
    let currentZoom = 1;
    const applyZoom = (next: number) => {
      currentZoom = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
      const scalable = [rulerElement, ...rendererHost.querySelectorAll<HTMLElement>("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface'], [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']")];
      for (const element of scalable) {
        element.style.transformOrigin = "0 0";
        element.style.scale = `${currentZoom} 1`;
      }
      const baseWidth = Number.parseFloat(getComputedStyle(viewportElement).getPropertyValue("--wave-width")) || 640;
      const width = 440 + baseWidth * currentZoom;
      rendererHost.style.width = `${width}px`;
      rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.style.setProperty("width", `${width}px`);
      rendererHost.dataset.zoom = String(currentZoom);
      setZoom(currentZoom);
    };
    changeZoom.current = (delta) => applyZoom(currentZoom + delta);
    snapTransactionCycle.current = (clientX) => {
      const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
      const referenceId = session.getSnapshot().document.timeline.referenceClock;
      const referenceRow = referenceId ? projection.rowLayout.find((row) => row.rowId === referenceId) : undefined;
      if (!waveLayer || !referenceRow) return undefined;
      const bounds = waveLayer.getBoundingClientRect();
      const snap = buildSnapIndex(session.getSnapshot().document, projection, geometryMaps, snapService).nearest({ x: (clientX - bounds.left) / currentZoom, y: referenceRow.y + session.getSnapshot().document.layout.rowHeight / 2 }, 14 / currentZoom, ["cycle-boundary", "clock-edge", "signal-transition", "bus-transition", "marker", "annotation"]);
      return snap?.anchor.cycle;
    };
    publishState();

    void renderer.whenIdle().then(() => {
      if (!rendererHost.isConnected) return;
      buildRuler(rulerElement, referenceGeometry, session.getSnapshot().document, clock.id);
      applyZoom(currentZoom);
      refreshOverlays(session.getSnapshot().document);
      publishState();
      rendererHost.dataset.cycleViewReady = "true";
    });

    const applyResult = (result: ReturnType<CommandHistorySession["execute"]>) => {
      if (!result.ok) {
        setProblem(result.problems.map((item) => item.message).join(" "));
        return;
      }
      delete rendererHost.dataset.editorIdle;
      projection = projectionService.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: window, previous: projection });
      renderer.update(projection);
      setSnapshot(result.snapshot);
      setTimelineRange((range) => {
        const start = Math.min(range.start, result.snapshot.document.timeline.cycleCount - 1);
        return { start, end: Math.max(start + 1, Math.min(range.end, result.snapshot.document.timeline.cycleCount)) };
      });
      setHistory(session.historyState());
      setProblem("");
      publishState();
      void renderer.whenIdle().then(() => {
        if (!rendererHost.isConnected) return;
        buildRuler(rulerElement, referenceGeometry, result.snapshot.document, clock.id);
        applyZoom(currentZoom);
        refreshOverlays(result.snapshot.document);
        publishState();
        rendererHost.dataset.editorIdle = "true";
      });
    };
    execute.current = (command) => applyResult(session.execute(command));
    undo.current = () => applyResult(session.undo());
    redo.current = () => applyResult(session.redo());
    const replaceDocument = (document: CanonicalDocument) => {
      delete rendererHost.dataset.editorIdle;
      session = new CommandHistorySession(document);
      geometryMaps.clear();
      referenceGeometry = undefined;
      window = viewportWindow(viewportElement);
      projection = projectionService.project({ snapshot: session.getSnapshot(), changeSet: { fullDocumentReplace: true }, viewport: window });
      renderer.update(projection);
      rulerElement.replaceChildren();
      setSnapshot(session.getSnapshot());
      setHistory(session.historyState());
      setSelectedId(undefined);
      selectedAnnotationRef.current = undefined;
      setSelectedAnnotationId(undefined);
      selectedTransactionRef.current = undefined;
      setSelectedTransactionId(undefined);
      setProblem("");
      publishState();
      void renderer.whenIdle().then(() => {
        if (!rendererHost.isConnected) return;
        buildRuler(rulerElement, referenceGeometry, session.getSnapshot().document, session.getSnapshot().document.timeline.referenceClock);
        applyZoom(currentZoom);
        refreshOverlays(session.getSnapshot().document);
        publishState();
        rendererHost.dataset.editorIdle = "true";
      });
    };
    openDocument.current = (text) => {
      const parsed = parseDocument(text);
      if (!parsed.ok) {
        setProblem(parsed.problems.map((item) => item.message).join(" "));
        return;
      }
      replaceDocument(parsed.document);
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
        const next = viewportWindow(viewportElement);
        if (next.viewportStartY === window.viewportStartY && next.viewportEndY === window.viewportEndY) return;
        window = next;
        projection = projectionService.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport: window, previous: projection });
        renderer.update(projection);
        rendererHost.dataset.viewportStartY = String(window.viewportStartY);
      });
    };
    let pendingArrow: "armed" | SemanticAnchor | undefined;
    armArrowPick.current = () => {
      pendingArrow = "armed";
      setArrowPickStatus("from");
      rendererHost.dataset.arrowPick = "from";
    };
    const onSelect = (event: MouseEvent) => {
      const groupOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='tree-branch'][data-group-id]") : null;
      if (groupOwner?.dataset.groupId) {
        setSelectedGroupId(groupOwner.dataset.groupId as GroupId);
        selectedGroupRef.current = groupOwner.dataset.groupId as GroupId;
        setSelectedId(undefined);
        selectedSignalRef.current = undefined;
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
        setSelectedGroupId(undefined);
        setSelectedTransactionId(undefined);
        selectedTransactionRef.current = undefined;
        if (followSelectionRef.current) setBottomTab("Annotation");
        for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-annotation-id]")) owner.dataset.selected = String(owner.dataset.annotationId === id);
        return;
      }
      if (pendingArrow && event.target instanceof Element && event.target.closest("[data-role='timing-semantic-rows'], [data-role='stable-waveform-surface']")) {
        const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
        if (!waveLayer) return;
        const bounds = waveLayer.getBoundingClientRect();
        const snap = buildSnapIndex(session.getSnapshot().document, projection, geometryMaps).nearest({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, 12, ["clock-edge", "signal-transition", "bus-transition"]);
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
        const annotation: Annotation = { id: nextEntityId("annotation") as AnnotationId, type: "arrow", label: "Transition", visible: true, color: "#d04a36", from: pendingArrow, to: snap.anchor, lineType: "straight", arrowhead: "end" };
        commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_transition_arrow"), type: "annotation.create", annotation });
        selectedAnnotationRef.current = annotation.id;
        setSelectedAnnotationId(annotation.id);
        setSelectedId(undefined);
        setSelectedGroupId(undefined);
        setSelectedTransactionId(undefined);
        selectedTransactionRef.current = undefined;
        if (followSelectionRef.current) setBottomTab("Annotation");
        pendingArrow = undefined;
        setArrowPickStatus("idle");
        delete rendererHost.dataset.arrowPick;
        rendererHost.dataset.snapKind = snap.kind;
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
      const id = target?.dataset.rowId;
      if (!id || !id.startsWith("sig_")) return;
      const signal = session.getSnapshot().document.signals.find((candidate) => candidate.id === id);
      if (!signal) return;
      for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]")) {
        const selected = row.dataset.rowId === id || row.dataset.signalId === id;
        row.dataset.selected = String(selected);
        row.setAttribute("aria-selected", String(selected));
      }
      rendererHost.dataset.selectedSignalId = id;
      setSelectedId(signal.id);
      setSelectedGroupId(undefined);
      selectedAnnotationRef.current = undefined;
      setSelectedAnnotationId(undefined);
      selectedTransactionRef.current = undefined;
      setSelectedTransactionId(undefined);
      if (followSelectionRef.current) setBottomTab("Signal");
      publishState();
    };
    const onRulerSelect = (event: MouseEvent) => {
      const tick = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cycle]") : null;
      if (!tick) return;
      const cycle = Number(tick.dataset.cycle);
      if (!Number.isInteger(cycle) || cycle >= session.getSnapshot().document.timeline.cycleCount) return;
      if (event.shiftKey) {
        const anchor = timelineRangeRef.current.start;
        setTimelineRange({ start: Math.min(anchor, cycle), end: Math.max(anchor, cycle) + 1 });
      } else setTimelineRange({ start: cycle, end: cycle + 1 });
    };
    let dragged: { readonly kind: "signal" | "group"; readonly id: string } | undefined;
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
        ...(field ? { field, snapIndex: buildSnapIndex(session.getSnapshot().document, projection, geometryMaps, snapService) } : {}),
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
      const dx = Math.round(event.clientX - annotationDrag.startX);
      const dy = Math.round(event.clientY - annotationDrag.startY);
      annotationDrag.owner.style.translate = `${dx}px ${dy}px`;
      if (!annotationDrag.field || annotationDrag.label) return;
      const document = session.getSnapshot().document;
      const annotation = document.annotations.find((item) => item.id === annotationDrag?.annotationId);
      const anchor = annotation?.[annotationDrag.field];
      const point = resolveAnchorPoint(anchor, document, projection, geometryMaps);
      if (!annotation || !anchor || !point) return;
      const desired = { x: point.x + dx, y: point.y + dy };
      const snap = annotationDrag.snapIndex?.nearest(desired, 8, undefined, preferredSnapKinds(annotation.type));
      if (!snap) {
        renderer.updateSnapGuide();
        delete rendererHost.dataset.snapKind;
        delete rendererHost.dataset.snapDistance;
        return;
      }
      const row = projection.rowLayout.find((item) => item.rowId === snap.anchor.signalId);
      renderer.updateSnapGuide({ x: snap.point.x, y: snap.point.y, rowY: row?.y ?? 0, rowHeight: row?.height ?? projection.totalHeight, surfaceHeight: projection.totalHeight, label: `${snap.kind} · cycle ${snap.anchor.cycle}` });
      rendererHost.dataset.snapKind = snap.kind;
      rendererHost.dataset.snapDistance = String(Math.round(snap.distance * 100) / 100);
    };
    const onAnnotationPointerUp = (event: PointerEvent) => {
      const drag = annotationDrag;
      if (!drag) return;
      const dx = Math.round(event.clientX - drag.startX);
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
      const point = resolveAnchorPoint(anchor, session.getSnapshot().document, projection, geometryMaps);
      if (!field || !anchor || !point) return;
      const desired = { x: point.x + dx, y: point.y + dy };
      const snap = drag.snapIndex?.nearest(desired, 8, undefined, preferredSnapKinds(annotation.type));
      const nextAnchor = snap ? withSnapOffset(snap.anchor, desired, snap.point) : withAddedOffset(anchor, dx, dy);
      if (snap) {
        rendererHost.dataset.snapKind = snap.kind;
        rendererHost.dataset.snapDistance = String(snap.distance);
      }
      commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_drag"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: nextAnchor });
    };
    const onAnnotationKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || !mayRouteGlobalShortcut(event, annotationDrag !== undefined)) return;
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
      setContextMenu({ x: event.clientX, y: event.clientY });
    };
    viewportElement.addEventListener("scroll", onScroll, { passive: true });
    rendererHost.addEventListener("click", onSelect);
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
      cancelAnimationFrame(frame);
      viewportElement.removeEventListener("scroll", onScroll);
      rendererHost.removeEventListener("click", onSelect);
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
      execute.current = () => undefined;
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

  const createSelectedAnnotation = (annotation: Annotation) => {
    commandRegistry.current.execute<SemanticCommand>("semantic.execute", { id: nextCommandId("annotation_create"), type: "annotation.create", annotation });
    selectedAnnotationRef.current = annotation.id;
    setSelectedAnnotationId(annotation.id);
    setSelectedId(undefined);
    setSelectedTransactionId(undefined);
    selectedTransactionRef.current = undefined;
    if (followSelectionRef.current) setBottomTab("Annotation");
  };
  const signalEditor = <SignalEditor
    key={`${selectedSignal?.id ?? "none"}:${snapshot.revision}`}
    signal={selectedSignal}
    cycleCount={snapshot.document.timeline.cycleCount}
    history={history}
    groups={snapshot.document.signalGroups}
    problem={problem}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onVisibility={(_signalId, visible) => commandRegistry.current.execute("selection.visibility", { visible })}
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
  const annotationEditor = selectedAnnotation ? <AnnotationEditor
    key={`${selectedAnnotation.id}:${snapshot.revision}`}
    annotation={selectedAnnotation}
    history={history}
    problem={problem}
    onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
    onUndo={() => commandRegistry.current.execute("history.undo")}
    onRedo={() => commandRegistry.current.execute("history.redo")}
    onDelete={() => commandRegistry.current.execute("selection.delete")}
  /> : <div className="empty-editor">Select or create an Annotation.</div>;
  const selectTransaction = (id: TransactionId) => {
    selectedTransactionRef.current = id;
    setSelectedTransactionId(id);
    selectedSignalRef.current = undefined; setSelectedId(undefined);
    selectedGroupRef.current = undefined; setSelectedGroupId(undefined);
    selectedAnnotationRef.current = undefined; setSelectedAnnotationId(undefined);
    if (followSelectionRef.current) setBottomTab("Transaction");
  };
  const transactionEditor = <TransactionEditor
    key={`${selectedTransaction?.id ?? "none"}:${snapshot.revision}`}
    transaction={selectedTransaction}
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
    if (target.kind === "annotation" && followSelectionRef.current) setBottomTab("Annotation");
    if (target.kind === "transaction" && followSelectionRef.current) setBottomTab("Transaction");
    if (target.kind === "timeline") viewport.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  return <main className="editor-shell" data-inspector-visible={String(inspectorVisible)} data-bottom-visible={String(bottomVisible)}>
    <header className="app-titlebar"><span className="appmark">∿</span><h1>{snapshot.document.document.title}</h1><span className="save-state">{history.dirty ? "Modified" : "Saved"}</span><span className="view-title">Cycle View</span><span className="window-controls">—　□　×</span></header>
    <nav className="ribbon-tabs" aria-label="Ribbon tabs">
      {(["File", "Home", "Insert", "Timeline", "Annotation", "View", "Review", "AI"] as const).map((tab) => <button type="button" key={tab} className={ribbonTab === tab ? "active" : ""} onClick={() => setRibbonTab(tab)}>{tab}</button>)}
      <div className="view-mode"><span>View Mode:</span>{(["Cycle", "Transaction", "Split"] as const).map((mode) => <button type="button" key={mode} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{mode}</button>)}</div>
    </nav>
    <Ribbon
      tab={ribbonTab}
      document={snapshot.document}
      range={timelineRange}
      history={history}
      zoom={zoom}
      arrowPickStatus={arrowPickStatus}
      selectedSignalId={selectedSignal?.id ?? clock.id}
      onRange={setTimelineRange}
      onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)}
      onCreateAnnotation={createSelectedAnnotation}
      onArrowPick={() => armArrowPick.current()}
      onZoom={(delta) => changeZoom.current(delta)}
      onUndo={() => commandRegistry.current.execute("history.undo")}
      onRedo={() => commandRegistry.current.execute("history.redo")}
      onDelete={() => commandRegistry.current.execute("selection.delete")}
      onNew={() => newDocument.current()}
      onOpen={() => fileInput.current?.click()}
      onSave={() => { const text = saveDocument.current(); if (text) downloadText(text, `${snapshot.document.document.title || "timing-chart"}.tcd.json`); }}
      onRecent={() => { const text = localStorage.getItem("timing-chart-v2.recent"); if (text) openDocument.current(text); else setProblem("No recent document is available."); }}
      onProperties={() => setPropertiesVisible(true)}
      onExport={() => setExportVisible(true)}
      onToggleInspector={() => setInspectorVisible((value) => !value)}
      onToggleBottom={() => setBottomVisible((value) => !value)}
    />
    <div className="desktop-workspace">
      <section className={`cycle-panel mode-${viewMode.toLowerCase()}`} aria-label="Cycle View">
        <div className="column-headings" aria-hidden="true"><span>Signal / Group</span><span>Role / signal</span><span>Cycle waveform</span></div>
        <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport">
          {viewMode !== "Cycle" && <TransactionLanes document={snapshot.document} zoom={zoom} selectedId={selectedTransactionId} onSelect={selectTransaction} onSnap={(clientX) => snapTransactionCycle.current(clientX)} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} />}
          <div className="cycle-ruler" ref={ruler} data-testid="cycle-ruler" aria-label="Cycle ruler" />
          <div className="surface-host" ref={host} data-testid="cycle-surface" />
        </div>
      </section>
      <aside className="left-panel-tail"><button type="button">＋ Group</button><button type="button">＋ Signal</button><span>{snapshot.document.signals.length} signals</span></aside>
      {bottomVisible && <section className="bottom-editor" data-testid="bottom-editor">
        <nav className="bottom-tabs">
          {(["Signal", "Annotation", "Transaction", "Problems", "JSON"] as const).map((tab) => <button type="button" key={tab} className={bottomTab === tab ? "active" : ""} onClick={() => setBottomTab(tab)}>{tab}</button>)}
          <span />
          <label><input type="checkbox" checked={followSelection} onChange={(event) => setFollowSelection(event.target.checked)} /> Follow Selection</label>
          <button type="button" onClick={() => setFollowSelection(false)}>Pin</button>
        </nav>
        <div className="bottom-content">{bottomTab === "Signal" ? signalEditor : bottomTab === "Annotation" ? annotationEditor : bottomTab === "Transaction" ? transactionEditor : bottomTab === "Problems" ? <ProblemsPanel diagnostics={diagnostics} onNavigate={navigateProblem} /> : <JsonPanel document={snapshot.document} />}</div>
      </section>}
      {inspectorVisible && <InspectorPanel key={`${selectedSignal?.id ?? selectedGroup?.id ?? selectedAnnotation?.id ?? selectedTransaction?.id ?? "none"}:${snapshot.revision}`} signal={selectedSignal} group={selectedGroup} annotation={selectedAnnotation} transaction={selectedTransaction} registry={commandRegistry.current} document={snapshot.document} onCommand={(command) => commandRegistry.current.execute("semantic.execute", command)} />}
    </div>
    {contextMenu && <div className="context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseLeave={() => setContextMenu(undefined)}><button type="button" role="menuitem" onClick={() => { const current = selectedSignal?.name ?? selectedGroup?.name; const name = current === undefined ? null : window.prompt("Rename", current); if (name?.trim()) commandRegistry.current.execute("selection.rename", { name }); setContextMenu(undefined); }}>Rename</button><button type="button" role="menuitem" onClick={() => { commandRegistry.current.execute("selection.delete"); setContextMenu(undefined); }}>Delete</button><button type="button" role="menuitem" onClick={() => { if (selectedSignal) commandRegistry.current.execute("selection.visibility", { visible: selectedSignal.display.visible === false }); setContextMenu(undefined); }}>Visibility</button></div>}
    {propertiesVisible && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Document Properties" className="document-properties"><header><h2>Document Properties</h2><button type="button" aria-label="Close properties" onClick={() => setPropertiesVisible(false)}>×</button></header><dl><dt>Title</dt><dd>{snapshot.document.document.title}</dd><dt>ID</dt><dd>{snapshot.document.document.id}</dd><dt>Revision</dt><dd>{snapshot.document.document.footer.revision}</dd><dt>Signals</dt><dd>{snapshot.document.signals.length}</dd><dt>Cycles</dt><dd>{snapshot.document.timeline.cycleCount}</dd></dl></section></div>}
    {exportVisible && <ExportDialog snapshot={snapshot} range={timelineRange} onClose={() => setExportVisible(false)} />}
    <input ref={fileInput} hidden type="file" accept=".json,.tcd" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((text) => openDocument.current(text)); event.currentTarget.value = ""; }} />
    <footer className="status-bar">
      <span>Tool: Select</span>
      <span>Selected: <strong data-testid="selection-status">{selectedTransaction?.name ?? selectedAnnotation?.label ?? selectedSignal?.display.name ?? selectedGroup?.name ?? "None"}</strong></span>
      <span>Cycle {timelineRange.start}</span><span>Zoom: {Math.round(zoom * 100)}%</span><span>Snap: On</span>
      <span data-testid="revision-status">Canonical revision {snapshot.revision}</span>
      <span data-testid="history-status">History {history.undoDepth} / Redo {history.redoDepth}</span>
      <span>{history.dirty ? "Modified" : "Clean"}</span><span>Problems: {diagnostics.length}</span><span>WaveDrom: Ready</span>
    </footer>
  </main>;
}

const iconSprite = new URL("../../../../gui-mockup/icons.svg", import.meta.url).href;

function RibbonIcon({ name }: { readonly name: string }) {
  return <svg aria-hidden="true"><use href={`${iconSprite}#${name}`} /></svg>;
}

function Ribbon({ tab, document, range, history, zoom, arrowPickStatus, selectedSignalId, onRange, onCommand, onCreateAnnotation, onArrowPick, onZoom, onUndo, onRedo, onDelete, onNew, onOpen, onSave, onRecent, onProperties, onExport, onToggleInspector, onToggleBottom }: {
  readonly tab: string; readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly zoom: number; readonly arrowPickStatus: "idle" | "from" | "to"; readonly selectedSignalId: SignalId;
  readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => void; readonly onCreateAnnotation: (annotation: Annotation) => void; readonly onArrowPick: () => void; readonly onZoom: (delta: number) => void;
  readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onNew: () => void; readonly onOpen: () => void; readonly onSave: () => void; readonly onRecent: () => void; readonly onProperties: () => void; readonly onExport: () => void; readonly onToggleInspector: () => void; readonly onToggleBottom: () => void;
}) {
  return <section className="ribbon" aria-label={`${tab} Ribbon`} data-testid="ribbon">
    <div className="ribbon-group file-group">
      <button type="button" className="ribbon-tool" onClick={onNew}><RibbonIcon name="i-new" /><span>New</span></button>
      <button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span>Open</span></button>
      <button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span>Save</span></button>
      <button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span>Save As</span></button>
      <div className="ribbon-toggles"><button type="button" onClick={onRecent} title="Open the most recently saved document">Recent</button><button type="button" onClick={onProperties} title={`${document.document.title} · ${document.signals.length} signals`}>Properties</button><button type="button" onClick={onExport}>Export</button></div><b>File</b>
    </div>
    <div className="ribbon-group history-group"><button type="button" className="ribbon-tool" onClick={onUndo} disabled={!history.canUndo}><RibbonIcon name="i-undo" /><span>Undo</span></button><button type="button" className="ribbon-tool" onClick={onRedo} disabled={!history.canRedo}><RibbonIcon name="i-redo" /><span>Redo</span></button><button type="button" className="ribbon-tool" onClick={onDelete}><RibbonIcon name="i-delete" /><span>Delete</span></button><b>Edit</b></div>
    <div className="ribbon-group timeline-group"><TimelineToolbar document={document} range={range} onRange={onRange} onCommand={onCommand} /><b>Timeline</b></div>
    <div className="ribbon-group annotation-group"><AnnotationToolbar range={range} signalId={selectedSignalId} onCreate={onCreateAnnotation} arrowPickStatus={arrowPickStatus} onArmArrow={onArrowPick} /><b>Annotation</b></div>
    <div className="ribbon-group view-group"><button type="button" className="ribbon-tool" onClick={() => onZoom(-0.25)}><RibbonIcon name="i-zoom-out" /><span>Zoom out</span></button><output data-testid="zoom-status">{Math.round(zoom * 100)}%</output><button type="button" className="ribbon-tool" onClick={() => onZoom(0.25)}><RibbonIcon name="i-zoom-in" /><span>Zoom in</span></button><div className="ribbon-toggles"><button type="button" onClick={onToggleInspector}>Inspector</button><button type="button" onClick={onToggleBottom}>Bottom Editor</button><label><input type="checkbox" defaultChecked /> Grid</label><label><input type="checkbox" defaultChecked /> Snap</label></div><b>View</b></div>
  </section>;
}

function InspectorPanel({ signal, group, annotation, transaction, registry, document, onCommand }: { readonly signal: Signal | undefined; readonly group: SignalGroup | undefined; readonly annotation: Annotation | undefined; readonly transaction: Transaction | undefined; readonly registry: UiCommandRegistry; readonly document: Readonly<CanonicalDocument>; readonly onCommand: (command: SemanticCommand) => void }) {
  const [name, setName] = useState(signal?.name ?? "");
  const [groupName, setGroupName] = useState(group?.name ?? "");
  const [spacingBefore, setSpacingBefore] = useState(group?.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(group?.spacingAfter ?? 0);
  const [visible, setVisible] = useState(signal?.display.visible !== false);
  const [edgeCounter, setEdgeCounter] = useState<EdgeCounterSettings | undefined>(signal?.type === "clock" ? signal.edgeCounter : undefined);
  const [transactionName, setTransactionName] = useState(transaction?.name ?? "");
  const [transactionStart, setTransactionStart] = useState(transaction?.start ?? 0);
  const [transactionEnd, setTransactionEnd] = useState(transaction?.end ?? 1);
  const [transactionLane, setTransactionLane] = useState(transaction?.laneId ?? "lane_0");
  return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span><button type="button">•••</button></header>
    {!signal && !group && !annotation && !transaction && <section className="inspector-empty">No selection</section>}
    {signal && <>
      <section><h3>Signal</h3><div className="property-row"><span>Type</span><b>{signal.type}</b></div><label>Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== signal.name) registry.execute("selection.rename", { name }); }} /></label><label>Role<select aria-label="Inspector signal role" value={signal.role} disabled><option>{signal.role}</option></select></label><label>Width<input value={signal.type === "bus" ? signal.width ?? "" : 1} readOnly /></label><label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => { setVisible(event.target.checked); registry.execute("selection.visibility", { visible: event.target.checked }); }} /></label><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Signal</button></section>
      <section><h3>Layout</h3><div className="property-row"><span>Row height</span><span>{document.layout.rowHeight}px</span></div><div className="property-row"><span>Spacing</span><span>{document.layout.signalSpacing}px</span></div></section>
      {signal.type === "clock" && edgeCounter && <section><h3>Edge Numbers</h3><label className="checkline">Show<input aria-label="Edge Numbers show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Edge Numbers mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start number<input aria-label="Edge Numbers start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count from<select aria-label="Edge Numbers count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Edge Numbers every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Edge Numbers position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Edge Numbers X" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Edge Numbers Y" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="button" onClick={() => onCommand({ id: nextCommandId("edge_counter"), type: "signal.updateEdgeCounter", signalId: signal.id, edgeCounter })}>Apply Edge Numbers</button></section>}
    </>}
    {group && <section><h3>Group</h3><label>Name<input aria-label="Inspector group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} onBlur={() => { if (groupName.trim() && groupName.trim() !== group.name) registry.execute("selection.rename", { name: groupName }); }} /></label><label>Spacing Before<input aria-label="Group spacing before" type="number" min="0" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Group spacing after" type="number" min="0" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label><button type="button" onClick={() => onCommand({ id: nextCommandId("group_layout"), type: "group.updateLayout", groupId: group.id, spacingBefore, spacingAfter })}>Apply Group Layout</button><div className="property-row"><span>Rows</span><span>{group.rows.length}</span></div><div className="property-row"><span>Collapsed</span><span>No</span></div></section>}
    {annotation && <section><h3>Annotation</h3><div className="property-row"><span>Type</span><b>{annotation.type}</b></div><div className="property-row"><span>Anchor</span><span>{annotation.anchor?.point ?? annotation.from?.point ?? annotation.start?.point}</span></div><div className="property-row"><span>Offset</span><span>{JSON.stringify((annotation.anchor ?? annotation.from ?? annotation.start)?.offset ?? { x: 0, y: 0 })}</span></div><div className="property-row"><span>Style</span><span>{annotation.lineType ?? "default"}</span></div><div className="property-row"><span>Text</span><span>{annotation.label}</span></div><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Annotation</button></section>}
    {transaction && <section><h3>Transaction</h3><label>Name<input aria-label="Transaction name" value={transactionName} onChange={(event) => setTransactionName(event.target.value)} onBlur={() => { if (transactionName.trim() && transactionName.trim() !== transaction.name) registry.execute("selection.rename", { name: transactionName }); }} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={transactionEnd - 1} value={transactionStart} onChange={(event) => setTransactionStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={transactionStart + 1} max={document.timeline.cycleCount} value={transactionEnd} onChange={(event) => setTransactionEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={transactionLane} onChange={(event) => setTransactionLane(event.target.value)} /></label><button type="button" onClick={() => { if (transactionStart !== transaction.start) onCommand({ id: nextCommandId("transaction_move"), type: "transaction.move", transactionId: transaction.id, start: transactionStart }); if (transactionEnd !== transaction.end) onCommand({ id: nextCommandId("transaction_resize"), type: "transaction.resize", transactionId: transaction.id, edge: "end", value: transactionEnd }); if (transactionLane.trim() !== (transaction.laneId ?? "lane_0")) onCommand({ id: nextCommandId("transaction_lane"), type: "transaction.moveLane", transactionId: transaction.id, laneId: transactionLane }); }}>Apply Transaction</button><h3>Linked Signals</h3>{document.signals.filter((item) => item.type !== "commentRow").map((item) => <label className="checkline" key={item.id}>{item.display.name}<input aria-label={`Link ${item.display.name}`} type="checkbox" checked={transaction.linkedSignals?.includes(item.id) ?? false} onChange={(event) => onCommand({ id: nextCommandId("transaction_link"), type: event.target.checked ? "transaction.linkSignal" : "transaction.unlinkSignal", transactionId: transaction.id, signalId: item.id })} /></label>)}<button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Transaction</button></section>}
  </aside>;
}

function ProblemsPanel({ diagnostics, onNavigate }: { readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly onNavigate: (path: string) => void }) {
  const [filter, setFilter] = useState("");
  const visible = diagnostics.filter((item) => `${item.code} ${item.path} ${item.message}`.toLowerCase().includes(filter.toLowerCase()));
  return <section className="problems-panel" data-testid="problems-panel"><header><strong>Problems</strong><span>{diagnostics.length} diagnostics</span><input aria-label="Filter problems" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter" /><button type="button" onClick={() => setFilter("")}>Refresh</button></header>{visible.length === 0 ? <p>{diagnostics.length === 0 ? "No validation problems." : "No matching problems."}</p> : <table><thead><tr><th>Code</th><th>Path</th><th>Message</th></tr></thead><tbody>{visible.map((item, index) => <tr key={`${item.code}:${index}`}><td><button type="button" onClick={() => onNavigate(item.path)}>{item.code}</button></td><td>{item.path}</td><td>{item.message}</td></tr>)}</tbody></table>}</section>;
}

function JsonPanel({ document }: { readonly document: CanonicalDocument }) {
  const text = serializeCanonicalDocument(document);
  const [status, setStatus] = useState("Read only");
  return <section className="json-panel" data-testid="json-panel"><div className="json-toolbar"><strong>Generated JSON</strong><span>🔒 Read only</span><button type="button" onClick={() => setStatus("Formatted")}>Format</button><button type="button" onClick={() => setStatus(validateCanonicalDocument(document).length === 0 ? "Valid" : "Invalid")}>Validate</button><button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setStatus("Copied"); }}>Copy</button><select aria-label="JSON scope"><option>Selected Object</option><option>Whole Document</option></select><output>{status}</output></div><pre>{text}</pre></section>;
}

function TransactionLanes({ document, zoom, selectedId, onSelect, onSnap, onCommand }: { readonly document: CanonicalDocument; readonly zoom: number; readonly selectedId: TransactionId | undefined; readonly onSelect: (id: TransactionId) => void; readonly onSnap: (clientX: number) => number | undefined; readonly onCommand: (command: SemanticCommand) => void }) {
  const lanes = [...new Set(["lane_0", ...document.transactions.map((transaction) => transaction.laneId ?? "lane_0")])].sort();
  const [drag, setDrag] = useState<{ id: TransactionId; edge: "body" | "start" | "end" }>();
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
    const cycle = onSnap(event.clientX);
    setDrag(undefined);
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
  const capture = (event: React.PointerEvent, next: { id: TransactionId; edge: "body" | "start" | "end" }) => { event.stopPropagation(); event.currentTarget.parentElement?.setPointerCapture(event.pointerId); setDrag(next); };
  const x = (cycle: number) => cycleXs[cycle] ?? cycle / document.timeline.cycleCount * 640;
  return <section ref={owner} className="transaction-lanes" data-testid="transaction-lanes" style={{ "--transaction-zoom": zoom } as React.CSSProperties}><div className="transaction-lane-labels">{lanes.map((lane) => <span key={lane}>{lane}</span>)}</div><div className="transaction-track">{lanes.map((lane, laneIndex) => <div className="transaction-lane" key={lane} style={{ top: laneIndex * 28 }}>{document.transactions.filter((transaction) => (transaction.laneId ?? "lane_0") === lane).map((transaction) => <button type="button" key={transaction.id} data-transaction-id={transaction.id} data-selected={String(selectedId === transaction.id)} style={{ left: x(transaction.start), width: x(transaction.end) - x(transaction.start) }} onClick={() => onSelect(transaction.id)} onPointerUp={(event) => finish(event, transaction)}><i data-edge="start" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "start" })} /><span onPointerDown={(event) => capture(event, { id: transaction.id, edge: "body" })}>{transaction.name}</span><i data-edge="end" onPointerDown={(event) => capture(event, { id: transaction.id, edge: "end" })} /></button>)}</div>)}</div></section>;
}

function TransactionEditor({ transaction, document, history, onSelect, onCommand, onUndo, onRedo }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument; readonly history: HistoryState; readonly onSelect: (id: TransactionId) => void; readonly onCommand: (command: SemanticCommand) => void; readonly onUndo: () => void; readonly onRedo: () => void }) {
  const [name, setName] = useState("Transaction");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.min(5, document.timeline.cycleCount));
  const [laneId, setLaneId] = useState("lane_0");
  return <section className="transaction-editor" data-testid="transaction-editor"><header><strong>{transaction ? `Editing: ${transaction.name}` : "Transaction Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button></header><form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction") as TransactionId; onCommand({ id: nextCommandId("transaction_create"), type: "transaction.create", transaction: { id, name: name.trim() || "Transaction", start, end, laneId } }); onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Start<input aria-label="New Transaction start" type="number" min="0" max={end - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End<input aria-label="New Transaction end" type="number" min={start + 1} max={document.timeline.cycleCount} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /></label><button type="submit">Create Transaction</button></form><div className="transaction-list">{document.transactions.map((item) => <button type="button" key={item.id} data-selected={String(item.id === transaction?.id)} onClick={() => onSelect(item.id)}><b>{item.name}</b><span>{item.start}–{item.end}</span><span>{item.laneId ?? "lane_0"}</span><span>{item.linkedSignals?.length ?? 0} links</span></button>)}</div></section>;
}

function ExportDialog({ snapshot, range, onClose }: { readonly snapshot: CanonicalSnapshot; readonly range: { start: number; end: number }; readonly onClose: () => void }) {
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg");
  const [scope, setScope] = useState<"document" | "selected-range">("document");
  const [scale, setScale] = useState(2);
  const [status, setStatus] = useState("");
  const exportNow = async () => {
    setStatus("Generating…");
    try {
      const bytes = await new DeterministicExportService().export({ format, snapshot, settings: { scope, ...(scope === "selected-range" ? { range } : {}), scale, page: { size: "A4", orientation: "landscape", margin: 24, fit: "width" }, foldPolicy: "respect" } });
      downloadBytes(bytes, `${snapshot.document.document.title || "timing-chart"}.${format}`, format === "svg" ? "image/svg+xml" : format === "png" ? "image/png" : "application/pdf");
      setStatus(`${format.toUpperCase()} ready`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Export failed"); }
  };
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Export Timing Chart" className="export-dialog"><header><h2>Export</h2><button type="button" aria-label="Close export" onClick={onClose}>×</button></header><label>Format<select aria-label="Export format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="svg">SVG</option><option value="png">PNG</option><option value="pdf">PDF</option></select></label><label>Scope<select aria-label="Export scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="document">Entire Document</option><option value="selected-range">Selected Range</option></select></label>{format === "png" && <label>Scale<select aria-label="PNG scale" value={scale} onChange={(event) => setScale(Number(event.target.value))}><option value="1">1x</option><option value="2">2x</option><option value="3">3x</option></select></label>}<div className="export-summary">Canonical source · {snapshot.document.signals.length} signals · {snapshot.document.transactions.length} transactions</div><footer><output>{status}</output><button type="button" onClick={() => void exportNow()}>Export {format.toUpperCase()}</button></footer></section></div>;
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

function AnnotationToolbar({ range, signalId, onCreate, arrowPickStatus, onArmArrow }: { readonly range: { readonly start: number; readonly end: number }; readonly signalId: SignalId; readonly onCreate: (annotation: Annotation) => void; readonly arrowPickStatus: "idle" | "from" | "to"; readonly onArmArrow: () => void }) {
  const [type, setType] = useState<AnnotationType>("text");
  return <div className="annotation-toolbar" aria-label="Annotation tools" data-testid="annotation-toolbar">
    <strong>Annotation</strong>
    <select aria-label="Annotation type" value={type} onChange={(event) => setType(event.target.value as AnnotationType)}>
      {(["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency"] as const).map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
    <button type="button" onClick={() => onCreate(createAnnotation(type, signalId, range))}>Add annotation</button>
    <button type="button" className={arrowPickStatus === "idle" ? "" : "active"} onClick={onArmArrow}>Pick arrow endpoints</button>
    {arrowPickStatus !== "idle" && <b data-testid="arrow-pick-status">Click {arrowPickStatus} transition</b>}
    <span>Uses selected Signal and Timeline range · drag handles snap to rendered geometry</span>
  </div>;
}

function createAnnotation(type: AnnotationType, signalId: SignalId, range: { readonly start: number; readonly end: number }): Annotation {
  const id = nextEntityId("annotation") as AnnotationId;
  const first: SemanticAnchor = { signalId, cycle: range.start, point: "cycle-start" };
  const second: SemanticAnchor = { signalId, cycle: Math.max(range.start, range.end - 1), point: "cycle-end" };
  const base = { id, type, label: `${type} ${range.start}`, visible: true, color: "#d04a36" } as const;
  if (type === "arrow" || type === "dependency") return { ...base, from: first, to: second, lineType: "straight", arrowhead: "end" };
  if (["range", "bracket", "highlight", "measurement"].includes(type)) return { ...base, start: first, end: second };
  return { ...base, anchor: first };
}

function AnnotationEditor({ annotation, history, problem, onCommand, onUndo, onRedo, onDelete }: { readonly annotation: Annotation; readonly history: HistoryState; readonly problem: string; readonly onCommand: (command: SemanticCommand) => void; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void }) {
  const [label, setLabel] = useState(annotation.label);
  const [color, setColor] = useState(annotation.color ?? "#d04a36");
  const [visible, setVisible] = useState(annotation.visible);
  const [lineType, setLineType] = useState<NonNullable<Annotation["lineType"]>>(annotation.lineType ?? "straight");
  const [arrowhead, setArrowhead] = useState<NonNullable<Annotation["arrowhead"]>>(annotation.arrowhead ?? "end");
  const [labelX, setLabelX] = useState(annotation.labelOffset?.x ?? 0);
  const [labelY, setLabelY] = useState(annotation.labelOffset?.y ?? -14);
  return <section className="signal-editor annotation-editor" aria-label="Annotation Editor" data-testid="annotation-editor">
    <div className="editor-tabbar">
      <button type="button" className="editor-tab">Signal</button><button type="button" className="editor-tab active">Annotation</button>
      <span className="editor-selection">{annotation.label} · {annotation.type}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
      <button type="button" onClick={onDelete} data-testid="delete-annotation">Delete</button>
    </div>
    {problem && <div className="editor-problem" role="alert">{problem}</div>}
    <form className="annotation-properties" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("annotation_style"), type: "annotation.updateProperties", annotationId: annotation.id, label, visible, color, ...(annotation.type === "arrow" ? { lineType, arrowhead } : {}) });
    }}>
      <label>Label<input aria-label="Annotation label" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
      <label>Color<input aria-label="Annotation color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label className="check-label"><input aria-label="Annotation visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />Visible</label>
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

function TimelineToolbar({ document, range, onRange, onCommand }: { readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => void }) {
  const [count, setCount] = useState(1);
  const [destination, setDestination] = useState(8);
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
      <button type="button" onClick={() => onCommand({ id: nextCommandId("timeline_before"), type: "timeline.insert", at: range.start, count })}>Insert before</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("timeline_after"), type: "timeline.insert", at: range.end, count })}>Insert after</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("timeline_delete"), type: "timeline.delete", start: range.start, end: range.end })}>Delete range</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("timeline_duplicate"), type: "timeline.duplicateRange", start: range.start, end: range.end, at: destination })}>Duplicate to</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("timeline_move"), type: "timeline.moveRange", start: range.start, end: range.end, to: destination })}>Move to</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("marker"), type: "bookmark.create", bookmark: { id: nextEntityId("bookmark") as BookmarkId, name: `Marker ${range.start}`, start: range.start } })}>Add marker</button>
      <button type="button" onClick={() => onCommand({ id: nextCommandId("gap"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time") as TimeGroupId, name: `Gap ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "GAP" } } })}>Add gap</button>
    </div>
    <div className="timeline-objects">
      {document.bookmarks.map((bookmark) => <button type="button" key={bookmark.id} data-bookmark-id={bookmark.id} onClick={() => onCommand({ id: nextCommandId("marker_delete"), type: "bookmark.delete", bookmarkId: bookmark.id })}>◆ {bookmark.name} ×</button>)}
      {document.timeGroups.map((group) => <button type="button" key={group.id} data-time-group-id={group.id} onClick={() => onCommand({ id: nextCommandId("gap_delete"), type: "timeGroup.delete", timeGroupId: group.id })}>// {group.name} ×</button>)}
    </div>
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
  readonly onDropToGroup: (kind: "signal" | "group", id: string, targetGroupId: GroupId) => void;
}

function SignalEditor({ signal, cycleCount, history, groups, problem, onCommand, onUndo, onRedo, onVisibility, onDropToGroup }: SignalEditorProps) {
  const [name, setName] = useState(signal?.display.name ?? "");
  const [role, setRole] = useState<SignalRole>(signal?.role ?? "internal");
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
        onCommand({ id: nextCommandId("properties"), type: "signal.updateProperties", signalId: signal.id, name, role, ...(signal.type === "bus" ? { displayFormat: format } : {}) });
      }}>
        <label>Name<input aria-label="Signal name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Role<select aria-label="Signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        {signal.type === "bus" && <label>Display<select aria-label="Bus display format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label>}
        <button type="submit" data-testid="save-signal-properties">Apply properties</button>
      </form>
      {signal.type === "clock" ? <ClockGeneratorEditor signal={signal} onCommand={onCommand} /> : signal.type === "commentRow" ? <div className="editor-empty">Comment rows are edited in a later context editor.</div> : <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} />}
    </>}
  </section>;
}

function ClockGeneratorEditor({ signal, onCommand }: { readonly signal: ClockSignal; readonly onCommand: (command: SemanticCommand) => void }) {
  const [generator, setGenerator] = useState<ClockGenerator>(signal.generator);
  const number = (key: "start" | "period" | "duty" | "phase", value: string) => setGenerator({ ...generator, [key]: Number(value) });
  return <form className="clock-generator" aria-label="Clock Generator" onSubmit={(event) => {
    event.preventDefault();
    onCommand({ id: nextCommandId("clock"), type: "signal.updateClockGenerator", signalId: signal.id, generator });
  }}>
    <h2>Clock Generator</h2>
    <label>Start<input aria-label="Clock start" type="number" min="0" step="1" value={generator.start} onChange={(event) => number("start", event.target.value)} /></label>
    <label>Period<input aria-label="Clock period" type="number" min="1" step="1" value={generator.period} onChange={(event) => number("period", event.target.value)} /></label>
    <label title="Pinned WaveDrom supports 50% duty only">Duty<input aria-label="Clock duty" type="number" value={generator.duty} disabled /></label>
    <label>Phase<input aria-label="Clock phase" type="number" step="0.5" value={generator.phase} onChange={(event) => number("phase", event.target.value)} /></label>
    <label>Initial<select aria-label="Clock initial" value={generator.initial} onChange={(event) => setGenerator({ ...generator, initial: Number(event.target.value) as 0 | 1 })}><option value="0">0</option><option value="1">1</option></select></label>
    <label>Polarity<select aria-label="Clock polarity" value={generator.polarity} onChange={(event) => setGenerator({ ...generator, polarity: event.target.value as ClockGenerator["polarity"] })}><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
    <button type="submit" data-testid="apply-clock-generator">Apply generator</button>
  </form>;
}

function EventTable({ signal, cycleCount, onCommand }: { readonly signal: ValueSignal; readonly cycleCount: number; readonly onCommand: (command: SemanticCommand) => void }) {
  const [start, setStart] = useState(0);
  const [value, setValue] = useState(quickValue(signal));
  return <div className="event-editor">
    <div className="event-heading"><h2>Event Table</h2><span>End and duration are derived</span></div>
    <div className="event-table" role="table" aria-label="Signal events">
      <div className="event-row event-columns" role="row"><span>Start</span><span>Value</span><span>End</span><span>Duration</span><span>Comment</span><span>Actions</span></div>
      {signal.values.map((change, index) => <EventRow key={change.start} signal={signal} change={change} end={signal.values[index + 1]?.start ?? cycleCount} onCommand={onCommand} />)}
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

function EventRow({ signal, change, end, onCommand }: { readonly signal: ValueSignal; readonly change: ValueSignal["values"][number]; readonly end: number; readonly onCommand: (command: SemanticCommand) => void }) {
  const [start, setStart] = useState(change.start);
  const [value, setValue] = useState(String(change.value));
  const [comment, setComment] = useState(change.comment ?? "");
  return <form className="event-row" role="row" onSubmit={(event) => {
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
function nextEntityId(scope: "bookmark" | "time" | "annotation" | "transaction"): string {
  entitySequence += 1;
  return `${scope}_phase9_${entitySequence}`;
}

const annotationFields = ["anchor", "start", "end", "from", "to"] as const;

function resolveAnchorPoint(anchor: SemanticAnchor | undefined, document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>): Point | undefined {
  if (!anchor) return undefined;
  const signalId = anchor.signalId ?? document.timeline.referenceClock;
  if (!signalId) return undefined;
  const local = maps.get(signalId)?.find({ ...anchor, signalId });
  if (!local) return undefined;
  const rowY = anchor.signalId ? projection.rowLayout.find((row) => row.rowId === anchor.signalId)?.y ?? 0 : 0;
  return { x: local.point.x, y: rowY + local.point.y };
}

function projectAnnotationOverlays(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>): AnnotationOverlayPrimitive[] {
  return document.annotations.flatMap((annotation) => {
    const anchors = annotationFields.flatMap((field) => {
      const point = resolveAnchorPoint(annotation[field], document, projection, maps);
      return point ? [{ field, ...point }] : [];
    });
    if (anchors.length === 0) return [];
    const shape: AnnotationOverlayPrimitive["shape"] = annotation.type === "verticalLine" ? "vertical"
      : ["range", "highlight"].includes(annotation.type) ? "range"
      : ["arrow", "dependency", "measurement", "bracket"].includes(annotation.type) ? "line" : "point";
    return [{
      id: annotation.id,
      type: annotation.type,
      shape,
      label: annotation.type === "measurement" && annotation.start && annotation.end ? `${annotation.label} · Δ ${Math.abs(annotation.end.cycle - annotation.start.cycle)} cycles` : annotation.label,
      visible: annotation.visible,
      ...(annotation.color === undefined ? {} : { color: annotation.color }),
      anchors,
      ...(annotation.labelOffset === undefined ? {} : { labelOffset: annotation.labelOffset }),
      ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }),
      ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }),
      surfaceHeight: projection.totalHeight,
    }];
  });
}

function projectEdgeCounters(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>): EdgeCounterOverlayPrimitive[] {
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
    return edges.flatMap((edge, index) => index % signal.edgeCounter.labelEvery === 0 ? [{ id: `edge:${signal.id}:${edge.kind}:${edge.cycle}`, signalId: signal.id, x: edge.x + signal.edgeCounter.offset.x, y: edge.y + signal.edgeCounter.offset.y + (signal.edgeCounter.position === "above" ? -6 : 10), label: String(signal.edgeCounter.startNumber + index) }] : []);
  });
}

function buildSnapIndex(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, service = new SemanticSnapCandidateService()): ImmutableSnapIndex {
  return service.build({ document, geometryMaps: maps, rowY: new Map(projection.rowLayout.flatMap((row) => document.signals.some((signal) => signal.id === row.rowId) ? [[row.rowId as SignalId, row.y] as const] : [])) });
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

function viewportWindow(viewport: HTMLElement): VirtualizationWindow {
  const bodyTop = Math.max(0, viewport.scrollTop - 34);
  return {
    viewportStartY: bodyTop,
    viewportEndY: bodyTop + viewport.clientHeight,
    overscanBefore: 48,
    overscanAfter: 48,
    pinnedRowIds: [],
  };
}

function buildRuler(element: HTMLElement, geometry: LocalGeometryMap | undefined, document: CanonicalDocument, referenceSignalId: SignalId | undefined): void {
  if (!geometry || !referenceSignalId) {
    element.dataset.geometryError = "Reference-clock geometry unavailable";
    element.replaceChildren();
    return;
  }
  const ticks: HTMLElement[] = [];
  let finalX = 0;
  for (let cycle = 0; cycle <= document.timeline.cycleCount; cycle += 1) {
    const point = geometry.find({ signalId: referenceSignalId, cycle, point: "cycle-start" })?.point;
    if (!point) continue;
    const tick = element.ownerDocument.createElement("span");
    tick.dataset.cycle = String(cycle);
    tick.className = "cycle-tick";
    tick.style.left = `${point.x}px`;
    tick.textContent = String(cycle);
    ticks.push(tick);
    finalX = point.x;
  }
  const overlays: HTMLElement[] = [];
  for (const bookmark of document.bookmarks) {
    const point = geometry.find({ signalId: referenceSignalId, cycle: bookmark.start, point: "cycle-start" })?.point;
    if (!point) continue;
    const marker = element.ownerDocument.createElement("span");
    marker.className = "timeline-marker";
    marker.dataset.bookmarkId = bookmark.id;
    marker.style.left = `${point.x}px`;
    marker.textContent = `◆ ${bookmark.name}`;
    overlays.push(marker);
  }
  for (const group of document.timeGroups.filter((item) => item.presentation?.collapsed)) {
    const start = geometry.find({ signalId: referenceSignalId, cycle: group.start, point: "cycle-start" })?.point;
    const end = geometry.find({ signalId: referenceSignalId, cycle: group.end, point: "cycle-start" })?.point;
    if (!start || !end) continue;
    const gap = element.ownerDocument.createElement("span");
    gap.className = "timeline-gap";
    gap.dataset.timeGroupId = group.id;
    gap.style.left = `${start.x}px`;
    gap.style.width = `${end.x - start.x}px`;
    gap.textContent = group.presentation?.foldLabel ?? group.name;
    overlays.push(gap);
  }
  element.replaceChildren(...ticks, ...overlays);
  element.dataset.source = "local-geometry";
  element.parentElement?.style.setProperty("--wave-width", `${Math.ceil(finalX + 24)}px`);
}
