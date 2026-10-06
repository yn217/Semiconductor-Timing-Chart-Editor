import { timelineScrollOwner } from "./timeline-scroll-owner.js";
import type { DisplayTimeMappingCache, RenderProjection } from "@timing-chart-v2/projection";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { resolveTimeAxisGeometry, type LocalGeometryMap, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { renderGeometryGrid } from "../render-geometry-grid.js";
import type { ViewMetricsOwner } from "./view-metrics.js";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";
import { buildRuler } from "./build-ruler.js";
import { displayWindowForSource } from "./display-boundary.js";
import { waveOwnerPlacement } from "./wave-owner-placement.js";

/** Read the presentation-width authority published by ModeWorkspace, not an outer shell's mode label. */
function contentWidthOwner(element: HTMLElement): string | undefined {
  return element.closest<HTMLElement>("[data-content-width-owner]")?.dataset.contentWidthOwner;
}

/** Reapply ruler-owned boundaries and already-mounted waveform owners from the just-published generation. */
export function applyPublishedTimeAxisMetrics(ruler: HTMLElement, viewport: HTMLElement | undefined, metrics: TimeAxisMetrics): void {
  for (const boundary of ruler.querySelectorAll<HTMLElement>("[data-geometry-source-cycle]")) {
    const cycle = Number(boundary.dataset.geometrySourceCycle);
    if (!Number.isInteger(cycle)) continue;
    const x = metrics.sourceBoundaryToContentX(cycle);
    if (x === undefined || !Number.isFinite(x)) continue;
    boundary.style.left = `${x}px`;
    const endCycle = Number(boundary.dataset.geometryEndSourceCycle);
    if (Number.isInteger(endCycle)) {
      const endX = metrics.sourceBoundaryToContentX(endCycle);
      if (endX !== undefined && Number.isFinite(endX)) boundary.style.width = `${Math.max(18, endX - x)}px`;
    }
  }
  const widthOwner = viewport ?? ruler.closest<HTMLElement>("[data-testid='cycle-viewport']");
  if (!widthOwner || metrics.pxPerDisplayCycle === undefined || metrics.screenOriginX === undefined) return;
  for (const owner of widthOwner.querySelectorAll<HTMLElement>("[data-wave-owner]")) {
    if (owner.tagName !== "DIV") continue;
    const sourceStart = Number(owner.dataset.renderedSourceWindowStart);
    const sourceEnd = Number(owner.dataset.renderedSourceWindowEnd);
    if (!Number.isInteger(sourceStart) || !Number.isInteger(sourceEnd) || sourceEnd <= sourceStart) continue;
    const displayWindow = displayWindowForSource(metrics.mapping, { sourceStart, sourceEnd }, metrics.mapping.sourceCycleCount);
    if (!displayWindow) continue;
    const placement = waveOwnerPlacement({
      displayStart: displayWindow.displayStart,
      displayEnd: displayWindow.displayEnd,
      pxPerDisplayCycle: metrics.pxPerDisplayCycle,
      waveOriginPx: metrics.screenOriginX,
      presentationScale: metrics.presentationScale,
      viewBoxWidth: owner.querySelector<SVGSVGElement>(":scope > svg")?.viewBox.baseVal.width,
      metrics,
    });
    owner.style.width = `${placement.width}px`;
    owner.style.left = `${placement.left}px`;
  }
}

// #572 introduced a reference-SVG screen-scale measurement meant only to
// correct browser sub-pixel/DPI rounding around build-ruler.ts's own
// declared default (1 local-geometry unit = 1px at 100% zoom). In practice
// that measurement is never exactly 1 (e.g. 1.00106), and while #572 only
// guarded against it drifting *far* from 1, it applied whatever near-1
// value it measured to the ruler/grid's per-cycle pixel positions -- but
// never to the waveform surface itself, which always renders at the
// undivided 1-unit-per-px default. Because the correction is multiplicative,
// even a ~0.1% measured error is invisible near cycle 0 but compounds into a
// visible, growing pixel drift between the grid's vertical guide lines and
// the actual signal edges the farther right you scroll. Always using the
// documented default (scale 1) keeps the ruler/grid and the waveform
// surface reading the exact same coordinates everywhere, eliminating the
// drift entirely; DPI/sub-pixel rounding this was meant to smooth over is
// sub-1px and not worth reintroducing a source of unbounded drift for.
export function rebuildRulerPresentation(ruler: HTMLElement, document: CanonicalDocument, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, previousScale: number | undefined, referenceSvg: SVGSVGElement | undefined, zoom: number, minimumWaveWidth = 0, viewportElement?: HTMLElement, cyclesPerTc = 10): { readonly timeAxis: TimeAxisGeometry; readonly scale: number; readonly waveWidthPxPerDisplayCycle: number | undefined; readonly waveOriginPx: number } {
  void zoom;
  const timeAxis = resolveTimeAxisGeometry(document, geometryMaps);
  const mapping = mappingCache.get(document.timeline, document.timeGroups);
  const referenceViewBoxWidth = referenceSvg?.viewBox.baseVal.width;
  // #750: Transaction presentation labels the ruler in TC; Cycle and Combined keep system cycles (Combined shares one ruler with the Cycle pane).
  const tcScale = contentWidthOwner(ruler) === "transaction-lanes" ? cyclesPerTc : 1;
  // #750: cyclesPerTC is a horizontal display-time COMPRESSION factor in standalone Transaction Mode (1 TC occupies what 1 cycle does in
  // Cycle Mode). The geometry scale is the single presentation authority, so ruler, grid, bars, Phases, Bookmarks, snap and scroll extent
  // all follow it; Cycle and Combined stay 1:1 with source cycles.
  const geometryScale = tcScale > 1 ? 1 / tcScale : (previousScale !== undefined && previousScale >= 1 ? previousScale : 1);
  const { scale, targetWidth, waveOriginPx } = buildRuler(ruler, timeAxis.geometry, document, timeAxis.ownerSignalId, mapping, geometryScale, undefined, timeAxis.mode, minimumWaveWidth, viewportElement, referenceViewBoxWidth, tcScale);
  const waveWidthPxPerDisplayCycle = mapping.displayCycleCount > 0 ? targetWidth / mapping.displayCycleCount : undefined;
  return { timeAxis, scale, waveWidthPxPerDisplayCycle, waveOriginPx };
}

export function refreshGridPresentation(grid: HTMLElement, document: CanonicalDocument, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, enabled: boolean, totalHeight: number, viewportWidth: number, screenGeometryScale: number, cyclesPerTc = 10, sharedMetrics?: TimeAxisMetrics): void {
  const timeAxis = sharedMetrics?.timeAxis ?? resolveTimeAxisGeometry(document, geometryMaps);
  // #765: standalone Transaction hides the Cycle signal rows, so their summed height must not size the grid (it made the scroll owner overflow
  // vertically); the grid spans the Transaction lanes instead.
  const standaloneTransaction = contentWidthOwner(grid) === "transaction-lanes";
  const gridHeight = standaloneTransaction ? (grid.parentElement?.querySelector<HTMLElement>(".transaction-lanes")?.offsetHeight ?? 0) : totalHeight;
  renderGeometryGrid(grid, timeAxis.geometry, timeAxis.ownerSignalId, enabled, gridHeight, sharedMetrics?.mapping ?? mappingCache.get(document.timeline, document.timeGroups), Math.max(160, viewportWidth), sharedMetrics?.presentationScale ?? screenGeometryScale, timeAxis.mode, standaloneTransaction ? cyclesPerTc : 1, sharedMetrics);
}

export function refreshRulerAndGridIfNeeded(isInitialized: () => boolean, refreshRuler: () => void, refreshGrid: () => void): void {
  if (isInitialized()) return;
  refreshRuler();
  refreshGrid();
}

export function refreshPlayheadPresentation(ruler: HTMLElement, cycle: number, boundaryToLocalX: (cycle: number) => number | undefined): void {
  const playheadX = boundaryToLocalX(cycle);
  let playhead = ruler.querySelector<HTMLElement>("[data-role='playhead']");
  if (playheadX === undefined) { playhead?.remove(); return; }
  if (!playhead) { playhead = ruler.ownerDocument.createElement("span"); playhead.dataset.role = "playhead"; playhead.dataset.testid = "playhead"; playhead.setAttribute("aria-label", "Playhead"); ruler.append(playhead); }
  playhead.dataset.playheadCycle = String(cycle);
  playhead.style.left = `${playheadX}px`;
}

export function refreshRangeBandPresentation(viewport: HTMLElement, ruler: HTMLElement, rendererHost: HTMLElement, active: boolean, preview: string | undefined, range: { readonly start: number; readonly end: number }, boundaryToLocalX: (cycle: number, metrics: TimeAxisMetrics) => number | undefined, metrics: TimeAxisMetrics, timeDomainLeft: number, totalHeight: number): void {
  const band = viewport.querySelector<HTMLElement>("[data-role='range-selection-band']");
  const rulerBand = ruler.querySelector<HTMLElement>("[data-role='range-selection-ruler-band']");
  if (!band) return;
  if (!active && !preview) { band.hidden = true; if (rulerBand) rulerBand.hidden = true; for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) delete tick.dataset.rangeSelected; return; }
  const [startText, endText] = (preview ?? `${range.start}:${range.end}`).split(":");
  const start = Number(startText); const end = Number(endText);
  const startLocalX = boundaryToLocalX(start, metrics); const endLocalX = boundaryToLocalX(end, metrics);
  if (startLocalX === undefined || endLocalX === undefined || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) { band.hidden = true; return; }
  const startX = startLocalX * metrics.zoom; const endX = endLocalX * metrics.zoom;
  if (!Number.isFinite(startX) || !Number.isFinite(endX) || endX <= startX) { band.hidden = true; return; }
  band.hidden = false; band.dataset.rangeStart = String(start); band.dataset.rangeEnd = String(end); band.dataset.source = "ruler-local-geometry"; band.style.left = `${timeDomainLeft + startX}px`; band.style.width = `${endX - startX}px`; band.style.top = "34px"; band.style.height = `${Math.max(totalHeight, viewport.clientHeight - 34)}px`; band.setAttribute("aria-label", `Selected time range [${start}, ${end})`);
  if (rulerBand) { rulerBand.hidden = false; rulerBand.dataset.rangeStart = String(start); rulerBand.dataset.rangeEnd = String(end); rulerBand.dataset.source = "ruler-local-geometry"; rulerBand.style.left = `${startLocalX}px`; rulerBand.style.width = `${endLocalX - startLocalX}px`; rulerBand.setAttribute("aria-label", `Selected time range [${start}, ${end})`); }
  for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) { const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle); tick.dataset.rangeSelected = String(cycle >= start && cycle < end); }
  void rendererHost;
}

