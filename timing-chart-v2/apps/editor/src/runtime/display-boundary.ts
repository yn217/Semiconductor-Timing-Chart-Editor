import type { DisplayTimeMapping } from "@timing-chart-v2/projection";

export type SourceCycleWindow = Readonly<{ sourceStart: number; sourceEnd: number }>;
export type DisplayCycleWindow = Readonly<{ displayStart: number; displayEnd: number }>;

// #862: "next visible display boundary at or after a source cycle", built once per mapping instead of walking folded holes per lookup.
const nextVisibleByMapping = new WeakMap<DisplayTimeMapping, Int32Array>();
function nextVisibleDisplay(mapping: DisplayTimeMapping, sourceCycleCount: number): Int32Array {
  let next = nextVisibleByMapping.get(mapping);
  if (next && next.length === sourceCycleCount + 1) return next;
  next = new Int32Array(sourceCycleCount + 1).fill(-1);
  let following = -1;
  for (let source = sourceCycleCount - 1; source >= 0; source -= 1) {
    const display = mapping.sourceToDisplay[source];
    if (display !== undefined) following = display;
    next[source] = following;
  }
  nextVisibleByMapping.set(mapping, next);
  return next;
}

export function displayBoundaryForSource(mapping: DisplayTimeMapping, sourceCycle: number, sourceCycleCount: number): number | undefined {
  if (!Number.isInteger(sourceCycle) || sourceCycle < 0 || sourceCycle > sourceCycleCount) return undefined;
  if (sourceCycle === sourceCycleCount) return mapping.displayCycleCount;
  const direct = mapping.sourceToDisplay[sourceCycle];
  if (direct !== undefined) return direct;
  // A folded source cycle has no rendered slot. Resolve the boundary to the
  // next visible display boundary owned by the same shared mapping.
  const next = nextVisibleDisplay(mapping, sourceCycleCount)[sourceCycle]!;
  return next < 0 ? mapping.displayCycleCount : next;
}

/** Converts an explicitly source-domain bounded request into the display-domain
 * interval consumed by WaveDrom. The source interval remains authoritative for
 * geometry rebasing and is never silently interpreted as display indices. */
export function displayWindowForSource(mapping: DisplayTimeMapping, window: SourceCycleWindow, sourceCycleCount: number): DisplayCycleWindow | undefined {
  const displayStart = displayBoundaryForSource(mapping, window.sourceStart, sourceCycleCount);
  const displayEnd = displayBoundaryForSource(mapping, window.sourceEnd, sourceCycleCount);
  return displayStart === undefined || displayEnd === undefined || displayEnd <= displayStart ? undefined : { displayStart, displayEnd };
}
