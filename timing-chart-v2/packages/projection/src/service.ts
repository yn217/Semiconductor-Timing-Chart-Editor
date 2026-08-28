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
    const invalidatesLayout = request.changeSet.fullDocumentReplace || request.changeSet.rowOrder !== undefined || request.changeSet.rowPresentation !== undefined || request.changeSet.geometryScreenY !== undefined || request.changeSet.addedSignals !== undefined || request.changeSet.removedSignals !== undefined || request.changeSet.addedGroups !== undefined || request.changeSet.removedGroups !== undefined;
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
    const crossedHeaderHeight = layout.groupHeaders.filter((header) => header.y <= end).reduce((height, header) => height + header.height, 0);
    const mountedRows = layout.navigationRows.filter((row) => pinned.has(row.rowId) || intersects(row, start, end + crossedHeaderHeight));
    const previousMounted = request.changeSet.rowOrder === undefined ? new Set<RowLayoutEntry["rowId"]>() : new Set(request.previous?.mountedRowIds ?? []);
    const stableMountedRows = layout.navigationRows.filter((row) => previousMounted.has(row.rowId));
    const rowsToMount = request.changeSet.rowOrder === undefined ? mountedRows : [...stableMountedRows, ...mountedRows];
    const mountedById = new Map(rowsToMount.map((row) => [row.rowId, row]));
    if (request.changeSet.rowOrder === undefined) for (const row of stableMountedRows) mountedById.set(row.rowId, row);
    const mountedRowsOrdered = layout.navigationRows.filter((row) => mountedById.has(row.rowId));
    const mountedGroupHeaders = layout.groupHeaders.filter((row) => intersects(row, start, end));
    const mountedRowIds = mountedRowsOrdered.map((row) => row.rowId);
    this.#lastMountedRange = [mountedRowsOrdered[0]?.y ?? 0, mountedRowsOrdered.at(-1) ? mountedRowsOrdered.at(-1)!.y + mountedRowsOrdered.at(-1)!.height : 0];
    const mountedSignalIds = mountedRowsOrdered
      .filter((row) => row.kind === "timing" && row.visible)
      .map((row) => row.rowId as SignalId);
    const timingRowIds = mountedRowsOrdered.filter((row) => row.kind !== "timing" || row.visible).map((row) => row.rowId);
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
      timingRowIds,
      rowLayout: layout.navigationRows,
      groupHeaders: layout.groupHeaders,
      mountedGroupHeaderIds: mountedGroupHeaders.map((row) => row.rowId),
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

function intersects(row: Pick<RowLayoutEntry, "y" | "height">, start: number, end: number): boolean {
  return row.y + row.height >= start && row.y <= end;
}
