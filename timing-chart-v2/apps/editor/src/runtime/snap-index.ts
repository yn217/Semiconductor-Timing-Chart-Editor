import type { CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { findSourceAnchorGeometry, resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryEntry, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";

interface SharedBoundaryIndex {
  readonly entries: readonly LocalGeometryEntry[];
  readonly mapping: DisplayTimeMapping;
  readonly xByCycle: ReadonlyMap<number, number>;
}

interface ScreenMapAdapterCacheEntry {
  readonly referenceMap: LocalGeometryMap | undefined;
  readonly axisOwnerSignalId: SignalId | undefined;
  readonly mapping: DisplayTimeMapping;
  readonly xScale: number;
  readonly adapter: LocalGeometryMap;
}

interface BoundaryProjectionCacheEntry {
  readonly referenceMap: LocalGeometryMap | undefined;
  readonly axisOwnerSignalId: SignalId | undefined;
  readonly cycleKeyDomain: LocalGeometryMap["cycleKeyDomain"];
  readonly xScale: number;
  readonly entries: readonly LocalGeometryEntry[];
}

const sharedBoundaryIndexes = new WeakMap<LocalGeometryMap, SharedBoundaryIndex>();
const screenMapAdapters = new WeakMap<LocalGeometryMap, ScreenMapAdapterCacheEntry>();
const projectedBoundaryEntries = new WeakMap<readonly LocalGeometryEntry[], WeakMap<DisplayTimeMapping, BoundaryProjectionCacheEntry[]>>();

function projectBoundaryEntries(entries: readonly LocalGeometryEntry[], referenceMap: LocalGeometryMap | undefined, axisOwnerSignalId: SignalId | undefined, cycleKeyDomain: LocalGeometryMap["cycleKeyDomain"], mapping: DisplayTimeMapping, xScale: number): readonly LocalGeometryEntry[] {
  const byMapping = projectedBoundaryEntries.get(entries);
  const cached = byMapping?.get(mapping)?.find((entry) => entry.referenceMap === referenceMap
    && entry.axisOwnerSignalId === axisOwnerSignalId && entry.cycleKeyDomain === cycleKeyDomain && entry.xScale === xScale);
  if (cached) return cached.entries;
  const sharedBoundaries = sharedBoundaryIndex(referenceMap, mapping);
  const projected: LocalGeometryEntry[] = [];
  for (const entry of entries) {
    const sourceCycle = sourceCycleForGeometryKey(entry.cycle, cycleKeyDomain, mapping);
    if (sourceCycle === undefined) continue;
    const sharedX = sharedBoundaries?.xByCycle.get(sourceCycle);
    const sourceDisplayCycle = displayCycleForSourceCycle(sourceCycle, mapping);
    const sharedBoundary = sharedX === undefined && referenceMap && sourceDisplayCycle !== undefined
      ? findSourceAnchorGeometry(referenceMap, { cycle: sourceCycle, point: "cycle-start", ...(axisOwnerSignalId === undefined ? {} : { signalId: axisOwnerSignalId }) } as SemanticAnchor, sourceDisplayCycle)?.point
      : sharedX === undefined ? undefined : { x: sharedX };
    projected.push(Object.freeze({ ...entry, cycle: sourceCycle, position: Object.freeze({ ...entry.position, x: (sharedBoundary?.x ?? entry.position.x) * xScale }) }));
  }
  const result = Object.freeze(projected);
  const cacheByMapping = byMapping ?? new WeakMap<DisplayTimeMapping, BoundaryProjectionCacheEntry[]>();
  const cache = cacheByMapping.get(mapping) ?? [];
  cache.push({ referenceMap, axisOwnerSignalId, cycleKeyDomain, xScale, entries: result });
  cacheByMapping.set(mapping, cache);
  if (!byMapping) projectedBoundaryEntries.set(entries, cacheByMapping);
  return result;
}

function sourceCycleForGeometryKey(cycle: number, cycleKeyDomain: LocalGeometryMap["cycleKeyDomain"], mapping: DisplayTimeMapping): number | undefined {
  if (cycleKeyDomain !== "display") {
    return cycle === mapping.sourceCycleCount || mapping.sourceToDisplay(cycle) !== undefined ? cycle : undefined;
  }
  if (cycle === mapping.displayCycleCount) return mapping.sourceCycleCount;
  return mapping.displayToSource(cycle);
}

function displayCycleForSourceCycle(cycle: number, mapping: DisplayTimeMapping): number | undefined {
  return cycle === mapping.sourceCycleCount ? mapping.displayCycleCount : mapping.sourceToDisplay(cycle);
}

function sharedBoundaryIndex(referenceMap: LocalGeometryMap | undefined, mapping: DisplayTimeMapping): SharedBoundaryIndex | undefined {
  if (!referenceMap?.cycleBoundaryEntries) return undefined;
  const entries = referenceMap.cycleBoundaryEntries();
  const cached = sharedBoundaryIndexes.get(referenceMap);
  if (cached?.entries === entries && cached.mapping === mapping) return cached;
  const xByCycle = new Map<number, number>();
  for (const entry of entries) {
    const sourceCycle = sourceCycleForGeometryKey(entry.cycle, referenceMap.cycleKeyDomain, mapping);
    if (sourceCycle !== undefined) xByCycle.set(sourceCycle, entry.position.x);
  }
  const index = { entries, mapping, xByCycle };
  sharedBoundaryIndexes.set(referenceMap, index);
  return index;
}

function screenMapAdapter(map: LocalGeometryMap, referenceMap: LocalGeometryMap | undefined, axisOwnerSignalId: SignalId | undefined, mapping: DisplayTimeMapping, xScale: number): LocalGeometryMap {
  const cached = screenMapAdapters.get(map);
  if (cached && cached.referenceMap === referenceMap && cached.axisOwnerSignalId === axisOwnerSignalId && cached.mapping === mapping && cached.xScale === xScale) return cached.adapter;
  const adapter: LocalGeometryMap = {
    signalId: map.signalId,
    cycleKeyDomain: "source",
    find: (anchor: SemanticAnchor) => {
      const displayCycle = displayCycleForSourceCycle(anchor.cycle, mapping);
      if (displayCycle === undefined) return undefined;
      const local = findSourceAnchorGeometry(map, anchor, displayCycle);
      if (!local) return undefined;
      const sharedBoundary = anchor.point === "cycle-start"
        ? referenceMap && findSourceAnchorGeometry(referenceMap, { ...anchor, ...(axisOwnerSignalId === undefined ? {} : { signalId: axisOwnerSignalId }) }, displayCycle)?.point
        : undefined;
      return { ...local, point: { ...local.point, x: (sharedBoundary?.x ?? local.point.x) * xScale } };
    },
    ...(map.cycleBoundaryEntries === undefined ? {} : {
      cycleBoundaryEntriesDisplayFiltered: true as const,
      cycleBoundaryEntries: (): readonly LocalGeometryEntry[] => {
        return projectBoundaryEntries(map.cycleBoundaryEntries!(), referenceMap, axisOwnerSignalId, map.cycleKeyDomain, mapping, xScale);
      },
    }),
    ...(map.edgeEntries === undefined ? {} : { edgeEntries: () => map.edgeEntries!() }),
  };
  screenMapAdapters.set(map, { referenceMap, axisOwnerSignalId, mapping, xScale, adapter });
  return adapter;
}

interface ProjectedSnapRows {
  readonly y: ReadonlyMap<SignalId, number>;
  readonly bounds: ReadonlyMap<SignalId, Readonly<{ top: number; bottom: number }>>;
}

const rowYCache = new WeakMap<CanonicalDocument["signals"], WeakMap<RenderProjection["rowLayout"], ProjectedSnapRows>>();

function projectedSignalRows(document: CanonicalDocument, projection: RenderProjection): ProjectedSnapRows {
  let byLayout = rowYCache.get(document.signals);
  if (!byLayout) {
    byLayout = new WeakMap();
    rowYCache.set(document.signals, byLayout);
  }
  const cached = byLayout.get(projection.rowLayout);
  if (cached) return cached;

  const signalIds = new Set(document.signals.map((signal) => signal.id));
  const rowY = new Map<SignalId, number>();
  const rowBounds = new Map<SignalId, Readonly<{ top: number; bottom: number }>>();
  for (const row of projection.rowLayout) {
    if (signalIds.has(row.rowId as SignalId)) {
      const signalId = row.rowId as SignalId;
      rowY.set(signalId, row.y);
      if (Number.isFinite(row.y) && Number.isFinite(row.height) && row.height >= 0) {
        rowBounds.set(signalId, Object.freeze({ top: row.y, bottom: row.y + row.height }));
      }
    }
  }
  const result = Object.freeze({ y: rowY, bounds: rowBounds });
  byLayout.set(projection.rowLayout, result);
  return result;
}

export function buildSnapIndex(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, service = new SemanticSnapCandidateService(), xScale = 1): ImmutableSnapIndex {
  const timeAxis = resolveTimeAxisGeometry(document, maps);
  const axisOwnerSignalId = timeAxis.ownerSignalId;
  const referenceMap = timeAxis.geometry;
  const screenMaps = new Map<SignalId, LocalGeometryMap>([...maps.entries()].map(([id, map]) => [id, screenMapAdapter(map, referenceMap, axisOwnerSignalId, mapping, xScale)]));
  const projectedRows = projectedSignalRows(document, projection);
  return service.build({
    document,
    geometryMaps: screenMaps,
    ...(axisOwnerSignalId === undefined ? {} : { axisOwnerSignalId }),
    rowY: projectedRows.y,
    rowBounds: projectedRows.bounds,
    renderedCycleCount: mapping.displayCycleCount,
    sourceCycleForRenderedCycle: (renderedCycle) => renderedCycle === mapping.displayCycleCount ? document.timeline.cycleCount : mapping.displayToSource(renderedCycle),
    renderedCycleForSourceCycle: (sourceCycle) => sourceCycle === document.timeline.cycleCount
      ? mapping.displayCycleCount
      : mapping.sourceToDisplay(sourceCycle),
  });
}
