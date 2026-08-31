import type { ClockGenerator, EdgeCounterSettings } from "@timing-chart-v2/schema";

export function serializeClockSettings(signalId: string, name: string, generator: ClockGenerator, edgeCounter: EdgeCounterSettings): string {
  return JSON.stringify({ signalId, name, generator, edgeCounter }, null, 2);
}
