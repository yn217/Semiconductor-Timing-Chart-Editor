import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { ViewMetricsOwner } from "./view-metrics.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { createTimelineNavigationController, createTimelineZoomController } from "./viewport-controller.js";

type TimelineRange = Readonly<{ start: number; end: number }>;

export type TimelineNavigationAttachment = Readonly<{
  runtime: TimelineViewportRuntime;
  rendererHost: HTMLElement;
  timingSurface: HTMLElement;
  viewport: HTMLElement;
  ruler: HTMLElement;
  scalable: readonly HTMLElement[];
  rulerViewport: HTMLElement;
  viewMetrics: ViewMetricsOwner;
  timelineOffset: () => number;
  getPresentationScale: () => number;
  syncPresentationScale: (viewport: HTMLElement, host: HTMLElement, rulerViewport: HTMLElement, zoom: number, presentationScale: number) => void;
  getDocument: () => CanonicalDocument;
  getRange: () => TimelineRange;
  setSelectedCycle: (cycle: number) => void;
  setRange: (range: TimelineRange) => void;
  publishState: () => void;
}>;

export type TimelineNavigationOwner = Readonly<{
  zoom: number;
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  zoomBy: (delta: number) => void;
  fitSelection: () => void;
  fitAll: () => void;
  navigateToCycle: (cycle: number) => void;
  attach: (context: TimelineNavigationAttachment) => () => void;
}>;

export function useTimelineNavigationOwner(viewMode: "Cycle" | "Transaction" | "Split" = "Cycle"): TimelineNavigationOwner {
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const zoomByModeRef = useRef<Record<"Cycle" | "Transaction", number>>({ Cycle: 1, Transaction: 1 });
  const previousModeRef = useRef<"Cycle" | "Transaction" | "Split">(viewMode);
  const activeModeRef = useRef(viewMode);
  activeModeRef.current = viewMode;
  const zoomStateFrameRef = useRef<number | undefined>(undefined);
  const applyZoomRef = useRef<(zoom: number) => void>(() => undefined);
  const fitSelectionRef = useRef<() => void>(() => undefined);
  const fitAllRef = useRef<() => void>(() => undefined);
  const navigateToCycleRef = useRef<(cycle: number) => void>(() => undefined);

  useEffect(() => () => {
    if (zoomStateFrameRef.current !== undefined) cancelAnimationFrame(zoomStateFrameRef.current);
  }, []);

  useEffect(() => {
    const previous = previousModeRef.current;
    if (previous !== viewMode) {
      if (previous === "Cycle" || previous === "Transaction") zoomByModeRef.current[previous] = zoomRef.current;
      if (viewMode === "Cycle" || viewMode === "Transaction") {
        const next = zoomByModeRef.current[viewMode];
        zoomRef.current = next;
        setZoomState(next);
        applyZoomRef.current(next);
      }
      previousModeRef.current = viewMode;
    }
  }, [viewMode]);

  return useMemo(() => ({
    zoom,
    getZoom: () => zoomRef.current,
    setZoom: (next) => applyZoomRef.current(next),
    zoomBy: (delta) => applyZoomRef.current(zoomRef.current + delta),
    fitSelection: () => fitSelectionRef.current(),
    fitAll: () => fitAllRef.current(),
    navigateToCycle: (cycle) => navigateToCycleRef.current(cycle),
    attach: (context) => {
      const applyZoom = createTimelineZoomController({
        rendererHost: context.rendererHost,
        timingSurface: context.timingSurface,
        viewport: context.viewport,
        ruler: context.ruler,
        scalable: context.scalable,
        leftPaneWidth: context.viewMetrics.snapshot().leftPaneWidth,
        frozenPaneWidth: context.viewMetrics.snapshot().frozenPaneWidth,
        inspectorWidth: context.viewMetrics.snapshot().inspectorWidth,
        viewportWidth: globalThis.innerWidth,
        timelineOffset: context.timelineOffset(),
        onPresentationScale: (nextZoom) => context.syncPresentationScale(context.viewport, context.rendererHost, context.rulerViewport, nextZoom, context.getPresentationScale()),
        onZoom: (nextZoom) => {
          zoomRef.current = nextZoom;
          const activeMode = activeModeRef.current;
          if (activeMode === "Cycle" || activeMode === "Transaction") zoomByModeRef.current[activeMode] = nextZoom;
          context.viewMetrics.update({ zoom: nextZoom, viewportWidth: context.viewport.clientWidth });
          // The DOM presentation is already updated synchronously by the
          // zoom controller. Defer the non-critical React status/ribbon state
          // to the next frame so large documents can paint the interaction
          // before rebuilding the owner tree.
          if (zoomStateFrameRef.current !== undefined) cancelAnimationFrame(zoomStateFrameRef.current);
          zoomStateFrameRef.current = requestAnimationFrame(() => {
            zoomStateFrameRef.current = undefined;
            startTransition(() => setZoomState(nextZoom));
          });
        },
      });
      applyZoomRef.current = (next) => { zoomRef.current = applyZoom(next); };

      const navigation = createTimelineNavigationController({
        runtime: context.runtime,
        getDocument: context.getDocument,
        getRange: context.getRange,
        setSelectedCycle: context.setSelectedCycle,
        setRange: context.setRange,
        host: context.rendererHost,
        publishState: context.publishState,
      });
      fitSelectionRef.current = navigation.fitSelection;
      fitAllRef.current = navigation.fitAll;
      navigateToCycleRef.current = navigation.navigateToCycle;

      return () => {
        applyZoomRef.current = () => undefined;
        fitSelectionRef.current = () => undefined;
        fitAllRef.current = () => undefined;
        navigateToCycleRef.current = () => undefined;
      };
    },
  }), [zoom]);
}
