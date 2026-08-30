import type { ClockGenerator } from "./types.js";

/** Number of generated clock slots whose active edge starts inside the timeline. */
export function clockSlotCount(generator: Pick<ClockGenerator, "start" | "period">, cycleCount: number): number {
  if (!Number.isInteger(generator.start) || !Number.isInteger(generator.period) || generator.period <= 0) return 0;
  return generator.start >= cycleCount ? 0 : Math.ceil((cycleCount - generator.start) / generator.period);
}

/** Convert a generator-relative suppression slot to its canonical cycle. */
export function clockCycleForSlot(generator: Pick<ClockGenerator, "start" | "period">, slot: number): number {
  return generator.start + slot * generator.period;
}
