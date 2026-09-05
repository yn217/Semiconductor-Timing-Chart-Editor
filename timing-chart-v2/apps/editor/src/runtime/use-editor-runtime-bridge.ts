import type { RefObject } from "react";
import { EditorApplicationRuntime } from "./editor-application-runtime.js";
import { valueSignalWaveDomain, type AnnotationId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type DocumentProblem, type GroupId, type SignalGroupStyle } from "@timing-chart-v2/schema";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { assertSafeWaveDromSvg, renderWaveJsonMarkup, toWaveJson, WaveDromAdapterError } from "@timing-chart-v2/wavedrom-adapter";
import { projectAnnotationOverlays } from "./annotation-overlays.js";
import { projectEdgeCounters, type SelectedClockEdge } from "./edge-counter-projection.js";
import { resolveTimeAxisGeometry } from "@timing-chart-v2/geometry";
import { renderGeometryGrid } from "../render-geometry-grid.js";
import { buildRuler } from "./build-ruler.js";

function nextBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else globalThis.setTimeout(resolve, 0);
  });
}
import { referenceSvgScreenScale } from "./screen-scale.js";
import { buildViewportWindow } from "./viewport-window.js";
import { createTimelineViewportRuntime, type TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import type { ImmutableSnapIndex } from "@timing-chart-v2/geometry";

export type RendererHostSizingContext = { readonly host: RefObject<HTMLDivElement | null>; readonly viewport: RefObject<HTMLDivElement | null>; readonly metrics: { readonly viewportWidth: number; readonly leftPaneWidth: number; readonly inspectorWidth: number; readonly frozenPaneWidth: number; readonly zoom: number } };
export function applyRendererHostSizing({ host, viewport, metrics }: RendererHostSizingContext): void { const rendererHost = host.current; const viewportElement = viewport.current; if (!rendererHost || !viewportElement) return; const availableWidth = metrics.viewportWidth > 0 ? metrics.viewportWidth : globalThis.innerWidth; // viewportWidth is the cycle viewport; the Inspector is outside it.
  const baseWidth = Math.max(160, availableWidth - metrics.leftPaneWidth - metrics.frozenPaneWidth); const width = metrics.leftPaneWidth + metrics.frozenPaneWidth + baseWidth * metrics.zoom; rendererHost.style.width = `${width}px`; const timingSurface = rendererHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']"); timingSurface?.style.setProperty("width", `${width}px`); timingSurface?.style.setProperty("grid-template-columns", `${metrics.leftPaneWidth}px ${metrics.frozenPaneWidth}px var(--wave-width, 640px)`); rendererHost.querySelector<HTMLElement>("[data-role='frozen-label-rows']")?.style.setProperty("left", `${metrics.leftPaneWidth}px`, "important"); }

function groupStyleAppliesToSurface(style: SignalGroupStyle | undefined, surface: "left" | "frozen" | "timing"): boolean {
  const scope = style?.extend ?? "both";
  return scope === "both" || (scope === "waveform" ? surface === "timing" : surface !== "timing");
}

/** Applies an Inspector-only Group style draft directly to the mounted shells.
 * This is intentionally DOM-only: preview input must not create a Canonical,
 * History, or Dirty transition. The next projection update reasserts the
 * canonical style after Apply, while Cancel passes the canonical style back. */
export function refreshGroupStylePreview(host: HTMLElement, groupId: GroupId, style: SignalGroupStyle | undefined): void {
  const surfaces = [
    ["left", "left-row", "left-group-header"],
    ["frozen", "frozen-row", "frozen-group-header"],
    ["timing", "timing-row", "timing-group-header"],
  ] as const;
  for (const [surface, rowRole, headerRole] of surfaces) {
    const applies = groupStyleAppliesToSurface(style, surface);
    for (const element of host.querySelectorAll<HTMLElement>(`[data-role='${rowRole}'][data-group-id='${CSS.escape(groupId)}'], [data-role='${headerRole}'][data-group-id='${CSS.escape(groupId)}']`)) {
      if (applies && style?.showBackground && style.background) element.style.setProperty("--group-background", style.background);
      else element.style.removeProperty("--group-background");
      if (applies && style?.opacity !== undefined) element.style.opacity = String(style.opacity);
      else element.style.removeProperty("opacity");
      if (applies && style?.border) element.style.setProperty("--group-border", style.border);
      else element.style.removeProperty("--group-border");
      element.dataset.groupStylePreview = style === undefined ? "false" : "true";
    }
  }
}

/** Applies an Annotation editor's draft Label/Color/Opacity directly to the
 * mounted overlay (packages/renderer/src/stable-surface.ts's renderOverlay
 * output -- see its own `[data-role='annotation-label']` text content and
 * `--annotation-color` custom property), the same DOM-only pattern
 * refreshGroupStylePreview above already uses: no Canonical/History/Dirty
 * transition, since nothing here touches Canonical state -- only the
 * already-mounted, stable overlay element's own text/style. The next real
 * projection update (any document/selection change, or Apply) reasserts
 * the canonical presentation; passing `undefined` for a field restores its
 * live canonical value (used on Cancel/selection change). Anchor-derived
 * geometry (position, shape) is unaffected -- this only previews the
 * fields that don't require re-deriving screen geometry from projection/
 * scale/mapping. */
export function refreshAnnotationPreview(host: HTMLElement, annotationId: AnnotationId, draft: { readonly label?: string | undefined; readonly color?: string | undefined; readonly opacity?: number | undefined } | undefined, canonical: { readonly label: string; readonly color: string | undefined; readonly opacity: number | undefined }): void {
  const owner = host.querySelector<HTMLElement>(`[data-role='annotation-owner'][data-annotation-id='${CSS.escape(annotationId)}']`);
  if (!owner) return;
  const label = owner.querySelector<HTMLElement>("[data-role='annotation-label']");
  const nextLabel = draft?.label ?? canonical.label;
  if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
  // aria-label is renderer-owned and its format varies by annotation type
  // (e.g. Measurement includes its threshold percentages) -- this preview
  // must not clobber that with a generic reconstruction. Only override it
  // while actively previewing a different label, caching the exact original
  // string first so reverting (draft undefined) restores it verbatim
  // instead of guessing a replacement format.
  if (draft?.label !== undefined) {
    if (owner.dataset.annotationAriaLabelOriginal === undefined) owner.dataset.annotationAriaLabelOriginal = owner.getAttribute("aria-label") ?? "";
    owner.setAttribute("aria-label", `${owner.dataset.annotationType}: ${nextLabel}`);
  } else if (owner.dataset.annotationAriaLabelOriginal !== undefined) {
    owner.setAttribute("aria-label", owner.dataset.annotationAriaLabelOriginal);
    delete owner.dataset.annotationAriaLabelOriginal;
  }
  const nextColor = draft?.color ?? canonical.color;
  if (nextColor) owner.style.setProperty("--annotation-color", nextColor); else owner.style.removeProperty("--annotation-color");
  const nextOpacity = draft?.opacity ?? canonical.opacity;
  if (nextOpacity !== undefined) owner.style.opacity = String(nextOpacity); else owner.style.removeProperty("opacity");
  owner.dataset.annotationPreview = draft === undefined ? "false" : "true";
}

/**
 * Applies a Clock Generator draft (Start/Period/Duty/Phase/Initial/Polarity/
 * Suppressed periods) as a real transient waveform preview for the selected
 * Clock row -- unlike refreshGroupStylePreview/refreshAnnotationPreview above,
 * a generator draft changes the wave SHAPE (edge positions), not just a CSS
 * property on the existing mounted SVG, so this renders a genuinely separate
 * preview <svg> via the pinned WaveDrom conversion/render pipeline
 * (toWaveJson + renderWaveJsonMarkup, both pure functions -- see
 * packages/wavedrom-adapter) called DIRECTLY, bypassing
 * ProductionWaveDromAdapter entirely. This is deliberate: the adapter's
 * `#active`/`#markupCache` maps are keyed by signalId and own the real
 * canonical mount (renderer.ts:107-146) -- routing a draft through them would
 * either evict or poison the canonical entry. Instead, the canonical SVG
 * (already mounted by the real renderer/adapter pair) is only hidden via
 * `display:none` -- never removed -- and the preview SVG is appended as a
 * sibling, so Canonical/History/Dirty never change and reverting (draft
 * undefined) is an exact, lossless restore of the untouched canonical node. */
export function refreshClockPreview(host: HTMLElement, signal: ClockSignal, draftGenerator: ClockGenerator | undefined, cycleCount: number): void {
  const mount = host.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(signal.id)}']`);
  if (!mount) return;
  const canonicalSvg = mount.querySelector<SVGElement>(":scope > svg:not([data-clock-preview-svg])");
  const existingPreview = mount.querySelector<SVGElement>("[data-clock-preview-svg]");
  const restoreCanonical = () => {
    existingPreview?.remove();
    canonicalSvg?.style.removeProperty("display");
    delete mount.dataset.clockPreview;
  };
  if (draftGenerator === undefined) { restoreCanonical(); return; }
  try {
    const waveJson = toWaveJson({ signal: { ...signal, generator: draftGenerator }, cycleCount });
    // A fixed high render index keeps this preview's generated element ids
    // (WaveDrom's gradient/pattern defs) from colliding with the real
    // adapter's own monotonic per-signal indices, which start at 0.
    const markup = renderWaveJsonMarkup(waveJson, 0xC10CC, []);
    const template = mount.ownerDocument.createElement("template");
    template.innerHTML = markup.trim();
    const svg = template.content.firstElementChild;
    if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg" || svg.localName !== "svg") { restoreCanonical(); return; }
    assertSafeWaveDromSvg(svg);
    svg.setAttribute("data-clock-preview-svg", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    existingPreview?.remove();
    canonicalSvg?.style.setProperty("display", "none");
    mount.appendChild(svg);
    mount.dataset.clockPreview = "true";
  } catch (error) {
    // An in-progress draft can be transiently unrepresentable (e.g. duty not
    // aligned to a half cycle) -- Apply's own command-layer validation
    // (INVALID_CLOCK_GENERATOR) is the real gate, so a draft-conversion
    // rejection here just falls back to showing the canonical waveform
    // rather than surfacing a crash from a best-effort visual preview.
    if (!(error instanceof WaveDromAdapterError)) throw error;
    restoreCanonical();
  }
}

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

export type SnapIndexResolver = (() => ImmutableSnapIndex) & { invalidate: () => void };

export function createSnapIndexResolver(context: {
  readonly getDocument: () => CanonicalDocument;
  readonly getProjection: () => any;
  readonly geometryMaps: any;
  readonly mappingCache: any;
  readonly snapService: any;
  readonly screenGeometry: any;
  readonly build: (document: CanonicalDocument, projection: any, geometryMaps: any, mapping: any, snapService: any, screenGeometry: any) => ImmutableSnapIndex;
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
    const rebuilt = rebuildRulerPresentation(context.ruler, context.document, context.geometryMaps, context.mappingCache, rulerInitialized ? screenGeometryScale : undefined, timeAxis.ownerSignalId ? context.geometrySvgs.get(timeAxis.ownerSignalId) : undefined, metrics.zoom);
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
      const start = context.runtime.sourceBoundaryToLocalX(document, range.start) ?? 0;
      const end = context.runtime.sourceBoundaryToLocalX(document, range.end) ?? start + 1;
      context.runtime.fitSelection(start, end);
    },
    fitAll() {
      const document = context.getDocument();
      const start = context.runtime.sourceBoundaryToLocalX(document, 0) ?? 0;
      const end = context.runtime.sourceBoundaryToLocalX(document, document.timeline.cycleCount) ?? start + 1;
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
  readonly projection: any;
  readonly timeAxis: any;
  readonly screenGeometry: any;
  readonly zoom: number;
  readonly snapEnabled: boolean;
  readonly document: CanonicalDocument;
  readonly currentSnapIndex: () => any;
  readonly cycleBoundaryAtPointerX: (clientX: number) => number | undefined;
  readonly cycleBoundaryAtX: (clientX: number) => number | undefined;
  readonly publishState: () => void;
}): number | undefined {
  const waveLayer = context.host.querySelector<HTMLElement>("[data-role='stable-waveform-surface']");
  const axisOwner = context.timeAxis.ownerSignalId;
  const axisRow = axisOwner === undefined ? undefined : context.projection.rowLayout.find((row: any) => row.rowId === axisOwner);
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

export function scheduleInitialTimelineRefresh(renderer: { whenIdle: () => Promise<unknown> }, host: HTMLElement, refresh: { readonly ruler: () => void; readonly range: () => void; readonly playhead: () => void; readonly grid: () => void; readonly zoom: () => void; readonly overlays: () => void; readonly collectErrors: () => void; readonly publish: () => void; }): void {
  void renderer.whenIdle().then(() => {
    if (!host.isConnected) return;
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
}

export function mountInitialTimelineProjection(context: { readonly coordinator: { mount: (host: HTMLElement) => void }; readonly renderer: { update: (projection: any) => void }; readonly host: HTMLElement; readonly viewport: HTMLElement; readonly referenceClock: any; readonly projectionCoordinator: { project: (input: any) => any }; readonly snapshot: any; readonly collapsedGroupIds: readonly string[] }): { readonly window: any; readonly projection: any } {
  context.coordinator.mount(context.host);
  const window = buildViewportWindow(context.viewport, context.referenceClock);
  const projection = context.projectionCoordinator.project({ snapshot: context.snapshot, changeSet: { fullDocumentReplace: true }, viewport: window, collapsedGroupIds: context.collapsedGroupIds });
  context.renderer.update(projection);
  return { window, projection };
}

export function collectWaveRenderErrors(host: HTMLElement): readonly DocumentProblem[] {
  return [...host.querySelectorAll<HTMLElement>("[data-wave-error]")].map((owner) => ({
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
    recommendation: "Review the affected Signal values or type, then retry the operation or open a supported document.",
    detail: "waveform-render:localized-failure",
  }));
}

export function createEditorTimelineRuntime(context: Parameters<typeof createTimelineViewportRuntime>[0]): TimelineViewportRuntime {
  return createTimelineViewportRuntime(context);
}

export type WaveformProviderContext = Readonly<{
  sessionController: { snapshot: () => { readonly document: CanonicalDocument; readonly revision: number } };
  mappingCache: { get: (timeline: CanonicalDocument["timeline"], timeGroups: CanonicalDocument["timeGroups"]) => any; remapValueChanges: (values: any, mapping: any) => any };
  adapter: any;
  geometryRegistry: { readonly maps: Map<string, any>; readonly svgs: Map<string, SVGSVGElement>; remove: (id: any) => void };
  markOpenPhase: (phase: string, phaseTimestamp?: number) => void;
  onReferenceGeometryReady?: () => void;
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
      const yieldBetweenOwners = document.signals.length * mapping.displayCycleCount >= 250_000;
      let referenceGeometryReady = false;
      if (signalIndexDocument !== document || signalIndexRevision !== currentSnapshot.revision) {
        signalById = new Map(document.signals.map((signal) => [signal.id, signal]));
        signalIndexDocument = document;
        signalIndexRevision = currentSnapshot.revision;
      }
      const prepared = requests.map((request) => {
        const signal = signalById.get(request.signalId);
        if (!signal) return { request, waveJson: undefined, error: new Error(`Signal '${request.signalId}' is missing.`) };
        let remappedValues: any;
        const displaySignal = signal.type === "commentRow" ? signal : signal.type === "clock"
          ? { ...signal, ...(signal.enable ? { enable: context.mappingCache.remapValueChanges(signal.enable, mapping) } : {}) }
          : (remappedValues = context.mappingCache.remapValueChanges(signal.values, mapping), { ...signal, values: remappedValues });
        const semanticValues = remappedValues !== undefined && signal.type !== "clock" && signal.type !== "commentRow" && valueSignalWaveDomain(signal.type) === "data" ? remappedValues.map((change: { readonly value: string | number }) => String(change.value)) : undefined;
        return { request, waveJson: context.adapter.toWaveJson({ signal: displaySignal, cycleCount: mapping.displayCycleCount }), semanticValues, error: undefined };
      });
      const renderResults: Array<{ readonly request: (typeof requests)[number]; readonly waveJson: any; readonly semanticValues?: readonly string[]; readonly error: Error | undefined; readonly rendered: any }> = [];
      for (const item of prepared) {
        if (item.error || !item.waveJson) renderResults.push({ ...item, rendered: undefined });
        else {
          try { renderResults.push({ ...item, rendered: await context.adapter.renderWave(item.request.signalId, item.waveJson, item.request.owner, item.semanticValues) }); }
          catch (error: unknown) { renderResults.push({ ...item, rendered: undefined, error: error instanceof Error ? error : new Error(String(error)) }); }
        }
        // WaveDrom markup creation and SVG mounting are synchronous inside the
        // adapter. On genuinely large documents, yield after each owner so the
        // browser can paint and answer input without interleaving geometry
        // reads with DOM writes. Smaller documents retain the lower-latency
        // batch path; the renderer still yields between every batch.
        if (yieldBetweenOwners) await nextBrowserFrame();
      }
      const results = renderResults.map((item) => {
        if (item.error || !item.rendered) return { signalId: item.request.signalId, error: item.error ?? new Error("Waveform render did not produce an SVG.") };
        try {
          if (item.request.signalId === document.timeline.referenceClock) context.markOpenPhase("reference-clock-painted");
          const geometry = context.adapter.extractLocalGeometry(item.rendered);
          context.geometryRegistry.maps.set(item.request.signalId, geometry);
          context.geometryRegistry.svgs.set(item.request.signalId, item.rendered.svg as SVGSVGElement);
          if (item.request.signalId === document.timeline.referenceClock) {
            context.markOpenPhase("reference-geometry-ready");
            referenceGeometryReady = true;
          }
          context.markOpenPhase("first-visible-wave-painted");
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, result: { waveDromRenders: 1, localGeometryBuilds: 1 } };
        } catch (error: unknown) {
          context.geometryRegistry.remove(item.request.signalId);
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, error };
        }
      });
      if (referenceGeometryReady) context.onReferenceGeometryReady?.();
      return results;
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

export function refreshRendererOverlays(renderer: any, host: RefObject<HTMLDivElement | null>, document: CanonicalDocument, projection: any, geometryMaps: any, mappingCache: any, screenGeometryScale: number, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge): void { renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps, mappingCache.get(document.timeline, document.timeGroups), screenGeometryScale)); renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, range, selectedCycle, screenGeometryScale, selectedEdge)); for (const owner of host.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationId); }

