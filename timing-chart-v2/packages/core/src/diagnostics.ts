import type { CanonicalDocument, Signal, SignalId, SignalValueChange, ValueSignal } from "@timing-chart-v2/schema";
import type { DocumentProblem } from "@timing-chart-v2/schema";

/**
 * Derived timing/protocol diagnostics are advisory. They describe a valid
 * canonical document and must never be fed back into DocumentSession.commit.
 * Keeping the codes here, rather than in the schema validator, makes that
 * boundary explicit.
 */
export const TIMING_DIAGNOSTIC_CODES = [
  "UNKNOWN_SIGNAL_VALUE",
  "UNINITIALIZED_SIGNAL_VALUE",
  "HANDSHAKE_CONSTRAINT_INVALID",
  "HANDSHAKE_NO_ACK",
  "HANDSHAKE_DATA_UNSTABLE",
  "LATENCY_RANGE_CONSTRAINT_INVALID",
  "LATENCY_RANGE_VIOLATION",
  "LATENCY_CONSTRAINT_INVALID",
  "LATENCY_RESPONSE_MISSING",
  "LATENCY_OUT_OF_RANGE",
] as const;

export type TimingDiagnosticCode = typeof TIMING_DIAGNOSTIC_CODES[number];
export const TIMING_DIAGNOSTIC_CATEGORIES = ["unknown-value", "protocol", "stability"] as const;
export type TimingDiagnosticCategory = typeof TIMING_DIAGNOSTIC_CATEGORIES[number];

export interface TimingDiagnostic extends DocumentProblem {
  readonly code: TimingDiagnosticCode;
  readonly category: TimingDiagnosticCategory;
  readonly severity: "warning";
  readonly source: "validation";
  readonly stage: "validate";
  /** Added by the registry evaluator; raw rule-local findings omit these. */
  readonly ruleId?: string;
  readonly stableKey?: string;
  readonly sourceCycle?: number;
}

export interface TimingDiagnosticOptions {
  /** Overrides the document setting when supplied. An empty list disables all rules. */
  readonly enabledCategories?: readonly TimingDiagnosticCategory[];
}

type ConstraintValue = string | number | boolean | null | readonly ConstraintValue[] | { readonly [key: string]: ConstraintValue };
type ConstraintData = { readonly [key: string]: ConstraintValue };

const LOGIC_HIGH = new Set(["1", "high", "h", "true"]);
const LOGIC_LOW = new Set(["0", "low", "l", "false"]);
const LOGIC_UNKNOWN = new Set(["x", "z", "unknown", "undefined"]);

