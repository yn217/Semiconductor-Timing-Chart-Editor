import type { Point } from "@timing-chart-v2/geometry";
import type { SemanticAnchor } from "@timing-chart-v2/schema";

export function withAddedOffset(anchor: SemanticAnchor, x: number, y: number): SemanticAnchor {
  return { ...anchor, offset: { x: (anchor.offset?.x ?? 0) + x, y: (anchor.offset?.y ?? 0) + y } };
}

export function withSnapOffset(anchor: SemanticAnchor, desired: Point, snapped: Point): SemanticAnchor {
  const residual = { x: Math.round(desired.x - snapped.x), y: Math.round(desired.y - snapped.y) };
  if (residual.x === 0 && residual.y === 0) return anchor;
  return { ...anchor, offset: { x: (anchor.offset?.x ?? 0) + residual.x, y: (anchor.offset?.y ?? 0) + residual.y } };
}