export function refreshTimelinePresentation(context: {
  readonly reason: string; readonly document: CanonicalDocument; readonly ruler: HTMLElement; readonly grid: HTMLElement; readonly viewport: HTMLElement; readonly host: HTMLElement; readonly rulerViewport: HTMLElement; readonly geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>; readonly geometrySvgs: ReadonlyMap<SignalId, SVGSVGElement>; readonly mappingCache: Pick<DisplayTimeMappingCache, "get">; readonly metricsOwner: Pick<ViewMetricsOwner, "update" | "snapshot">; readonly currentZoom: number; readonly previousScale: number; readonly rulerInitialized: boolean; readonly timeAxis: TimeAxisGeometry; readonly totalHeight: number; readonly gridEnabled: boolean; readonly markOpenPhase: (phase: string) => void; readonly onPlayhead: () => void; readonly onRange: () => void; readonly onResize: () => void;
  readonly cyclesPerTc: number;
  readonly publishTimeAxisMetrics?: (timeAxis: TimeAxisGeometry, presentationScale: number, pxPerDisplayCycle: number | undefined, screenOriginX: number, zoom: number) => TimeAxisMetrics;
  readonly publishTimeAxisZoom?: (zoom: number) => TimeAxisMetrics;
  readonly getTimeAxisMetrics?: () => TimeAxisMetrics;
}): { readonly timeAxis: TimeAxisGeometry; readonly screenGeometryScale: number; readonly rulerInitialized: boolean; readonly waveWidthPxPerDisplayCycle: number | undefined; readonly waveOriginPx: number | undefined } {
  let timeAxis = context.timeAxis; let screenGeometryScale = context.previousScale; let rulerInitialized = context.rulerInitialized;
  let waveWidthPxPerDisplayCycle: number | undefined;
  let waveOriginPx: number | undefined;
  let sharedMetrics = context.getTimeAxisMetrics?.();
  if (context.reason === "ruler" || context.reason === "resize") {
    context.metricsOwner.update({ viewportWidth: context.viewport.clientWidth });
    const metrics = context.metricsOwner.snapshot();
    // Standalone Transaction has no Cycle left/frozen columns inside the timeline area (#750): the presented time domain may use the full width.
    const inTransaction = contentWidthOwner(context.ruler) === "transaction-lanes";
    const minimumWaveWidth = Math.max(160, inTransaction ? metrics.viewportWidth : metrics.viewportWidth - metrics.leftPaneWidth - metrics.frozenPaneWidth);
    const currentTimeAxis = resolveTimeAxisGeometry(context.document, context.geometryMaps);
    const rebuilt = rebuildRulerPresentation(context.ruler, context.document, context.geometryMaps, context.mappingCache, rulerInitialized ? screenGeometryScale : undefined, currentTimeAxis.ownerSignalId ? context.geometrySvgs.get(currentTimeAxis.ownerSignalId) : undefined, metrics.zoom, minimumWaveWidth, context.viewport, context.cyclesPerTc);
    timeAxis = rebuilt.timeAxis; screenGeometryScale = rebuilt.scale; waveWidthPxPerDisplayCycle = rebuilt.waveWidthPxPerDisplayCycle; waveOriginPx = rebuilt.waveOriginPx; rulerInitialized = true;
    sharedMetrics = context.publishTimeAxisMetrics?.(timeAxis, screenGeometryScale, waveWidthPxPerDisplayCycle, waveOriginPx, context.currentZoom) ?? sharedMetrics;
    if (sharedMetrics) applyPublishedTimeAxisMetrics(context.ruler, context.viewport, sharedMetrics);
    context.markOpenPhase("ruler-painted"); syncPresentationScale(context.host, context.currentZoom, screenGeometryScale);
  } else {
    sharedMetrics = context.publishTimeAxisZoom?.(context.currentZoom) ?? sharedMetrics;
  }
  if (context.reason !== "scroll") { context.metricsOwner.update({ viewportWidth: context.viewport.clientWidth }); const metrics = context.metricsOwner.snapshot(); refreshGridPresentation(context.grid, context.document, context.geometryMaps, context.mappingCache, context.gridEnabled, context.totalHeight, globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth, screenGeometryScale, context.cyclesPerTc, sharedMetrics); }
  if (context.reason === "playhead") context.onPlayhead();
  if (context.reason === "range") context.onRange();
  if (context.reason === "resize") context.onResize();
  if (context.reason !== "scroll") syncRulerScroll(context.ruler, context.viewport, sharedMetrics?.zoom ?? context.currentZoom);
  return { timeAxis, screenGeometryScale, rulerInitialized, waveWidthPxPerDisplayCycle, waveOriginPx };
}

