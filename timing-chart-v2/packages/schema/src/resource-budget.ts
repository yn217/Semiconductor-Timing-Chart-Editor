import type { CanonicalDocument, DocumentProblem } from "./types.js";

/** Deterministic product limits applied before a document enters the session. */
export const DOCUMENT_RESOURCE_BUDGET = Object.freeze({
  inputBytes: 50 * 1024 * 1024,
  signalCount: 10_000,
  groupCount: 2_000,
  annotationCount: 20_000,
  transactionCount: 10_000,
  cycleCount: 100_000,
  valueChangeCount: 1_000_000,
  transactionGroupCount: 2_000,
  annotationGroupCount: 2_000,
  enumDefinitionCount: 5_000,
  enumEntryCount: 100_000,
  bookmarkCount: 10_000,
  timeGroupCount: 2_000,
  constraintCount: 10_000,
  labelAnchorCount: 20_000,
  maxJsonDepth: 128,
  maxJsonNodes: 250_000,
});

export function validateDocumentInputComplexity(value: unknown): readonly DocumentProblem[] {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > DOCUMENT_RESOURCE_BUDGET.maxJsonNodes) return [{ code: "RESOURCE_LIMIT_EXCEEDED", path: "$", message: "Document JSON node complexity exceeds the import limit.", expected: String(DOCUMENT_RESOURCE_BUDGET.maxJsonNodes), value: nodes, detail: `resource-budget;metric=jsonNodes;current=${nodes};limit=${DOCUMENT_RESOURCE_BUDGET.maxJsonNodes}` }];
    if (current.depth > DOCUMENT_RESOURCE_BUDGET.maxJsonDepth) return [{ code: "RESOURCE_LIMIT_EXCEEDED", path: "$", message: "Document JSON nesting depth exceeds the import limit.", expected: String(DOCUMENT_RESOURCE_BUDGET.maxJsonDepth), value: current.depth, detail: `resource-budget;metric=jsonDepth;current=${current.depth};limit=${DOCUMENT_RESOURCE_BUDGET.maxJsonDepth}` }];
    if (Array.isArray(current.value)) for (const entry of current.value) stack.push({ value: entry, depth: current.depth + 1 });
    else if (current.value !== null && typeof current.value === "object") for (const entry of Object.values(current.value)) stack.push({ value: entry, depth: current.depth + 1 });
  }
  return [];
}

export function validateDocumentInputBytes(byteLength: number): readonly DocumentProblem[] {
  if (!Number.isFinite(byteLength) || byteLength <= DOCUMENT_RESOURCE_BUDGET.inputBytes) return [];
  return [{
    code: "RESOURCE_LIMIT_EXCEEDED",
    path: "$",
    message: `Document resource limit exceeded for inputBytes: ${byteLength.toLocaleString()} exceeds ${DOCUMENT_RESOURCE_BUDGET.inputBytes.toLocaleString()}.`,
    expected: String(DOCUMENT_RESOURCE_BUDGET.inputBytes),
    value: byteLength,
    detail: `resource-budget;metric=inputBytes;current=${byteLength};limit=${DOCUMENT_RESOURCE_BUDGET.inputBytes}`,
  }];
}

type BudgetMetric = Readonly<{ name: string; path: string; current: number; limit: number }>;

