import { describe, expect, it } from "vitest";
import { isWavePrefetchModeEligible, WavePrefetchLifecycle } from "../../packages/renderer/src/wave-prefetch-lifecycle.js";

describe("wave prefetch mode lifecycle", () => {
  it("invalidates an in-flight Cycle generation on Transaction and rebuilds the same plan on return", () => {
    const lifecycle = new WavePrefetchLifecycle();
    expect(lifecycle.setEligible(true)).toBe(true);
    const initialGeneration = lifecycle.nextGeneration();
    expect(lifecycle.setPlanKey("signals-a-b:window-0-128:doc-4")).toBe(true);
    expect(lifecycle.isCurrent(initialGeneration)).toBe(true);

    expect(lifecycle.setEligible(false)).toBe(true);
    expect(lifecycle.isCurrent(initialGeneration)).toBe(false);
    const transactionGeneration = lifecycle.generation;
    expect(lifecycle.setEligible(false)).toBe(false);
    expect(lifecycle.generation).toBe(transactionGeneration);

    expect(lifecycle.setEligible(true)).toBe(true);
    const returnedGeneration = lifecycle.nextGeneration();
    expect(lifecycle.setPlanKey("signals-a-b:window-0-128:doc-4")).toBe(true);
    expect(lifecycle.isCurrent(returnedGeneration)).toBe(true);
    expect(lifecycle.isCurrent(initialGeneration)).toBe(false);
  });

  it("treats Cycle and Split as eligible states and rejects Transaction/unknown states at the caller boundary", () => {
    expect(isWavePrefetchModeEligible("Cycle")).toBe(true);
    expect(isWavePrefetchModeEligible("Split")).toBe(true);
    expect(isWavePrefetchModeEligible("Transaction")).toBe(false);
    expect(isWavePrefetchModeEligible(undefined)).toBe(false);
    const lifecycle = new WavePrefetchLifecycle();
    lifecycle.setEligible(true); // Cycle
    const generation = lifecycle.nextGeneration();
    lifecycle.setPlanKey("same-window");
    expect(lifecycle.isCurrent(generation)).toBe(true);

    // Split remains eligible; it does not invalidate the shared waveform plan.
    expect(lifecycle.setEligible(true)).toBe(false);
    expect(lifecycle.isCurrent(generation)).toBe(true);
    expect(lifecycle.setEligible(false)).toBe(true); // Transaction
    expect(lifecycle.isCurrent(generation)).toBe(false);
  });
});