// #175: zoom counter-scale variables are published on the smallest layers
// that hold their consumers. An inherited custom property written on the
// viewport or renderer host restyles every row, wave and grid line below it on
// each Zoom step, although only ruler ticks, overlay labels and wave text read it.
const ZOOM_X_SCOPES = ".cycle-ruler, [data-role='annotation-overlay-surface'], [data-role='interactive-overlay-surface']";
const WAVE_LABEL_SCOPES = "[data-role='stable-waveform-surface']";

function publishVariable(scope: ParentNode, selector: string, name: string, value: string): void {
  // Unit-test doubles are not DOM elements; there is nothing to publish to without a DOM.
  if (typeof scope.querySelectorAll !== "function") return;
  for (const element of scope.querySelectorAll<HTMLElement>(selector)) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
}

/** `--zoom-x` for the ruler and overlay labels that counter-scale against the CSS Zoom (center-columns.css). */
export function publishZoomX(scope: ParentNode, zoom: number): void {
  publishVariable(scope, ZOOM_X_SCOPES, "--zoom-x", String(zoom));
}

/** `--wave-label-x-scale` for waveform SVG text (waveform.css). */
export function publishWaveLabelScale(host: ParentNode, presentationScale: number): void {
  publishVariable(host, WAVE_LABEL_SCOPES, "--wave-label-x-scale", String(presentationScale));
}

