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

const sharedBoundaryIndexes = new WeakMap<LocalGeometryMap, SharedBoundaryIndex>();
const screenMapAdapters = new WeakMap<LocalGeometryMap, ScreenMapAdapterCacheEntry>();

function sourceCycleForGeometryKey(cycle: number, map: LocalGeometryMap, mapping: DisplayTimeMapping): number | undefined {
  if (map.cycleKeyDomain !== "display") {
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
    const sourceCycle = sourceCycleForGeometryKey(entry.cycle, referenceMap, mapping);
    if (sourceCycle !== undefined) xByCycle.set(sourceCycle, entry.position.x);
  }
  const index = { entries, mapping, xByCycle };
  sharedBoundaryIndexes.set(referenceMap, index);
  return index;
}

function screenMapAdapter(map: LocalGeometryMap, referenceMap: LocalGeometryMap | undefined, axisOwnerSignalId: SignalId | undefined, mapping: DisplayTimeMapping, xScale: number): LocalGeometryMap {
  const cached = screenMapAdapters.get(map);
  if (cached && cached.referenceMap === referenceMap && cached.axisOwnerSignalId === axisOwnerSignalId && cached.mapping === mapping && cached.xScale === xScale) return cached.adapter;
  const sharedBoundaries = sharedBoundaryIndex(referenceMap, mapping);
  let displayFilteredBoundaries: readonly LocalGeometryEntry[] | undefined;
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
        if (displayFilteredBoundaries) return displayFilteredBoundaries;
        const projected: LocalGeometryEntry[] = [];
        for (const entry of map.cycleBoundaryEntries!()) {
          const sourceCycle = sourceCycleForGeometryKey(entry.cycle, map, mapping);
          if (sourceCycle === undefined) continue;
          const sharedX = sharedBoundaries?.xByCycle.get(sourceCycle);
          const sourceDisplayCycle = displayCycleForSourceCycle(sourceCycle, mapping);
          const sharedBoundary = sharedX === undefined && referenceMap && sourceDisplayCycle !== undefined
            ? findSourceAnchorGeometry(referenceMap, { cycle: sourceCycle, point: "cycle-start", ...(axisOwnerSignalId === undefined ? {} : { signalId: axisOwnerSignalId }) } as SemanticAnchor, sourceDisplayCycle)?.point
            : sharedX === undefined ? undefined : { x: sharedX };
          projected.push({ ...entry, cycle: sourceCycle, position: { ...entry.position, x: (sharedBoundary?.x ?? entry.position.x) * xScale } });
        }
        displayFilteredBoundaries = Object.freeze(projected);
        return projected;
      },
    }),
    ...(map.edgeEntries === undefined ? {} : { edgeEntries: () => map.edgeEntries!() }),
  };
  screenMapAdapters.set(map, { referenceMap, axisOwnerSignalId, mapping, xScale, adapter });
  return adapter;
}

const rowYCache = new WeakMap<CanonicalDocument["signals"], WeakMap<RenderProjection["rowLayout"], ReadonlyMap<SignalId, number>>>();

function projectedSignalRows(document: CanonicalDocument, projection: RenderProjection): ReadonlyMap<SignalId, number> {
  let byLayout = rowYCache.get(document.signals);
  if (!byLayout) {
    byLayout = new WeakMap();
    rowYCache.set(document.signals, byLayout);
  }
  const cached = byLayout.get(projection.rowLayout);
  if (cached) return cached;

  const signalIds = new Set(document.signals.map((signal) => signal.id));
  const rowY = new Map<SignalId, number>();
  for (const row of projection.rowLayout) {
    if (signalIds.has(row.rowId as SignalId)) rowY.set(row.rowId as SignalId, row.y);
  }
  byLayout.set(projection.rowLayout, rowY);
  return rowY;
}

export function buildSnapIndex(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, service = new SemanticSnapCandidateService(), xScale = 1): ImmutableSnapIndex {
  const timeAxis = resolveTimeAxisGeometry(document, maps);
  const axisOwnerSignalId = timeAxis.ownerSignalId;
  const referenceMap = timeAxis.geometry;
  const screenMaps = new Map<SignalId, LocalGeometryMap>([...maps.entries()].map(([id, map]) => [id, screenMapAdapter(map, referenceMap, axisOwnerSignalId, mapping, xScale)]));
  return service.build({
    document,
    geometryMaps: screenMaps,
    ...(axisOwnerSignalId === undefined ? {} : { axisOwnerSignalId }),
    rowY: projectedSignalRows(document, projection),
    renderedCycleCount: mapping.displayCycleCount,
    sourceCycleForRenderedCycle: (renderedCycle) => renderedCycle === mapping.displayCycleCount ? document.timeline.cycleCount : mapping.displayToSource(renderedCycle),
    renderedCycleForSourceCycle: (sourceCycle) => sourceCycle === document.timeline.cycleCount
      ? mapping.displayCycleCount
      : mapping.sourceToDisplay(sourceCycle),
  });
}
