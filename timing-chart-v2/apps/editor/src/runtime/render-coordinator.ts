import { StableTimingChartRenderer, type TimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { RefObject } from "react";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { projectAnnotationOverlays } from "./annotation-overlays.js";
import { projectEdgeCounters, type EdgeCounterProjectionMetrics, type SelectedClockEdge } from "./edge-counter-projection.js";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import { DisplayTimeMappingCache, type RenderProjection } from "@timing-chart-v2/projection";

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

export function refreshRendererEdgeCounters(renderer: Pick<TimingChartRenderer, "updateEdgeCounters">, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, range: { readonly start: number; readonly end: number }, selectedCycle: number, screenGeometryScale: number, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): void { renderer.updateEdgeCounters(projectEdgeCounters(document, projection, geometryMaps, range, selectedCycle, screenGeometryScale, selectedEdge, metrics)); }

export function refreshRendererOverlays(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters">, host: RefObject<HTMLDivElement | null>, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, screenGeometryScale: number, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): void { renderer.updateOverlays(projectAnnotationOverlays(document, projection, geometryMaps, mappingCache.get(document.timeline, document.timeGroups), screenGeometryScale)); refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, range, selectedCycle, screenGeometryScale, selectedEdge, metrics); for (const owner of host.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) owner.dataset.selected = String(owner.dataset.annotationId === selectedAnnotationId); }

export function refreshRendererForReason(renderer: Pick<TimingChartRenderer, "updateOverlays" | "updateEdgeCounters">, host: RefObject<HTMLDivElement | null>, reason: string, document: CanonicalDocument, projection: RenderProjection, geometryMaps: ReadonlyMap<SignalId, LocalGeometryMap>, mappingCache: Pick<DisplayTimeMappingCache, "get">, screenGeometryScale: number, range: { readonly start: number; readonly end: number }, selectedCycle: number, selectedAnnotationId: string | undefined, selectedEdge?: SelectedClockEdge, metrics?: EdgeCounterProjectionMetrics): void { if (reason === "range") refreshRendererEdgeCounters(renderer, document, projection, geometryMaps, range, selectedCycle, screenGeometryScale, selectedEdge, metrics); else refreshRendererOverlays(renderer, host, document, projection, geometryMaps, mappingCache, screenGeometryScale, range, selectedCycle, selectedAnnotationId, selectedEdge, metrics); }
