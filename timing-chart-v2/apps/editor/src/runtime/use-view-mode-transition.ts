import { useEffect, useRef, type MutableRefObject } from "react";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";

/**
 * The single owner of what must happen when the View Mode changes.
 *
 * Switching mode is pure React state and never touches the renderer by itself, so the surface
 * has to reconcile explicitly, canonical/history/dirty-neutral:
 * - reproject the upper surface (#613): Cycle and Transaction/Combined request different bounded
 *   source windows, and Transaction defers non-reference waves that must be painted on reveal (#624);
 * - rebuild the ruler (#614): each wave-owner's window/width and the ruler's cached tick positions
 *   must be reconciled together or the grid drifts from the waveform edges.
 * Skips the initial mount, where the surface controller performs its own first projection.
 */
export function useViewModeTransition(
  viewMode: string,
  forceUpperReprojectRef: MutableRefObject<() => void>,
  timelineRuntimeRef: MutableRefObject<TimelineViewportRuntime | null>,
): void {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    forceUpperReprojectRef.current();
    timelineRuntimeRef.current?.refreshRuler();
  }, [viewMode, forceUpperReprojectRef, timelineRuntimeRef]);
}
