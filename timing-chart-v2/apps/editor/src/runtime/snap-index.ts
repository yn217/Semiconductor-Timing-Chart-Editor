import type { CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryEntry, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";

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
  const sharedBoundaryXByCycle = referenceMap?.cycleBoundaryEntries === undefined
    ? undefined
    : new Map(referenceMap.cycleBoundaryEntries().map((entry) => [entry.cycle, entry.position.x] as const));
  const screenMaps = new Map<SignalId, LocalGeometryMap>([...maps.entries()].map(([id, map]) => [id, {
    signalId: map.signalId,
    cycleKeyDomain: map.cycleKeyDomain,
    find: (anchor: SemanticAnchor) => {
      const local = map.find(anchor);
      if (!local) return undefined;
      const sharedBoundary = anchor.point === "cycle-start" ? referenceMap?.find({ ...anchor, ...(axisOwnerSignalId === undefined ? {} : { signalId: axisOwnerSignalId }) })?.point : undefined;
      return { ...local, point: { ...local.point, x: (sharedBoundary?.x ?? local.point.x) * xScale } };
    },
    // Keep the source map's bounded semantic boundary index through the
    // screen-coordinate adapter. Dropping this optional capability made the
    // candidate service fall back to probing every display cycle on large
    // documents, even though the underlying geometry was already windowed.
    ...(map.cycleBoundaryEntries === undefined ? {} : {
      cycleBoundaryEntries: (): readonly LocalGeometryEntry[] => map.cycleBoundaryEntries!().map((entry) => {
        const sharedX = sharedBoundaryXByCycle?.get(entry.cycle);
        const sharedBoundary = sharedX === undefined
          ? referenceMap?.find({ cycle: entry.cycle, point: "cycle-start", ...(axisOwnerSignalId === undefined ? {} : { signalId: axisOwnerSignalId }) })?.point
          : { x: sharedX };
        return { ...entry, position: { ...entry.position, x: (sharedBoundary?.x ?? entry.position.x) * xScale } };
      }),
    }),
    ...(map.edgeEntries === undefined ? {} : { edgeEntries: () => map.edgeEntries!() }),
  }]));
  return service.build({
    document,
    geometryMaps: screenMaps,
    ...(axisOwnerSignalId === undefined ? {} : { axisOwnerSignalId }),
    rowY: projectedSignalRows(document, projection),
    renderedCycleCount: mapping.displayCycleCount,
    sourceCycleForRenderedCycle: (renderedCycle) => renderedCycle === mapping.displayCycleCount ? document.timeline.cycleCount : mapping.displayToSource(renderedCycle),
    renderedCycleForSourceCycle: (sourceCycle) => mapping.sourceToDisplay(sourceCycle),
  });
}
