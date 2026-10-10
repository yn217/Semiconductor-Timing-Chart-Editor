/** Projects metrics already published by the surface; this read adds no collector or Open-path work. */
export function readOpenPerformanceData(host: HTMLElement | null): string {
  if (!host) return "Cycle surface is not mounted.";
  const fields = ["openReadiness", "openPhaseMarks", "openPhaseDurations", "openWaveBatchMetrics", "sessionCounters"] as const;
  const phaseMarks = JSON.parse(host.dataset.openPhaseMarks ?? "{}") as Record<string, number>;
  const durations = JSON.parse(host.dataset.openPhaseDurations ?? "{}") as Record<string, number>;
  const waveMetrics = JSON.parse(host.dataset.openWaveBatchMetrics ?? "{}") as Record<string, number>;
  const sessionCounters = JSON.parse(host.dataset.sessionCounters ?? "{}") as { viewMetrics?: { viewportWidth?: number }; mountedWaveOwners?: number };
  const openStart = phaseMarks["open-command-start"] ?? phaseMarks["open-start"] ?? 0;
  const openEnd = performance.now();
  const longTasks = performance.getEntriesByType("longtask").filter((entry) => entry.startTime >= openStart && entry.startTime < openEnd);
  return JSON.stringify({
    ...Object.fromEntries(fields.map((field) => [field, host.dataset[field] ?? null])),
    openTotalWallMs: durations.idle,
    openOutsideWaveBatchMs: typeof durations.idle === "number" && typeof waveMetrics.batchWallMs === "number" ? Math.max(0, durations.idle - waveMetrics.batchWallMs) : null,
    viewportWidth: sessionCounters.viewMetrics?.viewportWidth ?? null,
    mountedWaveOwners: sessionCounters.mountedWaveOwners ?? null,
    nativeSchedulerYieldAvailable: typeof (globalThis as typeof globalThis & { scheduler?: { yield?: unknown } }).scheduler?.yield === "function",
    longTasks: { count: longTasks.length, maxDurationMs: Math.max(0, ...longTasks.map((entry) => entry.duration)) },
  });
}
