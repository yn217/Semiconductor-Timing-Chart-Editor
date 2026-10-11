import { findSourceAnchorGeometry, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping } from "@timing-chart-v2/projection";
import type { SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

export type SourceCycleWindow = Readonly<{ sourceStart: number; sourceEnd: number }>;
export type DisplayCycleWindow = Readonly<{ displayStart: number; displayEnd: number }>;

/** Converts a retained geometry-map key to the shared display-cycle domain. */
export function displayBoundaryForGeometryKey(cycle: number, geometry: Pick<LocalGeometryMap, "cycleKeyDomain">, mapping: DisplayTimeMapping): number | undefined {
  if (geometry.cycleKeyDomain === "display") {
    return Number.isInteger(cycle) && cycle >= 0 && cycle <= mapping.displayCycleCount ? cycle : undefined;
  }
  return cycle === mapping.sourceCycleCount ? mapping.displayCycleCount : mapping.sourceToDisplay(cycle);
}

/** Resolves a canonical source boundary using the geometry map's declared cycle-key domain. */
export function sourceBoundaryGeometryPoint(geometry: LocalGeometryMap, signalId: SignalId, sourceCycle: number, displayCycle: number): { readonly x: number; readonly y: number } | undefined {
  const anchor: SemanticAnchor = { signalId, cycle: sourceCycle, point: "cycle-start" };
  return findSourceAnchorGeometry(geometry, anchor, displayCycle)?.point;
}

export function displayBoundaryForSource(mapping: DisplayTimeMapping, sourceCycle: number, sourceCycleCount: number): number | undefined {
  if (!Number.isInteger(sourceCycle) || sourceCycle < 0 || sourceCycle > sourceCycleCount) return undefined;
  if (sourceCycle === sourceCycleCount) return mapping.displayCycleCount;
  const direct = mapping.sourceToDisplay(sourceCycle);
  if (direct !== undefined) return direct;
  // A folded source cycle has no rendered slot. Resolve the boundary to the
  // next visible display boundary owned by the same shared mapping.
  return mapping.displayBoundaryAtOrAfterSource(sourceCycle);
}

/** Resolve a fold's representative marker onto a boundary that remains visible
 * even when the fold itself is nested inside another collapsed group. */
export function visibleFoldAnchor(mapping: DisplayTimeMapping, start: number, end: number): { readonly sourceCycle: number; readonly displayCycle: number } | undefined {
  const nextDisplay = mapping.displayBoundaryAtOrAfterSource(end);
  const nextSource = nextDisplay < mapping.displayCycleCount ? mapping.displayToSource(nextDisplay) : undefined;
  if (nextSource !== undefined) return { sourceCycle: nextSource, displayCycle: nextDisplay };
  const previousDisplay = mapping.displayBoundaryAtOrAfterSource(start) - 1;
  const previousSource = previousDisplay >= 0 ? mapping.displayToSource(previousDisplay) : undefined;
  return previousSource === undefined ? undefined : { sourceCycle: previousSource, displayCycle: previousDisplay };
}

/** Converts an explicitly source-domain bounded request into the display-domain
 * interval consumed by WaveDrom. The source interval remains authoritative for
 * geometry rebasing and is never silently interpreted as display indices. */
export function displayWindowForSource(mapping: DisplayTimeMapping, window: SourceCycleWindow, sourceCycleCount: number): DisplayCycleWindow | undefined {
  const displayStart = displayBoundaryForSource(mapping, window.sourceStart, sourceCycleCount);
  const displayEnd = displayBoundaryForSource(mapping, window.sourceEnd, sourceCycleCount);
  return displayStart === undefined || displayEnd === undefined || displayEnd <= displayStart ? undefined : { displayStart, displayEnd };
}
