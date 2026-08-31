import type { DisplayTimeMapping } from "@timing-chart-v2/projection";

export function displayBoundaryForSource(mapping: DisplayTimeMapping, sourceCycle: number, sourceCycleCount: number): number | undefined {
  if (!Number.isInteger(sourceCycle) || sourceCycle < 0 || sourceCycle > sourceCycleCount) return undefined;
  if (sourceCycle === sourceCycleCount) return mapping.displayCycleCount;
  const direct = mapping.sourceToDisplay[sourceCycle];
  if (direct !== undefined) return direct;
  // A folded source cycle has no rendered slot. Resolve the boundary to the
  // next visible display boundary owned by the same shared mapping.
  for (let source = sourceCycle + 1; source < sourceCycleCount; source += 1) {
    const display = mapping.sourceToDisplay[source];
    if (display !== undefined) return display;
  }
  return mapping.displayCycleCount;
}
