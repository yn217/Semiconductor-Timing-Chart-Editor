import { UniformCycleLocalGeometryMap, WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X, type LocalAnchorGeometry, type LocalGeometryEntry, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SemanticAnchor, SignalId } from "@timing-chart-v2/schema";
import { analyticLocalGeometry, WAVEDROM_ROW_Y, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";

/**
 * Local Geometry for a waveform owner. The cycle grid (start/center/end) is arithmetic, so boundaries are available without
 * eagerly constructing every edge/value/transition entry. Detailed anchors come from the same analytic producer as the SVG
 * geometry path, only when a consumer asks for them; the result is cached so there is still exactly one geometry truth.
 */
const GRID_POINTS = new Set(["cycle-start", "cycle-center", "value-center", "row-center", "cycle-end"]);

export class LazyAnalyticGeometryMap implements LocalGeometryMap {
  readonly signalId: SignalId;
  readonly cycleKeyDomain: "source" | "display";
  readonly #grid: UniformCycleLocalGeometryMap;
  readonly #waveJson: WaveJsonSignal;
  #analytic: LocalGeometryMap | undefined;

  constructor(signalId: SignalId, waveJson: WaveJsonSignal, sourceCycles: readonly number[]) {
    this.signalId = signalId;
    this.cycleKeyDomain = waveJson.geometryCycleDomain ?? "source";
    this.#waveJson = waveJson;
    this.#grid = new UniformCycleLocalGeometryMap(signalId, { sourceCycles, originX: WAVEDROM_ORIGIN_X, cycleWidth: WAVEDROM_CYCLE_WIDTH, rowY: WAVEDROM_ROW_Y });
  }

  #full(): LocalGeometryMap {
    this.#analytic ??= analyticLocalGeometry(this.signalId, this.#waveJson);
    return this.#analytic;
  }

  #findWindowedDetail(anchor: SemanticAnchor): LocalAnchorGeometry | undefined | null {
    const { wave, period, phase, clock } = this.#waveJson;
    if ((period ?? 1) !== 1 || (phase ?? 0) !== 0 || wave.length + 1 !== this.#grid.cycleBoundaryCount) return null;
    const targetIndex = this.#grid.indexOfCycleKey(anchor.cycle);
    if (targetIndex === undefined || targetIndex >= wave.length) return null;
    const targetCycleKey = this.#grid.cycleKeyAtIndex(targetIndex);
    const nextCycleKey = this.#grid.cycleKeyAtIndex(targetIndex + 1);
    if (targetCycleKey === undefined || nextCycleKey === undefined) return null;

    let fragmentWave: string;
    let fragmentCycles: number[];
    let fragmentTargetIndex: number;
    let initialClockLevel = clock?.initial;
    if (clock?.expanded) {
      // An expanded clock edge depends only on the level entering this slot.
      // The most recent explicit level token fully determines that state.
      for (let index = targetIndex - 1; index >= 0; index -= 1) {
        const token = wave[index];
        if (!token || token === "." || token === "|") continue;
        if (token === "p") initialClockLevel = 0;
        else if (token === "n") initialClockLevel = 1;
        else if (token === "0" || token === "1") initialClockLevel = Number(token) as 0 | 1;
        else continue;
        break;
      }
      fragmentWave = wave[targetIndex]!;
      fragmentCycles = [targetCycleKey, nextCycleKey];
      fragmentTargetIndex = 0;
    } else if (targetIndex === 0) {
      fragmentWave = wave[0]!;
      fragmentCycles = [targetCycleKey, nextCycleKey];
      fragmentTargetIndex = 0;
    } else {
      let previousToken: string | undefined;
      for (let index = targetIndex - 1; index >= 0; index -= 1) {
        const token = wave[index];
        if (token && token !== "." && token !== "|") {
          previousToken = token;
          break;
        }
      }
      if (previousToken === undefined) return null;
      const previousCycleKey = this.#grid.cycleKeyAtIndex(targetIndex - 1);
      if (previousCycleKey === undefined) return null;
      // WaveDrom's transition brick is a function of the preceding explicit
      // token and the token at this cycle. Holds between them only translate
      // the brick; the local two-token geometry preserves its exact shape.
      fragmentWave = `${previousToken}${wave[targetIndex]!}`;
      fragmentCycles = [previousCycleKey, targetCycleKey, nextCycleKey];
      fragmentTargetIndex = 1;
    }

    const fragment: WaveJsonSignal = {
      wave: fragmentWave,
      ...(clock === undefined ? {} : { clock: { ...clock, initial: initialClockLevel ?? clock.initial } }),
      geometrySourceCycles: fragmentCycles,
      geometryCycleDomain: this.cycleKeyDomain,
    };
    const detailMap = analyticLocalGeometry(this.signalId, fragment);
    const resolved = detailMap.find({ ...anchor, cycle: fragmentCycles[fragmentTargetIndex]! });
    if (!resolved) return undefined;
    const originalBoundary = this.#grid.find({ signalId: this.signalId, cycle: anchor.cycle, point: "cycle-start" });
    const fragmentBoundary = detailMap.find({ signalId: this.signalId, cycle: fragmentCycles[fragmentTargetIndex]!, point: "cycle-start" });
    if (!originalBoundary || !fragmentBoundary) return null;
    return {
      signalId: this.signalId,
      anchor,
      point: {
        x: resolved.point.x + originalBoundary.point.x - fragmentBoundary.point.x,
        y: resolved.point.y,
      },
    };
  }

  cycleBoundaryEntries(): readonly LocalGeometryEntry[] { return this.#grid.cycleBoundaryEntries(); }

  edgeEntries(): readonly LocalGeometryEntry[] { return this.#full().edgeEntries?.() ?? []; }

  find(anchor: SemanticAnchor): LocalAnchorGeometry | undefined {
    if (GRID_POINTS.has(anchor.point) && anchor.threshold === undefined) return this.#grid.find(anchor);
    if (!this.#analytic) {
      const windowed = this.#findWindowedDetail(anchor);
      if (windowed !== null) return windowed;
    }
    return this.#full().find(anchor);
  }
}
