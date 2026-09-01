import { startTransition, useMemo, useRef, useState } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { ViewMetricsOwner } from "./view-metrics.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { createTimelineNavigationController, createTimelineZoomController } from "./use-editor-runtime-bridge.js";

type TimelineRange = Readonly<{ start: number; end: number }>;

export type TimelineNavigationAttachment = Readonly<{
  runtime: TimelineViewportRuntime;
  rendererHost: HTMLElement;
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

export function useTimelineNavigationOwner(): TimelineNavigationOwner {
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const applyZoomRef = useRef<(zoom: number) => void>(() => undefined);
  const fitSelectionRef = useRef<() => void>(() => undefined);
  const fitAllRef = useRef<() => void>(() => undefined);
  const navigateToCycleRef = useRef<(cycle: number) => void>(() => undefined);

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
          context.viewMetrics.update({ zoom: nextZoom, viewportWidth: context.viewport.clientWidth });
          startTransition(() => setZoomState(nextZoom));
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
