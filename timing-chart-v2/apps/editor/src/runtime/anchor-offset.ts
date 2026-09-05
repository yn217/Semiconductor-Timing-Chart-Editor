import type { Point } from "@timing-chart-v2/geometry";
import type { SemanticAnchor } from "@timing-chart-v2/schema";

/** Convert a browser-space annotation drag delta into the canonical offset
 * units used by the geometry resolver. The waveform surface applies the
 * presentation scale only on X; row Y remains in the layout's unscaled
 * coordinate space. */
export function annotationOffsetDeltaFromScreen(delta: Point, presentationScale: number, zoom = 1): Point {
  if (!Number.isFinite(presentationScale) || presentationScale <= 0) throw new Error("Annotation presentation scale must be positive and finite.");
  if (!Number.isFinite(zoom) || zoom <= 0) throw new Error("Annotation zoom must be positive and finite.");
  return { x: Math.round(delta.x / (presentationScale * zoom)), y: Math.round(delta.y) };
}

export function withAddedOffset(anchor: SemanticAnchor, x: number, y: number): SemanticAnchor {
  return { ...anchor, offset: { x: (anchor.offset?.x ?? 0) + x, y: (anchor.offset?.y ?? 0) + y } };
}

export function withSnapOffset(anchor: SemanticAnchor, desired: Point, snapped: Point, presentationScale = 1): SemanticAnchor {
  const residual = annotationOffsetDeltaFromScreen({ x: desired.x - snapped.x, y: desired.y - snapped.y }, presentationScale);
  if (residual.x === 0 && residual.y === 0) return anchor;
  return { ...anchor, offset: { x: (anchor.offset?.x ?? 0) + residual.x, y: (anchor.offset?.y ?? 0) + residual.y } };
}
