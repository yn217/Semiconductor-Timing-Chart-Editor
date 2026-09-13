import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { clampTimelineZoom, type TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { syncRulerScroll } from "./timeline-presentation-refresh.js";

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
    // Scroll width changes are not observable through ResizeObserver on the
    // viewport itself. Notify view-only consumers such as MiniMap after the
    // zoom-owned width write has been applied.
    context.viewport.dispatchEvent(new Event("timeline-viewport-resize"));
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

export function createTimelineZoomController(context: TimelineZoomSurfaceContext): (next: number) => number {
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

export type { TimelineViewportRuntime };
