import { useEffect } from "react";
import { useSignalSplitSurfaceRuntime } from "./use-signal-split-surface-runtime.js";
import { useSignalSplitPresentationSync } from "./use-signal-split-presentation-sync.js";
import { createTimelineSurfaceController, type TimelineSurfaceRuntimeInput, type TimelineSurfaceRuntimeOutput } from "./timeline-surface-controller.js";

export type {
  TimelineSurfaceDomRefs,
  TimelineSurfacePresentationPort,
  TimelineSurfaceStatePort,
  TimelineSurfaceRuntimeInput,
  TimelineSurfaceRuntimeOutput,
} from "./timeline-surface-controller.js";

export function useTimelineSurfaceRuntime(input: TimelineSurfaceRuntimeInput): TimelineSurfaceRuntimeOutput {
  useEffect(() => {
    const controller = createTimelineSurfaceController(input);
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
