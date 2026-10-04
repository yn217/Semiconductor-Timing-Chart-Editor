type TimelineRange = Readonly<{ start: number; end: number }>;

/** Owns the Cycle-canvas click/shift-click selection state transition. */
export function createCycleCanvasSelectionHandler(input: Readonly<{
  getCycleCount: () => number;
  clearSelectedEdge: () => void;
  setRangeSelectionActive: (active: boolean) => void;
  setSelectedCycle: (cycle: number) => void;
  getTimelineRange: () => TimelineRange;
  setTimelineRange: (range: TimelineRange) => void;
  publishSelection: (cycle: number) => void;
  publishState: () => void;
}>): (cycle: number, shiftKey: boolean) => boolean {
  return (cycle, shiftKey) => {
    const cycleCount = input.getCycleCount();
    if (cycle < 0 || cycle > cycleCount) return false;
    input.clearSelectedEdge();
    input.setRangeSelectionActive(true);
    input.setSelectedCycle(cycle);
    input.publishSelection(cycle);
    if (shiftKey) {
      const anchor = input.getTimelineRange().start;
      input.setTimelineRange({ start: Math.min(anchor, cycle), end: Math.min(cycleCount, Math.max(anchor, cycle) + 1) });
    } else if (cycle === cycleCount) {
      input.setTimelineRange({ start: Math.max(0, cycle - 1), end: cycle });
    } else {
      input.setTimelineRange({ start: cycle, end: cycle + 1 });
    }
    input.publishState();
    return true;
  };
}