export function refreshGridPresentation(grid: HTMLElement, document: CanonicalDocument, geometryMaps: any, mappingCache: any, enabled: boolean, totalHeight: number, viewportWidth: number, screenGeometryScale: number): void { const timeAxis = resolveTimeAxisGeometry(document, geometryMaps); renderGeometryGrid(grid, timeAxis.geometry, timeAxis.ownerSignalId, enabled, totalHeight, mappingCache.get(document.timeline, document.timeGroups), Math.max(160, viewportWidth), screenGeometryScale, timeAxis.mode); }

export function rebuildRulerPresentation(ruler: HTMLElement, document: CanonicalDocument, geometryMaps: any, mappingCache: any, previousScale: number | undefined, referenceSvg: SVGSVGElement | undefined, zoom: number): { readonly timeAxis: any; readonly scale: number } { const timeAxis = resolveTimeAxisGeometry(document, geometryMaps); const scale = buildRuler(ruler, timeAxis.geometry, document, timeAxis.ownerSignalId, mappingCache.get(document.timeline, document.timeGroups), previousScale, referenceSvgScreenScale(referenceSvg, zoom), timeAxis.mode); return { timeAxis, scale }; }

export function refreshPlayheadPresentation(ruler: HTMLElement, cycle: number, boundaryToLocalX: (cycle: number) => number | undefined): void { const playheadX = boundaryToLocalX(cycle); let playhead = ruler.querySelector<HTMLElement>("[data-role='playhead']"); if (playheadX === undefined) { playhead?.remove(); return; } if (!playhead) { playhead = ruler.ownerDocument.createElement("span"); playhead.dataset.role = "playhead"; playhead.dataset.testid = "playhead"; playhead.setAttribute("aria-label", "Playhead"); ruler.append(playhead); } playhead.dataset.playheadCycle = String(cycle); playhead.style.left = `${playheadX}px`; }