export function syncPresentationScale(host: HTMLElement, zoom: number, screenGeometryScale: number): void {
  const presentationScale = Math.max(0.0001, zoom * screenGeometryScale);
  // The published value stays on the renderer host (read by the Signal Split
  // mirror and browser checks); it is registered non-inherited in
  // waveform.css, so updating it never restyles the host's descendants.
  host.style.setProperty("--presentation-x-scale", String(presentationScale));
  publishWaveLabelScale(host, presentationScale);
  publishZoomX(host, zoom);
}

const scrollVariableConsumerCache = new WeakMap<HTMLElement, readonly HTMLElement[]>();
function scrollVariableConsumers(viewport: HTMLElement): readonly HTMLElement[] {
  // Unit-test doubles are not DOM elements; there is nothing to publish to without a DOM.
  if (typeof viewport.querySelectorAll !== "function") return [];
  const cached = scrollVariableConsumerCache.get(viewport);
  if (cached && cached.every((element) => element.isConnected)) return cached;
  const found = Array.from(viewport.querySelectorAll<HTMLElement>("[data-testid='geometry-grid'], [data-testid='range-selection-band']"));
  // Only cache a complete set (both consumers mounted); otherwise look again on the next scroll.
  if (found.length >= 2) scrollVariableConsumerCache.set(viewport, found);
  return found;
}

