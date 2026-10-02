import { WAVEDROM_ORIGIN_X } from "@timing-chart-v2/geometry";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

/** WaveDrom's default skin pads every rendered SVG by 20.5 units on the left and 19.5 on the right (viewBox = 40 * cycles + 40). */
const WAVEDROM_HORIZONTAL_PADDING = 2 * WAVEDROM_ORIGIN_X - 1;

/**
 * Placement of a wave owner's SVG box in ruler coordinates.
 *
 * The SVG is drawn at `presentationScale` screen pixels per local unit, and its first cycle boundary sits
 * `20.5` units inside its own left edge. The box therefore has to start one left margin BEFORE the ruler position of its
 * first cycle, and be as wide as the SVG's whole viewBox (window cycles plus both paddings) -- squeezing the viewBox into
 * `cycles * pitch` would shrink the waveform by ~(2.5% at 24 cycles) and shift every edge off the ruler/grid it must match.
 */
export function waveOwnerPlacement(input: {
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly pxPerDisplayCycle: number;
  readonly waveOriginPx: number;
  /** Screen pixels per local geometry unit (the ruler's presentation scale). */
  readonly presentationScale: number;
  readonly viewBoxWidth?: number | undefined;
  /** When present, boundary X/pitch/scale must come from this captured generation. */
  readonly metrics?: Pick<TimeAxisMetrics, "displayBoundaryToContentX" | "pxPerDisplayCycle" | "presentationScale"> | undefined;
}): { readonly left: number; readonly width: number } {
  const scale = input.metrics?.presentationScale ?? input.presentationScale;
  const pxPerDisplayCycle = input.metrics?.pxPerDisplayCycle ?? input.pxPerDisplayCycle;
  // Without a rendered SVG yet, the box is the window's cycle span plus the two margins (the span already is in screen px).
  const width = input.viewBoxWidth !== undefined && Number.isFinite(input.viewBoxWidth) && input.viewBoxWidth > 0
    ? input.viewBoxWidth * scale
    : (input.displayEnd - input.displayStart) * pxPerDisplayCycle + WAVEDROM_HORIZONTAL_PADDING * scale;
  const boundaryX = input.metrics?.displayBoundaryToContentX(input.displayStart);
  return {
    left: (boundaryX ?? input.displayStart * input.pxPerDisplayCycle + input.waveOriginPx) - WAVEDROM_ORIGIN_X * scale,
    width,
  };
}

/** Extra time-domain width (px) the SVG margins add around the cycle span at the given presentation scale. */
export function waveDomainPaddingPx(scale: number): number {
  return WAVEDROM_HORIZONTAL_PADDING * scale;
}
