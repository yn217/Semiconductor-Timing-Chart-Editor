import type { DisplayTimeMappingCache, RenderProjection } from "@timing-chart-v2/projection";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { resolveTimeAxisGeometry, type LocalGeometryMap, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { renderGeometryGrid } from "../render-geometry-grid.js";
import type { ViewMetricsOwner } from "./view-metrics.js";
import { buildRuler } from "./build-ruler.js";
import { referenceSvgScreenScale } from "./screen-scale.js";

// #572: a legitimate reference-SVG screen-scale reading corrects only for
// browser sub-pixel/DPI rounding around build-ruler.ts's own declared
// default (1 local-geometry unit = 1px at 100% zoom) -- it must never
// silently redefine Cycle Mode's pitch. Fit All/Fit Selection already
// express "shrink to fit" through `zoom` itself (viewport-controller.ts's
// `createTimelineZoomController`), so `screenGeometryScale` should stay
// close to 1 regardless of zoom level. A measurement this far from 1 can
// only mean the reference SVG was sampled while its container was still
// constrained by an unrelated pass (e.g. `applyRendererHostSizing`'s resize
// handler, which sizes the renderer host to the viewport's own width and
// can run before the zoom controller has applied the document's real
// unzoomed width) -- not a genuine screen-DPI effect. Reject it rather than
// let Cycle Mode's default 100% pitch permanently compress to fit whatever
// width happened to be measured first.
const PLAUSIBLE_SCREEN_SCALE_MIN = 0.9;
const PLAUSIBLE_SCREEN_SCALE_MAX = 1.1;
function plausibleScreenScale(candidate: number | undefined): number | undefined {
  return candidate !== undefined && candidate >= PLAUSIBLE_SCREEN_SCALE_MIN && candidate <= PLAUSIBLE_SCREEN_SCALE_MAX ? candidate : undefined;
}

export function rebuildRulerPresentation(ruler: HTMLElement, document: CanonicalDocument, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, previousScale: number | undefined, referenceSvg: SVGSVGElement | undefined, zoom: number, minimumWaveWidth = 0, viewportElement?: HTMLElement, measureCurrentScale = true): { readonly timeAxis: TimeAxisGeometry; readonly scale: number } {
  const timeAxis = resolveTimeAxisGeometry(document, geometryMaps);
  const mapping = mappingCache.get(document.timeline, document.timeGroups);
  const referenceViewBoxWidth = referenceSvg?.viewBox.baseVal.width;
  let scale = buildRuler(ruler, timeAxis.geometry, document, timeAxis.ownerSignalId, mapping, previousScale, measureCurrentScale ? plausibleScreenScale(referenceSvgScreenScale(referenceSvg, zoom)) : undefined, timeAxis.mode, minimumWaveWidth, viewportElement, referenceViewBoxWidth);
  const settledScale = measureCurrentScale ? plausibleScreenScale(referenceSvgScreenScale(referenceSvg, zoom)) : undefined;
  if (settledScale !== undefined && Math.abs(settledScale - scale) > 0.0001) scale = buildRuler(ruler, timeAxis.geometry, document, timeAxis.ownerSignalId, mapping, undefined, settledScale, timeAxis.mode, minimumWaveWidth, viewportElement, referenceViewBoxWidth);
  return { timeAxis, scale };
}

export function refreshGridPresentation(grid: HTMLElement, document: CanonicalDocument, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, enabled: boolean, totalHeight: number, viewportWidth: number, screenGeometryScale: number): void {
  const timeAxis = resolveTimeAxisGeometry(document, geometryMaps);
  renderGeometryGrid(grid, timeAxis.geometry, timeAxis.ownerSignalId, enabled, totalHeight, mappingCache.get(document.timeline, document.timeGroups), Math.max(160, viewportWidth), screenGeometryScale, timeAxis.mode);
}

export function refreshPlayheadPresentation(ruler: HTMLElement, cycle: number, boundaryToLocalX: (cycle: number) => number | undefined): void {
  const playheadX = boundaryToLocalX(cycle);
  let playhead = ruler.querySelector<HTMLElement>("[data-role='playhead']");
  if (playheadX === undefined) { playhead?.remove(); return; }
  if (!playhead) { playhead = ruler.ownerDocument.createElement("span"); playhead.dataset.role = "playhead"; playhead.dataset.testid = "playhead"; playhead.setAttribute("aria-label", "Playhead"); ruler.append(playhead); }
  playhead.dataset.playheadCycle = String(cycle);
  playhead.style.left = `${playheadX}px`;
}

export function refreshRangeBandPresentation(viewport: HTMLElement, ruler: HTMLElement, rendererHost: HTMLElement, active: boolean, preview: string | undefined, range: { readonly start: number; readonly end: number }, boundaryToLocalX: (cycle: number) => number | undefined, zoom: number, timeDomainLeft: number, totalHeight: number): void {
  const band = viewport.querySelector<HTMLElement>("[data-role='range-selection-band']");
  const rulerBand = ruler.querySelector<HTMLElement>("[data-role='range-selection-ruler-band']");
  if (!band) return;
  if (!active && !preview) { band.hidden = true; if (rulerBand) rulerBand.hidden = true; for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) delete tick.dataset.rangeSelected; return; }
  const [startText, endText] = (preview ?? `${range.start}:${range.end}`).split(":");
  const start = Number(startText); const end = Number(endText);
  const startLocalX = boundaryToLocalX(start); const endLocalX = boundaryToLocalX(end);
  if (startLocalX === undefined || endLocalX === undefined || !Number.isInteger(start) || !Number.isInteger(end) || end <= start) { band.hidden = true; return; }
  const startX = startLocalX * zoom; const endX = endLocalX * zoom;
  if (!Number.isFinite(startX) || !Number.isFinite(endX) || endX <= startX) { band.hidden = true; return; }
  band.hidden = false; band.dataset.rangeStart = String(start); band.dataset.rangeEnd = String(end); band.dataset.source = "ruler-local-geometry"; band.style.left = `${timeDomainLeft + startX}px`; band.style.width = `${endX - startX}px`; band.style.top = "34px"; band.style.height = `${Math.max(totalHeight, viewport.clientHeight - 34)}px`; band.setAttribute("aria-label", `Selected time range [${start}, ${end})`);
  if (rulerBand) { rulerBand.hidden = false; rulerBand.dataset.rangeStart = String(start); rulerBand.dataset.rangeEnd = String(end); rulerBand.dataset.source = "ruler-local-geometry"; rulerBand.style.left = `${startLocalX}px`; rulerBand.style.width = `${endLocalX - startLocalX}px`; rulerBand.setAttribute("aria-label", `Selected time range [${start}, ${end})`); }
  for (const tick of ruler.querySelectorAll<HTMLElement>("[data-cycle]")) { const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle); tick.dataset.rangeSelected = String(cycle >= start && cycle < end); }
  void rendererHost;
}