export function syncRulerScroll(ruler: HTMLElement, viewport: HTMLElement, zoom: number): void {
  // Keep scroll translation independent from scale. Reconstructing a
  // transform from the already-transformed bounding box can lose the ruler's
  // horizontal correction during synthetic/high-frequency scroll events,
  // leaving annotation overlays and cycle ticks 1:1 out of alignment.
  // #625: in Cycle the TimelineViewport wrapper owns horizontal scroll; the (non-scrolling) viewport needs no frame compensation.
  const owner = timelineScrollOwner(viewport);
  const scrollLeft = owner.scrollLeft;
  ruler.style.translate = `${-scrollLeft}px 0`;
  ruler.style.transform = `scaleX(${zoom})`;
  const rulerFrame = ruler.parentElement;
  if (rulerFrame) rulerFrame.style.translate = owner === viewport ? `${scrollLeft}px 0` : "0px 0";
  // #738/#768: these custom properties are consumed only by the grid and the range band. Writing them on the viewport (an ancestor of the whole
  // ~100k-node waveform DOM) invalidated style for every descendant on EVERY scroll event; write them on the two consumers instead.
  const consumers = scrollVariableConsumers(viewport);
  for (const consumer of consumers) {
    consumer.style.setProperty("--timeline-scroll-left", owner === viewport ? "0" : String(scrollLeft));
    if (consumer.matches("[data-testid='geometry-grid']") && owner !== viewport && zoom > 0) { consumer.style.setProperty("--grid-clip-left", `${scrollLeft / zoom}px`); consumer.style.setProperty("--grid-clip-right", `${(scrollLeft + owner.clientWidth) / zoom}px`); }
  }
  ruler.dataset.scrollLeft = String(scrollLeft);
}
