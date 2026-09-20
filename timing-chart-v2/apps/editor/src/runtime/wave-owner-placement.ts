import { WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X } from "@timing-chart-v2/geometry";

/** WaveDrom's default skin pads every rendered SVG by 20.5 units on the left and 19.5 on the right (viewBox = 40 * cycles + 40). */
const WAVEDROM_HORIZONTAL_PADDING = 2 * WAVEDROM_ORIGIN_X - 1;

/**
 * Placement of a wave owner's SVG box in ruler coordinates.
 *
 * The SVG is drawn at one screen pixel per local unit times `pxPerDisplayCycle / 40`, and its first cycle boundary sits
 * `20.5` units inside its own left edge. The box therefore has to start one left margin BEFORE the ruler position of its
 * first cycle, and be as wide as the SVG's whole viewBox (window cycles plus both paddings) -- squeezing the viewBox into
 * `cycles * pitch` would shrink the waveform by ~(2.5% at 24 cycles) and shift every edge off the ruler/grid it must match.
 */
export function waveOwnerPlacement(input: {
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly pxPerDisplayCycle: number;
  readonly waveOriginPx: number;
  readonly viewBoxWidth?: number | undefined;
}): { readonly left: number; readonly width: number } {
  const scale = input.pxPerDisplayCycle / WAVEDROM_CYCLE_WIDTH;
  const viewBoxWidth = input.viewBoxWidth !== undefined && Number.isFinite(input.viewBoxWidth) && input.viewBoxWidth > 0
    ? input.viewBoxWidth
    : (input.displayEnd - input.displayStart) * WAVEDROM_CYCLE_WIDTH + WAVEDROM_HORIZONTAL_PADDING;
  return {
    left: input.displayStart * input.pxPerDisplayCycle + input.waveOriginPx - WAVEDROM_ORIGIN_X * scale,
    width: viewBoxWidth * scale,
  };
}