export function refreshTimelinePresentation(context: {
  readonly reason: string; readonly document: CanonicalDocument; readonly ruler: HTMLElement; readonly grid: HTMLElement; readonly viewport: HTMLElement; readonly host: HTMLElement; readonly rulerViewport: HTMLElement; readonly geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>; readonly geometrySvgs: ReadonlyMap<SignalId, SVGSVGElement>; readonly mappingCache: Pick<DisplayTimeMappingCache, "get">; readonly metricsOwner: Pick<ViewMetricsOwner, "update" | "snapshot">; readonly currentZoom: number; readonly previousScale: number; readonly rulerInitialized: boolean; readonly timeAxis: TimeAxisGeometry; readonly totalHeight: number; readonly gridEnabled: boolean; readonly markOpenPhase: (phase: string) => void; readonly onPlayhead: () => void; readonly onRange: () => void; readonly onResize: () => void;
}): { readonly timeAxis: TimeAxisGeometry; readonly screenGeometryScale: number; readonly rulerInitialized: boolean } {
  let timeAxis = context.timeAxis; let screenGeometryScale = context.previousScale; let rulerInitialized = context.rulerInitialized;
  if (context.reason === "ruler" || context.reason === "resize") {
    context.metricsOwner.update({ viewportWidth: context.viewport.clientWidth });
    const metrics = context.metricsOwner.snapshot();
    const minimumWaveWidth = Math.max(160, metrics.viewportWidth - metrics.leftPaneWidth - metrics.frozenPaneWidth);
    const currentTimeAxis = resolveTimeAxisGeometry(context.document, context.geometryMaps);
    const rebuilt = rebuildRulerPresentation(context.ruler, context.document, context.geometryMaps, context.mappingCache, rulerInitialized ? screenGeometryScale : undefined, currentTimeAxis.ownerSignalId ? context.geometrySvgs.get(currentTimeAxis.ownerSignalId) : undefined, metrics.zoom, minimumWaveWidth, context.viewport, context.reason === "resize" || !rulerInitialized);
    timeAxis = rebuilt.timeAxis; screenGeometryScale = rebuilt.scale; rulerInitialized = true; context.markOpenPhase("ruler-painted"); syncPresentationScale(context.viewport, context.host, context.rulerViewport, context.currentZoom, screenGeometryScale);
  }
  if (context.reason !== "scroll") { context.metricsOwner.update({ viewportWidth: context.viewport.clientWidth }); const metrics = context.metricsOwner.snapshot(); refreshGridPresentation(context.grid, context.document, context.geometryMaps, context.mappingCache, context.gridEnabled, context.totalHeight, globalThis.innerWidth - metrics.leftPaneWidth - metrics.inspectorWidth - metrics.frozenPaneWidth, screenGeometryScale); }
  if (context.reason === "playhead") context.onPlayhead();
  if (context.reason === "range") context.onRange();
  if (context.reason === "resize") context.onResize();
  if (context.reason !== "scroll") syncRulerScroll(context.ruler, context.viewport, context.currentZoom);
  return { timeAxis, screenGeometryScale, rulerInitialized };
}

export function syncPresentationScale(viewport: HTMLElement, host: HTMLElement, rulerViewport: HTMLElement, zoom: number, screenGeometryScale: number): void {
  const presentationScale = Math.max(0.0001, zoom * screenGeometryScale);
  viewport.style.setProperty("--presentation-x-scale", String(presentationScale));
  host.style.setProperty("--presentation-x-scale", String(presentationScale));
  rulerViewport.style.setProperty("--presentation-x-scale", String(presentationScale));
}

export function syncRulerScroll(ruler: HTMLElement, viewport: HTMLElement, zoom: number): void {
  // Keep scroll translation independent from scale. Reconstructing a
  // transform from the already-transformed bounding box can lose the ruler's
  // horizontal correction during synthetic/high-frequency scroll events,
  // leaving annotation overlays and cycle ticks 1:1 out of alignment.
  ruler.style.translate = `${-viewport.scrollLeft}px 0`;
  ruler.style.transform = `scaleX(${zoom})`;
  const rulerFrame = ruler.parentElement;
  if (rulerFrame) rulerFrame.style.translate = `${viewport.scrollLeft}px 0`;
  ruler.dataset.scrollLeft = String(viewport.scrollLeft);
}

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
