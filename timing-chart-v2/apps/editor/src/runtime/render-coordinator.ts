import { StableTimingChartRenderer, type TimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { RefObject } from "react";
import type { Annotation, CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { projectAnnotationOverlays } from "./annotation-overlays.js";
import { createDisplayTimeViewport, type DisplayTimeMapping, type DisplayTimeViewport } from "@timing-chart-v2/projection";
import { projectEdgeCounters, type EdgeCounterProjectionMetrics, type SelectedClockEdge } from "./edge-counter-projection.js";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

interface AnnotationViewportProjectionCache {
  readonly document: CanonicalDocument;
  readonly projection: RenderProjection;
  readonly geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>;
  readonly mapping: DisplayTimeMapping;
  readonly presentationScale: number;
  readonly selectedAnnotationId: string | undefined;
  readonly viewport: DisplayTimeViewport;
  readonly overlays: ReturnType<typeof projectAnnotationOverlays>;
  readonly publishedCacheHits: number;
  cacheHits: number;
}

const annotationViewportProjectionCaches = new WeakMap<HTMLElement, AnnotationViewportProjectionCache>();

function viewportContains(container: DisplayTimeViewport, requested: DisplayTimeViewport): boolean {
  return container.displayStart <= requested.displayStart
    && container.displayEnd >= requested.displayEnd
    && container.rowStart === requested.rowStart
    && container.rowEnd === requested.rowEnd
    && container.pinnedIds.length === requested.pinnedIds.length
    && container.pinnedIds.every((id, index) => id === requested.pinnedIds[index]);
}

function annotationProjectionWindow(viewport: DisplayTimeViewport, mapping: DisplayTimeMapping): DisplayTimeViewport {
  const visibleStart = Math.min(viewport.displayEnd, viewport.displayStart + viewport.overscanCycles);
  const visibleEnd = Math.max(visibleStart, viewport.displayEnd - viewport.overscanCycles);
  const visibleSpan = Math.max(1, visibleEnd - visibleStart);
  const overscan = Math.ceil(visibleSpan / 2);
  return createDisplayTimeViewport(mapping, visibleStart, visibleEnd, overscan, viewport.rowStart, viewport.rowEnd, viewport.generation, viewport.pinnedIds);
}

/** Owns the imperative renderer's DOM lifecycle outside React composition. */
export class RenderCoordinator {
  readonly renderer: StableTimingChartRenderer;

  constructor(provider: WaveformSurfaceProvider) {
    this.renderer = new StableTimingChartRenderer(provider);
  }

  mount(host: HTMLElement): void {
    this.renderer.mount(host);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export function refreshRendererEdgeCounters(renderer: Pick<TimingChartRenderer, "updateEdgeCounters">, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, timeAxisMetrics: TimeAxisMetrics, range: { readonly start: number; readonly end: number }, selectedCycle: number, screenGeometryScale: number, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): void { renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, timeAxisMetrics.mapping, range, selectedCycle, screenGeometryScale, selectedEdge, metrics)); }

/** Update only existing, geometry-stable Annotation owners; return false when a full reconciliation is required. */
export function refreshRendererAnnotationStyles(renderer: Pick<TimingChartRenderer, "patchOverlays">, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, timeAxisMetrics: TimeAxisMetrics, annotationIds: readonly string[]): boolean {
  const requested = new Set(annotationIds);
  if (requested.size !== annotationIds.length) return false;
  const annotations = document.annotations.filter((annotation) => requested.has(annotation.id));
  if (annotations.length !== requested.size || annotations.some((annotation) => !annotation.visible || annotation.measurement !== undefined || annotation.type === "ghostTrace")) return false;
  const primitives = annotations.flatMap((annotation) => projectAnnotationOverlays({ ...document, annotations: [annotation] }, projection, geometryMaps, timeAxisMetrics.mapping, timeAxisMetrics.presentationScale, undefined, undefined, timeAxisMetrics));
  if (primitives.length !== annotations.length || primitives.some((primitive, index) => primitive.id !== annotations[index]?.id)) return false;
  return renderer.patchOverlays(primitives) === primitives.length;
}

export function refreshRendererOverlays(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters"> & Partial<Pick<TimingChartRenderer, "patchOverlays">>, host: RefObject<HTMLDivElement | null>, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, timeAxisMetrics: TimeAxisMetrics, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics, viewport?: DisplayTimeViewport, reason?: string, annotationStyleIds?: readonly string[]): void {
  if (annotationStyleIds?.length && renderer.patchOverlays && refreshRendererAnnotationStyles(renderer as Pick<TimingChartRenderer, "patchOverlays">, document, projection, geometryMaps, timeAxisMetrics, annotationStyleIds)) return;
  const target = host.current;
  const mapping = timeAxisMetrics.mapping;
  const presentationScale = timeAxisMetrics.presentationScale;
  let cache = target ? annotationViewportProjectionCaches.get(target) : undefined;
  const reusable = reason === "scroll" && viewport !== undefined && cache !== undefined
    && cache.document === document
    && cache.projection === projection
    && cache.geometryMaps === geometryMaps
    && cache.mapping === mapping
    && cache.presentationScale === presentationScale
    && cache.selectedAnnotationId === selectedAnnotationId
    && viewportContains(cache.viewport, viewport);
  let overlays: ReturnType<typeof projectAnnotationOverlays>;
  if (reusable && cache) {
    overlays = cache.overlays;
    cache.cacheHits += 1;
  } else {
    const projectionViewport = reason === "scroll" && viewport !== undefined ? annotationProjectionWindow(viewport, mapping) : viewport;
    overlays = projectAnnotationOverlays(document, projection, geometryMaps, mapping, presentationScale, projectionViewport, (stats) => {
      if (!target) return;
      target.dataset.annotationCanonicalCount = String(stats.canonicalCount);
      target.dataset.annotationCandidateCount = String(stats.candidateCount);
      target.dataset.annotationResolvedCount = String(stats.resolvedCount);
      target.dataset.annotationProjectionDurationMs = stats.durationMs.toFixed(2);
      target.dataset.annotationIndexEntriesVisited = String(stats.indexEntriesVisited);
      target.dataset.annotationPinnedInjectedCount = String(stats.pinnedInjectedCount);
    }, timeAxisMetrics);
    const nextCache: AnnotationViewportProjectionCache | undefined = target && projectionViewport ? {
      document,
      projection,
      geometryMaps,
      mapping,
      presentationScale,
      selectedAnnotationId,
      viewport: projectionViewport,
      overlays,
      publishedCacheHits: (cache?.publishedCacheHits ?? 0) + (cache?.cacheHits ?? 0),
      cacheHits: 0,
    } : undefined;
    if (target && nextCache) {
      annotationViewportProjectionCaches.set(target, nextCache);
      target.dataset.annotationProjectionViewportCacheHits = String(nextCache.publishedCacheHits);
    } else if (target) annotationViewportProjectionCaches.delete(target);
  }
  if (!reusable) renderer.updateOverlays(overlays);
  // Scroll changes which Annotation overlays are visible, but not the
  // semantic range, selected cycle/edge, or time-axis geometry that owns Edge
  // Counters. Their dedicated range/selection/geometry refreshes remain the
  // update authority; reprojecting them here repeated work on every scroll.
  if (reason !== "scroll") refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, timeAxisMetrics, range, selectedCycle, presentationScale, selectedEdge, metrics);
  for (const owner of target?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) {
    const selected = String(owner.dataset.annotationId === selectedAnnotationId);
    if (owner.dataset.selected !== selected) owner.dataset.selected = selected;
  }
}

export function refreshRendererForReason(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters"> & Partial<Pick<TimingChartRenderer, "patchOverlays">>, host: RefObject<HTMLDivElement | null>, reason: string, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, timeAxisMetrics: TimeAxisMetrics, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics, viewport?: DisplayTimeViewport, annotationStyleIds?: readonly string[]): void { if (reason === "range") refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, timeAxisMetrics, range, selectedCycle, timeAxisMetrics.presentationScale, selectedEdge, metrics); else refreshRendererOverlays(renderer, host, document, projection, geometryMaps, timeAxisMetrics, range, selectedCycle, selectedAnnotationId, selectedEdge, metrics, viewport, reason, annotationStyleIds); }
