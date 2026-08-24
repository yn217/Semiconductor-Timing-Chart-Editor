import type { SignalId } from "@timing-chart-v2/schema";
import { calculateRowLayout } from "./row-layout.js";
import type { ProjectionRequest, ProjectionService, RenderProjection, RowLayoutEntry } from "./types.js";

const defaultTransform = { scrollX: 0, scrollY: 0, zoom: 1 } as const;

export class DefaultProjectionService implements ProjectionService {
  #layout: ReturnType<typeof calculateRowLayout> | undefined;
  #projectionBuilds = 0;
  #rowLayoutBuilds = 0;
  #lastMountedRange: readonly [number, number] = [0, 0];

  project(request: ProjectionRequest): RenderProjection {
    const document = request.snapshot.document;
    const invalidatesLayout = request.changeSet.fullDocumentReplace || request.changeSet.rowOrder !== undefined || request.changeSet.rowPresentation !== undefined || request.changeSet.addedSignals !== undefined || request.changeSet.removedSignals !== undefined || request.changeSet.addedGroups !== undefined || request.changeSet.removedGroups !== undefined;
    if (!this.#layout || invalidatesLayout) {
      this.#layout = calculateRowLayout(document);
      this.#rowLayoutBuilds += 1;
    }
    const layout = this.#layout;
    this.#projectionBuilds += 1;
    const visibleRowIds = layout.visibleRows.map((row) => row.rowId);
    const pinned = new Set(request.viewport.pinnedRowIds);
    const start = request.viewport.viewportStartY - request.viewport.overscanBefore;
    const end = request.viewport.viewportEndY + request.viewport.overscanAfter;
    const mountedRows = layout.visibleRows.filter((row) => pinned.has(row.rowId) || intersects(row, start, end));
    const mountedRowIds = mountedRows.map((row) => row.rowId);
    this.#lastMountedRange = [mountedRows[0]?.y ?? 0, mountedRows.at(-1) ? mountedRows.at(-1)!.y + mountedRows.at(-1)!.height : 0];
    const mountedSignalIds = mountedRows
      .filter((row) => row.kind === "timing")
      .map((row) => row.rowId as SignalId);
    const canonicalSignalIds = document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.id);
    const requestedWaves = request.changeSet.fullDocumentReplace
      ? canonicalSignalIds
      : (request.changeSet.waveSemantics ?? []);
    return {
      revision: request.snapshot.revision,
      canonicalRowIds: layout.canonicalRowIds,
      visibleRowIds,
      mountedRowIds,
      leftRowIds: mountedRowIds,
      frozenLabelRowIds: mountedRowIds,
      timingRowIds: mountedRowIds,
      rowLayout: layout.visibleRows,
      canonicalSignalIds,
      mountedSignalIds,
      waveSignalIds: [...new Set(requestedWaves)],
      totalHeight: layout.totalHeight,
      transform: request.previous?.transform ?? defaultTransform,
    };
  }

  diagnostics() {
    return Object.freeze({ projectionBuilds: this.#projectionBuilds, rowLayoutBuilds: this.#rowLayoutBuilds, lastMountedRange: this.#lastMountedRange });
  }
}

function intersects(row: RowLayoutEntry, start: number, end: number): boolean {
  return row.y + row.height >= start && row.y <= end;
}
