import type { ClockSignal, Signal } from "./types.js";
import type { ResetSemantics } from "./types.js";
export function validateClockTiming(signal: Signal): string | undefined {
  const generator = clockTiming(signal); if (!generator) return "Signal is not a clock.";
  if (!Number.isInteger(generator.period) || generator.period < 1) return "Clock period must be a positive integer.";
  if (!Number.isFinite(generator.duty) || generator.duty <= 0 || generator.duty >= 1) return "Clock duty must be between 0 and 1.";
  if (!Number.isFinite(generator.phase) || generator.phase < 0) return "Clock phase must be finite and non-negative.";
}
export function clockTiming(signal: Signal): ClockSignal["generator"] | undefined { return signal.type === "clock" ? signal.generator : undefined; }
export function resetSemantics(signal: Signal): ResetSemantics | undefined { return signal.type !== "clock" && signal.type !== "commentRow" ? signal.resetSemantics : undefined; }
