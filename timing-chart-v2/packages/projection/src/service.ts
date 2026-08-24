import type { SignalId } from "@timing-chart-v2/schema";
import { calculateRowLayout } from "./row-layout.js";
import type { ProjectionRequest, ProjectionService, RenderProjection, RowLayoutEntry } from "./types.js";

const defaultTransform = { scrollX: 0, scrollY: 0, zoom: 1 } as const;

export class DefaultProjectionService implements ProjectionService {
  project(request: ProjectionRequest): RenderProjection {
    const document = request.snapshot.document;
    const layout = calculateRowLayout(document);
    const visibleRowIds = layout.visibleRows.map((row) => row.rowId);
    const timingRows = layout.visibleRows.filter((row) => row.kind === "timing");
    const pinned = new Set(request.viewport.pinnedRowIds);
    const start = request.viewport.viewportStartY - request.viewport.overscanBefore;
    const end = request.viewport.viewportEndY + request.viewport.overscanAfter;
    const mountedSignalIds = timingRows
      .filter((row) => pinned.has(row.rowId) || intersects(row, start, end))
      .map((row) => row.rowId as SignalId);
    const canonicalSignalIds = document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
    const requestedWaves = request.changeSet.fullDocumentReplace
      ? canonicalSignalIds
      : (request.changeSet.waveSemantics ?? []);
    return {
      revision: request.snapshot.revision,
      canonicalRowIds: layout.canonicalRowIds,
      visibleRowIds,
      leftRowIds: visibleRowIds,
      frozenLabelRowIds: visibleRowIds,
      timingRowIds: visibleRowIds,
      rowLayout: layout.visibleRows,
      canonicalSignalIds,
      mountedSignalIds,
      waveSignalIds: [...new Set(requestedWaves)],
      totalHeight: layout.totalHeight,
      transform: request.previous?.transform ?? defaultTransform,
    };
  }
}

function intersects(row: RowLayoutEntry, start: number, end: number): boolean {
  return row.y + row.height >= start && row.y <= end;
}
