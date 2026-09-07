import { useEffect } from "react";
import type { TimelineSurfaceRuntimeInput } from "./timeline-surface-controller.js";
import { createSignalSplitSurfaceController } from "./signal-split-surface-controller.js";
export function useSignalSplitSurfaceRuntime(input: TimelineSurfaceRuntimeInput): void {
  const signalSplitEnabled = input.signalSplitEnabled;
  useEffect(() => {
    const controller = createSignalSplitSurfaceController(input);
    return controller.mount();
  }, [signalSplitEnabled]);
}
