// Keep Cycle ruler/grid ticks readable by thinning them only enough to avoid
// label overlap at the CURRENT zoom/screen scale -- not by a fixed absolute
// cycle-count cap. A fixed cap thinned long documents even while zoomed in
// (ample pixels per cycle, no overlap risk) and would still let short
// documents overlap at extreme zoom-out. This only controls which cycles
// get a rendered tick; shared time geometry still resolves every source
// cycle for waveform and interaction coordinates.
const MIN_TICK_PITCH_PX = 28;

export function presentationCycles(cycleCount: number, pixelsPerCycle = Infinity, maxTicks = Infinity): number[] {
  if (Number.isFinite(maxTicks) && maxTicks > 1 && cycleCount + 1 > maxTicks) {
    return Array.from({ length: maxTicks }, (_, index) => Math.round(index * cycleCount / (maxTicks - 1)));
  }
  const stride = Number.isFinite(pixelsPerCycle) && pixelsPerCycle > 0 ? Math.max(1, Math.ceil(MIN_TICK_PITCH_PX / pixelsPerCycle)) : 1;
  if (stride <= 1) return Array.from({ length: cycleCount + 1 }, (_, cycle) => cycle);
  const cycles: number[] = [0];
  for (let cycle = stride; cycle < cycleCount; cycle += stride) cycles.push(cycle);
  if (cycles.at(-1) !== cycleCount) cycles.push(cycleCount);
  return cycles;
}