export function validateDocumentResourceBudget(document: CanonicalDocument): readonly DocumentProblem[] {
  // Canonical validation and the resource budget are reported together at the
  // commit boundary. Keep the budget pass total for malformed runtime input:
  // the structural validator owns those diagnostics, while this pass must not
  // throw before the caller can receive them atomically.
  if (document === null || typeof document !== "object") return [];
  const candidate = document as unknown as Record<string, unknown>;
  const signals = Array.isArray(candidate.signals) ? candidate.signals : [];
  const groups = Array.isArray(candidate.signalGroups) ? candidate.signalGroups : [];
  const annotations = Array.isArray(candidate.annotations) ? candidate.annotations : [];
  const transactions = Array.isArray(candidate.transactions) ? candidate.transactions : [];
  const transactionGroups = Array.isArray(candidate.transactionGroups) ? candidate.transactionGroups : [];
  const annotationGroups = Array.isArray(candidate.annotationGroups) ? candidate.annotationGroups : [];
  const enumDefinitions = Array.isArray(candidate.enumDefinitions) ? candidate.enumDefinitions : [];
  const bookmarks = Array.isArray(candidate.bookmarks) ? candidate.bookmarks : [];
  const timeGroups = Array.isArray(candidate.timeGroups) ? candidate.timeGroups : [];
  const constraints = Array.isArray(candidate.constraints) ? candidate.constraints : [];
  const timeline = candidate.timeline !== null && typeof candidate.timeline === "object" ? candidate.timeline as Record<string, unknown> : {};
  const labelAnchors = Array.isArray(timeline.labelAnchors) ? timeline.labelAnchors : [];
  const enumEntryCount = enumDefinitions.reduce((total, entry) => total + (entry !== null && typeof entry === "object" && Array.isArray((entry as Record<string, unknown>).entries) ? ((entry as Record<string, unknown>).entries as unknown[]).length : 0), 0);
  const valueChangeCount = signals.reduce((total, signal) => {
    if (signal === null || typeof signal !== "object") return total;
    const values = (signal as Record<string, unknown>).values;
    return total + (Array.isArray(values) ? values.length : 0);
  }, 0);
  const metrics: readonly BudgetMetric[] = [
    { name: "signals", path: "$.signals", current: signals.length, limit: DOCUMENT_RESOURCE_BUDGET.signalCount },
    { name: "groups", path: "$.signalGroups", current: groups.length, limit: DOCUMENT_RESOURCE_BUDGET.groupCount },
    { name: "annotations", path: "$.annotations", current: annotations.length, limit: DOCUMENT_RESOURCE_BUDGET.annotationCount },
    { name: "transactions", path: "$.transactions", current: transactions.length, limit: DOCUMENT_RESOURCE_BUDGET.transactionCount },
    { name: "cycles", path: "$.timeline.cycleCount", current: typeof timeline.cycleCount === "number" ? timeline.cycleCount : 0, limit: DOCUMENT_RESOURCE_BUDGET.cycleCount },
    { name: "valueChanges", path: "$.signals[*].values", current: valueChangeCount, limit: DOCUMENT_RESOURCE_BUDGET.valueChangeCount },
    { name: "transactionGroups", path: "$.transactionGroups", current: transactionGroups.length, limit: DOCUMENT_RESOURCE_BUDGET.transactionGroupCount },
    { name: "annotationGroups", path: "$.annotationGroups", current: annotationGroups.length, limit: DOCUMENT_RESOURCE_BUDGET.annotationGroupCount },
    { name: "enumDefinitions", path: "$.enumDefinitions", current: enumDefinitions.length, limit: DOCUMENT_RESOURCE_BUDGET.enumDefinitionCount },
    { name: "enumEntries", path: "$.enumDefinitions[*].entries", current: enumEntryCount, limit: DOCUMENT_RESOURCE_BUDGET.enumEntryCount },
    { name: "bookmarks", path: "$.bookmarks", current: bookmarks.length, limit: DOCUMENT_RESOURCE_BUDGET.bookmarkCount },
    { name: "timeGroups", path: "$.timeGroups", current: timeGroups.length, limit: DOCUMENT_RESOURCE_BUDGET.timeGroupCount },
    { name: "constraints", path: "$.constraints", current: constraints.length, limit: DOCUMENT_RESOURCE_BUDGET.constraintCount },
    { name: "labelAnchors", path: "$.timeline.labelAnchors", current: labelAnchors.length, limit: DOCUMENT_RESOURCE_BUDGET.labelAnchorCount },
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
