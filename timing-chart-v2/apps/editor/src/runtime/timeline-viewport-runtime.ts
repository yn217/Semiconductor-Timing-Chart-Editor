import type { RefObject } from "react";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

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
    readonly getTimeAxisMetrics: () => Pick<TimeAxisMetrics, "zoom" | "localXToSourceBoundary">;
    readonly getTimeAxisGeometry: () => unknown;
    readonly getLocalGeometryMap: () => unknown;
    readonly sourceCycleToLocalX: (cycle: number) => number | undefined;
    readonly sourceBoundaryToLocalX: (document: unknown, cycle: number) => number | undefined;
    readonly requestSourceCycle: (cycle: number) => void;
    readonly clearRequestedSourceCycle: () => void;
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
    readonly getDocumentEpoch: () => number;
  };
  readonly render: {
    readonly requestRender: (reason: string) => void;
    readonly requestOverlayRefresh: (reason: string) => void;
    readonly waitForRendererIdle: () => Promise<void>;
  };
  readonly lifecycle: {
    readonly isCurrentEpoch: (epoch: number) => boolean;
  };
};

export type TimelineViewportRuntime = Readonly<{
  attach: () => void;
  detach: () => void;
  dispose: () => void;
  onDocumentEpochChanged: (epoch: number) => void;
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
  refreshOverlays: (reason?: string) => void;
  onViewportScroll: () => void;
  onViewportResize: () => void;
}>;

export const MIN_TIMELINE_ZOOM = 0.5;
export const MAX_TIMELINE_ZOOM = 8;

export function clampTimelineZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_TIMELINE_ZOOM;
  return Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, Math.round(zoom * 100) / 100));
}

