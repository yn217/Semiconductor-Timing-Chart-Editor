import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import type { LocalGeometryMap, Point } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping, RenderProjection } from "@timing-chart-v2/projection";
import type { AnnotationOverlayPrimitive } from "@timing-chart-v2/renderer";
import { resolveAnchorPoint } from "../resolve-anchor-point.js";

export const annotationFields = ["anchor", "start", "end", "from", "to"] as const;

export function projectAnnotationOverlays(document: CanonicalDocument, projection: RenderProjection, maps: ReadonlyMap<SignalId, LocalGeometryMap>, mapping: DisplayTimeMapping, xScale = 1): AnnotationOverlayPrimitive[] {
  return document.annotations.flatMap((annotation) => {
    const anchors = annotationFields.flatMap((field) => {
      const point = resolveAnchorPoint(annotation[field], document, projection, maps, mapping, xScale);
      return point ? [{ field, ...point, ...(annotation[field]?.threshold === undefined ? {} : { threshold: annotation[field]!.threshold }) }] : [];
    });
    if (anchors.length === 0) return [];
    const firstAnchor = annotation.start ?? annotation.anchor;
    const lastAnchor = annotation.end ?? annotation.anchor;
    const tracePoints = annotation.type === "ghostTrace" && annotation.sourceSignalId && firstAnchor && lastAnchor
      ? (() => {
        const sourceMap = maps.get(annotation.sourceSignalId);
        const sourceRowY = projection.rowLayout.find((row) => row.rowId === annotation.sourceSignalId)?.y;
        if (!sourceMap || sourceRowY === undefined) return [];
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
      : ["range", "highlight", "timingRegion"].includes(annotation.type) ? "range"
      : annotation.type === "ghostTrace" ? "trace"
      : ["arrow", "dependency", "measurement", "bracket"].includes(annotation.type) ? "line" : "point";
    return [{
      id: annotation.id,
      type: annotation.type,
      shape,
      label: annotation.type === "measurement" && annotation.start && annotation.end ? `${annotation.label} · ${annotation.start.threshold === undefined || annotation.end.threshold === undefined ? "cycle anchors" : `${Math.round(annotation.start.threshold * 100)}%→${Math.round(annotation.end.threshold * 100)}%`} · Δ ${Math.abs(annotation.end.cycle - annotation.start.cycle)} cycles` : annotation.label,
      visible: annotation.visible,
      ...(annotation.opacity === undefined ? {} : { opacity: annotation.opacity }),
      ...(annotation.sourceSignalId === undefined ? {} : { sourceSignalId: annotation.sourceSignalId }),
      ...(annotation.traceOffsetCycles === undefined ? {} : { traceOffsetCycles: annotation.traceOffsetCycles }),
      ...(annotation.color === undefined ? {} : { color: annotation.color }),
      anchors,
      ...(annotation.labelOffset === undefined ? {} : { labelOffset: annotation.labelOffset }),
      ...(annotation.lineType === undefined ? {} : { lineType: annotation.lineType }),
      ...(annotation.arrowhead === undefined ? {} : { arrowhead: annotation.arrowhead }),
      ...(tracePoints === undefined ? {} : { tracePoints }),
      surfaceHeight: projection.totalHeight,
    }];
  });
}
