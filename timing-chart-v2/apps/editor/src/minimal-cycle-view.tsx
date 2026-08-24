import { useEffect, useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type SnapKind } from "@timing-chart-v2/geometry";
import { CommandHistorySession, type HistoryState } from "@timing-chart-v2/history";
import { DefaultProjectionService, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { StableTimingChartRenderer, type AnnotationOverlayPrimitive, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { Annotation, AnnotationId, AnnotationType, BookmarkId, CanonicalDocument, ClockGenerator, ClockSignal, CommandId, GroupId, SemanticAnchor, Signal, SignalGroup, SignalId, SignalRole, TimeGroupId, ValueSignal } from "@timing-chart-v2/schema";
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
  const [selectedId, setSelectedId] = useState<SignalId | undefined>();
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<AnnotationId | undefined>();
  const selectedAnnotationRef = useRef<AnnotationId | undefined>(undefined);
  selectedAnnotationRef.current = selectedAnnotationId;
  const [snapshot, setSnapshot] = useState<CanonicalSnapshot>({ revision: 0, document: cycleDocument });
  const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, dirty: false });
  const [problem, setProblem] = useState("");
  const [arrowPickStatus, setArrowPickStatus] = useState<"idle" | "from" | "to">("idle");
  const [zoom, setZoom] = useState(1);
  const [timelineRange, setTimelineRange] = useState({ start: 2, end: 4 });
  const timelineRangeRef = useRef(timelineRange);
  timelineRangeRef.current = timelineRange;
  const selectedSignal = snapshot.document.signals.find((signal) => signal.id === selectedId);
  const selectedAnnotation = snapshot.document.annotations.find((annotation) => annotation.id === selectedAnnotationId);

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

    const session = new CommandHistorySession(cycleDocument);
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
      for (const owner of rendererHost.querySelectorAll<HTMLElement>("[data-annotation-id]")) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationRef.current);
    };

    const publishState = () => {
      rendererHost.dataset.canonicalRevision = String(session.getSnapshot().revision);
      rendererHost.dataset.historyDepth = String(session.historyState().undoDepth);
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
    publishState();

    void renderer.whenIdle().then(() => {
      if (!rendererHost.isConnected) return;
      buildRuler(rulerElement, referenceGeometry, session.getSnapshot().document, clock.id);
      applyZoom(currentZoom);
      refreshOverlays(session.getSnapshot().document);
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
        rendererHost.dataset.editorIdle = "true";
      });
    };
    execute.current = (command) => applyResult(session.execute(command));
    undo.current = () => applyResult(session.undo());
    redo.current = () => applyResult(session.redo());

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
      const annotationOwner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='annotation-owner'][data-annotation-id]") : null;
      if (annotationOwner?.dataset.annotationId) {
        const id = annotationOwner.dataset.annotationId as AnnotationId;
        selectedAnnotationRef.current = id;
        setSelectedAnnotationId(id);
        setSelectedId(undefined);
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
        execute.current({ id: nextCommandId("annotation_transition_arrow"), type: "annotation.create", annotation });
        selectedAnnotationRef.current = annotation.id;
        setSelectedAnnotationId(annotation.id);
        setSelectedId(undefined);
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
      selectedAnnotationRef.current = undefined;
      setSelectedAnnotationId(undefined);
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
          execute.current({ id: nextCommandId("drag_signal"), type: "signal.move", signalId: dragged.id as SignalId, targetGroupId: targetGroup.id, index });
        }
      } else {
        const sourceIndex = document.signalGroups.findIndex((group) => group.id === dragged!.id);
        const targetIndex = document.signalGroups.findIndex((group) => group.id === target.dataset.groupId);
        if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
          let index = targetIndex + (after ? 1 : 0);
          if (sourceIndex < index) index -= 1;
          execute.current({ id: nextCommandId("drag_group"), type: "group.move", groupId: dragged.id as GroupId, index });
        }
      }
      dragged = undefined;
      clearDropState();
    };
    const onDragEnd = () => { dragged = undefined; clearDropState(); };
    let annotationDrag: { readonly annotationId: AnnotationId; readonly field?: typeof annotationFields[number]; readonly label: boolean; readonly startX: number; readonly startY: number; readonly owner: HTMLElement } | undefined;
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
      annotationDrag = {
        annotationId: owner.dataset.annotationId as AnnotationId,
        ...(fieldElement?.dataset.annotationField ? { field: fieldElement.dataset.annotationField as typeof annotationFields[number] } : {}),
        label,
        startX: event.clientX,
        startY: event.clientY,
        owner,
      };
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
      const snap = buildSnapIndex(document, projection, geometryMaps, snapService).nearest(desired, 8, undefined, preferredSnapKinds(annotation.type));
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
        execute.current({ id: nextCommandId("annotation_label_drag"), type: "annotation.updateLabelOffset", annotationId: annotation.id, labelOffset: { x: (annotation.labelOffset?.x ?? 0) + dx, y: (annotation.labelOffset?.y ?? -14) + dy } });
        return;
      }
      if (!drag.field) {
        execute.current({ id: nextCommandId("annotation_move"), type: "annotation.translateOffsets", annotationId: annotation.id, delta: { x: dx, y: dy } });
        return;
      }
      const field = drag.field ?? annotationFields.find((key) => annotation[key] !== undefined);
      const anchor = field ? annotation[field] : undefined;
      const point = resolveAnchorPoint(anchor, session.getSnapshot().document, projection, geometryMaps);
      if (!field || !anchor || !point) return;
      const desired = { x: point.x + dx, y: point.y + dy };
      const snap = buildSnapIndex(session.getSnapshot().document, projection, geometryMaps, snapService).nearest(desired, 8, undefined, preferredSnapKinds(annotation.type));
      const nextAnchor = snap ? withSnapOffset(snap.anchor, desired, snap.point) : withAddedOffset(anchor, dx, dy);
      if (snap) {
        rendererHost.dataset.snapKind = snap.kind;
        rendererHost.dataset.snapDistance = String(snap.distance);
      }
      execute.current({ id: nextCommandId("annotation_drag"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: nextAnchor });
    };
    const onAnnotationKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element)) return;
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
      execute.current({ id: nextCommandId("annotation_nudge"), type: "annotation.setAnchor", annotationId: annotation.id, field, anchor: withAddedOffset(anchor, movement.x, movement.y) });
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
      rendererHost.ownerDocument.removeEventListener("keydown", onAnnotationKeyDown);
      execute.current = () => undefined;
      undo.current = () => undefined;
      redo.current = () => undefined;
      armArrowPick.current = () => undefined;
      changeZoom.current = () => undefined;
      renderer.dispose();
    };
  }, []);

  return <main className="editor-shell">
    <header className="app-header">
      <div><p className="eyebrow">TIMING CHART EDITOR V2</p><h1>Semiconductor Timing Chart</h1></div>
      <span className="view-chip">Cycle View</span>
    </header>
    <section className="cycle-panel" aria-label="Cycle View">
      <TimelineToolbar
        document={snapshot.document}
        range={timelineRange}
        onRange={setTimelineRange}
        onCommand={(command) => execute.current(command)}
      />
      <AnnotationToolbar
        range={timelineRange}
        signalId={selectedSignal?.id ?? clock.id}
        onCreate={(annotation) => {
          execute.current({ id: nextCommandId("annotation_create"), type: "annotation.create", annotation });
          selectedAnnotationRef.current = annotation.id;
          setSelectedAnnotationId(annotation.id);
          setSelectedId(undefined);
        }}
        arrowPickStatus={arrowPickStatus}
        onArmArrow={() => armArrowPick.current()}
      />
      <div className="view-toolbar" aria-label="View controls"><strong>View</strong><button type="button" onClick={() => changeZoom.current(-0.25)}>Zoom out</button><output data-testid="zoom-status">{Math.round(zoom * 100)}%</output><button type="button" onClick={() => changeZoom.current(0.25)}>Zoom in</button></div>
      <div className="column-headings" aria-hidden="true"><span>Signal tree</span><span>Role / signal</span><span>Cycle waveform</span></div>
      <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport">
        <div className="cycle-ruler" ref={ruler} data-testid="cycle-ruler" aria-label="Cycle ruler" />
        <div className="surface-host" ref={host} data-testid="cycle-surface" />
      </div>
    </section>
    {selectedAnnotation ? <AnnotationEditor
      key={`${selectedAnnotation.id}:${snapshot.revision}`}
      annotation={selectedAnnotation}
      history={history}
      problem={problem}
      onCommand={(command) => execute.current(command)}
      onUndo={() => undo.current()}
      onRedo={() => redo.current()}
      onDelete={() => {
        execute.current({ id: nextCommandId("annotation_delete"), type: "annotation.delete", annotationId: selectedAnnotation.id });
        selectedAnnotationRef.current = undefined;
        setSelectedAnnotationId(undefined);
      }}
    /> : <SignalEditor
      key={`${selectedSignal?.id ?? "none"}:${snapshot.revision}`}
      signal={selectedSignal}
      cycleCount={snapshot.document.timeline.cycleCount}
      history={history}
      groups={snapshot.document.signalGroups}
      problem={problem}
      onCommand={(command) => execute.current(command)}
      onUndo={() => undo.current()}
      onRedo={() => redo.current()}
      onVisibility={(signalId, visible) => execute.current({ id: nextCommandId("visibility"), type: "signal.setVisibility", signalId, visible })}
      onDropToGroup={(kind, id, targetGroupId) => {
        const document = snapshot.document;
        const targetGroup = document.signalGroups.find((group) => group.id === targetGroupId);
        if (!targetGroup) return;
        if (kind === "signal") {
          const sourceGroup = document.signalGroups.find((group) => group.rows.includes(id as SignalId));
          let index = targetGroup.rows.length;
          if (sourceGroup?.id === targetGroup.id) index = Math.max(0, index - 1);
          execute.current({ id: nextCommandId("drop_group_target"), type: "signal.move", signalId: id as SignalId, targetGroupId, index });
          return;
        }
        const sourceIndex = document.signalGroups.findIndex((group) => group.id === id);
        const targetIndex = document.signalGroups.findIndex((group) => group.id === targetGroupId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
        execute.current({ id: nextCommandId("drop_group_target"), type: "group.move", groupId: id as GroupId, index: sourceIndex < targetIndex ? targetIndex - 1 : targetIndex });
      }}
    />}
    <footer className="status-bar">
      <span>Selected: <strong data-testid="selection-status">{selectedAnnotation?.label ?? selectedSignal?.display.name ?? "None"}</strong></span>
      <span data-testid="revision-status">Canonical revision {snapshot.revision}</span>
      <span data-testid="history-status">History {history.undoDepth} / Redo {history.redoDepth}</span>
      <span>{history.dirty ? "Modified" : "Clean"}</span>
    </footer>
  </main>;
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
function nextEntityId(scope: "bookmark" | "time" | "annotation"): string {
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

function buildRuler(element: HTMLElement, geometry: LocalGeometryMap | undefined, document: CanonicalDocument, referenceSignalId: SignalId): void {
  if (!geometry) {
    element.dataset.geometryError = "Reference-clock geometry unavailable";
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
