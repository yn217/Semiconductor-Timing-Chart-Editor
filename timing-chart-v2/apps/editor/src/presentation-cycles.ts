// Keep Cycle ruler/grid ticks readable by thinning them only enough to avoid
// label overlap at the CURRENT zoom/screen scale -- not by a fixed absolute
// cycle-count cap. A fixed cap thinned long documents even while zoomed in
// (ample pixels per cycle, no overlap risk) and would still let short
// documents overlap at extreme zoom-out. This only controls which cycles
// get a rendered tick; shared time geometry still resolves every source
// cycle for waveform and interaction coordinates.
const MIN_TICK_PITCH_PX = 28;

/** `strideMultiple` (#750): in TC presentation the stride is a whole number of TCs so every kept tick sits on a TC boundary. */
export function presentationCycles(cycleCount: number, pixelsPerCycle = Infinity, maxTicks = Infinity, strideMultiple = 1): number[] {
  if (Number.isFinite(maxTicks) && maxTicks > 1 && cycleCount + 1 > maxTicks) {
    return Array.from({ length: maxTicks }, (_, index) => Math.round(index * cycleCount / (maxTicks - 1)));
  }
  const rawStride = Number.isFinite(pixelsPerCycle) && pixelsPerCycle > 0 ? Math.max(1, Math.ceil(MIN_TICK_PITCH_PX / pixelsPerCycle)) : 1;
  const multiple = Number.isInteger(strideMultiple) && strideMultiple > 1 ? strideMultiple : 1;
  const stride = multiple > 1 ? Math.ceil(rawStride / multiple) * multiple : rawStride;
  if (stride <= 1) return Array.from({ length: cycleCount + 1 }, (_, cycle) => cycle);
  const cycles: number[] = [0];
  for (let cycle = stride; cycle < cycleCount; cycle += stride) cycles.push(cycle);
  if (cycles.at(-1) !== cycleCount) cycles.push(cycleCount);
  return cycles;
}