export function createTimelineViewportRuntime(context: TimelineViewportRuntimeContext): TimelineViewportRuntime {
  let attached = false;
  let disposed = false;
  let documentEpoch = context.document.getDocumentEpoch();
  let resizeObserver: ResizeObserver | undefined;
  let zoomPresentationApplied = false;

  const assertActive = () => {
    if (disposed) throw new Error("TimelineViewportRuntime is disposed");
  };
  const render = (reason: string) => {
    assertActive();
    if (!attached) return;
    if (!context.lifecycle.isCurrentEpoch(documentEpoch)) return;
    context.render.requestRender(reason);
  };
  const fit = (startLocalX: number, endLocalX: number) => {
    const span = Math.max(1, endLocalX - startLocalX);
    const available = Math.max(160, context.viewport.getMetrics().width - context.viewport.getMetrics().leftInset - 20);
    return clampTimelineZoom(available / span);
  };

  return {
    attach: () => {
      assertActive();
      if (attached) return;
      attached = true;
      const viewport = context.dom.viewportRef.current;
      if (viewport && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          if (attached) render("resize");
        });
        resizeObserver.observe(viewport);
      }
    },
    detach: () => { resizeObserver?.disconnect(); resizeObserver = undefined; attached = false; },
    dispose: () => { resizeObserver?.disconnect(); resizeObserver = undefined; attached = false; disposed = true; },
    onDocumentEpochChanged: (epoch) => { assertActive(); documentEpoch = epoch; },
    zoomIn: () => { assertActive(); if (!attached) return; context.viewport.setZoom(clampTimelineZoom(context.viewport.getZoom() + 0.1)); render("zoom-in"); },
    zoomOut: () => { assertActive(); if (!attached) return; context.viewport.setZoom(clampTimelineZoom(context.viewport.getZoom() - 0.1)); render("zoom-out"); },
    setZoom: (zoom) => {
      assertActive();
      if (!attached) return;
      const nextZoom = clampTimelineZoom(zoom);
      // Accepted semantic commands call this synchronizer after the renderer
      // becomes idle. Once the initial presentation is applied, reapplying
      // the same zoom only schedules another scroll-layout/render pass (most
      // notably on Inspector property commits) without changing the view.
      if (zoomPresentationApplied && context.viewport.getZoom() === nextZoom && context.geometry.getTimeAxisMetrics().zoom === nextZoom) return;
      zoomPresentationApplied = true;
      context.viewport.setZoom(nextZoom);
      render("zoom");
    },
    fitAll: (contentWidth) => { assertActive(); if (!attached) return; context.viewport.setZoom(fit(0, contentWidth)); context.viewport.setScrollState({ left: 0 }); render("fit-all"); },
    fitSelection: (startLocalX, endLocalX) => {
      assertActive();
      if (!attached || !Number.isFinite(startLocalX) || !Number.isFinite(endLocalX) || endLocalX <= startLocalX) return;
      const metrics = context.viewport.getMetrics();
      const available = Math.max(160, metrics.width - metrics.leftInset - 20);
      const zoom = fit(startLocalX, endLocalX);
      const selectionWidth = (endLocalX - startLocalX) * zoom;
      const centeringOffset = Math.max(0, (available - selectionWidth) / 2);
      // startLocalX is measured from the time-domain origin. scrollLeft is
      // measured from the viewport's full surface origin, so the time-domain
      // inset must not be subtracted a second time here.
      const scrollLeft = Math.max(0, Math.round(startLocalX * zoom - centeringOffset));
      context.viewport.setZoom(zoom);
      const applyScroll = () => {
        if (!attached) return;
        context.viewport.setScrollState({ left: scrollLeft });
        render("fit-selection");
      };
      // Zoom presentation updates the scrollable surface on the next frame.
      // Apply the target scroll after that layout pass so the browser does not
      // clamp it against the previous (smaller) scrollWidth.
      if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(applyScroll);
      else applyScroll();
    },
    navigateToCycle: (cycle) => {
      assertActive();
      if (!attached) return;
      const requestEpoch = documentEpoch;
      const document = context.document.getSnapshot();
      let retries = 0;
      const maxRetries = 8;
      const isRequestCurrent = () => attached
        && !disposed
        && documentEpoch === requestEpoch
        && context.lifecycle.isCurrentEpoch(requestEpoch);
      const move = () => {
        // Renderer-idle callbacks can outlive the document that initiated a
        // Bookmark reveal. Never apply an old source-cycle target to a newly
        // opened/replaced document.
        if (!isRequestCurrent()) return;
        const localX = context.geometry.sourceBoundaryToLocalX(document, cycle);
        if (localX === undefined) {
          if (retries++ >= maxRetries) return;
          context.geometry.requestSourceCycle(cycle);
          render("navigate-cycle-retry");
          const retry = () => { if (isRequestCurrent()) void context.render.waitForRendererIdle().then(move); };
          if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(retry);
          else globalThis.setTimeout(retry, 0);
          return;
        }
        const { zoom } = context.geometry.getTimeAxisMetrics();
        context.viewport.setScrollState({ left: Math.max(0, Math.round(context.geometry.localXToScreenX(localX) * zoom - context.viewport.getMetrics().width * 0.35)) });
        context.geometry.clearRequestedSourceCycle();
        render("navigate-cycle");
      };
      if (context.geometry.sourceBoundaryToLocalX(document, cycle) !== undefined) { move(); return; }
      context.geometry.requestSourceCycle(cycle);
      render("navigate-cycle");
      void context.render.waitForRendererIdle().then(move);
    },
    sourceBoundaryToLocalX: (document, cycle) => { assertActive(); return context.geometry.sourceBoundaryToLocalX(document, cycle); },
    screenXToSourceCycle: (screenX) => { assertActive(); const metrics = context.geometry.getTimeAxisMetrics(); if (!Number.isFinite(metrics.zoom) || metrics.zoom <= 0) return undefined; return metrics.localXToSourceBoundary(screenX / metrics.zoom); },
    refreshRuler: () => { render("ruler"); },
    refreshGrid: () => { render("grid"); },
    refreshPlayhead: () => { render("playhead"); },
    refreshRange: () => { render("range"); if (attached && context.lifecycle.isCurrentEpoch(documentEpoch)) context.render.requestOverlayRefresh("range"); },
    refreshOverlays: (reason = "overlays") => { assertActive(); if (!attached || !context.lifecycle.isCurrentEpoch(documentEpoch)) return; context.render.requestOverlayRefresh(reason); },
    onViewportScroll: () => { assertActive(); if (!attached || !context.lifecycle.isCurrentEpoch(documentEpoch)) return; context.render.requestRender("scroll"); },
    onViewportResize: () => { render("resize"); },
  };
}
