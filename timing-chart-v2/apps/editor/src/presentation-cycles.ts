// Keep normal Cycle labels readable at 100% on the real viewport. This only
// controls ruler presentation; shared time geometry still resolves every
// source cycle for waveform and interaction coordinates.
const MAX_PRESENTATION_CYCLES = 80;

export function presentationCycles(cycleCount: number): number[] {
  if (cycleCount <= MAX_PRESENTATION_CYCLES) return Array.from({ length: cycleCount + 1 }, (_, cycle) => cycle);
  const stride = Math.ceil(cycleCount / MAX_PRESENTATION_CYCLES);
  const cycles: number[] = [0];
  for (let cycle = stride; cycle < cycleCount; cycle += stride) cycles.push(cycle);
  if (cycles.at(-1) !== cycleCount) cycles.push(cycleCount);
  return cycles;
}
