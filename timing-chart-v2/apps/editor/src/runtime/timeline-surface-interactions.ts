import type { MutableRefObject } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { RenderProjection } from "@timing-chart-v2/projection";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";
import type { AnnotationId, GroupId, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import type { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { ContextMenuState } from "../workspace/use-dialog-menu-state.js";
import type { SelectionOwner } from "../application/use-selection-owner.js";
import type { EditorApplicationOwner } from "../application/use-editor-application-owner.js";
import type { TimelineNavigationOwner } from "./use-timeline-navigation-owner.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import type { DocumentEpoch } from "./document-epoch.js";
import { TimelineRangeInteractionOwner } from "./timeline-range-interaction-owner.js";
import { AnnotationInteractionOwner } from "./timeline-annotation-interaction-owner.js";
import { TreeDragInteractionOwner } from "./tree-drag-interaction-owner.js";
import type { TimelineGeometryOwner } from "./timeline-geometry-owner.js";
import { attachEditorEventBindings } from "./interaction-controller.js";
import { routeGlobalShortcut } from "./keyboard-shortcut-router.js";
import { cancelActiveGesture } from "./active-gesture-cancellation.js";
import { nextCommandId } from "../command-id.js";

type Session = ReturnType<EditorApplicationOwner["runtime"]["session"]["current"]>;
type SessionSnapshot = ReturnType<Session["getSnapshot"]>;
type TimelineRange = Readonly<{ start: number; end: number }>;

export interface TimelineSurfaceInteractionInput {
  readonly rendererHost: HTMLElement;
  readonly viewportElement: HTMLElement;
  readonly rulerElement: HTMLElement;
  readonly rulerViewportElement: HTMLElement;
  readonly renderer: Pick<TimingChartRenderer, "updateSnapGuide" | "updateOverlays">;
  readonly timelineGeometry: TimelineGeometryOwner;
  readonly documentEpoch: Pick<DocumentEpoch, "current" | "isCurrent">;
  /** Read the replaceable document session at event time, never a mount-time session object. */
  readonly getSnapshot: () => SessionSnapshot;
  readonly timelineNavigation: TimelineNavigationOwner;
  readonly timelineRuntime: Pick<TimelineViewportRuntime, "refreshOverlays" | "refreshPlayhead">;
  readonly getProjection: () => RenderProjection;
  readonly getTimelineOffset: () => number;
  readonly getPendingArrow: () => "armed" | SemanticAnchor | undefined;
  readonly clearPendingArrow: () => void;
  readonly applyCanvasCycleSelection: (cycle: number, extend: boolean) => boolean;
  readonly onSelect: (event: MouseEvent) => void;
  readonly onTreeKeyDown: (event: KeyboardEvent) => void;
  readonly onScroll: () => void;
  readonly onViewportKeyDown: (event: KeyboardEvent) => void;
  readonly selection: SelectionOwner;
  readonly execute: (command: SemanticCommand) => void;
  readonly executeBatch: (commands: readonly SemanticCommand[]) => void;
  readonly commandRegistry: MutableRefObject<UiCommandRegistry>;
  readonly snapEnabledRef: MutableRefObject<boolean>;
  readonly timelineRangeRef: MutableRefObject<TimelineRange>;
  readonly selectedCycleRef: MutableRefObject<number>;
  readonly selectedEdgeRef: MutableRefObject<unknown>;
  readonly lowerCanvasClickRef: MutableRefObject<(event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => void>;
  readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
  readonly suppressCanvasClickRef: MutableRefObject<boolean>;
  readonly setRangeSelectionActive: (active: boolean) => void;
  readonly setRange: (range: TimelineRange) => void;
  readonly setSelectedCycle: (cycle: number) => void;
  readonly setContextMenu: (value: ContextMenuState | undefined) => void;
  readonly closeContextMenu: () => void;
  readonly setArrowPickStatus: (status: "idle" | "from" | "to") => void;
  readonly publishState: () => void;
  readonly refreshRangePreview: () => void;
}

export interface TimelineSurfaceInteractionHandle {
  readonly detach: () => void;
  readonly cancel: () => void;
  readonly consumeRulerClickSuppression: () => boolean;
}

export function createTimelineViewportKeyDownHandler(viewportElement: HTMLElement): (event: KeyboardEvent) => void {
  return (event) => {
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
}

export function createTimelineCycleBoundaryResolver(input: Readonly<{ rendererHost: HTMLElement; timelineGeometry: TimelineGeometryOwner; getZoom: () => number; isSnapEnabled: () => boolean }>): (clientX: number) => number | undefined {
  return (clientX) => {
    const waveLayer = input.rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
    if (!waveLayer) return undefined;
    return input.timelineGeometry.cycleBoundaryAtScreenX(clientX, waveLayer.getBoundingClientRect().left, input.getZoom(), input.isSnapEnabled());
  };
}

/** Owns pointer, keyboard, context-menu, and tree drag wiring for one surface. */
export function attachTimelineSurfaceInteractions(input: TimelineSurfaceInteractionInput): TimelineSurfaceInteractionHandle {
  const {
    rendererHost, viewportElement, rulerElement, rulerViewportElement, renderer, timelineGeometry, documentEpoch,
    getSnapshot, timelineNavigation, timelineRuntime, getProjection, getTimelineOffset, getPendingArrow, clearPendingArrow,
    applyCanvasCycleSelection, onSelect, onTreeKeyDown, onScroll, onViewportKeyDown,
    selection, execute, executeBatch, commandRegistry, snapEnabledRef, timelineRangeRef, selectedCycleRef, selectedEdgeRef,
    lowerCanvasClickRef, menuOriginRef, suppressCanvasClickRef, setRangeSelectionActive, setRange, setSelectedCycle,
    setContextMenu, closeContextMenu, setArrowPickStatus, publishState, refreshRangePreview,
  } = input;
  // #738: pointer X is interpreted in the SAME coordinate system the ruler ticks are drawn in -- the ruler content's own
  // origin -- not the (possibly hidden/offset) Cycle wave layer, so Transaction mode (whose Cycle surface is hidden and laid
  // out elsewhere) resolves the same time as Cycle mode. Falls back to the wave layer only before a ruler exists.
  const timeOriginLeft = (): number | undefined => {
    const ruler = rulerElement.getBoundingClientRect();
    if (ruler.width > 0) return ruler.left;
    return rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']")?.getBoundingClientRect().left;
  };
  const cycleBoundaryAtX = (clientX: number): number | undefined => {
    const left = timeOriginLeft();
    return left === undefined ? undefined : timelineGeometry.cycleBoundaryAtScreenX(clientX, left, timelineNavigation.getZoom(), snapEnabledRef.current);
  };
  /** The ruler cell [start, end) containing the pointer: deterministic floor, never snapped to the nearest tick or glyph. */
  const rulerCellAtX = (clientX: number): number | undefined => {
    const left = timeOriginLeft();
    // Boundary rule: cells are [start, end) -- a pointer exactly on a tick boundary belongs to the cell that starts there
    // (the 0.01px slack absorbs sub-pixel float error in the ruler/viewport transforms).
    return left === undefined ? undefined : timelineGeometry.cycleBoundaryAtScreenX(clientX, left - 0.01, timelineNavigation.getZoom(), false);
  };
  const timeDomainExclusions = [
    "[data-role='left-tree-rows']", "[data-role='frozen-label-rows']", "[data-role='annotation-owner']",
    "[data-role='annotation-body']", "[data-role='annotation-label']", "[data-role='annotation-handle']",
    "[data-testid='editor-legend']",
    "[role='menu']", "button", "input", "select", "textarea", "[contenteditable='true']", "[role='separator']", "[draggable='true']",
  ].join(", ");
  const isTimeDomainPointerTarget = (event: MouseEvent | PointerEvent): boolean => {
    const target = event.target instanceof Element ? event.target : undefined;
    if (!target || target.closest(timeDomainExclusions)) return false;
    const bounds = viewportElement.getBoundingClientRect();
    // #738: the ruler viewport is entirely time domain (it has no frozen columns of its own, in any mode); only the
    // waveform viewport reserves the Cycle left + frozen columns.
    const left = bounds.left + (rulerViewportElement.contains(target) ? 0 : getTimelineOffset());
    if (event.clientX < left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return false;
    // Cycle ownership is scoped to the Cycle renderer or its ruler. Transaction
    // lanes are siblings in the viewport and must never be filtered by a growing
    // list of Transaction selectors merely to keep this owner from handling them.
    return rendererHost.contains(target) || rulerViewportElement.contains(target);
  };
  const selectedClockEdgeAtPointer = (event: MouseEvent) => {
    const waveLayer = rendererHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
    if (!waveLayer) return undefined;
    const bounds = waveLayer.getBoundingClientRect();
    const zoom = timelineNavigation.getZoom();
    const local = timelineGeometry.screenToLocal({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, zoom);
    const snap = timelineGeometry.currentSnapIndex().nearest({ x: local.x, y: event.clientY - bounds.top }, 14 / zoom, ["clock-edge"]);
    const point = snap?.anchor.point;
    if (!snap || !snap.anchor.signalId || (point !== "rising-edge" && point !== "falling-edge")) return undefined;
    return { signalId: snap.anchor.signalId, cycle: snap.anchor.cycle, kind: point === "rising-edge" ? "rising" : "falling" };
  };
  let rangeInteractions!: TimelineRangeInteractionOwner;
  const onRulerSelect = (event: MouseEvent) => {
    if (rangeInteractions.consumeRulerClickSuppression()) return;
    // #738: the whole ruler cell is the hit target; the label glyph never owns the interaction.
    const tick = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cycle]") : null;
    const cycle = rulerCellAtX(event.clientX) ?? (tick ? Number(tick.dataset.sourceCycle ?? tick.dataset.cycle) : undefined);
    if (cycle === undefined || !Number.isInteger(cycle) || cycle > getSnapshot().document.timeline.cycleCount) return;
    selectedEdgeRef.current = undefined;
    setRangeSelectionActive(true);
    setSelectedCycle(cycle);
    rendererHost.dataset.selectedCycle = String(cycle);
    if (cycle === getSnapshot().document.timeline.cycleCount) {
      setRange({ start: Math.max(0, cycle - 1), end: cycle });
      return;
    }
    if (event.shiftKey) {
      const anchor = timelineRangeRef.current.start;
      setRange({ start: Math.min(anchor, cycle), end: Math.max(anchor, cycle) + 1 });
    } else setRange({ start: cycle, end: cycle + 1 });
    timelineRuntime.refreshOverlays();
  };
  const onRulerContextMenu = (event: MouseEvent) => {
    if (!isTimeDomainPointerTarget(event)) return;
    const cycle = cycleBoundaryAtX(event.clientX);
    if (cycle === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    menuOriginRef.current = event.target instanceof HTMLElement ? event.target : rulerElement;
    setContextMenu({ x: event.clientX, y: event.clientY, target: "ruler", cycle });
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
  const lowerCanvasClick = (event: MouseEvent, targetHost: HTMLElement, targetViewport: HTMLElement) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const bounds = targetViewport.getBoundingClientRect();
    if (!target || target.closest(timeDomainExclusions) || event.clientX < bounds.left + getTimelineOffset() || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    const waveLayer = targetHost.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
    if (!waveLayer) return;
    const cycle = timelineGeometry.cycleBoundaryAtScreenX(event.clientX, waveLayer.getBoundingClientRect().left, timelineNavigation.getZoom(), snapEnabledRef.current);
    if (cycle === undefined || !applyCanvasCycleSelection(cycle, event.shiftKey)) return;
    selectedEdgeRef.current = undefined;
    targetHost.dataset.selectedCycle = String(cycle);
    timelineRuntime.refreshOverlays();
  };
  lowerCanvasClickRef.current = lowerCanvasClick;

  rangeInteractions = new TimelineRangeInteractionOwner({
    rendererHost,
    isTimeDomainPointerTarget,
    cycleBoundaryAtX,
    rulerCellAtX,
    getCycleCount: () => getSnapshot().document.timeline.cycleCount,
    getRange: () => timelineRangeRef.current,
    getSelectedCycle: () => selectedCycleRef.current,
    setSelectedCyclePreview: (cycle) => { selectedCycleRef.current = cycle; },
    setRangeSelectionActive,
    setRange,
    setSelectedCycle,
    applyCanvasCycleSelection,
    refreshRange: refreshRangePreview,
    refreshPlayhead: () => timelineRuntime.refreshPlayhead(),
  });
  const treeDrag = new TreeDragInteractionOwner({ rendererHost, getDocument: () => getSnapshot().document, execute });
  const annotationInteraction = new AnnotationInteractionOwner({
    rendererHost, renderer, timelineGeometry, documentEpoch, getZoom: timelineNavigation.getZoom,
    getDocument: () => getSnapshot().document, getProjection, isSnapEnabled: () => snapEnabledRef.current,
    execute, executeBatch,
    getDragTargets: (annotationId) => {
      const document = getSnapshot().document;
      const group = (document.annotationGroups ?? []).find((candidate) => candidate.annotationIds.includes(annotationId as AnnotationId));
      if (group) return new Set(group.annotationIds);
      const multi = selection.refs.annotationIds.current;
      if (multi.size > 1 && multi.has(annotationId as AnnotationId)) return new Set(multi);
      return new Set([annotationId]);
    },
    publishState,
  });
  const onGlobalKeyDown = (event: KeyboardEvent) => {
    const handled = routeGlobalShortcut(event, {
      isGestureActive: () => annotationInteraction.active,
      execute: (name) => commandRegistry.current.execute(name),
      cancel: () => {
        closeContextMenu();
        cancelActiveGesture();
        annotationInteraction.cancel();
        clearPendingArrow();
        setArrowPickStatus("idle");
        delete rendererHost.dataset.arrowPick;
      },
    });
    if (!handled) annotationInteraction.nudge(event);
  };
  const onContextMenu = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-row-id], [data-annotation-id], [data-role='tree-more'], [data-role='tree-group-more']")) return;
    event.preventDefault();
    const target = event.target.closest<HTMLElement>("[data-row-id], [data-annotation-id], [data-role='tree-more'], [data-role='tree-group-more']");
    menuOriginRef.current = target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const rowId = target?.dataset.rowId;
    const annotationId = target?.dataset.annotationId;
    const alreadySelected = (rowId !== undefined && selection.refs.signalIds.current.has(rowId as SignalId)) || (annotationId !== undefined && selection.refs.annotationIds.current.has(annotationId as AnnotationId));
    if (!alreadySelected) onSelect(event);
    setContextMenu({ x: event.clientX, y: event.clientY, target: target?.dataset.annotationId ? "annotation" : target?.closest("[data-role='tree-group-more']") ? "group" : "signal" });
  };
  const onCanvasClick = (event: MouseEvent) => {
    if (suppressCanvasClickRef.current) { suppressCanvasClickRef.current = false; return; }
    if (rangeInteractions.consumeCanvasClickSuppression()) return;
    const target = event.target instanceof Element ? event.target : undefined;
    if (target?.closest("[data-role='tree-visibility'], [data-role='tree-more'], [data-role='tree-collapse'], [data-role='tree-group-more'], [data-row-id], [data-annotation-id]")) { onSelect(event); return; }
    if (getPendingArrow() || rendererHost.dataset.arrowPick) onSelect(event); else if (!selectCanvasCycle(event)) onSelect(event);
  };
  const onViewportClick = (event: MouseEvent) => {
    if (suppressCanvasClickRef.current) { suppressCanvasClickRef.current = false; return; }
    const target = event.target instanceof Element ? event.target : undefined;
    if (target && (rendererHost.contains(target) || target.closest("[data-testid='cycle-ruler']"))) return;
    if (rangeInteractions.consumeCanvasClickSuppression()) return;
    if (rendererHost.dataset.arrowPick) onSelect(event); else selectCanvasCycle(event);
  };
  const detach = attachEditorEventBindings([
    ...(() => { const tree = rendererHost.querySelector<HTMLElement>("[data-role='left-tree-rows']"); return tree ? [{ target: tree, type: "keydown", listener: onTreeKeyDown as EventListener }] : []; })(),
    { target: viewportElement, type: "scroll", listener: onScroll as EventListener, options: { passive: true } },
    { target: viewportElement, type: "keydown", listener: onViewportKeyDown as EventListener },
    { target: rendererHost, type: "click", listener: onCanvasClick as EventListener },
    { target: rendererHost, type: "pointerdown", listener: rangeInteractions.pointerDown as EventListener },
    { target: rendererHost, type: "pointermove", listener: rangeInteractions.pointerMove as EventListener },
    { target: rendererHost, type: "pointerup", listener: rangeInteractions.pointerUp as EventListener },
    { target: rendererHost, type: "pointercancel", listener: rangeInteractions.pointerCancel as EventListener },
    { target: rendererHost.ownerDocument, type: "keydown", listener: rangeInteractions.keyDown as EventListener },
    { target: rendererHost, type: "dragstart", listener: treeDrag.onDragStart as EventListener },
    { target: rendererHost, type: "dragover", listener: treeDrag.onDragOver as EventListener },
    { target: rendererHost, type: "drop", listener: treeDrag.onDrop as EventListener },
    { target: rendererHost, type: "dragend", listener: treeDrag.onDragEnd as EventListener },
    { target: viewportElement, type: "click", listener: onViewportClick as EventListener },
    { target: viewportElement, type: "pointerdown", listener: rangeInteractions.pointerDown as EventListener },
    { target: viewportElement, type: "pointermove", listener: rangeInteractions.pointerMove as EventListener },
    { target: viewportElement, type: "pointerup", listener: rangeInteractions.pointerUp as EventListener },
    { target: viewportElement, type: "pointercancel", listener: rangeInteractions.pointerCancel as EventListener },
    { target: rulerViewportElement, type: "click", listener: onRulerSelect as EventListener },
    { target: rulerViewportElement, type: "contextmenu", listener: onRulerContextMenu as EventListener },
    { target: rulerViewportElement, type: "pointerdown", listener: rangeInteractions.pointerDown as EventListener },
    { target: rulerViewportElement, type: "pointermove", listener: rangeInteractions.pointerMove as EventListener },
    { target: rulerViewportElement, type: "pointerup", listener: rangeInteractions.pointerUp as EventListener },
    { target: rulerViewportElement, type: "pointercancel", listener: rangeInteractions.pointerCancel as EventListener },
    { target: rendererHost, type: "pointerdown", listener: annotationInteraction.onPointerDown as EventListener },
    { target: rendererHost, type: "pointermove", listener: annotationInteraction.onPointerMove as EventListener },
    { target: rendererHost, type: "pointerup", listener: annotationInteraction.onPointerUp as EventListener },
    { target: rendererHost, type: "pointercancel", listener: annotationInteraction.cancel as EventListener },
    { target: rendererHost, type: "contextmenu", listener: onContextMenu as EventListener },
    { target: rendererHost.ownerDocument, type: "keydown", listener: onGlobalKeyDown as EventListener },
  ]);
  return {
    cancel: () => { rangeInteractions.cancel(); treeDrag.cancel(); annotationInteraction.cancel(); },
    detach: () => { detach(); lowerCanvasClickRef.current = () => undefined; rangeInteractions.cancel(); treeDrag.cancel(); annotationInteraction.cancel(); },
    consumeRulerClickSuppression: () => rangeInteractions.consumeRulerClickSuppression(),
  };
}
