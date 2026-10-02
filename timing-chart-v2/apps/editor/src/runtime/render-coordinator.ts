import { StableTimingChartRenderer, type TimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { RefObject } from "react";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { projectAnnotationOverlays } from "./annotation-overlays.js";
import type { DisplayTimeViewport } from "@timing-chart-v2/projection";
import { projectEdgeCounters, type EdgeCounterProjectionMetrics, type SelectedClockEdge } from "./edge-counter-projection.js";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { RenderProjection } from "@timing-chart-v2/projection";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

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

export function refreshRendererOverlays(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters">, host: RefObject<HTMLDivElement | null>, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, timeAxisMetrics: TimeAxisMetrics, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics, viewport?: DisplayTimeViewport): void { const overlays = projectAnnotationOverlays(document, projection, geometryMaps, timeAxisMetrics.mapping, timeAxisMetrics.presentationScale, viewport, (stats) => { const target = host.current; if (target) { target.dataset.annotationCanonicalCount = String(stats.canonicalCount); target.dataset.annotationCandidateCount = String(stats.candidateCount); target.dataset.annotationResolvedCount = String(stats.resolvedCount); target.dataset.annotationProjectionDurationMs = stats.durationMs.toFixed(2); target.dataset.annotationIndexEntriesVisited = String(stats.indexEntriesVisited); target.dataset.annotationPinnedInjectedCount = String(stats.pinnedInjectedCount); } }, timeAxisMetrics); renderer.updateOverlays(overlays); refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, timeAxisMetrics, range, selectedCycle, timeAxisMetrics.presentationScale, selectedEdge, metrics); for (const owner of host.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationId); }

export function refreshRendererForReason(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters">, host: RefObject<HTMLDivElement | null>, reason: string, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, timeAxisMetrics: TimeAxisMetrics, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics, viewport?: DisplayTimeViewport): void { if (reason === "range") refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, timeAxisMetrics, range, selectedCycle, timeAxisMetrics.presentationScale, selectedEdge, metrics); else refreshRendererOverlays(renderer, host, document, projection, geometryMaps, timeAxisMetrics, range, selectedCycle, selectedAnnotationId, selectedEdge, metrics, viewport); }
