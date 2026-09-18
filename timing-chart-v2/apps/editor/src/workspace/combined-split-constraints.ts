const DEFAULT_MIN_PANE_HEIGHT = 80;
const COMBINED_SPLITTER_HEIGHT = 8;

export interface CombinedSplitConstraints {
  readonly minPaneHeight: number;
  readonly minPercent: number;
  readonly maxPercent: number;
  readonly minRatio: number;
  readonly maxRatio: number;
}

/** Keep both Combined panes reachable while respecting the splitter's 15–85% range. */
export function resolveCombinedSplitConstraints(containerHeight: number): CombinedSplitConstraints {
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) {
    return { minPaneHeight: DEFAULT_MIN_PANE_HEIGHT, minPercent: 15, maxPercent: 85, minRatio: 0.15, maxRatio: 0.85 };
  }

  // If two default minimums do not fit, reduce them evenly instead of letting
  // the parent viewport clip one of the panes.
  const minPaneHeight = Math.min(DEFAULT_MIN_PANE_HEIGHT, Math.max(0, (containerHeight - COMBINED_SPLITTER_HEIGHT) / 2));
  const rawMinRatio = Math.max(0.15, minPaneHeight / containerHeight);
  const rawMaxRatio = Math.min(0.85, (containerHeight - minPaneHeight - COMBINED_SPLITTER_HEIGHT) / containerHeight);
  let minPercent = Math.ceil(rawMinRatio * 100);
  let maxPercent = Math.floor(rawMaxRatio * 100);
  if (minPercent > maxPercent) {
    const nearestFeasiblePercent = Math.round(((rawMinRatio + rawMaxRatio) / 2) * 100);
    minPercent = nearestFeasiblePercent;
    maxPercent = nearestFeasiblePercent;
  }

  return { minPaneHeight, minPercent, maxPercent, minRatio: minPercent / 100, maxRatio: maxPercent / 100 };
}
