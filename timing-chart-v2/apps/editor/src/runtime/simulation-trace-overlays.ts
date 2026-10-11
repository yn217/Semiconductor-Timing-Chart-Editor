import { compareExactSourceCycle, exactSourceCycleToNumber, type DisplayTimeMapping, type DisplayTimeViewport } from "@timing-chart-v2/projection";
import { rowsIntersectingVerticalViewport, type RenderProjection } from "@timing-chart-v2/projection";
import type { SimulationTraceOverlayPrimitive } from "@timing-chart-v2/renderer";
import type { SimulationTraceSnapshot } from "../simulation/simulation-trace.js";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

type VisibleSourceRun = { start: number; end: number };

function visibleSourceRuns(mapping: DisplayTimeMapping, viewport: DisplayTimeViewport): VisibleSourceRun[] {
  const runs: VisibleSourceRun[] = [];
  for (let displayCycle = viewport.displayStart; displayCycle < viewport.displayEnd; displayCycle += 1) {
    const sourceCycle = mapping.displayToSource(displayCycle);
    if (sourceCycle === undefined) continue;
    const previous = runs.at(-1);
    if (previous?.end === sourceCycle) previous.end += 1;
    else runs.push({ start: sourceCycle, end: sourceCycle + 1 });
  }
  return runs;
}

function lowerBoundCycle(events: SimulationTraceSnapshot["signal"]["events"], cycle: number): number {
  const target = { numerator: BigInt(cycle), denominator: 1n };
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareExactSourceCycle(events[middle]!.cycle, target) < 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function xAtSourceCycle(cycle: number, timeAxis: Pick<TimeAxisMetrics, "sourceBoundaryToContentX">): number | undefined {
  if (!Number.isFinite(cycle) || cycle < 0) return undefined;
  const start = Math.floor(cycle);
  const end = Math.ceil(cycle);
  const startX = timeAxis.sourceBoundaryToContentX(start);
  if (startX === undefined) return undefined;
  if (start === end) return startX;
  const endX = timeAxis.sourceBoundaryToContentX(end);
  if (endX === undefined || endX <= startX) return undefined;
  return startX + (endX - startX) * (cycle - start);
}

function yForValue(value: string, width: number, rowY: number, rowHeight: number): number {
  if (width > 1) return rowY + rowHeight / 2;
  switch (value.toLowerCase()) {
    case "1": return rowY + Math.min(5, rowHeight * 0.2);
    case "0": return rowY + rowHeight - Math.min(5, rowHeight * 0.2);
    case "x": return rowY + rowHeight / 2 - 1.5;
    case "z": return rowY + rowHeight / 2 + 1.5;
    default: return rowY + rowHeight / 2;
  }
}

function coordinate(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function projectSignal(snapshot: SimulationTraceSnapshot, row: { readonly y: number; readonly height: number }, runs: readonly VisibleSourceRun[], timeAxis: Pick<TimeAxisMetrics, "sourceBoundaryToContentX">): string {
  const { events, width } = snapshot.signal;
  const commands: string[] = [];
  for (const run of runs) {
    const startX = xAtSourceCycle(run.start, timeAxis);
    const endX = xAtSourceCycle(run.end, timeAxis);
    if (startX === undefined || endX === undefined || endX <= startX) continue;
    const startIndex = lowerBoundCycle(events, run.start);
    const atStart = events[startIndex] && compareExactSourceCycle(events[startIndex]!.cycle, { numerator: BigInt(run.start), denominator: 1n }) === 0
      ? events[startIndex]!
      : events[startIndex - 1];
    let state = atStart?.value;
    if (state !== undefined) commands.push(`M${coordinate(startX)} ${coordinate(yForValue(state, width, row.y, row.height))}`);

    let pending: { readonly x: number; readonly value: string; readonly pixel: number } | undefined;
    const flushPending = (): void => {
      if (!pending) return;
      const y = yForValue(pending.value, width, row.y, row.height);
      if (state === undefined) commands.push(`M${coordinate(pending.x)} ${coordinate(y)}`);
      else if (width > 1 && state !== pending.value) {
        commands.push(`H${coordinate(pending.x)} M${coordinate(pending.x)} ${coordinate(y - 3)} V${coordinate(y + 3)} M${coordinate(pending.x)} ${coordinate(y)}`);
      }
      else commands.push(`H${coordinate(pending.x)} V${coordinate(y)}`);
      state = pending.value;
      pending = undefined;
    };
    const endIndex = lowerBoundCycle(events, run.end);
    for (let index = startIndex; index < endIndex; index += 1) {
      const event = events[index]!;
      const sourceCycle = exactSourceCycleToNumber(event.cycle);
      if (!Number.isFinite(sourceCycle) || sourceCycle > run.end) break;
      const x = xAtSourceCycle(sourceCycle, timeAxis);
      if (x === undefined || x < startX || x > endX) continue;
      const pixel = Math.floor(x);
      if (pending?.pixel === pixel) pending = { x, value: event.value, pixel };
      else {
        flushPending();
        pending = { x, value: event.value, pixel };
      }
    }
    flushPending();
    if (state !== undefined) commands.push(`H${coordinate(endX)}`);
  }
  return commands.join(" ");
}

/** Project only visible timing rows and displayed source intervals; folds are not expanded. */
export function projectSimulationTraceOverlays(
  snapshot: SimulationTraceSnapshot | undefined,
  projection: RenderProjection,
  timeAxis: Pick<TimeAxisMetrics, "mapping" | "sourceBoundaryToContentX">,
  viewport: DisplayTimeViewport,
  documentEpoch: number,
): SimulationTraceOverlayPrimitive[] {
  if (!snapshot || snapshot.documentEpoch !== documentEpoch || viewport.displayEnd <= viewport.displayStart) return [];
  const visibleRow = rowsIntersectingVerticalViewport(projection.rowLayout, viewport.rowStart, viewport.rowEnd)
    .find((row) => row.kind === "timing" && row.rowId === snapshot.signal.signalId);
  if (!visibleRow) return [];
  const runs = visibleSourceRuns(timeAxis.mapping, viewport);
  if (runs.length === 0) return [];
  const path = projectSignal(snapshot, visibleRow, runs, timeAxis);
  if (!path) return [];
  return [{ signalId: snapshot.signal.signalId, signalName: snapshot.signal.signalName, sourceStart: runs[0]!.start, sourceEnd: runs.at(-1)!.end, path }];
}
