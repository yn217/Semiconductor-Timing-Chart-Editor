import type { ExactSourceCycle } from "@timing-chart-v2/projection";
import type { SignalId } from "@timing-chart-v2/schema";

export type SimulationTraceEvent = Readonly<{ cycle: ExactSourceCycle; value: string }>;
export type SimulationTraceSignal = Readonly<{
  signalId: SignalId;
  signalName: string;
  width: number;
  events: readonly SimulationTraceEvent[];
}>;

/** View-only imported waveform state. It is owned by the editor session, never by Canonical. */
export type SimulationTraceSnapshot = Readonly<{
  documentEpoch: number;
  signal: SimulationTraceSignal;
}>;
