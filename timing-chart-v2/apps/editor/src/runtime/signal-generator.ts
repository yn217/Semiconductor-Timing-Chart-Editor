import type { SignalValueChange } from "@timing-chart-v2/schema";

// #400: the Signal Generator is a pure computation, not a persisted
// canonical field (unlike Clock's own `generator`, which the projection/
// renderer re-evaluate every time because a Clock's waveform must span the
// entire, possibly-changing timeline). A Signal's single/finite/periodic
// pulse pattern is instead computed once here and committed as an ordinary
// `values` array through the exact same `signal.replaceValues` command the
// Manual Event Table already uses -- so every other part of the pipeline
// (validation, projection, renderer, export, WaveDrom adapter) needs no
// changes at all, and the result stays exactly as editable afterward as
// any other Signal's manually-entered values.
export interface SignalGeneratorParams {
  readonly start: number;
  readonly initial: 0 | 1;
  readonly active: 0 | 1;
  readonly width: number;
  readonly period: number;
  readonly repeat: number | "infinite";
  readonly phase: number;
  readonly suppressedPeriods: readonly number[];
  readonly cycleCount: number;
}

export function generateSignalPulseValues(params: SignalGeneratorParams): readonly SignalValueChange[] {
  const { start, initial, active, width, period, repeat, phase, suppressedPeriods, cycleCount } = params;
  if (!Number.isInteger(cycleCount) || cycleCount < 1) throw new Error("Signal Generator requires a positive integer cycle count.");
  if (!Number.isInteger(start) || start < 0) throw new Error("Start must be a non-negative integer.");
  if (!Number.isInteger(period) || period < 1) throw new Error("Period must be a positive integer.");
  if (!Number.isInteger(width) || width < 1 || width >= period) throw new Error("Width must be a positive integer smaller than Period.");
  if (repeat !== "infinite" && (!Number.isInteger(repeat) || repeat < 1)) throw new Error("Repeat must be a positive integer, or Infinite.");
  if (!Number.isInteger(phase)) throw new Error("Phase must be an integer.");

  const effectiveStart = start + phase;
  const maxPulses = repeat === "infinite" ? Math.max(0, Math.ceil((cycleCount - effectiveStart) / period)) + 1 : repeat;
  const points = new Map<number, 0 | 1>();
  points.set(0, initial);
  for (let index = 0; index < maxPulses; index += 1) {
    if (suppressedPeriods.includes(index)) continue;
    const pulseStart = effectiveStart + index * period;
    if (pulseStart < 0 || pulseStart >= cycleCount) continue;
    const pulseEnd = pulseStart + width;
    points.set(pulseStart, active);
    if (pulseEnd < cycleCount) points.set(pulseEnd, initial);
  }
  return Object.freeze([...points.entries()].sort((left, right) => left[0] - right[0]).map(([changeStart, value]) => ({ start: changeStart, value })));
}
