import type { ViewMode } from "../workspace/use-workspace-ui-state.js";

export type TimelinePresentationMode = Extract<ViewMode, "Cycle" | "Transaction" | "Split">;

/** Owns each standalone mode's viewport state and Combined's shared source-time viewport state. */
export function createModePresentationOwner(initialZoom = 1) {
  const zoomByMode: Record<TimelinePresentationMode, number> = { Cycle: initialZoom, Transaction: initialZoom, Split: initialZoom };
  const scrollLeftByMode: Record<TimelinePresentationMode, number> = { Cycle: 0, Transaction: 0, Split: 0 };
  return {
    getZoom: (mode: TimelinePresentationMode) => zoomByMode[mode],
    setZoom: (mode: TimelinePresentationMode, zoom: number) => { zoomByMode[mode] = zoom; },
    getScrollLeft: (mode: TimelinePresentationMode) => scrollLeftByMode[mode],
    setScrollLeft: (mode: TimelinePresentationMode, scrollLeft: number) => { scrollLeftByMode[mode] = Math.max(0, scrollLeft); },
    resetScrollLeft: () => { scrollLeftByMode.Cycle = 0; scrollLeftByMode.Transaction = 0; scrollLeftByMode.Split = 0; },
  } as const;
}
