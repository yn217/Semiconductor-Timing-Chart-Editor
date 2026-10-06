import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { ViewMetricsOwner } from "./view-metrics.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { createTimelineNavigationController, createTimelineZoomController } from "./viewport-controller.js";
import { timelineScrollOwner } from "./timeline-scroll-owner.js";
import { createModePresentationOwner } from "./mode-presentation-owner.js";

type TimelineRange = Readonly<{ start: number; end: number }>;

export type TimelineNavigationAttachment = Readonly<{
  runtime: TimelineViewportRuntime;
  rendererHost: HTMLElement;
  timingSurface: HTMLElement;
  viewport: HTMLElement;
  ruler: HTMLElement;
  scalable: readonly HTMLElement[];
  extraScalable?: () => readonly HTMLElement[];
  rulerViewport: HTMLElement;
  viewMetrics: ViewMetricsOwner;
  timelineOffset: () => number;
  getPresentationScale: () => number;
  syncPresentationScale: (host: HTMLElement, zoom: number, presentationScale: number) => void;
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
  fitSourceRange: (startCycle: number, endCycle: number) => boolean;
  fitAll: () => void;
  navigateToCycle: (cycle: number) => void;
  attach: (context: TimelineNavigationAttachment) => () => void;
}>;

export function useTimelineNavigationOwner(viewMode: "Cycle" | "Transaction" | "Split" = "Cycle", documentEpoch = 0): TimelineNavigationOwner {
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const modePresentationRef = useRef(createModePresentationOwner());
  const scrollRestorePendingRef = useRef(false);
  const restoreScrollLeftRef = useRef<(scrollLeft: number) => void>(() => undefined);
  const previousModeRef = useRef<"Cycle" | "Transaction" | "Split">(viewMode);
  const activeModeRef = useRef(viewMode);
  activeModeRef.current = viewMode;
  const cancelZoomStateRef = useRef<(() => void) | undefined>(undefined);
  const scrollRestoreFrameRef = useRef<number | undefined>(undefined);
  const applyZoomRef = useRef<(zoom: number) => void>(() => undefined);
  const fitSelectionRef = useRef<() => void>(() => undefined);
  const fitSourceRangeRef = useRef<(startCycle: number, endCycle: number) => boolean>(() => false);
  const fitAllRef = useRef<() => void>(() => undefined);
  const navigateToCycleRef = useRef<(cycle: number) => void>(() => undefined);

  useEffect(() => () => {
    cancelZoomStateRef.current?.();
    if (scrollRestoreFrameRef.current !== undefined) cancelAnimationFrame(scrollRestoreFrameRef.current);
  }, []);

  useEffect(() => {
    modePresentationRef.current.resetScrollLeft();
  }, [documentEpoch]);

  useEffect(() => {
    const previous = previousModeRef.current;
    if (previous !== viewMode) {
      modePresentationRef.current.setZoom(previous, zoomRef.current);
      const next = modePresentationRef.current.getZoom(viewMode);
      zoomRef.current = next;
      setZoomState(next);
      applyZoomRef.current(next);
      if (scrollRestoreFrameRef.current !== undefined) cancelAnimationFrame(scrollRestoreFrameRef.current);
      scrollRestorePendingRef.current = true;
      const restore = () => {
        scrollRestoreFrameRef.current = undefined;
        if (activeModeRef.current === viewMode) restoreScrollLeftRef.current(modePresentationRef.current.getScrollLeft(viewMode));
        scrollRestorePendingRef.current = false;
      };
      // Apply after the mode's scroll extent and inner/outer owner are committed;
      // Cycle uses its nested TimelineViewport while Transaction and Combined
      // use the outer viewport.
      if (typeof requestAnimationFrame === "function") scrollRestoreFrameRef.current = requestAnimationFrame(restore);
      else restore();
      previousModeRef.current = viewMode;
    }
  }, [viewMode]);

  return useMemo(() => ({
    zoom,
    getZoom: () => zoomRef.current,
    setZoom: (next) => applyZoomRef.current(next),
    zoomBy: (delta) => applyZoomRef.current(zoomRef.current + delta),
    fitSelection: () => fitSelectionRef.current(),
    fitSourceRange: (startCycle, endCycle) => fitSourceRangeRef.current(startCycle, endCycle),
    fitAll: () => fitAllRef.current(),
    navigateToCycle: (cycle) => navigateToCycleRef.current(cycle),
    attach: (context) => {
      const activeScrollOwner = () => timelineScrollOwner(context.viewport);
      const rememberScrollLeft = () => {
        // A mode's zoom/layout restoration can emit intermediate scroll events.
        // They are presentation artifacts, not the user's saved position.
        if (scrollRestorePendingRef.current || activeModeRef.current !== previousModeRef.current) return;
        modePresentationRef.current.setScrollLeft(activeModeRef.current, activeScrollOwner().scrollLeft);
      };
      restoreScrollLeftRef.current = (scrollLeft) => {
        const owner = activeScrollOwner();
        // In Cycle, the shell viewport is only a clipping/layout wrapper. A
        // stale standalone Transaction/Combined offset on it would shift the
        // fixed Signal/Role columns even though Cycle's inner owner is restored.
        if (owner !== context.viewport) context.viewport.scrollLeft = 0;
        owner.scrollLeft = Math.max(0, scrollLeft);
        modePresentationRef.current.setScrollLeft(activeModeRef.current, owner.scrollLeft);
      };
      modePresentationRef.current.setScrollLeft(activeModeRef.current, activeScrollOwner().scrollLeft);
      // Scroll events from Cycle's nested owner are observed in capture phase;
      // the active mode selects which presentation state receives the value.
      context.viewport.addEventListener("scroll", rememberScrollLeft, { capture: true, passive: true });
      const applyZoom = createTimelineZoomController({
        rendererHost: context.rendererHost,
        timingSurface: context.timingSurface,
        viewport: context.viewport,
        ruler: context.ruler,
        scalable: context.scalable,
        ...(context.extraScalable ? { extraScalable: context.extraScalable } : {}),
        leftPaneWidth: context.viewMetrics.snapshot().leftPaneWidth,
        frozenPaneWidth: context.viewMetrics.snapshot().frozenPaneWidth,
        inspectorWidth: context.viewMetrics.snapshot().inspectorWidth,
        viewportWidth: globalThis.innerWidth,
        timelineOffset: context.timelineOffset(),
        presentationBaseWidth: () => {
          if (activeModeRef.current !== "Transaction") return undefined;
          const wave = Number.parseFloat(context.viewport.style.getPropertyValue("--wave-width"));
          return Number.isFinite(wave) && wave > 0 ? wave : undefined;
        },
        onPresentationScale: (nextZoom) => context.syncPresentationScale(context.rendererHost, nextZoom, context.getPresentationScale()),
        onZoom: (nextZoom) => {
          zoomRef.current = nextZoom;
          const activeMode = activeModeRef.current;
          modePresentationRef.current.setZoom(activeMode, nextZoom);
          context.viewMetrics.update({ zoom: nextZoom, viewportWidth: context.viewport.clientWidth });
          // The zoom controller publishes the DOM presentation in the next
          // frame. Defer the non-critical React status/ribbon state until
          // after that frame has painted (#175: a frame callback queued from
          // the same input would run in the zoom frame itself), so large
          // documents paint the interaction before rebuilding the owner tree.
          cancelZoomStateRef.current?.();
          let timer: ReturnType<typeof setTimeout> | undefined;
          const frame = requestAnimationFrame(() => {
            timer = setTimeout(() => {
              cancelZoomStateRef.current = undefined;
              startTransition(() => setZoomState(nextZoom));
            }, 0);
          });
          cancelZoomStateRef.current = () => { cancelAnimationFrame(frame); if (timer !== undefined) clearTimeout(timer); };
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
      fitSourceRangeRef.current = navigation.fitSourceRange;
      fitAllRef.current = navigation.fitAll;
      navigateToCycleRef.current = navigation.navigateToCycle;

      return () => {
        context.viewport.removeEventListener("scroll", rememberScrollLeft, true);
        scrollRestorePendingRef.current = false;
        restoreScrollLeftRef.current = () => undefined;
        applyZoomRef.current = () => undefined;
        fitSelectionRef.current = () => undefined;
        fitSourceRangeRef.current = () => false;
        fitAllRef.current = () => undefined;
        navigateToCycleRef.current = () => undefined;
      };
    },
  }), [zoom]);
}