export function refreshRangeBandPresentation(viewport: HTMLElement, ruler: HTMLElement, rendererHost: HTMLElement, active: boolean, preview: string | undefined, range: { readonly start: number; readonly end: number }, boundaryToLocalX: (cycle: number) => number | undefined, zoom: number, timeDomainLeft: number, totalHeight: number): void { const band = viewport.querySelector<HTMLElement>("[data-role='range-selection-band']"); const rulerBand = ruler.querySelector<HTMLElement>("[data-role='range-selection-ruler-band']"); if (!band) return; if (!active && !preview) { band.hidden = true; if (rulerBand) rulerBand.hidden = true; for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) delete tick.dataset.rangeSelected; return; } const [startText, endText] = (preview ?? `${range.start}:${range.end}`).split(":"); const start = Number(startText); const end = Number(endText); const startLocalX = boundaryToLocalX(start); const endLocalX = boundaryToLocalX(end); if (startLocalX === undefined || endLocalX === undefined || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) { band.hidden = true; return; } const startX = startLocalX * zoom; const endX = endLocalX * zoom; if (!Number.isFinite(startX) || !Number.isFinite(endX) || endX <= startX) { band.hidden = true; return; } band.hidden = false; band.dataset.rangeStart = String(start); band.dataset.rangeEnd = String(end); band.dataset.source = "ruler-local-geometry"; band.style.left = `${timeDomainLeft + startX}px`; band.style.width = `${endX - startX}px`; band.style.top = "34px"; band.style.height = `${Math.max(totalHeight, viewport.clientHeight - 34)}px`; band.setAttribute("aria-label", `Selected time range [${start}, ${end})`); if (rulerBand) { rulerBand.hidden = false; rulerBand.dataset.rangeStart = String(start); rulerBand.dataset.rangeEnd = String(end); rulerBand.dataset.source = "ruler-local-geometry"; rulerBand.style.left = `${startLocalX}px`; rulerBand.style.width = `${endLocalX - startLocalX}px`; rulerBand.setAttribute("aria-label", `Selected time range [${start}, ${end})`); } for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) { const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle); tick.dataset.rangeSelected = String(cycle >= start && cycle < end); } void rendererHost; }

