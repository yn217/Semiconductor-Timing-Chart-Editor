const MAX_PRESENTATION_CYCLES = 512;

export function presentationCycles(cycleCount: number): number[] {
  if (cycleCount <= MAX_PRESENTATION_CYCLES) return Array.from({ length: cycleCount + 1 }, (_, cycle) => cycle);
  const stride = Math.ceil(cycleCount / MAX_PRESENTATION_CYCLES);
  const cycles: number[] = [0];
  for (let cycle = stride; cycle < cycleCount; cycle += stride) cycles.push(cycle);
  if (cycles.at(-1) !== cycleCount) cycles.push(cycleCount);
  return cycles;
}
