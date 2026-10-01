import { findSourceAnchorGeometry, type LocalGeometryMap, type Point } from "@timing-chart-v2/geometry";
import { resolveSourcePosition, type DisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
import type { CanonicalDocument, SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

// #863: row lookups go through an index keyed by the rowLayout array identity instead of a linear find per anchor.
const rowIndexByLayout = new WeakMap<RenderProjection["rowLayout"], ReadonlyMap<string, RenderProjection["rowLayout"][number]>>();
type AxisSignalEntry = Readonly<{ order: number; visible: boolean; isClock: boolean }>;
const axisSignalsByCollection = new WeakMap<CanonicalDocument["signals"], ReadonlyMap<SignalId, AxisSignalEntry>>();

function axisSignalIndex(signals: CanonicalDocument["signals"]): ReadonlyMap<SignalId, AxisSignalEntry> {
  let index = axisSignalsByCollection.get(signals);
  if (index) return index;
  const entries = new Map<SignalId, AxisSignalEntry>();
  for (let order = 0; order < signals.length; order += 1) {
    const signal = signals[order]!;
    if (signal.type === "commentRow") continue;
    entries.set(signal.id, { order, visible: signal.display.visible !== false, isClock: signal.type === "clock" });
  }
  index = entries;
  axisSignalsByCollection.set(signals, index);
  return index;
}

/** Resolve the shared time-axis Signal without rescanning canonical Signals per Annotation anchor. */
export function annotationAxisOwnerSignalId(document: CanonicalDocument, maps: ReadonlyMap<SignalId, LocalGeometryMap>): SignalId | undefined {
  const signals = axisSignalIndex(document.signals);
  const referenceClock = document.timeline.referenceClock;
  const reference = referenceClock === undefined ? undefined : signals.get(referenceClock);
  if (referenceClock !== undefined && reference?.isClock && maps.has(referenceClock)) return referenceClock;

  let firstVisible: Readonly<{ id: SignalId; order: number }> | undefined;
  let firstAvailable: Readonly<{ id: SignalId; order: number }> | undefined;
  for (const id of maps.keys()) {
    const signal = signals.get(id);
    if (!signal) continue;
    if (!firstAvailable || signal.order < firstAvailable.order) firstAvailable = { id, order: signal.order };
    if (signal.visible && (!firstVisible || signal.order < firstVisible.order)) firstVisible = { id, order: signal.order };
  }
  return firstVisible?.id ?? firstAvailable?.id;
}

export function rowLayoutIndex(rowLayout: RenderProjection["rowLayout"]): ReadonlyMap<string, RenderProjection["rowLayout"][number]> {
  let index = rowIndexByLayout.get(rowLayout);
  if (!index) { index = new Map(rowLayout.map((row) => [row.rowId as string, row] as const)); rowIndexByLayout.set(rowLayout, index); }
  return index;
}

export function resolveAnchorPoint(anchor: SemanticAnchor | undefined, document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, xScale = 1, continuous = false, resolvedAxisOwnerSignalId?: SignalId | null): Point | undefined {
  if (!anchor) return undefined;
  const axisOwnerSignalId = resolvedAxisOwnerSignalId === undefined ? annotationAxisOwnerSignalId(document, maps) : resolvedAxisOwnerSignalId ?? undefined;
  const signalId = anchor.signalId ?? axisOwnerSignalId;
  if (!signalId) return undefined;
  const renderedCycle = anchor.cycle === document.timeline.cycleCount ? mapping.displayCycleCount : resolveSourcePosition(mapping, anchor.cycle, continuous ? "interpolate" : "omit");
  if (renderedCycle === undefined) return undefined;
  const map = maps.get(signalId);
  const local = map ? findSourceAnchorGeometry(map, { ...anchor, signalId }, renderedCycle) : undefined;
  if (!local) return undefined;
  const row = anchor.signalId ? rowLayoutIndex(projection.rowLayout).get(anchor.signalId) : undefined;
  // Navigation keeps hidden rows addressable for selection and stable layout
  // identity, but a hidden timing row has no visible geometry owner. Do not
  // project an annotation onto that retained navigation slot; this also keeps
  // hidden-target behavior consistent with the snap-index visibility policy.
  if (anchor.signalId && (!row || !row.visible)) return undefined;
  const rowY = row?.y ?? 0;
  const sharedBoundary = anchor.point === "cycle-start" && axisOwnerSignalId !== undefined
    ? (() => {
      const axisMap = maps.get(axisOwnerSignalId);
      return axisMap ? findSourceAnchorGeometry(axisMap, { ...anchor, signalId: axisOwnerSignalId }, renderedCycle)?.point : undefined;
    })()
    : undefined;
  return { x: (sharedBoundary?.x ?? local.point.x) * xScale, y: rowY + local.point.y };
}
