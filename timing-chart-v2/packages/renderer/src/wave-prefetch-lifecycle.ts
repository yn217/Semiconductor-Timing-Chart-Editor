/** Owns the generation/key contract for mode-scoped detached waveform preparation. */
export function isWavePrefetchModeEligible(viewMode: string | undefined): boolean {
  return viewMode === "Cycle" || viewMode === "Split";
}

export class WavePrefetchLifecycle {
  #generation = 0;
  #planKey = "";
  #eligible: boolean | undefined;

  get generation(): number { return this.#generation; }

  nextGeneration(): number { return this.#generation + 1; }

  isCurrent(generation: number): boolean {
    return this.#eligible === true && this.#generation === generation;
  }

  setEligible(eligible: boolean): boolean {
    if (this.#eligible === eligible) return false;
    this.#eligible = eligible;
    this.invalidatePlan();
    return true;
  }

  setPlanKey(key: string): boolean {
    if (key === this.#planKey) return false;
    this.#planKey = key;
    this.#generation += 1;
    return true;
  }

  invalidatePlan(): void {
    this.#generation += 1;
    this.#planKey = "";
  }
}
