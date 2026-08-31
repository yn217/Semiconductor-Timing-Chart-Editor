import type { RefObject } from "react";
import { EditorApplicationRuntime } from "./editor-application-runtime.js";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { projectAnnotationOverlays } from "./annotation-overlays.js";
import { projectEdgeCounters } from "./edge-counter-projection.js";
import { resolveTimeAxisGeometry } from "@timing-chart-v2/geometry";
import { renderGeometryGrid } from "../render-geometry-grid.js";
import { buildRuler } from "./build-ruler.js";
import { referenceSvgScreenScale } from "./screen-scale.js";
import { buildViewportWindow } from "./viewport-window.js";

export type RendererHostSizingContext = { readonly host: RefObject<HTMLDivElement | null>; readonly viewport: RefObject<HTMLDivElement | null>; readonly metrics: { readonly viewportWidth: number; readonly leftPaneWidth: number; readonly inspectorWidth: number; readonly frozenPaneWidth: number; readonly zoom: number } };
export function applyRendererHostSizing({ host, viewport, metrics }: RendererHostSizingContext): void { const rendererHost = host.current; const viewportElement = viewport.current; if (!rendererHost || !viewportElement) return; const availableWidth = metrics.viewportWidth > 0 ? metrics.viewportWidth : globalThis.innerWidth; const baseWidth = Math.max(160, availableWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth); const width = metrics.leftPaneWidth + metrics.frozenPaneWidth + baseWidth * metrics.zoom; rendererHost.style.width = `${width}px`; const timingSurface = rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']"); timingSurface?.style.setProperty("width", `${width}px`); timingSurface?.style.setProperty("grid-template-columns", `${metrics.leftPaneWidth}px ${metrics.frozenPaneWidth}px var(--wave-width, 640px)`); rendererHost.querySelector<HTMLElement>("[data-role='frozen-label-rows']")?.style.setProperty("left", `${metrics.leftPaneWidth}px`, "important"); }

export function refreshRulerRangeSelection(ruler: RefObject<HTMLDivElement | null>, active: boolean, range: { readonly start: number; readonly end: number }): void {
  const rulerElement = ruler.current;
  if (!rulerElement) return;
  for (const tick of rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")) {
    if (!active) delete tick.dataset.rangeSelected;
    else { const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle); tick.dataset.rangeSelected = String(cycle >= range.start && cycle < range.end); }
  }
}

export function createEditorRuntimeBridge(initialDocument: Readonly<CanonicalDocument>): EditorApplicationRuntime {
  return new EditorApplicationRuntime(initialDocument);
}

export function projectViewportWindow({
  viewport,
  referenceClock,
  snapshot,
  previous,
  projectionCoordinator,
  collapsedGroupIds,
  onProjection,
}: {
  readonly viewport: HTMLElement;
  readonly referenceClock: any;
  readonly snapshot: any;
  readonly previous: any;
  readonly projectionCoordinator: { project: (input: any) => any };
  readonly collapsedGroupIds: readonly string[];
  readonly onProjection: (projection: any, window: any, mountedSignalsChanged: boolean) => void;
}): void {
  const nextWindow = buildViewportWindow(viewport, referenceClock as any);
  if (nextWindow.viewportStartY === previous.window.viewportStartY && nextWindow.viewportEndY === previous.window.viewportEndY) return;
  const nextProjection = projectionCoordinator.project({ snapshot, changeSet: {}, viewport: nextWindow, previous: previous.projection, collapsedGroupIds });
  const oldMounted = previous.projection.mountedSignalIds;
  const nextMounted = nextProjection.mountedSignalIds;
  const mountedSignalsChanged = oldMounted.length !== nextMounted.length || oldMounted.some((signalId: string, index: number) => signalId !== nextMounted[index]);
  onProjection(nextProjection, nextWindow, mountedSignalsChanged);
}

