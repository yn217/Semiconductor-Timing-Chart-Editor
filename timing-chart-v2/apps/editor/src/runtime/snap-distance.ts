/** Treat sub-half-pixel floating-point noise as exact screen-geometry alignment. */
export function normalizeSnapDistance(distance: number): number {
  return Math.abs(distance) < 0.5 ? 0 : Math.round(distance * 100) / 100;
}
