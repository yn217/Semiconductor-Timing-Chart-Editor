import type { DisplayTimeMapping } from "@timing-chart-v2/projection";

export type SourceCycleWindow = Readonly<{ sourceStart: number; sourceEnd: number }>;
export type DisplayCycleWindow = Readonly<{ displayStart: number; displayEnd: number }>;

export function displayBoundaryForSource(mapping: DisplayTimeMapping, sourceCycle: number, sourceCycleCount: number): number | undefined {
  if (!Number.isInteger(sourceCycle) || sourceCycle < 0 || sourceCycle > sourceCycleCount) return undefined;
  if (sourceCycle === sourceCycleCount) return mapping.displayCycleCount;
  const direct = mapping.sourceToDisplay(sourceCycle);
  if (direct !== undefined) return direct;
  // A folded source cycle has no rendered slot. Resolve the boundary to the
  // next visible display boundary owned by the same shared mapping.
  return mapping.displayBoundaryAtOrAfterSource(sourceCycle);
}

/** Converts an explicitly source-domain bounded request into the display-domain
 * interval consumed by WaveDrom. The source interval remains authoritative for
 * geometry rebasing and is never silently interpreted as display indices. */
export function displayWindowForSource(mapping: DisplayTimeMapping, window: SourceCycleWindow, sourceCycleCount: number): DisplayCycleWindow | undefined {
  const displayStart = displayBoundaryForSource(mapping, window.sourceStart, sourceCycleCount);
  const displayEnd = displayBoundaryForSource(mapping, window.sourceEnd, sourceCycleCount);
  return displayStart === undefined || displayEnd === undefined || displayEnd <= displayStart ? undefined : { displayStart, displayEnd };
}