export function refreshTimelinePresentation(context: {
  readonly reason: string;
  readonly document: CanonicalDocument;
  readonly ruler: HTMLElement;
  readonly grid: HTMLElement;
  readonly viewport: HTMLElement;
  readonly host: HTMLElement;
  readonly rulerViewport: HTMLElement;
  readonly geometryMaps: any;
  readonly geometrySvgs: any;
  readonly mappingCache: any;
  readonly metricsOwner: any;
  readonly currentZoom: number;
  readonly previousScale: number;
  readonly rulerInitialized: boolean;
  readonly timeAxis: any;
  readonly totalHeight: number;
  readonly gridEnabled: boolean;
  readonly markOpenPhase: (phase: string) => void;
  readonly onPlayhead: () => void;
  readonly onRange: () => void;
  readonly onResize: () => void;
}): { readonly timeAxis: any; readonly screenGeometryScale: number; readonly rulerInitialized: boolean } {
  let timeAxis = context.timeAxis;
  let screenGeometryScale = context.previousScale;
  let rulerInitialized = context.rulerInitialized;
  if (context.reason === "ruler") {
    context.metricsOwner.update({ viewportWidth: context.viewport.clientWidth });
    const metrics = context.metricsOwner.snapshot();
    const fitWidth = Math.max(160, globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth);
    const rebuilt = rebuildRulerPresentation(context.ruler, context.document, context.geometryMaps, context.mappingCache, fitWidth, rulerInitialized ? screenGeometryScale : undefined, timeAxis.ownerSignalId ? context.geometrySvgs.get(timeAxis.ownerSignalId) : undefined, metrics.zoom);
    timeAxis = rebuilt.timeAxis;
    screenGeometryScale = rebuilt.scale;
    rulerInitialized = true;
    context.markOpenPhase("ruler-painted");
    syncPresentationScale(context.viewport, context.host, context.rulerViewport, context.currentZoom, screenGeometryScale);
  }
  if (context.reason === "grid") {
    context.metricsOwner.update({ viewportWidth: context.viewport.clientWidth });
    const metrics = context.metricsOwner.snapshot();
    refreshGridPresentation(context.grid, context.document, context.geometryMaps, context.mappingCache, context.gridEnabled, context.totalHeight, globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth, screenGeometryScale);
  }
  if (context.reason === "playhead") context.onPlayhead();
  if (context.reason === "range") context.onRange();
  if (context.reason === "resize") context.onResize();
  return { timeAxis, screenGeometryScale, rulerInitialized };
}

export function deriveRenderInvalidation(changeSet: any, referenceSignalId: string | undefined): Readonly<{ snapDependenciesChanged: boolean; referenceWaveChanged: boolean; refreshRuler: boolean; refreshGrid: boolean; refreshOverlays: boolean }> {
  const full = changeSet.fullDocumentReplace === true;
  const snapDependenciesChanged = full || changeSet.rowOrder !== undefined || changeSet.addedSignals !== undefined || changeSet.removedSignals !== undefined || changeSet.addedGroups !== undefined || changeSet.removedGroups !== undefined || changeSet.waveSemantics !== undefined || changeSet.geometryLocal !== undefined || changeSet.geometryScreenX === true || changeSet.geometryScreenY !== undefined || changeSet.annotationPosition !== undefined || changeSet.annotationStyle !== undefined || changeSet.bookmarkPosition !== undefined || changeSet.timeGroupSemantics !== undefined || changeSet.timelineSemantics === true;
  const referenceWaveChanged = referenceSignalId !== undefined && (full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || changeSet.waveSemantics?.includes(referenceSignalId) === true || changeSet.geometryLocal?.includes(referenceSignalId) === true);
  const refreshRuler = full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || changeSet.bookmarkPosition !== undefined || referenceWaveChanged;
  const refreshGrid = full || changeSet.timelineSemantics === true || changeSet.timeGroupSemantics !== undefined || referenceWaveChanged;
  const refreshOverlays = refreshRuler || changeSet.rowOrder !== undefined || changeSet.geometryScreenY !== undefined || changeSet.edgeCounter !== undefined || (changeSet.annotationPosition?.length ?? 0) > 0 || (changeSet.annotationStyle?.length ?? 0) > 0 || (changeSet.addedSignals?.length ?? 0) > 0 || (changeSet.removedSignals?.length ?? 0) > 0;
  return { snapDependenciesChanged, referenceWaveChanged, refreshRuler, refreshGrid, refreshOverlays };
}