function text(value: ConstraintValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function textFrom(data: ConstraintData, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = text(data[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function textListFrom(data: ConstraintData, keys: readonly string[]): readonly string[] {
  for (const key of keys) {
    const value = data[key];
    if (!Array.isArray(value)) continue;
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  }
  return [];
}

function polarityFrom(data: ConstraintData, keys: readonly string[]): "active-high" | "active-low" {
  return textFrom(data, keys) === "active-low" ? "active-low" : "active-high";
}

function constraintData(value: unknown): ConstraintData {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ConstraintData;
}

function unknownToken(signal: ValueSignal, value: string | number): string | undefined {
  if (typeof value === "number") return undefined;
  const compact = value.trim().replaceAll("_", "").toLowerCase();
  if (compact.length === 0) return undefined;
  if (signal.type === "binary" || signal.type === "logic" || signal.type === "pulse") {
    return /^[xz]+$/.test(compact) || LOGIC_UNKNOWN.has(compact) ? compact : undefined;
  }
  if (signal.type === "bus") {
    const digits = compact.startsWith("0b") || compact.startsWith("0x") ? compact.slice(2) : compact;
    if (digits.length === 0 || !/^[0-9a-fxz]+$/.test(digits)) return undefined;
    return /[xz]/.test(digits) ? compact : undefined;
  }
  if (signal.type === "state") return LOGIC_UNKNOWN.has(compact) ? compact : undefined;
  return undefined;
}

function signalValuePath(signalIndex: number, field: "values", changeIndex: number, property: "start" | "value"): string {
  return `$.signals[${signalIndex}].${field}[${changeIndex}].${property}`;
}

function signalProblem(
  code: TimingDiagnosticCode,
  category: TimingDiagnosticCategory,
  path: string,
  message: string,
  signal: Signal,
  value?: string | number,
): TimingDiagnostic {
  return {
    code,
    category,
    severity: "warning",
    path,
    message,
    entityId: signal.id,
    objectType: "signal",
    objectId: signal.id,
    objectLabel: signal.name,
    source: "validation",
    stage: "validate",
    ...(value === undefined ? {} : { value }),
  };
}

function valueDiagnostics(document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>): TimingDiagnostic[] {
  const problems: TimingDiagnostic[] = [];
  if (!enabled.has("unknown-value")) return problems;
  document.signals.forEach((signal, signalIndex) => {
    problems.push(...signalValueDiagnostics(signal, signalIndex));
  });
  return problems;
}

function signalValueDiagnostics(signal: Signal, signalIndex: number): TimingDiagnostic[] {
  if (signal.type === "clock" || signal.type === "commentRow") return [];
  const problems: TimingDiagnostic[] = [];
  const changes = signal.values;
  if (changes[0] && changes[0].start > 0) {
    problems.push(signalProblem(
      "UNINITIALIZED_SIGNAL_VALUE",
      "unknown-value",
      signalValuePath(signalIndex, "values", 0, "start"),
      `Signal '${signal.name}' is unknown before its first value at cycle ${changes[0].start}.`,
      signal,
      changes[0].start,
    ));
  }
  changes.forEach((change, changeIndex) => {
    const token = unknownToken(signal, change.value);
    if (token === undefined) return;
    problems.push(signalProblem(
      "UNKNOWN_SIGNAL_VALUE",
      "unknown-value",
      signalValuePath(signalIndex, "values", changeIndex, "value"),
      `Signal '${signal.name}' contains unknown value '${String(change.value)}' at cycle ${change.start}.`,
      signal,
      change.value,
    ));
  });
  return problems;
}

function withRuleMetadata(diagnostic: TimingDiagnostic, ruleId: string): TimingDiagnostic {
  return {
    ...diagnostic,
    ruleId,
    stableKey: `${ruleId}:${diagnostic.code}:${diagnostic.objectId ?? diagnostic.entityId ?? ""}:${diagnostic.path}${diagnostic.sourceCycle === undefined ? "" : `:cycle:${diagnostic.sourceCycle}`}`,
  };
}

function level(value: string | number): "high" | "low" | "unknown" {
  if (typeof value === "number") return value === 1 ? "high" : value === 0 ? "low" : "unknown";
  const normalized = value.trim().replaceAll("_", "").toLowerCase();
  if (LOGIC_HIGH.has(normalized)) return "high";
  if (LOGIC_LOW.has(normalized)) return "low";
  return "unknown";
}

function asserted(change: SignalValueChange, polarity: "active-high" | "active-low"): boolean {
  const state = level(change.value);
  return state === (polarity === "active-low" ? "low" : "high");
}

function risingEdges(signal: ValueSignal): readonly number[] {
  const edges: number[] = [];
  let previous: "high" | "low" | "unknown" = "unknown";
  for (const change of signal.values) {
    const current = level(change.value);
    if (previous === "low" && current === "high") edges.push(change.start);
    previous = current;
  }
  return edges;
}

function firstCycleAtOrAfter(cycles: readonly number[], targetCycle: number): number {
  let low = 0;
  let high = cycles.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cycles[middle]! < targetCycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstCycleAtLatency(cycles: readonly number[], requestCycle: number, minCycles: number): number {
  let low = 0;
  let high = cycles.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cycles[middle]! - requestCycle < minCycles) low = middle + 1;
    else high = middle;
  }
  return low;
}

function latencyRangeDiagnostics(document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>, providedIndexes?: TimingDiagnosticIndexes): TimingDiagnostic[] {
  if (!enabled.has("protocol")) return [];
  const indexes = providedIndexes ?? buildTimingDiagnosticIndexes(document, enabled);
  const problems: TimingDiagnostic[] = [];
  const add = (code: TimingDiagnosticCode, path: string, message: string, constraintId: string, sourceCycle?: number): void => {
    problems.push({ code, category: "protocol", severity: "warning", path, message, entityId: constraintId, objectType: "constraint", objectId: constraintId, source: "validation", stage: "validate", ...(sourceCycle === undefined ? {} : { sourceCycle }) });
  };

  document.constraints.forEach((constraint, index) => {
    if (constraint.type.toLowerCase() !== "latency-range") return;
    const data = constraintData(constraint.data);
    const requestId = textFrom(data, ["requestSignalId"]) as SignalId | undefined;
    const acknowledgeId = textFrom(data, ["acknowledgeSignalId"]) as SignalId | undefined;
    const minCycles = data.minCycles;
    const maxCycles = data.maxCycles;
    const basePath = `$.constraints[${index}].data`;
    if (!requestId || !acknowledgeId || typeof minCycles !== "number" || !Number.isSafeInteger(minCycles) || minCycles < 0 || typeof maxCycles !== "number" || !Number.isSafeInteger(maxCycles) || maxCycles < minCycles) {
      add("LATENCY_RANGE_CONSTRAINT_INVALID", basePath, "Latency-range constraint requires requestSignalId, acknowledgeSignalId, and integer minCycles/maxCycles with 0 <= minCycles <= maxCycles.", constraint.id);
      return;
    }
    const request = indexes.signalsById.get(requestId);
    const acknowledge = indexes.signalsById.get(acknowledgeId);
    if (!request || (request.type !== "binary" && request.type !== "logic" && request.type !== "pulse")) {
      add("LATENCY_RANGE_CONSTRAINT_INVALID", `${basePath}.requestSignalId`, `Request signal '${requestId}' does not reference a binary, logic, or pulse signal.`, constraint.id);
      return;
    }
    if (!acknowledge || (acknowledge.type !== "binary" && acknowledge.type !== "logic" && acknowledge.type !== "pulse")) {
      add("LATENCY_RANGE_CONSTRAINT_INVALID", `${basePath}.acknowledgeSignalId`, `Acknowledge signal '${acknowledgeId}' does not reference a binary, logic, or pulse signal.`, constraint.id);
      return;
    }
    const acknowledgeEdges = risingEdges(acknowledge);
    for (const requestCycle of risingEdges(request)) {
      const firstLaterIndex = firstCycleAtOrAfter(acknowledgeEdges, requestCycle);
      const matchIndex = minCycles === 0 ? firstLaterIndex : firstCycleAtLatency(acknowledgeEdges, requestCycle, minCycles);
      const matchingCycle = acknowledgeEdges[matchIndex];
      if (matchingCycle !== undefined && matchingCycle - requestCycle <= maxCycles) continue;
      const firstLaterCycle = acknowledgeEdges[firstLaterIndex];
      const observed = firstLaterCycle === undefined ? "no acknowledge rising edge at or after the request" : `no acknowledge rising edge in range (first later edge is ${firstLaterCycle - requestCycle} cycles after the request)`;
      add("LATENCY_RANGE_VIOLATION", `${basePath}.acknowledgeSignalId`, `Request '${request.name}' rises at cycle ${requestCycle}; ${observed}, expected ${minCycles}..${maxCycles} cycles.`, constraint.id, requestCycle);
    }
  });
  return problems;
}

function firstChangeAtOrAfter(changes: readonly SignalValueChange[], cycle: number): number {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (changes[middle]!.start < cycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstChangeAfter(changes: readonly SignalValueChange[], cycle: number): number {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (changes[middle]!.start <= cycle) low = middle + 1;
    else high = middle;
  }
  return low;
}

function assertedChanges(signal: Signal, polarity: "active-high" | "active-low"): readonly SignalValueChange[] {
  return signal.type === "clock" || signal.type === "commentRow" ? [] : signal.values.filter((change) => asserted(change, polarity));
}

function numberFrom(data: ConstraintData, key: string): number | undefined {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function edgeCycles(signal: Signal, edge: "rising" | "falling"): number[] {
  if (signal.type === "clock" || signal.type === "commentRow") return [];
  const matches = (before: "high" | "low" | "unknown", after: "high" | "low" | "unknown"): boolean => edge === "rising"
    ? before === "low" && after === "high"
    : before === "high" && after === "low";
  const cycles: number[] = [];
  for (let index = 1; index < signal.values.length; index += 1) {
    const before = level(signal.values[index - 1]!.value);
    const after = level(signal.values[index]!.value);
    if (matches(before, after)) cycles.push(signal.values[index]!.start);
  }
  return cycles;
}

function isEdgeValueSignal(signal: Signal | undefined): signal is ValueSignal {
  return signal !== undefined && (signal.type === "binary" || signal.type === "logic" || signal.type === "bus" || signal.type === "pulse");
}

function handshakeDiagnostics(
  document: CanonicalDocument,
  enabled: ReadonlySet<TimingDiagnosticCategory>,
  providedIndexes?: TimingDiagnosticIndexes,
): TimingDiagnostic[] {
  const problems: TimingDiagnostic[] = [];
  const indexes = providedIndexes ?? buildTimingDiagnosticIndexes(document, enabled);
  const addConstraintProblem = (code: TimingDiagnosticCode, path: string, message: string, constraintId: string): void => {
    problems.push({ code, category: "protocol", severity: "warning", path, message, entityId: constraintId, objectType: "constraint", objectId: constraintId, source: "validation", stage: "validate" });
  };

  document.constraints.forEach((constraint, constraintIndex) => {
    if (constraint.type.toLowerCase() !== "handshake") return;
    const data = constraintData(constraint.data);
    const requestId = textFrom(data, ["requestSignalId", "request", "reqSignalId", "req"]) as SignalId | undefined;
    const acknowledgeId = textFrom(data, ["acknowledgeSignalId", "ackSignalId", "acknowledge", "ack"]) as SignalId | undefined;
    const stableIds = textListFrom(data, ["stableSignalIds", "dataSignalIds", "stableSignals", "dataSignals"]) as SignalId[];
    const basePath = `$.constraints[${constraintIndex}].data`;
    if (!requestId || !acknowledgeId) {
      addConstraintProblem("HANDSHAKE_CONSTRAINT_INVALID", basePath, "Handshake constraint requires requestSignalId and acknowledgeSignalId.", constraint.id);
      return;
    }
    const request = indexes.signalsById.get(requestId);
    const acknowledge = indexes.signalsById.get(acknowledgeId);
    if (!request || request.type === "clock" || request.type === "commentRow") {
      addConstraintProblem("HANDSHAKE_CONSTRAINT_INVALID", `${basePath}.requestSignalId`, `Request signal '${requestId}' does not reference a value signal.`, constraint.id);
      return;
    }
    if (!acknowledge || acknowledge.type === "clock" || acknowledge.type === "commentRow") {
      addConstraintProblem("HANDSHAKE_CONSTRAINT_INVALID", `${basePath}.acknowledgeSignalId`, `Acknowledge signal '${acknowledgeId}' does not reference a value signal.`, constraint.id);
      return;
    }
    const stableSignals = stableIds.map((id) => indexes.signalsById.get(id));
    if (stableSignals.some((signal) => signal === undefined || signal.type === "clock" || signal.type === "commentRow")) {
      addConstraintProblem("HANDSHAKE_CONSTRAINT_INVALID", `${basePath}.stableSignalIds`, "Every stable signal must reference a value signal.", constraint.id);
      return;
    }
    const requestPolarity = polarityFrom(data, ["requestPolarity", "requestActiveLevel"]);
    const acknowledgePolarity = polarityFrom(data, ["acknowledgePolarity", "ackPolarity", "ackActiveLevel"]);
    const requestChanges = request.values;
    const acknowledgeChanges = assertedChanges(acknowledge, acknowledgePolarity);
    requestChanges.forEach((requestChange) => {
      if (!asserted(requestChange, requestPolarity)) return;
      const ackIndex = firstChangeAtOrAfter(acknowledgeChanges, requestChange.start);
      const ackChange = acknowledgeChanges[ackIndex];
      if (!ackChange) {
        if (enabled.has("protocol")) addConstraintProblem("HANDSHAKE_NO_ACK", `${basePath}.acknowledgeSignalId`, `Handshake request '${request.name}' at cycle ${requestChange.start} has no acknowledge assertion before the timeline ends.`, constraint.id);
        return;
      }
      if (!enabled.has("stability")) return;
      stableSignals.forEach((stableSignal) => {
        if (!stableSignal || stableSignal.type === "clock" || stableSignal.type === "commentRow") return;
        const firstRelevant = firstChangeAfter(stableSignal.values, requestChange.start);
        const endExclusive = firstChangeAtOrAfter(stableSignal.values, ackChange.start);
        const index = indexes.signalIndexById.get(stableSignal.id);
        if (index === undefined) return;
        for (let changeIndex = firstRelevant; changeIndex < endExclusive; changeIndex += 1) {
          const change = stableSignal.values[changeIndex]!;
          problems.push(signalProblem(
            "HANDSHAKE_DATA_UNSTABLE",
            "stability",
            signalValuePath(index, "values", changeIndex, "start"),
            `Signal '${stableSignal.name}' changes at cycle ${change.start} before handshake acknowledge at cycle ${ackChange.start}.`,
            stableSignal,
            change.value,
          ));
        }
      });
    });
  });
  return problems;
}

/** Evaluate JSON constraints of the form REQ edge -> ACK edge within N..M cycles. */
function latencyDiagnostics(document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>, providedIndexes?: TimingDiagnosticIndexes): TimingDiagnostic[] {
  if (!enabled.has("protocol")) return [];
  const problems: TimingDiagnostic[] = [];
  const indexes = providedIndexes ?? buildTimingDiagnosticIndexes(document, enabled);
  document.constraints.forEach((constraint, constraintIndex) => {
    if (constraint.type.toLowerCase() !== "latency") return;
    const data = constraintData(constraint.data);
    const triggerId = textFrom(data, ["triggerSignalId"]) as SignalId | undefined;
    const responseId = textFrom(data, ["responseSignalId"]) as SignalId | undefined;
    const triggerEdge = textFrom(data, ["triggerEdge"]);
    const responseEdge = textFrom(data, ["responseEdge"]);
    const minCycles = numberFrom(data, "minCycles");
    const maxCycles = numberFrom(data, "maxCycles");
    const trigger = triggerId ? indexes.signalsById.get(triggerId) : undefined;
    const response = responseId ? indexes.signalsById.get(responseId) : undefined;
    const basePath = `$.constraints[${constraintIndex}].data`;
    const invalid = !triggerId || !responseId || !isEdgeValueSignal(trigger) || !isEdgeValueSignal(response)
      || (triggerEdge !== "rising" && triggerEdge !== "falling")
      || (responseEdge !== "rising" && responseEdge !== "falling")
      || minCycles === undefined || !Number.isInteger(minCycles) || minCycles < 0
      || maxCycles === undefined || !Number.isInteger(maxCycles) || maxCycles < minCycles;
    if (invalid) {
      problems.push({ code: "LATENCY_CONSTRAINT_INVALID", category: "protocol", severity: "warning", path: basePath, message: "Latency constraint requires value-signal IDs, rising/falling edges, and integer cycle bounds where 0 ≤ minCycles ≤ maxCycles.", entityId: constraint.id, objectType: "constraint", objectId: constraint.id, source: "validation", stage: "validate" });
      return;
    }
    const triggerCycles = edgeCycles(trigger, triggerEdge);
    const responseCycles = edgeCycles(response, responseEdge);
    let responseIndex = 0;
    const responseIndexInDocument = indexes.signalIndexById.get(response.id) ?? -1;
    triggerCycles.forEach((triggerCycle) => {
      while (responseIndex < responseCycles.length && responseCycles[responseIndex]! < triggerCycle) responseIndex += 1;
      const responseCycle = responseCycles[responseIndex];
      if (responseCycle === undefined) {
        problems.push({ code: "LATENCY_RESPONSE_MISSING", category: "protocol", severity: "warning", path: `$.signals[${responseIndexInDocument}]`, message: `Signal '${response.name}' has no ${responseEdge} edge for '${trigger.name}' ${triggerEdge} at cycle ${triggerCycle}.`, entityId: response.id, objectType: "constraint", objectId: constraint.id, objectLabel: constraint.id, source: "validation", stage: "validate", expected: `${minCycles}..${maxCycles} cycles` });
        return;
      }
      responseIndex += 1;
      const latency = responseCycle - triggerCycle;
      if (latency < minCycles || latency > maxCycles) {
        problems.push({ code: "LATENCY_OUT_OF_RANGE", category: "protocol", severity: "warning", path: `$.signals[${responseIndexInDocument}]`, message: `Signal '${response.name}' edge at cycle ${responseCycle} is ${latency} cycles after '${trigger.name}' at cycle ${triggerCycle}; expected ${minCycles}..${maxCycles}.`, entityId: response.id, objectType: "constraint", objectId: constraint.id, objectLabel: constraint.id, source: "validation", stage: "validate", value: latency, expected: `${minCycles}..${maxCycles} cycles` });
      }
    });
  });
  return problems;
}

function diagnosticOrder(left: TimingDiagnostic, right: TimingDiagnostic): number {
  return left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || (left.objectId ?? "").localeCompare(right.objectId ?? "");
}

export interface TimingDiagnosticRule {
  readonly id: string;
  /** Primary category retained for compatibility with existing rule consumers. */
  readonly category: TimingDiagnosticCategory;
  /** Categories that can be emitted by this evaluator. */
  readonly categories?: readonly TimingDiagnosticCategory[];
  /** `indexes` is optional to preserve direct rule evaluation compatibility. */
  readonly evaluate: (document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>, indexes?: TimingDiagnosticIndexes) => readonly TimingDiagnostic[];
}

type TimingDiagnosticIndexes = Readonly<{
  signalsById: ReadonlyMap<SignalId, Signal>;
  signalIndexById: ReadonlyMap<SignalId, number>;
}>;

function buildTimingDiagnosticIndexes(document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>): TimingDiagnosticIndexes {
  const signalsById = new Map<SignalId, Signal>();
  const signalIndexById = new Map<SignalId, number>();
  if (enabled.has("protocol") || enabled.has("stability")) {
    document.signals.forEach((signal, index) => {
      signalsById.set(signal.id, signal);
      signalIndexById.set(signal.id, index);
    });
  }
  return { signalsById, signalIndexById };
}

/** Shared derived-rule registry. Results remain outside CanonicalDocument. */
export const TIMING_DIAGNOSTIC_RULES: readonly TimingDiagnosticRule[] = [
  { id: "timing.unknown-value", category: "unknown-value", evaluate: valueDiagnostics },
  { id: "timing.handshake", category: "protocol", categories: ["protocol", "stability"], evaluate: handshakeDiagnostics },
  { id: "timing.latency-range", category: "protocol", evaluate: latencyRangeDiagnostics },
  { id: "timing.latency", category: "protocol", evaluate: latencyDiagnostics },
];

function enabledDiagnosticCategories(document: CanonicalDocument): ReadonlySet<TimingDiagnosticCategory> {
  const configured = document.checkSettings.enabledCategories;
  return new Set<TimingDiagnosticCategory>(configured === undefined ? TIMING_DIAGNOSTIC_CATEGORIES : configured.filter((category): category is TimingDiagnosticCategory => TIMING_DIAGNOSTIC_CATEGORIES.some((known) => known === category)));
}

/** Derive deterministic, non-persistent timing/protocol Problems from Canonical data. */
export function deriveTimingDiagnostics(document: CanonicalDocument, options: TimingDiagnosticOptions = {}): readonly TimingDiagnostic[] {
  const enabled = options.enabledCategories === undefined ? enabledDiagnosticCategories(document) : new Set<TimingDiagnosticCategory>(options.enabledCategories.filter((category): category is TimingDiagnosticCategory => TIMING_DIAGNOSTIC_CATEGORIES.some((known) => known === category)));
  const indexes = buildTimingDiagnosticIndexes(document, enabled);
  return TIMING_DIAGNOSTIC_RULES.filter((rule) => (rule.categories ?? [rule.category]).some((category) => enabled.has(category)))
    .flatMap((rule) => rule.evaluate(document, enabled, indexes)
    .map((diagnostic) => withRuleMetadata(diagnostic, rule.id)))
    .sort(diagnosticOrder);
}

function evaluateSingleConstraintDiagnostics(document: CanonicalDocument, constraint: CanonicalDocument["constraints"][number], index: number, enabled: ReadonlySet<TimingDiagnosticCategory>, indexes: TimingDiagnosticIndexes): TimingDiagnostic[] {
  const singleConstraintDocument = { ...document, constraints: [constraint] };
  const output: TimingDiagnostic[] = [];
  const append = (diagnostics: readonly TimingDiagnostic[], ruleId: string) => {
    for (const diagnostic of diagnostics) {
      const path = diagnostic.path.replace("$.constraints[0]", `$.constraints[${index}]`);
      output.push(withRuleMetadata({ ...diagnostic, path }, ruleId));
    }
  };
  const type = constraint.type.toLowerCase();
  if (type === "latency-range" && enabled.has("protocol")) append(latencyRangeDiagnostics(singleConstraintDocument, enabled, indexes), "timing.latency-range");
  else if (type === "latency" && enabled.has("protocol")) append(latencyDiagnostics(singleConstraintDocument, enabled, indexes), "timing.latency");
  return output;
}

/**
 * Reuse a previous timing-diagnostic result when all of its canonical inputs
 * are structurally shared. These are the complete document dependencies of
 * the registered rules; unrelated immutable edits (for example Annotation,
 * Bookmark, or Transaction presentation changes) therefore do no rule work.
 * Collection identity is deliberately the correctness guard rather than a
 * command-name allowlist, so newly added commands remain safe by default.
 */
export function deriveTimingDiagnosticsIfInputsChanged(
  previousDocument: CanonicalDocument,
  nextDocument: CanonicalDocument,
  previousDiagnostics: readonly TimingDiagnostic[],
  options: Readonly<{ timingDiagnosticsUnchanged?: boolean }> = {},
): Readonly<{ diagnostics: readonly TimingDiagnostic[]; recomputed: boolean }> {
  // CheckSettings currently only controls which rule categories are enabled.
  // When that is the sole changed input, preserve findings for still-enabled
  // categories and evaluate only newly enabled categories. In particular,
  // disabling a category must not rescan Signals or Constraints.
  if (previousDocument.signals === nextDocument.signals
    && previousDocument.constraints === nextDocument.constraints
    && previousDocument.checkSettings !== nextDocument.checkSettings) {
    const previousEnabled = enabledDiagnosticCategories(previousDocument);
    const nextEnabled = enabledDiagnosticCategories(nextDocument);
    const newlyEnabled = [...nextEnabled].filter((category) => !previousEnabled.has(category));
    const diagnostics = [
      ...previousDiagnostics.filter((diagnostic) => nextEnabled.has(diagnostic.category)),
      ...(newlyEnabled.length > 0 ? deriveTimingDiagnostics(nextDocument, { enabledCategories: newlyEnabled }) : []),
    ].sort(diagnosticOrder);
    return { diagnostics, recomputed: newlyEnabled.length > 0 };
  }

  const sharedRuleInputs = previousDocument.constraints === nextDocument.constraints
    && previousDocument.checkSettings === nextDocument.checkSettings;
  if (sharedRuleInputs && (previousDocument.signals === nextDocument.signals
    || (options.timingDiagnosticsUnchanged === true && previousDocument.signals.length === nextDocument.signals.length))) {
    return { diagnostics: previousDiagnostics, recomputed: false };
  }
  if (previousDocument.signals === nextDocument.signals && previousDocument.checkSettings === nextDocument.checkSettings
    && previousDocument.constraints !== nextDocument.constraints) {
    const previousById = new Map(previousDocument.constraints.map((constraint) => [constraint.id, constraint] as const));
    const nextById = new Map(nextDocument.constraints.map((constraint) => [constraint.id, constraint] as const));
    if (previousById.size === previousDocument.constraints.length && nextById.size === nextDocument.constraints.length) {
      const changedIds = new Set<CanonicalDocument["constraints"][number]["id"]>();
      for (const [id, constraint] of previousById) if (nextById.get(id) !== constraint) changedIds.add(id);
      for (const id of nextById.keys()) if (!previousById.has(id)) changedIds.add(id);
      if (changedIds.size === 0) {
        const nextIndexById = new Map(nextDocument.constraints.map((constraint, index) => [constraint.id, index] as const));
        const rebased = previousDiagnostics.map((diagnostic) => {
          const nextIndex = diagnostic.objectId === undefined ? undefined : nextIndexById.get(diagnostic.objectId as CanonicalDocument["constraints"][number]["id"]);
          const path = nextIndex === undefined || diagnostic.category !== "protocol"
            ? diagnostic.path
            : diagnostic.path.replace(/^\$\.constraints\[\d+\]/, `$.constraints[${nextIndex}]`);
          return path === diagnostic.path || diagnostic.ruleId === undefined
            ? diagnostic
            : withRuleMetadata({ ...diagnostic, path }, diagnostic.ruleId);
        });
        return { diagnostics: rebased.sort(diagnosticOrder), recomputed: true };
      }

      const enabled = enabledDiagnosticCategories(nextDocument);
      const affectedStableSignalIds = new Set<SignalId>();
      if (enabled.has("stability")) {
        for (const id of changedIds) {
          for (const constraint of [previousById.get(id), nextById.get(id)]) {
            if (!constraint) continue;
            for (const signalId of handshakeStableSignalDependencies(constraint)) affectedStableSignalIds.add(signalId);
          }
        }
      }
      const stabilityRefreshConstraintIds = new Set<string>();
      if (affectedStableSignalIds.size > 0) {
        for (const constraint of nextDocument.constraints) {
          if (constraint.type.toLowerCase() !== "handshake") continue;
          if (handshakeStableSignalDependencies(constraint).some((id) => affectedStableSignalIds.has(id))) stabilityRefreshConstraintIds.add(constraint.id);
        }
      }
      const constraintsToReevaluate = new Set([...changedIds, ...stabilityRefreshConstraintIds]);
      const nextIndexById = new Map(nextDocument.constraints.map((constraint, index) => [constraint.id, index] as const));
      const retained = previousDiagnostics.flatMap((diagnostic) => {
        if (diagnostic.category === "protocol" && diagnostic.objectId !== undefined && changedIds.has(diagnostic.objectId as CanonicalDocument["constraints"][number]["id"])) return [];
        if (diagnostic.category === "stability" && diagnostic.entityId !== undefined && affectedStableSignalIds.has(diagnostic.entityId as SignalId)) return [];
        const nextIndex = diagnostic.objectId === undefined ? undefined : nextIndexById.get(diagnostic.objectId as CanonicalDocument["constraints"][number]["id"]);
        const path = nextIndex === undefined || diagnostic.category !== "protocol"
          ? diagnostic.path
          : diagnostic.path.replace(/^\$\.constraints\[\d+\]/, `$.constraints[${nextIndex}]`);
        return path === diagnostic.path || diagnostic.ruleId === undefined
          ? [diagnostic]
          : [withRuleMetadata({ ...diagnostic, path }, diagnostic.ruleId)];
      });
      if (constraintsToReevaluate.size === 0 || (!enabled.has("protocol") && !enabled.has("stability"))) {
        return { diagnostics: retained.sort(diagnosticOrder), recomputed: true };
      }
      const indexes = buildTimingDiagnosticIndexes(nextDocument, enabled);
      const updated: TimingDiagnostic[] = [];
      nextDocument.constraints.forEach((constraint, index) => {
        if (!constraintsToReevaluate.has(constraint.id)) return;
        const stabilityOnly = !changedIds.has(constraint.id);
        const diagnostics = constraint.type.toLowerCase() === "handshake"
          ? handshakeDiagnostics({ ...nextDocument, constraints: [constraint] }, enabled, indexes)
            .map((diagnostic) => withRuleMetadata({ ...diagnostic, path: diagnostic.path.replace("$.constraints[0]", `$.constraints[${index}]`) }, "timing.handshake"))
          : evaluateSingleConstraintDiagnostics(nextDocument, constraint, index, enabled, indexes);
        for (const diagnostic of diagnostics) if (!stabilityOnly || diagnostic.category === "stability") updated.push(diagnostic);
      });
      return { diagnostics: [...retained, ...updated].sort(diagnosticOrder), recomputed: true };
    }
  }
  if (previousDocument.signals === nextDocument.signals && previousDocument.checkSettings === nextDocument.checkSettings
    && previousDocument.constraints !== nextDocument.constraints
    && previousDocument.constraints.length === nextDocument.constraints.length
    && previousDocument.constraints.every((constraint, index) => constraint.id === nextDocument.constraints[index]?.id)) {
    const changedIndexes = nextDocument.constraints.flatMap((constraint, index) => previousDocument.constraints[index] === constraint ? [] : [index]);
    if (changedIndexes.length === 0) return { diagnostics: deriveTimingDiagnostics(nextDocument), recomputed: true };
    const enabled = enabledDiagnosticCategories(nextDocument);
    const changedIds = new Set<string>(changedIndexes.map((index) => nextDocument.constraints[index]!.id));
    const affectedStableSignalIds = new Set<SignalId>();
    if (enabled.has("stability")) {
      for (const index of changedIndexes) {
        for (const constraint of [previousDocument.constraints[index]!, nextDocument.constraints[index]!]) {
          for (const signalId of handshakeStableSignalDependencies(constraint)) affectedStableSignalIds.add(signalId);
        }
      }
    }
    // A changed Handshake can alter stability findings emitted by any other
    // Handshake that shares one of its stable Signals. Recompute those rules
    // together, while leaving unrelated constraint work untouched.
    const stabilityRefreshConstraintIds = new Set<string>();
    if (affectedStableSignalIds.size > 0) {
      for (const constraint of nextDocument.constraints) {
        if (constraint.type.toLowerCase() !== "handshake") continue;
        if (handshakeStableSignalDependencies(constraint).some((id) => affectedStableSignalIds.has(id))) {
          stabilityRefreshConstraintIds.add(constraint.id);
        }
      }
    }
    const constraintsToReevaluate = new Set([...changedIds, ...stabilityRefreshConstraintIds]);
    const retained = previousDiagnostics.filter((diagnostic) => !(diagnostic.category === "protocol"
      && diagnostic.objectId !== undefined && changedIds.has(diagnostic.objectId))
      && !(diagnostic.category === "stability" && diagnostic.entityId !== undefined
        && affectedStableSignalIds.has(diagnostic.entityId as SignalId)));
    if (constraintsToReevaluate.size === 0 || (!enabled.has("protocol") && !enabled.has("stability"))) {
      return { diagnostics: retained, recomputed: true };
    }
    const indexes = buildTimingDiagnosticIndexes(nextDocument, enabled);
    const updated: TimingDiagnostic[] = [];
    nextDocument.constraints.forEach((constraint, index) => {
      if (!constraintsToReevaluate.has(constraint.id)) return;
      const stabilityOnly = !changedIds.has(constraint.id);
      const diagnostics = constraint.type.toLowerCase() === "handshake"
        ? handshakeDiagnostics({ ...nextDocument, constraints: [constraint] }, enabled, indexes)
          .map((diagnostic) => withRuleMetadata({
            ...diagnostic,
            path: diagnostic.path.replace("$.constraints[0]", `$.constraints[${index}]`),
          }, "timing.handshake"))
        : evaluateSingleConstraintDiagnostics(nextDocument, constraint, index, enabled, indexes);
      for (const diagnostic of diagnostics) if (!stabilityOnly || diagnostic.category === "stability") updated.push(diagnostic);
    });
    return { diagnostics: [...retained, ...updated].sort(diagnosticOrder), recomputed: true };
  }
  if (sharedRuleInputs && previousDocument.signals !== nextDocument.signals) {
    const enabled = enabledDiagnosticCategories(nextDocument);
    const reusedUnknownValues: TimingDiagnostic[] = [];
    const previousById = new Map(previousDocument.signals.map((signal, index) => [signal.id, { signal, index }] as const));
    const previousUnknownById = new Map<SignalId, TimingDiagnostic[]>();
    for (const diagnostic of previousDiagnostics) {
      if (diagnostic.category !== "unknown-value" || diagnostic.entityId === undefined) continue;
      const signalId = diagnostic.entityId as SignalId;
      const items = previousUnknownById.get(signalId);
      if (items) items.push(diagnostic);
      else previousUnknownById.set(signalId, [diagnostic]);
    }
    if (enabled.has("unknown-value")) nextDocument.signals.forEach((signal, index) => {
      const previous = previousById.get(signal.id);
      const sameValueArray = signal.type === "clock" || signal.type === "commentRow"
        ? previous?.signal.type === signal.type
        : previous !== undefined && previous.signal.type !== "clock" && previous.signal.type !== "commentRow" && previous.signal.values === signal.values;
      if (previous && previous.index === index && previous.signal.name === signal.name && previous.signal.type === signal.type && sameValueArray) {
        reusedUnknownValues.push(...(previousUnknownById.get(signal.id) ?? []));
      } else {
        reusedUnknownValues.push(...signalValueDiagnostics(signal, index).map((diagnostic) => withRuleMetadata(diagnostic, "timing.unknown-value")));
      }
    });
    // Reuse the old-ID index built above for unknown-value reuse; rebuilding
    // the same SignalId -> Signal/index map here adds another full pass on
    // every Signal collection change.
    const previousSignalIndexes = previousById;
    const changedSignalIds = new Set<SignalId>();
    nextDocument.signals.forEach((signal, index) => {
      const previous = previousSignalIndexes.get(signal.id);
      const sameValues = signal.type === "clock" || signal.type === "commentRow"
        ? previous?.signal.type === signal.type
        : previous !== undefined && previous.signal.type !== "clock" && previous.signal.type !== "commentRow" && previous.signal.values === signal.values;
      if (!previous || previous.index !== index || previous.signal.name !== signal.name || previous.signal.type !== signal.type || !sameValues) changedSignalIds.add(signal.id);
      previousSignalIndexes.delete(signal.id);
    });
    for (const deletedId of previousSignalIndexes.keys()) changedSignalIds.add(deletedId);

    const invalidatedConstraintIds = new Set<string>();
    const constraintIdsBySignal = new Map<SignalId, string[]>();
    if (enabled.has("protocol") || enabled.has("stability")) {
      nextDocument.constraints.forEach((constraint) => {
        if (!enabled.has("protocol") && constraint.type.toLowerCase() !== "handshake") return;
        for (const signalId of constraintSignalDependencies(constraint)) {
          const ids = constraintIdsBySignal.get(signalId);
          if (ids) ids.push(constraint.id);
          else constraintIdsBySignal.set(signalId, [constraint.id]);
        }
      });
      for (const signalId of changedSignalIds) {
        for (const constraintId of constraintIdsBySignal.get(signalId) ?? []) invalidatedConstraintIds.add(constraintId);
      }
    }

    const affectedStableSignalIds = new Set<SignalId>();
    const stabilityRefreshConstraintIds = new Set<string>();
    if (enabled.has("stability") && invalidatedConstraintIds.size > 0) {
      for (const constraint of nextDocument.constraints) {
        if (invalidatedConstraintIds.has(constraint.id) && constraint.type.toLowerCase() === "handshake") {
          for (const id of handshakeStableSignalDependencies(constraint)) affectedStableSignalIds.add(id);
        }
      }
      if (affectedStableSignalIds.size > 0) {
        for (const constraint of nextDocument.constraints) {
          if (constraint.type.toLowerCase() !== "handshake") continue;
          if (!handshakeStableSignalDependencies(constraint).some((id) => affectedStableSignalIds.has(id))) continue;
          stabilityRefreshConstraintIds.add(constraint.id);
        }
      }
    }
    const constraintsToReevaluate = new Set([...invalidatedConstraintIds, ...stabilityRefreshConstraintIds]);

    const retainedConstraintDiagnostics = previousDiagnostics.filter((diagnostic) => diagnostic.category !== "unknown-value"
      && !(diagnostic.category === "protocol" && diagnostic.objectId !== undefined && invalidatedConstraintIds.has(diagnostic.objectId))
      && !(diagnostic.category === "stability" && diagnostic.entityId !== undefined && affectedStableSignalIds.has(diagnostic.entityId as SignalId)));
    const incrementalConstraintDiagnostics: TimingDiagnostic[] = [];
    if (constraintsToReevaluate.size > 0) {
      const indexes = buildTimingDiagnosticIndexes(nextDocument, enabled);
      nextDocument.constraints.forEach((constraint, constraintIndex) => {
        if (!constraintsToReevaluate.has(constraint.id)) return;
        const stabilityOnly = !invalidatedConstraintIds.has(constraint.id);
        const singleConstraintDocument = { ...nextDocument, constraints: [constraint] };
        const diagnostics = constraint.type.toLowerCase() === "handshake"
          ? handshakeDiagnostics(singleConstraintDocument, enabled, indexes).map((diagnostic) => withRuleMetadata(diagnostic, "timing.handshake"))
          : evaluateSingleConstraintDiagnostics(nextDocument, constraint, constraintIndex, enabled, indexes);
        for (const diagnostic of diagnostics) if (!stabilityOnly || diagnostic.category === "stability") incrementalConstraintDiagnostics.push(diagnostic);
      });
    }
    return { diagnostics: [...retainedConstraintDiagnostics, ...incrementalConstraintDiagnostics, ...reusedUnknownValues].sort(diagnosticOrder), recomputed: true };
  }
  return { diagnostics: deriveTimingDiagnostics(nextDocument), recomputed: true };
}

function constraintSignalDependencies(constraint: CanonicalDocument["constraints"][number]): readonly SignalId[] {
  const data = constraintData(constraint.data);
  switch (constraint.type.toLowerCase()) {
    case "handshake":
      return [
        textFrom(data, ["requestSignalId", "request", "reqSignalId", "req"]),
        textFrom(data, ["acknowledgeSignalId", "ackSignalId", "acknowledge", "ack"]),
        ...textListFrom(data, ["stableSignalIds", "dataSignalIds", "stableSignals", "dataSignals"]),
      ].filter((id): id is string => id !== undefined) as SignalId[];
    case "latency-range":
      return [textFrom(data, ["requestSignalId"]), textFrom(data, ["acknowledgeSignalId"])].filter((id): id is string => id !== undefined) as SignalId[];
    case "latency":
      return [textFrom(data, ["triggerSignalId"]), textFrom(data, ["responseSignalId"])].filter((id): id is string => id !== undefined) as SignalId[];
    default:
      return [];
  }
}

function handshakeStableSignalDependencies(constraint: CanonicalDocument["constraints"][number]): readonly SignalId[] {
  if (constraint.type.toLowerCase() !== "handshake") return [];
  return textListFrom(constraintData(constraint.data), ["stableSignalIds", "dataSignalIds", "stableSignals", "dataSignals"]) as SignalId[];
}
