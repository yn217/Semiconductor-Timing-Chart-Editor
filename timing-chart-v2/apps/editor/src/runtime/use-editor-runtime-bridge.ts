import type { RefObject } from "react";
import type { ChangeSet } from "@timing-chart-v2/commands";
import { EditorApplicationRuntime } from "./editor-application-runtime.js";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import type { TimingChartRenderer } from "@timing-chart-v2/renderer";
import { projectAnnotationOverlays } from "./annotation-overlays.js";
import { projectEdgeCounters, type EdgeCounterProjectionMetrics, type SelectedClockEdge } from "./edge-counter-projection.js";
import { resolveTimeAxisGeometry, type ImmutableSnapIndex, type LocalGeometryMap, type ScreenGeometryProjector, type SemanticSnapCandidateService, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { DisplayTimeMappingCache, type DisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
import type { ProjectionCoordinator } from "./projection-coordinator.js";

function nextBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else globalThis.setTimeout(resolve, 0);
  });
}
import { clampTimelineZoom, createTimelineViewportRuntime, type TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { syncRulerScroll } from "./timeline-presentation-refresh.js";

export { applyRendererHostSizing, refreshRulerRangeSelection, refreshTransactionLinkedRows, attachDirtyUnloadGuard, attachDialogOriginCapture, scheduleDialogFocusRestore, trapDialogTab, type RendererHostSizingContext } from "./editor-dom-bridge.js";
export { mountInitialTimelineProjection, projectViewportWindow } from "./viewport-projection.js";
export { createWaveformSurfaceProvider, type WaveformProviderContext } from "./waveform-surface-provider.js";
export { refreshGridPresentation, refreshPlayheadPresentation, refreshRangeBandPresentation, refreshTimelinePresentation, rebuildRulerPresentation, syncFrozenColumnScroll, syncPresentationScale, syncRulerScroll } from "./timeline-presentation-refresh.js";
export { publishRendererState } from "./runtime-diagnostics.js";

export { refreshGroupStylePreview, refreshAnnotationPreview, refreshClockPreview } from "./presentation-preview.js";

export function createEditorRuntimeBridge(initialDocument: Readonly<CanonicalDocument>): EditorApplicationRuntime {
  return new EditorApplicationRuntime(initialDocument);
}

export type SnapIndexResolver = (() => ImmutableSnapIndex) & { invalidate: () => void };

export function createSnapIndexResolver(context: {
  readonly getDocument: () => CanonicalDocument;
  readonly getProjection: () => RenderProjection;
  readonly geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>;
  readonly mappingCache: Pick<DisplayTimeMappingCache, "get">;
  readonly snapService: SemanticSnapCandidateService;
  readonly screenGeometry: ScreenGeometryProjector;
  readonly build: (document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, snapService: SemanticSnapCandidateService, screenGeometry: ScreenGeometryProjector) => ImmutableSnapIndex;
  readonly onBuilt: () => void;
}): SnapIndexResolver {
  let index: ImmutableSnapIndex | undefined;
  const resolver = (() => {
    if (!index) {
      const document = context.getDocument();
      index = context.build(document, context.getProjection(), context.geometryMaps, context.mappingCache.get(document.timeline, document.timeGroups), context.snapService, context.screenGeometry);
      context.onBuilt();
    }
    return index;
  }) as SnapIndexResolver;
  resolver.invalidate = () => { index = undefined; };
  return resolver;
}

export function deriveRenderInvalidation(changeSet: ChangeSet, referenceSignalId: SignalId | undefined): Readonly<{ snapDependenciesChanged: boolean; referenceWaveChanged: boolean; refreshRuler: boolean; refreshGrid: boolean; refreshOverlays: boolean }> {
  const full = changeSet.fullDocumentReplace === true;
  const snapDependenciesChanged = full || changeSet.rowOrder !== undefined || changeSet.addedSignals !== undefined || changeSet.removedSignals !== undefined || changeSet.addedGroups !== undefined || changeSet.removedGroups !== undefined || changeSet.waveSemantics !== undefined || changeSet.geometryLocal !== undefined || changeSet.geometryScreenX === true || changeSet.geometryScreenY !== undefined || changeSet.annotationPosition !== undefined || changeSet.annotationStyle !== undefined || changeSet.bookmarkPosition !== undefined || changeSet.timeGroupSemantics !== undefined || changeSet.timelineSemantics === true;
  const referenceWaveChanged = referenceSignalId !== undefined && (full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || changeSet.waveSemantics?.includes(referenceSignalId) === true || changeSet.geometryLocal?.includes(referenceSignalId) === true);
  const refreshRuler = full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || changeSet.bookmarkPosition !== undefined || referenceWaveChanged;
  const refreshGrid = full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || referenceWaveChanged;
  const refreshOverlays = refreshRuler || changeSet.rowOrder !== undefined || changeSet.geometryScreenY !== undefined || changeSet.edgeCounter !== undefined || (changeSet.annotationPosition?.length ?? 0) > 0 || (changeSet.annotationStyle?.length ?? 0) > 0 || (changeSet.annotationOrder?.length ?? 0) > 0 || (changeSet.annotationGroups?.length ?? 0) > 0 || (changeSet.addedSignals?.length ?? 0) > 0 || (changeSet.removedSignals?.length ?? 0) > 0;
  return { snapDependenciesChanged, referenceWaveChanged, refreshRuler, refreshGrid, refreshOverlays };
}

export function createTimelineZoomController(context: {
  readonly rendererHost: HTMLElement;
  readonly timingSurface: HTMLElement;
  readonly viewport: HTMLElement;
  readonly ruler: HTMLElement;
  readonly scalable: readonly HTMLElement[];
  readonly leftPaneWidth: number;
  readonly frozenPaneWidth: number;
  readonly inspectorWidth: number;
  readonly viewportWidth: number;
  readonly timelineOffset: number;
  readonly onPresentationScale: (zoom: number) => void;
  readonly onSyncFrozenColumns: () => void;
  readonly onZoom: (zoom: number) => void;
}): (next: number) => number {
  return (next) => applyTimelineZoom(next, context);
}

export function createTimelineNavigationController(context: {
  readonly runtime: { sourceBoundaryToLocalX: (document: CanonicalDocument, cycle: number) => number | undefined; fitSelection: (start: number, end: number) => void; fitAll: (end: number) => void; navigateToCycle: (cycle: number) => void };
  readonly getDocument: () => CanonicalDocument;
  readonly getRange: () => { readonly start: number; readonly end: number };
  readonly setSelectedCycle: (cycle: number) => void;
  readonly setRange: (range: { readonly start: number; readonly end: number }) => void;
  readonly host: HTMLElement;
  readonly publishState: () => void;
}): Readonly<{ fitSelection: () => void; fitAll: () => void; navigateToCycle: (cycle: number) => void }> {
  return {
    fitSelection() {
      const document = context.getDocument();
      const range = context.getRange();
      const start = context.runtime.sourceBoundaryToLocalX(document, range.start);
      const end = context.runtime.sourceBoundaryToLocalX(document, range.end);
      if (start === undefined || end === undefined || end <= start) {
        context.host.dataset.timelineNavigationDiagnostic = "fit-selection-geometry-unavailable";
        return;
      }
      delete context.host.dataset.timelineNavigationDiagnostic;
      context.runtime.fitSelection(start, end);
    },
    fitAll() {
      const document = context.getDocument();
      const start = context.runtime.sourceBoundaryToLocalX(document, 0);
      const end = context.runtime.sourceBoundaryToLocalX(document, document.timeline.cycleCount);
      if (start === undefined || end === undefined || end <= start) {
        context.host.dataset.timelineNavigationDiagnostic = "fit-all-geometry-unavailable";
        return;
      }
      delete context.host.dataset.timelineNavigationDiagnostic;
      context.runtime.fitAll(end);
    },
    navigateToCycle(cycle) {
      const document = context.getDocument();
      if (!Number.isInteger(cycle) || cycle < 0 || cycle > document.timeline.cycleCount) return;
      if (context.runtime.sourceBoundaryToLocalX(document, cycle) === undefined) return;
      context.setSelectedCycle(cycle);
      context.host.dataset.selectedCycle = String(cycle);
      context.setRange(cycle === document.timeline.cycleCount ? { start: Math.max(0, cycle - 1), end: cycle } : { start: cycle, end: cycle + 1 });
      context.runtime.navigateToCycle(cycle);
      context.publishState();
    },
  };
}

export function resolveTransactionSnapCycle(context: {
  readonly clientX: number;
  readonly host: HTMLElement;
  readonly projection: RenderProjection;
  readonly timeAxis: TimeAxisGeometry;
  readonly screenGeometry: ScreenGeometryProjector;
  readonly zoom: number;
  readonly snapEnabled: boolean;
  readonly document: CanonicalDocument;
  readonly currentSnapIndex: () => ImmutableSnapIndex;
  readonly cycleBoundaryAtPointerX: (clientX: number) => number | undefined;
  readonly cycleBoundaryAtX: (clientX: number) => number | undefined;
  readonly publishState: () => void;
}): number | undefined {
  const waveLayer = context.host.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
  const axisOwner = context.timeAxis.ownerSignalId;
  const axisRow = axisOwner === undefined ? undefined : context.projection.rowLayout.find((row) => row.rowId === axisOwner);
  if (!waveLayer || !axisOwner || !axisRow) return context.cycleBoundaryAtPointerX(context.clientX);
  context.host.dataset.transactionSnapAxisRowId = axisRow.rowId;
  const bounds = waveLayer.getBoundingClientRect();
  if (!context.snapEnabled) return context.cycleBoundaryAtX(context.clientX);
  const localPointer = context.screenGeometry.fromScreen({ x: context.clientX - bounds.left, y: 0 }, { scrollX: 0, scrollY: 0, zoom: context.zoom });
  const snap = context.currentSnapIndex().nearest({ x: localPointer.x, y: axisRow.y + context.document.layout.rowHeight / 2 }, 14 / context.zoom, ["cycle-boundary", "clock-edge", "signal-transition", "bus-transition", "marker", "annotation"]);
  context.publishState();
  // A pointer dragged past the first/last cycle boundary falls outside the
  // fixed snap-candidate radius above; fall back to the terminal-tolerant
  // cycle-boundary resolver so a Transaction edge/move drag clamps at the
  // timeline's terminal boundary instead of silently no-opping.
  return snap?.anchor.cycle ?? context.cycleBoundaryAtPointerX(context.clientX);
}

export function scheduleInitialTimelineRefresh(renderer: { whenIdle: () => Promise<unknown> }, host: HTMLElement, refresh: { readonly ruler: () => void; readonly range: () => void; readonly playhead: () => void; readonly grid: () => void; readonly zoom: () => void; readonly overlays: () => void; readonly collectErrors: () => void; readonly publish: () => void; }, lifecycle: { readonly isCurrent: () => boolean } = { isCurrent: () => true }): void {
  void renderer.whenIdle().then(() => {
    // The initial mount promise can settle after Open/New has replaced the
    // document. It must not publish initial-document presentation or mark the
    // replacement idle; the replacement owns its own epoch and idle lifecycle.
    if (!host.isConnected || !lifecycle.isCurrent()) return;
    // The first ruler pass writes the shared wave-width CSS variable. Give
    // the browser a frame to commit that width before taking the authoritative
    // reference-SVG screen-scale sample used by the settling pass below.
    return nextBrowserFrame().then(() => {
      if (!host.isConnected || !lifecycle.isCurrent()) return;
      refresh.ruler();
      return nextBrowserFrame();
    }).then(() => {
      if (!host.isConnected || !lifecycle.isCurrent()) return;
      refresh.ruler();
      refresh.range();
      refresh.playhead();
      refresh.grid();
      refresh.zoom();
      refresh.overlays();
      refresh.collectErrors();
      refresh.publish();
      host.dataset.editorIdle = "true";
      host.dataset.cycleViewReady = "true";
    });
  });
}

export { collectWaveRenderErrors } from "./runtime-diagnostics.js";
export function createEditorTimelineRuntime(context: Parameters<typeof createTimelineViewportRuntime>[0]): TimelineViewportRuntime {
  return createTimelineViewportRuntime(context);
}

export { createOpenPhaseTracker, type OpenPhaseTracker } from "./runtime-diagnostics.js";
export function refreshRendererEdgeCounters(renderer: Pick<TimingChartRenderer, "updateEdgeCounters">, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, range: { readonly start: number; readonly end: number }, selectedCycle: number, screenGeometryScale: number, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): void { renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, range, selectedCycle, screenGeometryScale, selectedEdge, metrics)); }

