import type { RefObject } from "react";

export type TimelineViewportRuntimeContext = {
  readonly dom: {
    readonly viewportRef: RefObject<HTMLElement | null>;
    readonly waveformRef: RefObject<HTMLElement | null>;
    readonly rulerRef: RefObject<HTMLElement | null>;
    readonly gridRef: RefObject<HTMLElement | null>;
    readonly overlayRef: RefObject<HTMLElement | null>;
    readonly rangeBandRef: RefObject<HTMLElement | null>;
    readonly playheadRef: RefObject<HTMLElement | null>;
  };
  readonly geometry: {
    readonly getDisplayTimeMapping: () => unknown;
    readonly getTimeAxisGeometry: () => unknown;
    readonly getLocalGeometryMap: () => unknown;
    readonly sourceCycleToLocalX: (cycle: number) => number | undefined;
    readonly sourceBoundaryToLocalX: (document: unknown, cycle: number) => number | undefined;
    readonly localXToScreenX: (localX: number) => number;
  };
  readonly viewport: {
    readonly getMetrics: () => Readonly<{ width: number; leftInset: number }>;
    readonly getScrollState: () => Readonly<{ left: number; top: number }>;
    readonly setScrollState: (state: Readonly<{ left?: number; top?: number }>) => void;
    readonly getZoom: () => number;
    readonly setZoom: (zoom: number) => void;
  };
  readonly document: {
    readonly getSnapshot: () => unknown;
    readonly getCanonicalRevision: () => number;
    readonly getDocumentEpoch: () => unknown;
  };
  readonly render: {
    readonly requestRender: (reason: string) => void;
    readonly requestOverlayRefresh: (reason: string) => void;
    readonly waitForRendererIdle: () => Promise<void>;
  };
  readonly lifecycle: {
    readonly isCurrentEpoch: (epoch: unknown) => boolean;
  };
};

export type TimelineViewportRuntime = Readonly<{
  attach: () => void;
  detach: () => void;
  dispose: () => void;
  onDocumentEpochChanged: (epoch: unknown) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (zoom: number) => void;
  fitAll: (contentWidth: number) => void;
  fitSelection: (startLocalX: number, endLocalX: number) => void;
  navigateToCycle: (cycle: number) => void;
  screenXToSourceCycle: (screenX: number) => number | undefined;
  sourceBoundaryToLocalX: (document: unknown, cycle: number) => number | undefined;
  refreshRuler: () => void;
  refreshGrid: () => void;
  refreshPlayhead: () => void;
  refreshRange: (start: number, end: number) => void;
  onViewportScroll: () => void;
  onViewportResize: () => void;
}>;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom * 100) / 100));
}

export function createTimelineViewportRuntime(context: TimelineViewportRuntimeContext): TimelineViewportRuntime {
  let attached = false;
  let disposed = false;
  let documentEpoch: unknown = context.document.getDocumentEpoch();

  const assertActive = () => {
    if (disposed) throw new Error("TimelineViewportRuntime is disposed");
  };
  const render = (reason: string) => {
    assertActive();
    if (!context.lifecycle.isCurrentEpoch(documentEpoch)) return;
    context.render.requestRender(reason);
  };
  const fit = (startLocalX: number, endLocalX: number) => {
    const span = Math.max(1, endLocalX - startLocalX);
    const available = Math.max(160, context.viewport.getMetrics().width - context.viewport.getMetrics().leftInset - 20);
    return clampZoom(available / span);
  };

  return {
    attach: () => { assertActive(); attached = true; },
    detach: () => { attached = false; },
    dispose: () => { attached = false; disposed = true; },
    onDocumentEpochChanged: (epoch) => { assertActive(); documentEpoch = epoch; },
    zoomIn: () => { assertActive(); context.viewport.setZoom(clampZoom(context.viewport.getZoom() + 0.1)); render("zoom-in"); },
    zoomOut: () => { assertActive(); context.viewport.setZoom(clampZoom(context.viewport.getZoom() - 0.1)); render("zoom-out"); },
    setZoom: (zoom) => { assertActive(); context.viewport.setZoom(clampZoom(zoom)); render("zoom"); },
    fitAll: (contentWidth) => { assertActive(); context.viewport.setZoom(fit(0, contentWidth)); context.viewport.setScrollState({ left: 0 }); render("fit-all"); },
    fitSelection: (startLocalX, endLocalX) => { assertActive(); const zoom = fit(startLocalX, endLocalX); context.viewport.setZoom(zoom); context.viewport.setScrollState({ left: Math.max(0, Math.round(startLocalX * zoom - context.viewport.getMetrics().leftInset)) }); render("fit-selection"); },
    navigateToCycle: (cycle) => { assertActive(); const localX = context.geometry.sourceBoundaryToLocalX(context.document.getSnapshot(), cycle); if (localX === undefined) return; context.viewport.setScrollState({ left: Math.max(0, Math.round(context.geometry.localXToScreenX(localX) * context.viewport.getZoom() - context.viewport.getMetrics().width * 0.35)) }); render("navigate-cycle"); },
    sourceBoundaryToLocalX: (document, cycle) => { assertActive(); return context.geometry.sourceBoundaryToLocalX(document, cycle); },
    screenXToSourceCycle: (screenX) => { assertActive(); const zoom = context.viewport.getZoom(); if (!Number.isFinite(zoom) || zoom <= 0) return undefined; const localX = screenX / zoom; const mapping = context.geometry.getDisplayTimeMapping(); return typeof mapping === "object" && mapping !== null && "displayToSourceCycle" in mapping && typeof mapping.displayToSourceCycle === "function" ? (mapping.displayToSourceCycle as (x: number) => number | undefined)(localX) : undefined; },
    refreshRuler: () => { render("ruler"); },
    refreshGrid: () => { render("grid"); },
    refreshPlayhead: () => { render("playhead"); },
    refreshRange: () => { render("range"); context.render.requestOverlayRefresh("range"); },
    onViewportScroll: () => { assertActive(); if (!context.lifecycle.isCurrentEpoch(documentEpoch)) return; context.render.requestRender("scroll"); },
    onViewportResize: () => { render("resize"); },
  };
}
