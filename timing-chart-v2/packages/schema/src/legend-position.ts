import type { Legend, PixelOffset } from "./types.js";

export interface LegendRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Resolve persisted Legend coordinates against the plot, never the browser viewport. */
export function resolveLegendPosition(
  legend: Pick<Legend, "position" | "positionMode" | "corner">,
  plot: LegendRect,
  size: Pick<LegendRect, "width" | "height">,
): PixelOffset {
  if (legend.positionMode !== "canvas-corner") return legend.position;
  const corner = legend.corner ?? "top-left";
  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  return {
    x: (right ? plot.x + plot.width - size.width : plot.x) + (right ? -legend.position.x : legend.position.x),
    y: (bottom ? plot.y + plot.height - size.height : plot.y) + (bottom ? -legend.position.y : legend.position.y),
  };
}

export function legendOffsetFromCanvasPosition(
  legend: Pick<Legend, "positionMode" | "corner">,
  point: PixelOffset,
  plot: LegendRect,
  size: Pick<LegendRect, "width" | "height">,
): PixelOffset {
  if (legend.positionMode !== "canvas-corner") return point;
  const corner = legend.corner ?? "top-left";
  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  return {
    x: right ? plot.x + plot.width - size.width - point.x : point.x - plot.x,
    y: bottom ? plot.y + plot.height - size.height - point.y : point.y - plot.y,
  };
}