export function refreshRendererOverlays(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters">, host: RefObject<HTMLDivElement | null>, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, screenGeometryScale: number, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): void { renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps, mappingCache.get(document.timeline, document.timeGroups), screenGeometryScale)); refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, range, selectedCycle, screenGeometryScale, selectedEdge, metrics); for (const owner of host.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationId); }

export function refreshRendererForReason(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters">, host: RefObject<HTMLDivElement | null>, reason: string, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, screenGeometryScale: number, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): void { if (reason === "range") refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, range, selectedCycle, screenGeometryScale, selectedEdge, metrics); else refreshRendererOverlays(renderer, host, document, projection, geometryMaps, mappingCache, screenGeometryScale, range, selectedCycle, selectedAnnotationId, selectedEdge, metrics); }

export type EditorEventBinding = {
  readonly target: EventTarget;
  readonly type: string;
  readonly listener: EventListener;
  readonly options?: boolean | AddEventListenerOptions;
};

export function attachEditorEventBindings(bindings: readonly EditorEventBinding[]): () => void {
  for (const binding of bindings) binding.target.addEventListener(binding.type, binding.listener, binding.options);
  return () => {
    for (const binding of [...bindings].reverse()) binding.target.removeEventListener(binding.type, binding.listener, binding.options);
  };
}

export type TimelineZoomSurfaceContext = {
  readonly rendererHost: HTMLElement;
  /** Stable renderer-owned surface; avoids a DOM lookup on each view-only Zoom. */
  readonly timingSurface: HTMLElement;
  readonly viewport: HTMLElement;
  readonly ruler: HTMLElement;
  readonly scalable: readonly HTMLElement[];
  readonly leftPaneWidth: number;
  readonly frozenPaneWidth: number;
  readonly inspectorWidth: number;
  readonly viewportWidth: number;
  readonly timelineOffset: number;
  readonly onPresentationScale: (zoom: number) => void;
  readonly onSyncFrozenColumns: () => void;
  readonly onZoom: (zoom: number) => void;
};

export function applyTimelineZoom(next: number, context: TimelineZoomSurfaceContext): number {
  const zoom = clampTimelineZoom(next);
  const baseWidth = Math.max(160, context.viewportWidth - context.leftPaneWidth - context.inspectorWidth - context.frozenPaneWidth);
  const width = context.timelineOffset + baseWidth * zoom;
  const applyPresentation = () => {
    if (context.rendererHost.isConnected === false) return;
    for (const element of context.scalable) {
      if (element.style.transformOrigin !== "0px 0px" && element.style.transformOrigin !== "0 0") element.style.transformOrigin = "0 0";
      element.style.scale = `${zoom} 1`;
    }
    if (context.ruler.style.transformOrigin !== "0px 0px" && context.ruler.style.transformOrigin !== "0 0") context.ruler.style.transformOrigin = "0 0";
    syncRulerScroll(context.ruler, context.viewport, zoom);
    context.viewport.style.setProperty("--zoom-x", String(zoom));
    context.onPresentationScale(zoom);
    context.rendererHost.style.width = `${width}px`;
    context.timingSurface.style.setProperty("width", `${width}px`);
    context.onSyncFrozenColumns();
  };
  // Scale and width writes can invalidate the whole scroll-layout tree. Keep
  // the controller's value synchronous for input/geometry consumers, but
  // publish the DOM presentation in the next frame so the input frame remains
  // responsive. The synchronous fallback keeps this helper deterministic in
  // non-browser callers and focused unit tests.
  if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(applyPresentation);
  else applyPresentation();
  context.rendererHost.dataset.zoom = String(zoom);
  context.onZoom(zoom);
  return zoom;
}

export function attachMenuKeyboardNavigation(doc: Document, closeContextMenu: () => void, closeTreeAddMenu: () => void, closeTreeMoreMenu: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : undefined; const activeMenu = target?.closest<HTMLElement>("[role='menu']"); if (!activeMenu) return; if (event.key === "Escape") { event.preventDefault(); if (activeMenu.classList.contains("context-menu")) closeContextMenu(); else if (activeMenu.classList.contains("tree-add-menu")) closeTreeAddMenu(); else closeTreeMoreMenu(); return; } if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; const items = [...activeMenu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; if (items.length === 0) return; event.preventDefault(); const current = items.indexOf(doc.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next]?.focus(); };
  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}
