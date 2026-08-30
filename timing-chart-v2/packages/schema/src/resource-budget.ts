import type { CanonicalDocument, DocumentProblem } from "./types.js";

/** Deterministic product limits applied before a document enters the session. */
export const DOCUMENT_RESOURCE_BUDGET = Object.freeze({
  signalCount: 10_000,
  groupCount: 2_000,
  annotationCount: 20_000,
  transactionCount: 10_000,
  cycleCount: 100_000,
  valueChangeCount: 1_000_000,
});

type BudgetMetric = Readonly<{ name: string; path: string; current: number; limit: number }>;

export function validateDocumentResourceBudget(document: CanonicalDocument): readonly DocumentProblem[] {
  const valueChangeCount = document.signals.reduce((total, signal) => total + ("values" in signal ? signal.values.length : 0), 0);
  const metrics: readonly BudgetMetric[] = [
    { name: "signals", path: "$.signals", current: document.signals.length, limit: DOCUMENT_RESOURCE_BUDGET.signalCount },
    { name: "groups", path: "$.signalGroups", current: document.signalGroups.length, limit: DOCUMENT_RESOURCE_BUDGET.groupCount },
    { name: "annotations", path: "$.annotations", current: document.annotations.length, limit: DOCUMENT_RESOURCE_BUDGET.annotationCount },
    { name: "transactions", path: "$.transactions", current: document.transactions.length, limit: DOCUMENT_RESOURCE_BUDGET.transactionCount },
    { name: "cycles", path: "$.timeline.cycleCount", current: document.timeline.cycleCount, limit: DOCUMENT_RESOURCE_BUDGET.cycleCount },
    { name: "valueChanges", path: "$.signals[*].values", current: valueChangeCount, limit: DOCUMENT_RESOURCE_BUDGET.valueChangeCount },
  ];
  return metrics.filter(({ current, limit }) => current > limit).map(({ name, path, current, limit }) => ({
    code: "RESOURCE_LIMIT_EXCEEDED",
    path,
    message: `Document resource limit exceeded for ${name}: ${current.toLocaleString()} exceeds ${limit.toLocaleString()}.`,
    expected: String(limit),
    value: current,
    detail: `resource-budget;metric=${name};current=${current};limit=${limit}`,
  }));
}
