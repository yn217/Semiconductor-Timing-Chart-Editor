import type { CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";

export function buildSnapIndex(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, service = new SemanticSnapCandidateService(), xScale = 1): ImmutableSnapIndex {
  const timeAxis = resolveTimeAxisGeometry(document, maps);
  const axisOwnerSignalId = timeAxis.ownerSignalId;
  const referenceMap = timeAxis.geometry;
  const signalIds = new Set(document.signals.map((signal) => signal.id));
  const screenMaps = new Map<SignalId, LocalGeometryMap>([...maps.entries()].map(([id, map]) => [id, {
    signalId: map.signalId,
    find: (anchor: SemanticAnchor) => {
      const local = map.find(anchor);
      if (!local) return undefined;
      const sharedBoundary = anchor.point === "cycle-start" ? referenceMap?.find({ ...anchor, ...(axisOwnerSignalId === undefined ? {} : { signalId: axisOwnerSignalId }) })?.point : undefined;
      return { ...local, point: { ...local.point, x: (sharedBoundary?.x ?? local.point.x) * xScale } };
    },
  }]));
  return service.build({
    document,
    geometryMaps: screenMaps,
    ...(axisOwnerSignalId === undefined ? {} : { axisOwnerSignalId }),
    rowY: new Map(projection.rowLayout.flatMap((row) => signalIds.has(row.rowId as SignalId) ? [[row.rowId as SignalId, row.y] as const] : [])),
    renderedCycleCount: mapping.displayCycleCount,
    sourceCycleForRenderedCycle: (renderedCycle) => renderedCycle === mapping.displayCycleCount ? document.timeline.cycleCount : mapping.displayToSource(renderedCycle),
    renderedCycleForSourceCycle: (sourceCycle) => mapping.sourceToDisplay(sourceCycle),
  });
}
