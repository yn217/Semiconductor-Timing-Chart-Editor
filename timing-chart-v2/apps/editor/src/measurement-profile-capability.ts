import type { SemanticAnchor, Signal } from "@timing-chart-v2/schema";

/** Transition-based Measurement profiles require two resolvable timing rows. */
export function supportsTransitionMeasurement(start: SemanticAnchor | undefined, end: SemanticAnchor | undefined, signals: readonly Signal[]): boolean {
  if (!start?.signalId || !end?.signalId) return false;
  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  return [start.signalId, end.signalId].every((signalId) => {
    const signal = signalById.get(signalId);
    return signal !== undefined && signal.type !== "clock" && signal.type !== "commentRow";
  });
}
