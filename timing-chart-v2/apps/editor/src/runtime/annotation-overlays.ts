import { anchorTransitionFraction, anchorTransitionKind } from "@timing-chart-v2/schema";
import type { Annotation, CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { allocateMeasurementLanes, findSourceAnchorGeometry, type LocalGeometryMap, type Point } from "@timing-chart-v2/geometry";
import { rowsIntersectingVerticalViewport, type DisplayTimeMapping, type DisplayTimeViewport, type RenderProjection } from "@timing-chart-v2/projection";
import type { AnnotationOverlayPrimitive } from "@timing-chart-v2/renderer";
import { annotationAxisOwnerSignalId, resolveAnchorPoint, rowLayoutIndex } from "../resolve-anchor-point.js";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

export const annotationFields = ["anchor", "start", "end", "from", "to"] as const;

/** #863: time-bucket index over the Annotation collection (keyed by array identity) so a viewport projection visits only the
 * Annotations whose anchor cycles can intersect the viewport, instead of all (up to 20k). Order is restored to document order. */
const BUCKET_CYCLES = 256;
const WIDE_BUCKETS = 16;
const INDEX_THRESHOLD = 256;
interface WideAnnotationInterval { readonly position: number; readonly start: number; readonly end: number }
/** `wideMaxEnd` is a max-end segment tree over start-sorted `wideIntervals` (leaves at `wideLeafCount + i`), so an overlap
 * query is O(log N + k) even when one full-span Annotation would make a prefix-max bound degenerate to the whole list. */
interface AnnotationTimeIndex { readonly buckets: ReadonlyMap<number, readonly number[]>; readonly wideIntervals: readonly WideAnnotationInterval[]; readonly wideMaxEnd: Float64Array; readonly wideLeafCount: number; readonly byId: ReadonlyMap<string, number> }
const annotationTimeIndexes = new WeakMap<readonly Annotation[], AnnotationTimeIndex>();
function annotationTimeIndex(annotations: readonly Annotation[]): AnnotationTimeIndex {
  let index = annotationTimeIndexes.get(annotations);
  if (index) return index;
  const buckets = new Map<number, number[]>();
  const wide: Array<{ readonly position: number; readonly start: number; readonly end: number }> = [];
  const byId = new Map<string, number>();
  const addInterval = (position: number, min: number, max: number): void => {
    if (min > max) return;
    const first = Math.floor(min / BUCKET_CYCLES), last = Math.floor(max / BUCKET_CYCLES);
    if (last - first >= WIDE_BUCKETS) { wide.push({ position, start: min, end: max }); return; }
    for (let bucket = first; bucket <= last; bucket += 1) { const list = buckets.get(bucket); if (list) list.push(position); else buckets.set(bucket, [position]); }
  };
  annotations.forEach((annotation, position) => {
    byId.set(annotation.id, position);
    let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;
    for (const field of annotationFields) { const anchor = annotation[field]; if (anchor) { min = Math.min(min, anchor.cycle); max = Math.max(max, anchor.cycle); } }
    if (min > max) return; // no anchors: never a time hit
    addInterval(position, min, max);
    if (annotation.type === "ghostTrace" && annotation.start && annotation.end) {
      const offset = annotation.traceOffsetCycles ?? 0;
      addInterval(position, Math.min(annotation.start.cycle, annotation.end.cycle) + offset, Math.max(annotation.start.cycle, annotation.end.cycle) + offset);
    }
  });
  wide.sort((left, right) => left.start - right.start || left.end - right.end || left.position - right.position);
  let wideLeafCount = 1;
  while (wideLeafCount < wide.length) wideLeafCount *= 2;
  const wideMaxEnd = new Float64Array(wideLeafCount * 2).fill(Number.NEGATIVE_INFINITY);
  wide.forEach((interval, offset) => { wideMaxEnd[wideLeafCount + offset] = interval.end; });
  for (let node = wideLeafCount - 1; node > 0; node -= 1) wideMaxEnd[node] = Math.max(wideMaxEnd[node * 2]!, wideMaxEnd[node * 2 + 1]!);
  index = { buckets, wideIntervals: wide, wideMaxEnd, wideLeafCount, byId };
  annotationTimeIndexes.set(annotations, index);
  return index;
}
/** O(1) id lookup sharing the time index's cached `byId` (built once per Annotation array identity, not per call). */
export function annotationById(annotations: readonly Annotation[], id: string): Annotation | undefined {
  const position = annotationTimeIndex(annotations).byId.get(id);
  return position === undefined ? undefined : annotations[position];
}
export function annotationsNearViewport(annotations: readonly Annotation[], sourceStart: number, sourceEnd: number): readonly Annotation[] {
  return indexedAnnotationsNearViewport(annotations, sourceStart, sourceEnd).items;
}
export function indexedAnnotationsNearViewport(annotations: readonly Annotation[], sourceStart: number, sourceEnd: number, pinnedIds: ReadonlySet<string> = new Set()): Readonly<{ items: readonly Annotation[]; indexEntriesVisited: number; wideNodesVisited: number; pinnedInjectedCount: number }> {
  const index = annotationTimeIndex(annotations);
  const positions = new Set<number>();
  let indexEntriesVisited = 0;
  // Closed-interval overlap (start <= sourceEnd && end >= sourceStart): prune subtrees whose max end precedes the viewport
  // or whose first (smallest) start follows it. Leaves reached are exactly the hits.
  let wideNodesVisited = 0;
  const { wideIntervals, wideMaxEnd, wideLeafCount } = index;
  const visit = (node: number, left: number, right: number): void => {
    if (left >= wideIntervals.length) return;
    wideNodesVisited += 1;
    if (wideMaxEnd[node]! < sourceStart || wideIntervals[left]!.start > sourceEnd) return;
    if (right - left === 1) { indexEntriesVisited += 1; positions.add(wideIntervals[left]!.position); return; }
    const middle = (left + right) >>> 1;
    visit(node * 2, left, middle);
    visit(node * 2 + 1, middle, right);
  };
  if (wideIntervals.length > 0) visit(1, 0, wideLeafCount);
  for (let bucket = Math.floor(sourceStart / BUCKET_CYCLES); bucket <= Math.floor(sourceEnd / BUCKET_CYCLES); bucket += 1) {
    const entries = index.buckets.get(bucket) ?? [];
    indexEntriesVisited += entries.length;
    for (const position of entries) positions.add(position);
  }
  let pinnedInjectedCount = 0;
  for (const id of pinnedIds) {
    const position = index.byId.get(id);
    if (position !== undefined && !positions.has(position)) { positions.add(position); pinnedInjectedCount += 1; }
  }
  const ordered = [...positions].sort((left, right) => left - right);
  return { items: ordered.map((position) => annotations[position]!), indexEntriesVisited, wideNodesVisited, pinnedInjectedCount };
}

function measurementAnchorLabel(annotation: Pick<Annotation, "label" | "measurement" | "start" | "end">): string {
  if (!annotation.start || !annotation.end) return annotation.label;
  const start = anchorTransitionFraction(annotation.start);
  const end = anchorTransitionFraction(annotation.end);
  if (start === undefined || end === undefined || annotation.measurement?.profile === "cycle") return `${annotation.label} · cycle anchors · Δ ${Math.abs(annotation.end.cycle - annotation.start.cycle)} cycles`;
  const profile = annotation.measurement?.profile;
  const range = profile === "30-70" ? "30%→70%" : profile === "10-90" ? "10%→90%" : profile === "20-80" ? "20%→80%" : profile === "50%" ? "50%→50%" : `${Math.round(start * 100)}%→${Math.round(end * 100)}%`;
  return `${annotation.label} · ${range} · ${annotation.measurement?.anchorKind ?? "threshold"} · Δ ${Math.abs(annotation.end.cycle - annotation.start.cycle)} cycles`;
}

export type AnnotationOverlayProjectionMetrics = Readonly<{ canonicalCount: number; candidateCount: number; resolvedCount: number; durationMs: number; indexEntriesVisited: number; pinnedInjectedCount: number }>;
type ResolvedOverlayAnchor = Readonly<{ field: typeof annotationFields[number]; x: number; y: number; threshold?: number; transitionKind?: "threshold" | "ratio" }>;

export function projectAnnotationOverlays(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, xScale = 1, viewport?: DisplayTimeViewport, onMetrics?: (metrics: AnnotationOverlayProjectionMetrics) => void, timeAxisMetrics?: TimeAxisMetrics): AnnotationOverlayPrimitive[] {
  mapping = timeAxisMetrics?.mapping ?? mapping;
  xScale = timeAxisMetrics?.presentationScale ?? xScale;
  const startedAt = performance.now();
  // Without a viewport, candidate() intentionally accepts the supplied pool
  // as-is (notably the single-Annotation drag-preview path). Do not scan the
  // complete navigation layout to build a row set that path never consults.
  const rowIds = viewport
    ? new Set(rowsIntersectingVerticalViewport(projection.rowLayout, viewport.rowStart, viewport.rowEnd).map((row) => row.rowId))
    : undefined;
  const pinned = new Set(viewport?.pinnedIds ?? []);
  const candidate = (annotation: Annotation): boolean => {
    if (!viewport || pinned.has(annotation.id)) return true;
    const anchors = annotationFields.map((field) => annotation[field]).filter((anchor): anchor is NonNullable<typeof anchor> => Boolean(anchor));
    const rawTimeHit = anchors.some((anchor) => anchor.cycle >= viewport.sourceStart && anchor.cycle <= viewport.sourceEnd)
      || Boolean(annotation.start && annotation.end && Math.min(annotation.start.cycle, annotation.end.cycle) <= viewport.sourceEnd && Math.max(annotation.start.cycle, annotation.end.cycle) >= viewport.sourceStart);
    const offset = annotation.type === "ghostTrace" ? annotation.traceOffsetCycles ?? 0 : 0;
    const shiftedTraceHit = Boolean(annotation.type === "ghostTrace" && annotation.start && annotation.end
      && Math.min(annotation.start.cycle, annotation.end.cycle) + offset <= viewport.sourceEnd
      && Math.max(annotation.start.cycle, annotation.end.cycle) + offset >= viewport.sourceStart);
    const timeHit = rawTimeHit || shiftedTraceHit;
    // A cycle-only anchor is resolved against the projection's shared axis
    // owner by resolveAnchorPoint(); it has no explicit row ID to test here.
    // Treat it as row-independent so indexed viewport filtering does not drop
    // an annotation that the resolver can otherwise project.
    const rowHit = anchors.some((anchor) => anchor.signalId === undefined || rowIds?.has(anchor.signalId) === true) || (annotation.sourceSignalId !== undefined && rowIds?.has(annotation.sourceSignalId) === true);
    return timeHit && rowHit;
  };
  // Pinned Annotations are always candidates and may lie outside the time window, so the time index only narrows the rest.
  const indexed = viewport && document.annotations.length > INDEX_THRESHOLD
    ? indexedAnnotationsNearViewport(document.annotations, viewport.sourceStart, viewport.sourceEnd, pinned)
    : undefined;
  const pool = indexed?.items ?? document.annotations;
  const candidates = pool.filter(candidate);
  const needsAxisOwner = candidates.some((annotation) => annotationFields.some((field) => {
    const anchor = annotation[field];
    return anchor !== undefined && (anchor.signalId === undefined || anchor.point === "cycle-start");
  }));
  // Resolve once for this projection, not once per anchor (a document-wide
  // Signal lookup here used to multiply by the number of visible Annotations).
  const axisOwnerSignalId = needsAxisOwner ? annotationAxisOwnerSignalId(document, maps) ?? null : null;
  const measurementAnchorsById = new Map<string, readonly ResolvedOverlayAnchor[]>();
  const measurementSpans = candidates.flatMap((annotation) => {
    if (annotation.type !== "measurement" || !annotation.start || !annotation.end) return [];
    const continuous = annotation.positionMode === "free";
    const anchors = annotationFields.flatMap((field): ResolvedOverlayAnchor[] => {
      const anchor = annotation[field];
      const point = resolveAnchorPoint(anchor, document, projection, maps, mapping, xScale, continuous, axisOwnerSignalId, timeAxisMetrics);
      if (!point) return [];
      const fraction = anchorTransitionFraction(anchor);
      const kind = anchorTransitionKind(anchor);
      return [{ field, ...point, ...(fraction === undefined ? {} : { threshold: fraction }), ...(kind === undefined ? {} : { transitionKind: kind }) }];
    });
    measurementAnchorsById.set(annotation.id, anchors);
    const first = anchors.find((anchor) => anchor.field === "start");
    const second = anchors.find((anchor) => anchor.field === "end");
    return first && second ? [{ id: annotation.id, firstX: first.x, secondX: second.x, ...(annotation.measurementLayout?.lane === undefined ? {} : { explicitLane: annotation.measurementLayout.lane }) }] : [];
  });
  const measurementLaneById = allocateMeasurementLanes(measurementSpans);
  const overlays = candidates.flatMap((annotation) => {
    const anchors = annotation.type === "measurement" ? measurementAnchorsById.get(annotation.id) ?? [] : annotationFields.flatMap((field): ResolvedOverlayAnchor[] => {
      const anchor = annotation[field];
      const point = resolveAnchorPoint(anchor, document, projection, maps, mapping, xScale, annotation.positionMode === "free", axisOwnerSignalId, timeAxisMetrics);
      if (!point) return [];
      const fraction = anchorTransitionFraction(anchor);
      const kind = anchorTransitionKind(anchor);
      return [{ field, ...point, ...(fraction === undefined ? {} : { threshold: fraction }), ...(kind === undefined ? {} : { transitionKind: kind }) }];
    });
    if (anchors.length === 0) return [];
    const firstAnchor = annotation.start ?? annotation.anchor;
    const lastAnchor = annotation.end ?? annotation.anchor;
    const tracePoints = annotation.type === "ghostTrace" && annotation.sourceSignalId && firstAnchor && lastAnchor
      ? (() => {
        const sourceMap = maps.get(annotation.sourceSignalId);
        const sourceRow = rowLayoutIndex(projection.rowLayout).get(annotation.sourceSignalId);
        if (!sourceMap || !sourceRow?.visible) return [];
        const sourceRowY = sourceRow.y;
        const offset = annotation.traceOffsetCycles ?? 0;
        const points: Point[] = [];
        const start = Math.max(
          0,
          Math.floor(Math.min(firstAnchor.cycle, lastAnchor.cycle)),
          viewport ? Math.ceil(viewport.sourceStart - offset) : 0,
        );
        const end = Math.min(
          document.timeline.cycleCount,
          Math.ceil(Math.max(firstAnchor.cycle, lastAnchor.cycle)),
          // Trace cycle c samples source cycle c + offset. The source window
          // is half-open, so the greatest integer trace cycle is ceil(end-offset)-1.
          viewport ? Math.ceil(viewport.sourceEnd - offset) - 1 : document.timeline.cycleCount,
        );
        for (let cycle = start; cycle <= end; cycle += 1) {
          const sourceCycle = cycle + offset;
          if (sourceCycle < 0 || sourceCycle > document.timeline.cycleCount) continue;
          const renderedCycle = mapping.sourceToDisplay(sourceCycle);
          if (renderedCycle === undefined) continue;
          for (const point of ["cycle-start", "transition-center"] as const) {
            const local = findSourceAnchorGeometry(sourceMap, { signalId: annotation.sourceSignalId, cycle: sourceCycle, point }, renderedCycle);
            if (local) points.push({ x: local.point.x * xScale, y: sourceRowY + local.point.y });
          }
        }
        return points;
      })()
      : undefined;
    const shape: AnnotationOverlayPrimitive["shape"] = annotation.type === "verticalLine" ? "vertical"
      : ["range", "highlight", "timingRegion", "rectangle", "ellipse"].includes(annotation.type) ? "range"
      : annotation.type === "ghostTrace" ? "trace"
      : ["arrow", "dependency", "measurement", "bracket", "connector"].includes(annotation.type) ? "line" : "point";
    const markerExtent = annotation.type === "marker" && annotation.verticalSpan
      ? (() => {
        if (annotation.verticalSpan.mode === "rows") {
          const start = rowLayoutIndex(projection.rowLayout).get(annotation.verticalSpan?.startRowId ?? "");
          const end = rowLayoutIndex(projection.rowLayout).get(annotation.verticalSpan?.endRowId ?? "");
          return start && end ? { top: Math.min(start.y, end.y), bottom: Math.max(start.y + start.height, end.y + end.height) } : undefined;
        }
        const anchorPoint = anchors.find((item) => item.field === "anchor");
        if (!anchorPoint) return undefined;
        return annotation.verticalSpan.mode === "custom"
          ? { top: anchorPoint.y + (annotation.verticalSpan.startOffset ?? 0), bottom: anchorPoint.y + (annotation.verticalSpan.endOffset ?? 0) }
          : { top: 0, bottom: projection.totalHeight };
      })()
      : undefined;
    const markerExtentAnchors = markerExtent && annotation.type === "marker"
      ? [{ field: "verticalSpanStart" as const, x: anchors[0]!.x, y: markerExtent.top }, { field: "verticalSpanEnd" as const, x: anchors[0]!.x, y: markerExtent.bottom }]
      : [];
    return [{
      id: annotation.id,
      type: annotation.type,
      shape,
      label: annotation.type === "measurement" ? measurementAnchorLabel(annotation) : annotation.label,
      visible: annotation.visible,
      ...(annotation.opacity === undefined ? {} : { opacity: annotation.opacity }),
      ...(annotation.sourceSignalId === undefined ? {} : { sourceSignalId: annotation.sourceSignalId }),
      ...(annotation.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: annotation.traceOffsetCycles }),
      ...(annotation.color === undefined ? {} : { color: annotation.color }),
      anchors: [...anchors, ...markerExtentAnchors],
      ...(markerExtent === undefined ? {} : { verticalExtent: markerExtent }),
      ...(annotation.labelOffset === undefined ? {} : { labelOffset: annotation.labelOffset }),
      ...(annotation.labelPlacement === undefined ? {} : { labelPlacement: annotation.labelPlacement }),
      ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }),
      ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }),
      ...(annotation.measurementLayout === undefined ? {} : { measurementLayout: annotation.measurementLayout, measurementLane: measurementLaneById.get(annotation.id) ?? annotation.measurementLayout.lane ?? 0 }),
      ...(tracePoints === undefined ? {} : { tracePoints }),
      ...(annotation.style === undefined ? {} : { style: annotation.style }),
      ...(annotation.rotation === undefined ? {} : { rotation: annotation.rotation }),
      ...(annotation.align === undefined ? {} : { align: annotation.align }),
      ...(annotation.locked === undefined ? {} : { locked: annotation.locked }),
      surfaceHeight: projection.totalHeight,
    }];
  });
  onMetrics?.({ canonicalCount: document.annotations.length, candidateCount: candidates.length, resolvedCount: overlays.length, durationMs: performance.now() - startedAt, indexEntriesVisited: indexed?.indexEntriesVisited ?? document.annotations.length, pinnedInjectedCount: indexed?.pinnedInjectedCount ?? 0 });
  return overlays;
}
