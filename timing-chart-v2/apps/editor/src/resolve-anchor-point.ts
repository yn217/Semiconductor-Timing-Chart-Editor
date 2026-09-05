import type { LocalGeometryMap, Point } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";
import type { CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

export function resolveAnchorPoint(anchor: SemanticAnchor | undefined, document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, xScale = 1): Point | undefined {
  if (!anchor) return undefined;
  const axisOwnerSignalId = document.timeline.referenceClock ?? document.signals.find((signal) => signal.type !== "commentRow" && maps.has(signal.id))?.id;
  const signalId = anchor.signalId ?? axisOwnerSignalId;
  if (!signalId) return undefined;
  const renderedCycle = anchor.cycle === document.timeline.cycleCount ? mapping.displayCycleCount : mapping.sourceToDisplay[anchor.cycle];
  if (renderedCycle === undefined) return undefined;
  const local = maps.get(signalId)?.find({ ...anchor, signalId, cycle: renderedCycle });
  if (!local) return undefined;
  const row = anchor.signalId ? projection.rowLayout.find((item) => item.rowId === anchor.signalId) : undefined;
  // Navigation keeps hidden rows addressable for selection and stable layout
  // identity, but a hidden timing row has no visible geometry owner. Do not
  // project an annotation onto that retained navigation slot; this also keeps
  // hidden-target behavior consistent with the snap-index visibility policy.
  if (anchor.signalId && (!row || !row.visible)) return undefined;
  const rowY = row?.y ?? 0;
  const sharedBoundary = anchor.point === "cycle-start" && axisOwnerSignalId !== undefined
    ? maps.get(axisOwnerSignalId)?.find({ ...anchor, signalId: axisOwnerSignalId, cycle: renderedCycle })?.point
    : undefined;
  return { x: (sharedBoundary?.x ?? local.point.x) * xScale, y: rowY + local.point.y };
}
