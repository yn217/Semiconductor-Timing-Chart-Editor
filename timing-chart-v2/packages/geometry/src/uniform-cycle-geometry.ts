import type { SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import type { LocalAnchorGeometry, LocalGeometryEntry, LocalGeometryMap, Point } from "./index.js";

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

/**
 * Allocation-free Local Geometry for the uniform grid: every anchor position is computed from the cycle index on demand, so a
 * window of N cycles costs O(N) numbers (the source-cycle index) instead of 5N frozen entry objects. Semantically identical to
 * `new ImmutableLocalGeometryMap(id, uniformCycleBoundaryEntries(input))` for the boundary/center/end anchors.
 */
export class UniformCycleLocalGeometryMap implements LocalGeometryMap {
  readonly signalId: SignalId;
  readonly #input: UniformCycleGridInput;
  readonly #indexBySourceCycle: ReadonlyMap<number, number> | undefined;
  readonly #firstCycle: number;
  #boundaries: readonly LocalGeometryEntry[] | undefined;

  constructor(signalId: SignalId, input: UniformCycleGridInput) {
    this.signalId = signalId;
    this.#input = input;
    const cycles = input.sourceCycles;
    this.#firstCycle = cycles[0] ?? 0;
    let contiguous = true;
    for (let index = 1; index < cycles.length; index += 1) if (cycles[index] !== this.#firstCycle + index) { contiguous = false; break; }
    this.#indexBySourceCycle = contiguous ? undefined : new Map(cycles.map((cycle, index) => [cycle, index] as const));
  }

  edgeEntries(): readonly LocalGeometryEntry[] { return []; }

  cycleBoundaryEntries(): readonly LocalGeometryEntry[] {
    if (!this.#boundaries) {
      const { sourceCycles, originX, cycleWidth, rowY } = this.#input;
      this.#boundaries = Object.freeze(sourceCycles.map((cycle, index) => ({ cycle, point: "cycle-start" as const, position: { x: originX + index * cycleWidth, y: rowY } })));
    }
    return this.#boundaries;
  }

  #indexOf(cycle: number): number | undefined {
    const index = this.#indexBySourceCycle ? this.#indexBySourceCycle.get(cycle) : cycle - this.#firstCycle;
    return index !== undefined && Number.isInteger(index) && index >= 0 && index < this.#input.sourceCycles.length ? index : undefined;
  }

  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined {
    if (anchor.signalId !== this.signalId) return undefined;
    const index = this.#indexOf(anchor.cycle);
    if (index === undefined) return undefined;
    const { originX, cycleWidth, rowY, sourceCycles } = this.#input;
    const isTerminal = index === sourceCycles.length - 1;
    let x: number | undefined;
    switch (anchor.point) {
      case "cycle-start": x = originX + index * cycleWidth; break;
      case "cycle-center": case "value-center": case "row-center": x = isTerminal ? undefined : originX + (index + 0.5) * cycleWidth; break;
      case "cycle-end": x = isTerminal ? undefined : originX + (index + 1) * cycleWidth; break;
      default: x = undefined;
    }
    if (x === undefined) return undefined;
    const point = Object.freeze({ x: x + (anchor.offset?.x ?? 0), y: rowY + (anchor.offset?.y ?? 0) });
    return Object.freeze({ signalId: this.signalId, anchor, point });
  }
}
