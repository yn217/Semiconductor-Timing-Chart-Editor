import type { LocalGeometryEntry, Point } from "./index.js";

/**
 * Renderer-independent producer of the uniform cycle grid (#755). WaveDrom lays every cycle out at a fixed
 * width from a fixed left origin, so the cycle-boundary entries the SVG extractor derives from gmark lines
 * and lane matrices are a pure function of the cycle index. A Canvas (or any non-SVG) renderer can publish
 * the same `LocalGeometryMap` entries without mounting an SVG.
 */
export interface UniformCycleGridInput {
  /** Source-domain cycle for each local boundary 0..N (length N + 1); folds/windows supply the mapping. */
  readonly sourceCycles: readonly number[];
  readonly originX: number;
  readonly cycleWidth: number;
  readonly rowY: number;
}

/** Geometry of WaveDrom's default skin: 1 cycle = 40 units, left origin 20.5 (verified against the SVG extractor). */
export const WAVEDROM_CYCLE_WIDTH = 40;
export const WAVEDROM_ORIGIN_X = 20.5;

export function uniformCycleBoundaryEntries(input: UniformCycleGridInput): readonly LocalGeometryEntry[] {
  const { sourceCycles, originX, cycleWidth, rowY } = input;
  const entries: LocalGeometryEntry[] = [];
  const boundary = (index: number): Point => ({ x: originX + index * cycleWidth, y: rowY });
  for (let index = 0; index < sourceCycles.length - 1; index += 1) {
    const cycle = sourceCycles[index]!;
    const start = boundary(index);
    const end = boundary(index + 1);
    const center: Point = { x: (start.x + end.x) / 2, y: rowY };
    entries.push({ cycle, point: "cycle-start", position: start });
    entries.push({ cycle, point: "cycle-center", position: center });
    entries.push({ cycle, point: "value-center", position: center });
    entries.push({ cycle, point: "row-center", position: center });
    entries.push({ cycle, point: "cycle-end", position: end });
  }
  const terminal = sourceCycles.length - 1;
  if (terminal >= 0) entries.push({ cycle: sourceCycles[terminal]!, point: "cycle-start", position: boundary(terminal) });
  return entries;
}
