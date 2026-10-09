import { rowsIntersectingVerticalViewport, type DisplayTimeViewport, type RenderProjection } from "@timing-chart-v2/projection";
import type { ScenarioSignalDifference, SignalId } from "@timing-chart-v2/schema";
import type { ScenarioDifferenceOverlayPrimitive } from "@timing-chart-v2/renderer";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

/** Project only changed Signal rows and source ranges intersecting the shared viewport. */
export function projectScenarioDifferenceOverlays(
  differences: readonly ScenarioSignalDifference[],
  projection: RenderProjection,
  timeAxis: Pick<TimeAxisMetrics, "sourceBoundaryToContentX">,
  viewport: DisplayTimeViewport,
): ScenarioDifferenceOverlayPrimitive[] {
  if (differences.length === 0 || viewport.sourceEnd <= viewport.sourceStart) return [];
  const visibleRows = rowsIntersectingVerticalViewport(projection.rowLayout, viewport.rowStart, viewport.rowEnd);
  const visibleRowsBySignal = new Map<SignalId, (typeof visibleRows)[number]>();
  for (const row of visibleRows) {
    if (row.kind === "timing") visibleRowsBySignal.set(row.rowId as SignalId, row);
  }
  const overlays: ScenarioDifferenceOverlayPrimitive[] = [];
  for (const difference of differences) {
    const row = visibleRowsBySignal.get(difference.signalId);
    if (!row) continue;
    for (const range of difference.ranges) {
      const sourceStart = Math.max(range.start, viewport.sourceStart);
      const sourceEnd = Math.min(range.end, viewport.sourceEnd);
      if (sourceEnd <= sourceStart) continue;
      const startX = timeAxis.sourceBoundaryToContentX(sourceStart);
      const endX = timeAxis.sourceBoundaryToContentX(sourceEnd);
      if (startX === undefined || endX === undefined || endX <= startX) continue;
      overlays.push({
        key: `${encodeURIComponent(difference.signalId)}:${sourceStart}:${sourceEnd}`,
        signalId: difference.signalId,
        sourceStart,
        sourceEnd,
        x: startX,
        y: row.y,
        width: endX - startX,
        height: row.height,
      });
    }
  }
  return overlays;
}
