import type { SignalId } from "@timing-chart-v2/schema";
import { calculateRowLayout } from "./row-layout.js";
import type { ProjectionRequest, ProjectionService, RenderProjection, RowLayoutEntry } from "./types.js";
import type { RowLayoutResult } from "./row-layout.js";

const defaultTransform = { scrollX: 0, scrollY: 0, zoom: 1 } as const;

export class DefaultProjectionService implements ProjectionService {
  #layout: ReturnType<typeof calculateRowLayout> | undefined;
  #projectionBuilds = 0;
  #viewportOnlyBuilds = 0;
  #fullVisibleRowScans = 0;
  #viewportRowsVisited = 0;
  #viewportBinarySearchSteps = 0;
  #rowLayoutBuilds = 0;
  #lastMountedRange: readonly [number, number] = [0, 0];
  #rowIndexById = new Map<RowLayoutEntry["rowId"], number>();
  #groupHeaderPrefixHeights: number[] = [];

  project(request: ProjectionRequest): RenderProjection {
    const document = request.snapshot.document;
    const invalidatesLayout = request.changeSet.fullDocumentReplace || request.changeSet.rowOrder !== undefined || request.changeSet.rowPresentation !== undefined || request.changeSet.geometryScreenY !== undefined || request.changeSet.addedSignals !== undefined || request.changeSet.removedSignals !== undefined || request.changeSet.addedGroups !== undefined || request.changeSet.removedGroups !== undefined;
    if (!this.#layout || invalidatesLayout) {
      this.#layout = calculateRowLayout(document);
      this.#rowLayoutBuilds += 1;
      this.#rowIndexById = new Map(this.#layout.navigationRows.map((row, index) => [row.rowId, index]));
      this.#groupHeaderPrefixHeights = [0];
      for (const header of this.#layout.groupHeaders) this.#groupHeaderPrefixHeights.push(this.#groupHeaderPrefixHeights.at(-1)! + header.height);
    }
    const layout = this.#layout;
    this.#projectionBuilds += 1;
    if (request.previous && request.snapshot.revision === request.previous.revision && Object.keys(request.changeSet).length === 0) {
      this.#viewportOnlyBuilds += 1;
      return this.#projectViewportOnly(request, layout);
    }
    this.#fullVisibleRowScans += layout.visibleRows.length;
    const visibleRowIds = layout.visibleRows.map((row) => row.rowId);
    const pinned = new Set(request.viewport.pinnedRowIds);
    const start = request.viewport.viewportStartY - request.viewport.overscanBefore;
    const end = request.viewport.viewportEndY + request.viewport.overscanAfter;
    const crossedHeaderHeight = (this.#groupHeaderPrefixHeights[upperBound(layout.groupHeaders, end, (header) => header.y)] ?? 0);
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
    return Object.freeze({ projectionBuilds: this.#projectionBuilds, viewportOnlyBuilds: this.#viewportOnlyBuilds, fullVisibleRowScans: this.#fullVisibleRowScans, viewportRowsVisited: this.#viewportRowsVisited, viewportBinarySearchSteps: this.#viewportBinarySearchSteps, rowLayoutBuilds: this.#rowLayoutBuilds, lastMountedRange: this.#lastMountedRange });
  }

  #projectViewportOnly(request: ProjectionRequest, layout: RowLayoutResult): RenderProjection {
    const start = request.viewport.viewportStartY - request.viewport.overscanBefore;
    const end = request.viewport.viewportEndY + request.viewport.overscanAfter;
    const firstHeader = upperBound(layout.groupHeaders, request.viewport.viewportEndY, (header) => header.y, () => { this.#viewportBinarySearchSteps += 1; });
    const firstIntersectingHeader = lowerBound(layout.groupHeaders, start, (header) => header.y + header.height, () => { this.#viewportBinarySearchSteps += 1; });
    const crossedHeaderHeight = (this.#groupHeaderPrefixHeights[firstHeader] ?? 0) - (this.#groupHeaderPrefixHeights[firstIntersectingHeader] ?? 0);
    const rangeEnd = end + crossedHeaderHeight;
    const firstRow = lowerBound(layout.navigationRows, start, (row) => row.y + row.height, () => { this.#viewportBinarySearchSteps += 1; });
    const afterLastRow = upperBound(layout.navigationRows, rangeEnd, (row) => row.y, () => { this.#viewportBinarySearchSteps += 1; });
    this.#viewportRowsVisited += Math.max(0, afterLastRow - firstRow);
    const candidateIds = new Set<RowLayoutEntry["rowId"]>();
    for (let index = firstRow; index < afterLastRow; index += 1) candidateIds.add(layout.navigationRows[index]!.rowId);
    for (const rowId of request.viewport.pinnedRowIds) candidateIds.add(rowId);
    for (const rowId of request.previous!.mountedRowIds) candidateIds.add(rowId);
    const mountedRows = [...candidateIds]
      .map((rowId) => this.#rowIndexById.get(rowId))
      .filter((index): index is number => index !== undefined)
      .sort((left, right) => left - right)
      .map((index) => layout.navigationRows[index]!);
    const mountedGroupHeaders = layout.groupHeaders
      .slice(Math.max(0, lowerBound(layout.groupHeaders, start, (header) => header.y + header.height, () => { this.#viewportBinarySearchSteps += 1; })), firstHeader + 1)
      .filter((header) => intersects(header, start, end));
    const mountedRowIds = mountedRows.map((row) => row.rowId);
    this.#lastMountedRange = [mountedRows[0]?.y ?? 0, mountedRows.at(-1) ? mountedRows.at(-1)!.y + mountedRows.at(-1)!.height : 0];
    const mountedSignalIds = mountedRows.filter((row) => row.kind === "timing" && row.visible).map((row) => row.rowId as SignalId);
    const timingRowIds = mountedRows.filter((row) => row.kind !== "timing" || row.visible).map((row) => row.rowId);
    return {
      ...request.previous!,
      revision: request.snapshot.revision,
      mountedRowIds,
      leftRowIds: mountedRowIds,
      frozenLabelRowIds: mountedRowIds,
      timingRowIds,
      mountedGroupHeaderIds: mountedGroupHeaders.map((row) => row.rowId),
      mountedSignalIds,
      waveSignalIds: [],
      transform: request.previous!.transform,
    };
  }
}

function lowerBound<T>(items: readonly T[], target: number, value: (item: T) => number, onStep?: () => void): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    onStep?.();
    const middle = Math.floor((low + high) / 2);
    if (value(items[middle]!) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound<T>(items: readonly T[], target: number, value: (item: T) => number, onStep?: () => void): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    onStep?.();
    const middle = Math.floor((low + high) / 2);
    if (value(items[middle]!) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function intersects(row: Pick<RowLayoutEntry, "y" | "height">, start: number, end: number): boolean {
  return row.y + row.height >= start && row.y <= end;
}
