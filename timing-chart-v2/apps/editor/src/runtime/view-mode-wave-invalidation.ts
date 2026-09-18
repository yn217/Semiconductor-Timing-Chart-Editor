import type { RenderProjection } from "@timing-chart-v2/projection";

/** Re-queue visible waveforms when a Cycle-capable view becomes active.
 * Transaction mode may defer non-reference wave paints, so an otherwise
 * unchanged projection needs an explicit visible-wave invalidation when
 * Cycle or Combined becomes the active view again. */
export function projectionForActiveWaveView(
  projection: RenderProjection,
  viewMode: "Cycle" | "Transaction" | "Split",
): RenderProjection {
  if (viewMode === "Transaction") return projection;
  return { ...projection, waveSignalIds: projection.mountedSignalIds };
}