export type WaveformProviderContext = Readonly<{
  sessionController: { snapshot: () => { readonly document: CanonicalDocument; readonly revision: number } };
  mappingCache: { get: (timeline: CanonicalDocument["timeline"], timeGroups: CanonicalDocument["timeGroups"]) => any; remapValueChanges: (values: any, mapping: any) => any };
  adapter: any;
  geometryRegistry: { readonly maps: Map<string, any>; readonly svgs: Map<string, SVGSVGElement>; remove: (id: any) => void };
  markOpenPhase: (phase: string, phaseTimestamp?: number) => void;
  invalidateSnapIndex: () => void;
}>;

export function createWaveformSurfaceProvider(context: WaveformProviderContext): WaveformSurfaceProvider {
  let signalIndexDocument: CanonicalDocument | undefined;
  let signalIndexRevision = -1;
  let signalById = new Map<string, CanonicalDocument["signals"][number]>();
  return {
    async mountWaveBatch(requests) {
      const currentSnapshot = context.sessionController.snapshot();
      const document = currentSnapshot.document;
      const mapping = context.mappingCache.get(document.timeline, document.timeGroups);
      if (signalIndexDocument !== document || signalIndexRevision !== currentSnapshot.revision) {
        signalById = new Map(document.signals.map((signal) => [signal.id, signal]));
        signalIndexDocument = document;
        signalIndexRevision = currentSnapshot.revision;
      }
      const prepared = requests.map((request) => {
        const signal = signalById.get(request.signalId);
        if (!signal) return { request, waveJson: undefined, error: new Error(`Signal '${request.signalId}' is missing.`) };
        const displaySignal = signal.type === "commentRow" ? signal : signal.type === "clock"
          ? { ...signal, ...(signal.enable ? { enable: context.mappingCache.remapValueChanges(signal.enable, mapping) } : {}) }
          : { ...signal, values: context.mappingCache.remapValueChanges(signal.values, mapping) };
        return { request, waveJson: context.adapter.toWaveJson({ signal: displaySignal, cycleCount: mapping.displayCycleCount }), error: undefined };
      });
      const renderResults = await Promise.all(prepared.map(async (item) => {
        if (item.error || !item.waveJson) return { ...item, rendered: undefined };
        try { return { ...item, rendered: await context.adapter.renderWave(item.request.signalId, item.waveJson, item.request.owner) }; }
        catch (error: unknown) { return { ...item, rendered: undefined, error }; }
      }));
      return renderResults.map((item) => {
        if (item.error || !item.rendered) return { signalId: item.request.signalId, error: item.error ?? new Error("Waveform render did not produce an SVG.") };
        try {
          if (item.request.signalId === document.timeline.referenceClock) context.markOpenPhase("reference-clock-painted");
          const geometry = context.adapter.extractLocalGeometry(item.rendered);
          context.geometryRegistry.maps.set(item.request.signalId, geometry);
          context.geometryRegistry.svgs.set(item.request.signalId, item.rendered.svg as SVGSVGElement);
          if (item.request.signalId === document.timeline.referenceClock) context.markOpenPhase("reference-geometry-ready");
          context.markOpenPhase("first-visible-wave-painted");
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, result: { waveDromRenders: 1, localGeometryBuilds: 1 } };
        } catch (error: unknown) {
          context.geometryRegistry.remove(item.request.signalId);
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, error };
        }
      });
    },
    async mountWave(id, owner) {
      const item = (await this.mountWaveBatch?.([{ signalId: id, owner }]))?.[0];
      if (!item?.result) throw item?.error instanceof Error ? item.error : new Error("Waveform batch did not produce a result.");
      return item.result;
    },
    disposeWave(id) { context.adapter.dispose(id); context.geometryRegistry.remove(id); context.invalidateSnapIndex(); },
  };
}

export type OpenPhaseTracker = Readonly<{
  mark: (phase: string, phaseTimestamp?: number) => void;
  begin: (commandStartedAt?: number, fileReadStartedAt?: number) => void;
}>;

