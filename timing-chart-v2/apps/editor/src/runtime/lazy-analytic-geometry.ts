import { UniformCycleLocalGeometryMap, WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X, type LocalAnchorGeometry, type LocalGeometryEntry, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { analyticLocalGeometry, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";

/**
 * Local Geometry for a Canvas-painted owner (#755). The cycle grid (start/center/end) is arithmetic and allocation-free, so a
 * far jump over a 10k-cycle Transaction extent costs O(cycles) numbers. Everything else -- edges, value boundaries, transition
 * fractions -- comes from the SAME analytic producer the SVG path uses, but only when a consumer (snap index, edge counter,
 * transition anchor) actually asks for it; the result is cached, so there is still exactly one geometry truth.
 */
const GRID_POINTS = new Set(["cycle-start", "cycle-center", "value-center", "row-center", "cycle-end"]);

export class LazyAnalyticGeometryMap implements LocalGeometryMap {
  readonly signalId: SignalId;
  readonly #grid: UniformCycleLocalGeometryMap;
  readonly #waveJson: WaveJsonSignal;
  #analytic: LocalGeometryMap | undefined;

  constructor(signalId: SignalId, waveJson: WaveJsonSignal, sourceCycles: readonly number[]) {
    this.signalId = signalId;
    this.#waveJson = waveJson;
    this.#grid = new UniformCycleLocalGeometryMap(signalId, { sourceCycles, originX: WAVEDROM_ORIGIN_X, cycleWidth: WAVEDROM_CYCLE_WIDTH, rowY: 15 });
  }

  #full(): LocalGeometryMap {
    this.#analytic ??= analyticLocalGeometry(this.signalId, this.#waveJson);
    return this.#analytic;
  }

  cycleBoundaryEntries(): readonly LocalGeometryEntry[] { return this.#grid.cycleBoundaryEntries(); }

  edgeEntries(): readonly LocalGeometryEntry[] { return this.#full().edgeEntries?.() ?? []; }

  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined {
    if (GRID_POINTS.has(anchor.point) && anchor.threshold === undefined) return this.#grid.find(anchor);
    return this.#full().find(anchor);
  }
}
