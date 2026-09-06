import type { ClockSignal, Signal } from "./types.js";
import type { ResetSemantics } from "./types.js";
export function clockTiming(signal: Signal): ClockSignal["generator"] | undefined { return signal.type === "clock" ? signal.generator : undefined; }
export function resetSemantics(signal: Signal): ResetSemantics | undefined { return signal.type !== "clock" && signal.type !== "commentRow" ? signal.resetSemantics : undefined; }