/** Owns open/first-paint instrumentation for the editor runtime bridge. */
export function createOpenPhaseTracker(rendererHost: HTMLElement): OpenPhaseTracker {
  const marks: Record<string, number> = {};
  let active = false;
  let rowShellPainted = false;
  let referenceGeometryReady = false;
  let rulerPainted = false;
  const mark = (phase: string, phaseTimestamp = globalThis.performance.now()): void => {
    if (!active || marks[phase] !== undefined) return;
    marks[phase] = phaseTimestamp;
    globalThis.performance.mark(`timing-chart-v2:${phase}`);
    rendererHost.dataset.openPhaseMarks = JSON.stringify(marks);
    const fileReadDurationMs = marks["file-read-start"] !== undefined && marks["file-read-complete"] !== undefined
      ? Math.max(0, marks["file-read-complete"] - marks["file-read-start"]) : undefined;
    rendererHost.dataset.openPhaseDurations = JSON.stringify(fileReadDurationMs === undefined ? {} : { fileReadDurationMs });
    if (phase === "row-shell-painted") rowShellPainted = true;
    if (phase === "reference-geometry-ready") referenceGeometryReady = true;
    if (phase === "ruler-painted") rulerPainted = true;
    if (rowShellPainted && referenceGeometryReady && rulerPainted) mark("first-correct-paint");
  };
  return {
    mark,
    begin(commandStartedAt = globalThis.performance.now(), fileReadStartedAt) {
      active = true;
      rowShellPainted = false;
      referenceGeometryReady = false;
      rulerPainted = false;
      for (const key of Object.keys(marks)) delete marks[key];
      delete rendererHost.dataset.openPhaseMarks;
      delete rendererHost.dataset.openPhaseDurations;
      mark("open-command-start", commandStartedAt);
      mark("open-start", commandStartedAt);
      if (fileReadStartedAt !== undefined) mark("file-read-start", fileReadStartedAt);
    },
  };
}

export function refreshTransactionLinkedRows(host: RefObject<HTMLDivElement | null>, linkedSignalIds: ReadonlySet<string>): void {
  for (const row of host.current?.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]") ?? []) {
    const id = row.dataset.rowId ?? row.dataset.signalId;
    row.dataset.transactionLinked = String(id !== undefined && linkedSignalIds.has(id));
  }
}

export function attachDirtyUnloadGuard(dirty: boolean): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; };
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
}

export function attachDialogOriginCapture(doc: Document, originRef: { current: HTMLElement | null }, labelRef: { current: string | null }, menuOriginRef: { current: HTMLElement | null }): () => void {
  const capture = (event: MouseEvent) => { const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-testid='bulk-register-open'], [data-testid='hierarchy-open']") : null; if (!target) return; labelRef.current = target.dataset.testid === "bulk-register-open" ? "Add signal or group" : "More tree actions"; originRef.current = menuOriginRef.current ?? doc.querySelector<HTMLElement>(`button[aria-label='${labelRef.current}']`) ?? target; };
  doc.addEventListener("click", capture, true);
  return () => doc.removeEventListener("click", capture, true);
}

export function scheduleDialogFocusRestore(doc: Document, originRef: { current: HTMLElement | null }, labelRef: { current: string | null }): () => void {
  const frame = requestAnimationFrame(() => { const label = labelRef.current; const origin = originRef.current?.isConnected ? originRef.current : label === null ? null : label === "Properties" ? [...doc.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === label) ?? null : doc.querySelector<HTMLElement>(`button[aria-label='${label}']`); originRef.current = null; labelRef.current = null; if (origin?.isConnected) origin.focus({ preventScroll: true }); });
  return () => cancelAnimationFrame(frame);
}

export function trapDialogTab(doc: Document, event: KeyboardEvent): boolean {
  const activeDialog = doc.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
  if (!activeDialog || event.key !== "Tab") return false;
  const focusable = [...activeDialog.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")].filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) return true;
  const first = focusable[0]!; const last = focusable.at(-1)!;
  if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus({ preventScroll: true }); }
  else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus({ preventScroll: true }); }
  return true;
}

export function refreshRendererOverlays(renderer: any, host: RefObject<HTMLDivElement | null>, document: CanonicalDocument, projection: any, geometryMaps: any, mappingCache: any, screenGeometryScale: number, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined): void { renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps, mappingCache.get(document.timeline, document.timeGroups), screenGeometryScale)); renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, range, selectedCycle, screenGeometryScale)); for (const owner of host.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationId); }

