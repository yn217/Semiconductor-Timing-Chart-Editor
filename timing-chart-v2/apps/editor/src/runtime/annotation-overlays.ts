import { anchorTransitionFraction, anchorTransitionKind } from "@timing-chart-v2/schema";
import type { Annotation, CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { allocateMeasurementLanes, type LocalGeometryMap, type Point } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";
import type { AnnotationOverlayPrimitive } from "@timing-chart-v2/renderer";
import { resolveAnchorPoint } from "../resolve-anchor-point.js";

export const annotationFields = ["anchor", "start", "end", "from", "to"] as const;

function measurementAnchorLabel(annotation: Pick<Annotation, "label" | "measurement" | "start" | "end">): string {
  if (!annotation.start || !annotation.end) return annotation.label;
  const start = anchorTransitionFraction(annotation.start);
  const end = anchorTransitionFraction(annotation.end);
  if (start === undefined || end === undefined || annotation.measurement?.profile === "cycle") return `${annotation.label} · cycle anchors · Δ ${Math.abs(annotation.end.cycle - annotation.start.cycle)} cycles`;
  const profile = annotation.measurement?.profile;
  const range = profile === "30-70" ? "30%→70%" : profile === "10-90" ? "10%→90%" : profile === "20-80" ? "20%→80%" : profile === "50%" ? "50%→50%" : `${Math.round(start * 100)}%→${Math.round(end * 100)}%`;
  return `${annotation.label} · ${range} · ${annotation.measurement?.anchorKind ?? "threshold"} · Δ ${Math.abs(annotation.end.cycle - annotation.start.cycle)} cycles`;
}

export function projectAnnotationOverlays(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, xScale = 1): AnnotationOverlayPrimitive[] {
  const measurementSpans = document.annotations.flatMap((annotation) => {
    if (annotation.type !== "measurement" || !annotation.start || !annotation.end) return [];
    const continuous = annotation.positionMode === "free";
    const first = resolveAnchorPoint(annotation.start, document, projection, maps, mapping, xScale, continuous);
    const second = resolveAnchorPoint(annotation.end, document, projection, maps, mapping, xScale, continuous);
    return first && second ? [{ id: annotation.id, firstX: first.x, secondX: second.x, ...(annotation.measurementLayout?.lane === undefined ? {} : { explicitLane: annotation.measurementLayout.lane }) }] : [];
  });
  const measurementLaneById = allocateMeasurementLanes(measurementSpans);
  return document.annotations.flatMap((annotation) => {
    const anchors = annotationFields.flatMap((field) => {
      const point = resolveAnchorPoint(annotation[field], document, projection, maps, mapping, xScale, annotation.positionMode === "free");
      const fraction = anchorTransitionFraction(annotation[field]);
      const kind = anchorTransitionKind(annotation[field]);
      return point ? [{ field, ...point, ...(fraction === undefined ? {} : { threshold: fraction }), ...(kind === undefined ? {} : { transitionKind: kind }) }] : [];
    });
    if (anchors.length === 0) return [];
    const firstAnchor = annotation.start ?? annotation.anchor;
    const lastAnchor = annotation.end ?? annotation.anchor;
    const tracePoints = annotation.type === "ghostTrace" && annotation.sourceSignalId && firstAnchor && lastAnchor
      ? (() => {
        const sourceMap = maps.get(annotation.sourceSignalId);
        const sourceRow = projection.rowLayout.find((row) => row.rowId === annotation.sourceSignalId);
        if (!sourceMap || !sourceRow?.visible) return [];
        const sourceRowY = sourceRow.y;
        const offset = annotation.traceOffsetCycles ?? 0;
        const points: Point[] = [];
        const start = Math.max(0, Math.floor(Math.min(firstAnchor.cycle, lastAnchor.cycle)));
        const end = Math.min(document.timeline.cycleCount, Math.ceil(Math.max(firstAnchor.cycle, lastAnchor.cycle)));
        for (let cycle = start; cycle <= end; cycle += 1) {
          const sourceCycle = cycle + offset;
          if (sourceCycle < 0 || sourceCycle > document.timeline.cycleCount) continue;
          const renderedCycle = mapping.sourceToDisplay[sourceCycle];
          if (renderedCycle === undefined) continue;
          for (const point of ["cycle-start", "transition-center"] as const) {
            const local = sourceMap.find({ signalId: annotation.sourceSignalId, cycle: renderedCycle, point });
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
      anchors,
      ...(annotation.labelOffset === undefined ? {} : { labelOffset: annotation.labelOffset }),
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
}