export function publishRendererState(host: HTMLElement, session: any, viewMetricsOwner: any, adapter: any, geometryCache: any, projectionCoordinator: any, renderer: any, mappingCache: any, snapService: any, snapIndex: any, rulerBuilds: number, edgeCounterResolvePasses: number, zoom: number): void { host.dataset.canonicalRevision = String(session.getSnapshot().revision); host.dataset.historyDepth = String(session.historyState().undoDepth); const metrics = viewMetricsOwner.snapshot(); host.dataset.viewMetrics = JSON.stringify(metrics); const { renderCallsBySignal: _renderCallsBySignal, ...waveAdapter } = adapter.metrics(); const { last: _lastGeometry, ...geometryExtraction } = adapter.geometryMetrics(); host.dataset.sessionCounters = JSON.stringify({ ...session.metrics(), ...session.historyMetrics(), ...projectionCoordinator.diagnostics(), ...renderer.diagnosticSummary(), rulerBuilds, edgeCounterResolvePasses, ...mappingCache.metrics(), snapIndexBuilds: snapService.metrics().builds, snapCandidateCount: snapService.metrics().candidateCount, snapQueries: snapIndex?.metrics().queries ?? 0, snapCandidatesVisited: snapIndex?.metrics().candidatesVisited ?? 0, viewMetrics: metrics, waveAdapter, geometryExtraction, zoom }); }