export function refreshGridPresentation(grid: HTMLElement, document: CanonicalDocument, geometryMaps: any, mappingCache: any, enabled: boolean, totalHeight: number, viewportWidth: number, screenGeometryScale: number): void { const timeAxis = resolveTimeAxisGeometry(document, geometryMaps); renderGeometryGrid(grid, timeAxis.geometry, timeAxis.ownerSignalId, enabled, totalHeight, mappingCache.get(document.timeline, document.timeGroups), Math.max(160, viewportWidth), screenGeometryScale, timeAxis.mode); }

export function rebuildRulerPresentation(ruler: HTMLElement, document: CanonicalDocument, geometryMaps: any, mappingCache: any, fitWidth: number, previousScale: number | undefined, referenceSvg: SVGSVGElement | undefined, zoom: number): { readonly timeAxis: any; readonly scale: number } { const timeAxis = resolveTimeAxisGeometry(document, geometryMaps); const scale = buildRuler(ruler, timeAxis.geometry, document, timeAxis.ownerSignalId, mappingCache.get(document.timeline, document.timeGroups), fitWidth, previousScale, referenceSvgScreenScale(referenceSvg, zoom), timeAxis.mode); return { timeAxis, scale }; }

export function refreshPlayheadPresentation(ruler: HTMLElement, cycle: number, boundaryToLocalX: (cycle: number) => number | undefined): void { const playheadX = boundaryToLocalX(cycle); let playhead = ruler.querySelector<HTMLElement>("[data-role='playhead']"); if (playheadX === undefined) { playhead?.remove(); return; } if (!playhead) { playhead = ruler.ownerDocument.createElement("span"); playhead.dataset.role = "playhead"; playhead.dataset.testid = "playhead"; playhead.setAttribute("aria-label", "Playhead"); ruler.append(playhead); } playhead.dataset.playheadCycle = String(cycle); playhead.style.left = `${playheadX}px`; }

export function refreshRangeBandPresentation(viewport: HTMLElement, ruler: HTMLElement, rendererHost: HTMLElement, active: boolean, preview: string | undefined, range: { readonly start: number; readonly end: number }, boundaryToLocalX: (cycle: number) => number | undefined, zoom: number, timeDomainLeft: number, totalHeight: number): void { const band = viewport.querySelector<HTMLElement>("[data-role='range-selection-band']"); const rulerBand = ruler.querySelector<HTMLElement>("[data-role='range-selection-ruler-band']"); if (!band) return; if (!active && !preview) { band.hidden = true; if (rulerBand) rulerBand.hidden = true; for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) delete tick.dataset.rangeSelected; return; } const [startText, endText] = (preview ?? `${range.start}:${range.end}`).split(":"); const start = Number(startText); const end = Number(endText); const startLocalX = boundaryToLocalX(start); const endLocalX = boundaryToLocalX(end); if (startLocalX === undefined || endLocalX === undefined || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) { band.hidden = true; return; } const startX = startLocalX * zoom; const endX = endLocalX * zoom; if (!Number.isFinite(startX) || !Number.isFinite(endX) || endX <= startX) { band.hidden = true; return; } band.hidden = false; band.dataset.rangeStart = String(start); band.dataset.rangeEnd = String(end); band.dataset.source = "ruler-local-geometry"; band.style.left = `${timeDomainLeft + startX}px`; band.style.width = `${endX - startX}px`; band.style.top = "34px"; band.style.height = `${Math.max(totalHeight, viewport.clientHeight - 34)}px`; band.setAttribute("aria-label", `Selected time range [${start}, ${end})`); if (rulerBand) { rulerBand.hidden = false; rulerBand.dataset.rangeStart = String(start); rulerBand.dataset.rangeEnd = String(end); rulerBand.dataset.source = "ruler-local-geometry"; rulerBand.style.left = `${startLocalX}px`; rulerBand.style.width = `${endLocalX - startLocalX}px`; rulerBand.setAttribute("aria-label", `Selected time range [${start}, ${end})`); } for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) { const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle); tick.dataset.rangeSelected = String(cycle >= start && cycle < end); } void rendererHost; }

