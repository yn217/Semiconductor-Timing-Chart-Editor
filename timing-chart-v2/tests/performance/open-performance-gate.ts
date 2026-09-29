export type OpenPerformanceBaseline = Readonly<{
  sourceCommit: string;
  measurement: string;
  sampleCount: number;
  percentileMethod: string;
  absoluteP95BudgetMsExclusive: number;
  maxMedianRegressionRatio: number;
  maxP95RegressionRatio: number;
  fixtures: Readonly<Record<string, Readonly<{ medianMs: number; p95Ms: number }>>>;
  limitations: string;
}>;

export type OpenPerformanceSummary = Readonly<{
  fixture: string;
  samplesMs: readonly number[];
  medianMs: number;
  p95Ms: number;
}>;

/** Nearest-rank percentiles; small samples intentionally resolve p95 to the maximum. */
export function summarizeOpenPresentation(fixture: string, samplesMs: readonly number[]): OpenPerformanceSummary {
  if (samplesMs.length === 0 || samplesMs.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error("Open performance samples must be a non-empty list of finite, non-negative durations.");
  }
  const ordered = [...samplesMs].sort((left, right) => left - right);
  const nearestRank = (fraction: number) => ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)]!;
  return { fixture, samplesMs: [...samplesMs], medianMs: nearestRank(0.5), p95Ms: nearestRank(0.95) };
}

/** Compare production browser marks against the checked-in approved-main budget. */
export function evaluateOpenPerformanceGate(summary: OpenPerformanceSummary, baseline: OpenPerformanceBaseline): readonly string[] {
  const reference = baseline.fixtures[summary.fixture];
  if (!reference) return [`${summary.fixture}: no approved-main performance baseline exists.`];
  const failures: string[] = [];
  if (summary.p95Ms >= baseline.absoluteP95BudgetMsExclusive) {
    failures.push(`${summary.fixture}: presentation-ready p95 ${summary.p95Ms.toFixed(1)}ms must be < ${baseline.absoluteP95BudgetMsExclusive}ms.`);
  }
  const medianLimit = reference.medianMs * baseline.maxMedianRegressionRatio;
  if (summary.medianMs > medianLimit) {
    failures.push(`${summary.fixture}: presentation-ready p50 ${summary.medianMs.toFixed(1)}ms exceeds approved-main ${reference.medianMs.toFixed(1)}ms × ${baseline.maxMedianRegressionRatio} (${medianLimit.toFixed(1)}ms).`);
  }
  const p95Limit = reference.p95Ms * baseline.maxP95RegressionRatio;
  if (summary.p95Ms > p95Limit) {
    failures.push(`${summary.fixture}: presentation-ready p95 ${summary.p95Ms.toFixed(1)}ms exceeds approved-main ${reference.p95Ms.toFixed(1)}ms × ${baseline.maxP95RegressionRatio} (${p95Limit.toFixed(1)}ms).`);
  }
  return failures;
}
