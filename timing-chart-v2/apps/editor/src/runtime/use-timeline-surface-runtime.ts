import { useEffect, useRef } from "react";
import { useSignalSplitSurfaceRuntime } from "./use-signal-split-surface-runtime.js";
import { useSignalSplitPresentationSync } from "./use-signal-split-presentation-sync.js";
import { createTimelineSurfaceController, type TimelineSurfaceRuntimeInput, type TimelineSurfaceRuntimeOutput } from "./timeline-surface-controller.js";

export type {
  TimelineSurfaceDomRefs,
  TimelineSurfaceStatePort,
  TimelineSurfaceRuntimeInput,
  TimelineSurfaceRuntimeOutput,
} from "./timeline-surface-controller.js";
export type { TimelineSurfacePresentationPort } from "./timeline-surface-presentation-port.js";

export function useTimelineSurfaceRuntime(input: TimelineSurfaceRuntimeInput): TimelineSurfaceRuntimeOutput {
  // The surface controller intentionally mounts once, but viewMode is live
  // presentation state. Keep the one-time controller from retaining the
  // mode that happened to be active on its first render.
  const viewModeRef = useRef(input.viewMode);
  viewModeRef.current = input.viewMode;

  useEffect(() => {
    const liveInput: TimelineSurfaceRuntimeInput = {
      ...input,
      get viewMode() {
        return viewModeRef.current;
      },
    };
    const controller = createTimelineSurfaceController(liveInput);
    return controller.mount();
  }, []);

  useSignalSplitSurfaceRuntime(input);
  useEffect(() => {
    input.dom.signalSplitRuntimeRef.current?.onViewportResize();
  }, [input.signalSplitRatio]);
  useSignalSplitPresentationSync(input);
  return {
    refreshPlayhead: () => input.presentation.refreshPlayhead.current(),
    refreshRangeSelection: () => input.presentation.refreshRangeSelectionBand.current(),
    forceUpperReproject: () => input.presentation.forceUpperReprojectRef.current(),
    selectCycleFromLowerPane: (event, targetHost, targetViewport) => input.presentation.lowerCanvasClickRef.current(event, targetHost, targetViewport),
    getTransactionSnapCycle: (clientX) => input.presentation.snapTransactionCycle.current(clientX),
    getTransactionBoundaryX: (cycle) => input.presentation.transactionBoundaryX.current(cycle),
    publishRendererState: () => input.presentation.publishStateRef.current(),
  };
}