export function publishRendererState(host: HTMLElement, session: any, viewMetricsOwner: any, adapter: any, geometryCache: any, projectionCoordinator: any, renderer: any, mappingCache: any, snapService: any, snapIndex: any, rulerBuilds: number, edgeCounterResolvePasses: number, zoom: number): void { host.dataset.canonicalRevision = String(session.getSnapshot().revision); host.dataset.historyDepth = String(session.historyState().undoDepth); const metrics = viewMetricsOwner.snapshot(); host.dataset.viewMetrics = JSON.stringify(metrics); const { renderCallsBySignal: _renderCallsBySignal, ...waveAdapter } = adapter.metrics(); const { last: _lastGeometry, ...geometryExtraction } = adapter.geometryMetrics(); host.dataset.sessionCounters = JSON.stringify({ ...session.metrics(), ...session.historyMetrics(), ...projectionCoordinator.diagnostics(), ...renderer.diagnosticSummary(), rulerBuilds, edgeCounterResolvePasses, ...mappingCache.metrics(), snapIndexBuilds: snapService.metrics().builds, snapCandidateCount: snapService.metrics().candidateCount, snapQueries: snapIndex?.metrics().queries ?? 0, snapCandidatesVisited: snapIndex?.metrics().candidatesVisited ?? 0, viewMetrics: metrics, waveAdapter, geometryExtraction, zoom }); }

export function syncPresentationScale(viewport: HTMLElement, host: HTMLElement, rulerViewport: HTMLElement, zoom: number, screenGeometryScale: number): void { const presentationScale = Math.max(0.0001, zoom * screenGeometryScale); viewport.style.setProperty("--presentation-x-scale", String(presentationScale)); host.style.setProperty("--presentation-x-scale", String(presentationScale)); rulerViewport.style.setProperty("--presentation-x-scale", String(presentationScale)); }
export function syncRulerScroll(ruler: HTMLElement, viewport: HTMLElement, zoom: number): void { ruler.style.transform = `translateX(${-viewport.scrollLeft}px) scaleX(${zoom})`; ruler.dataset.scrollLeft = String(viewport.scrollLeft); }

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
  readonly viewport: HTMLElement;
  readonly ruler: HTMLElement;
  readonly scalable: readonly HTMLElement[];
  readonly leftPaneWidth: number;
  readonly frozenPaneWidth: number;
  readonly inspectorWidth: number;
  readonly viewportWidth: number;
  readonly timelineOffset: number;
  readonly onPresentationScale: (zoom: number) => void;
  readonly onZoom: (zoom: number) => void;
};

export function applyTimelineZoom(next: number, context: TimelineZoomSurfaceContext): number {
  const zoom = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
  for (const element of context.scalable) {
    element.style.transformOrigin = "0 0";
    element.style.scale = `${zoom} 1`;
  }
  context.ruler.style.transformOrigin = "0 0";
  syncRulerScroll(context.ruler, context.viewport, zoom);
  context.viewport.style.setProperty("--zoom-x", String(zoom));
  context.onPresentationScale(zoom);
  const baseWidth = Math.max(160, context.viewportWidth - context.leftPaneWidth - context.inspectorWidth - context.frozenPaneWidth);
  const width = context.timelineOffset + baseWidth * zoom;
  context.rendererHost.style.width = `${width}px`;
  context.rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.style.setProperty("width", `${width}px`);
  context.rendererHost.dataset.zoom = String(zoom);
  context.onZoom(zoom);
  return zoom;
}

export function attachMenuKeyboardNavigation(doc: Document, closeContextMenu: () => void, closeTreeAddMenu: () => void, closeTreeMoreMenu: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => { const target = event.target instanceof HTMLElement ? event.target : undefined; const activeMenu = target?.closest<HTMLElement>("[role='menu']"); if (!activeMenu) return; if (event.key === "Escape") { event.preventDefault(); if (activeMenu.classList.contains("context-menu")) closeContextMenu(); else if (activeMenu.classList.contains("tree-add-menu")) closeTreeAddMenu(); else closeTreeMoreMenu(); return; } if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return; const items = [...activeMenu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]; if (items.length === 0) return; event.preventDefault(); const current = items.indexOf(doc.activeElement as HTMLButtonElement); const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items[next]?.focus(); };
  doc.addEventListener("keydown", onKeyDown);
  return () => doc.removeEventListener("keydown", onKeyDown);
}
