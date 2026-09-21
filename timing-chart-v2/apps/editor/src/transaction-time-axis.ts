/**
 * #750 slice 1: the Transaction display-time geometry owner (pure, no DOM).
 *
 *   displayTc = sourceCycle / cyclesPerTC
 *   localX    = origin + displayTc * pxPerTc * zoom
 *
 * cyclesPerTC is a horizontal display-time COMPRESSION factor for standalone Transaction Mode: 1 TC occupies `pxPerTc` at zoom 1, so a
 * long Transaction becomes physically shorter as cyclesPerTC grows. Canonical time stays whole source cycles; Cycle Mode and Combined
 * (one shared source-time axis) do not use this mapper. Ruler, grid, bars, Phase boundaries, Bookmark/Event/Annotation X, Cursor/Range,
 * scroll extent and MiniMap are to consume it in the following slices; the inverse serves hit-test, drag and snap.
 */
export interface TransactionTimeAxis {
  readonly cyclesPerTc: number;
  readonly pxPerTc: number;
  readonly zoom: number;
  readonly origin: number;
  /** Source cycle (may be fractional) -> local X. */
  readonly cycleToX: (cycle: number) => number;
  /** Local X -> source cycle (fractional). */
  readonly xToCycle: (x: number) => number;
  /** Local X -> nearest whole source cycle (drag / snap target), clamped to [0, cycleCount]. */
  readonly xToNearestCycle: (x: number, cycleCount: number) => number;
  /** Total content width for `cycleCount` source cycles (scroll extent). */
  readonly extent: (cycleCount: number) => number;
  /** Pixels one source cycle occupies (`pxPerTc * zoom / cyclesPerTc`). */
  readonly pxPerCycle: number;
}

export function createTransactionTimeAxis(input: { readonly cyclesPerTc: number; readonly pxPerTc: number; readonly zoom: number; readonly origin?: number }): TransactionTimeAxis {
  const cyclesPerTc = Number.isFinite(input.cyclesPerTc) && input.cyclesPerTc > 0 ? input.cyclesPerTc : 1;
  const pxPerTc = Number.isFinite(input.pxPerTc) && input.pxPerTc > 0 ? input.pxPerTc : 1;
  const zoom = Number.isFinite(input.zoom) && input.zoom > 0 ? input.zoom : 1;
  const origin = input.origin ?? 0;
  const pxPerCycle = (pxPerTc * zoom) / cyclesPerTc;
  const cycleToX = (cycle: number) => origin + (cycle / cyclesPerTc) * pxPerTc * zoom;
  const xToCycle = (x: number) => ((x - origin) / (pxPerTc * zoom)) * cyclesPerTc;
  return {
    cyclesPerTc, pxPerTc, zoom, origin, pxPerCycle, cycleToX, xToCycle,
    xToNearestCycle: (x, cycleCount) => Math.max(0, Math.min(cycleCount, Math.round(xToCycle(x)))),
    extent: (cycleCount) => origin + cycleToX(cycleCount) - origin,
  };
}