export function syncPresentationScale(viewport: HTMLElement, host: HTMLElement, rulerViewport: HTMLElement, zoom: number, screenGeometryScale: number): void { const presentationScale = Math.max(0.0001, zoom * screenGeometryScale); viewport.style.setProperty("--presentation-x-scale", String(presentationScale)); host.style.setProperty("--presentation-x-scale", String(presentationScale)); rulerViewport.style.setProperty("--presentation-x-scale", String(presentationScale)); }
export function syncRulerScroll(ruler: HTMLElement, viewport: HTMLElement, zoom: number): void { ruler.style.transform = `translateX(${-viewport.scrollLeft}px) scaleX(${zoom})`; ruler.dataset.scrollLeft = String(viewport.scrollLeft); }

/** Keep frozen presentation columns pinned when their scroll-content containing
 * block reaches a horizontal edge. This is view-only and does not alter
 * canonical coordinates or geometry ownership. */
export function syncFrozenColumnScroll(viewport: HTMLElement, host: HTMLElement, leftPaneWidth: number): void {
  const viewportRect = viewport.getBoundingClientRect();
  const targets: readonly [string, number][] = [
    ["[data-role='left-tree-rows']", viewportRect.left],
    ["[data-role='frozen-label-rows']", viewportRect.left + leftPaneWidth],
  ];
  for (const [selector, targetLeft] of targets) {
    const element = host.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const currentTranslateX = Number.parseFloat(element.style.getPropertyValue("translate")) || 0;
    const baseLeft = element.getBoundingClientRect().left - currentTranslateX;
    const nextTranslateX = targetLeft - baseLeft;
    if (Math.abs(nextTranslateX) < 0.01) element.style.removeProperty("translate");
    else element.style.setProperty("translate", `${nextTranslateX}px 0`);
  }
}

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
  const zoom = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
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
