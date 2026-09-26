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
    if (signal.type === "clock" || signal.type === "commentRow") return;
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
  });
  return problems;
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

function latencyRangeDiagnostics(document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>): TimingDiagnostic[] {
  if (!enabled.has("protocol")) return [];
  const problems: TimingDiagnostic[] = [];
  const signals = new Map(document.signals.map((signal) => [signal.id, signal]));
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
    const request = signals.get(requestId);
    const acknowledge = signals.get(acknowledgeId);
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
      const matchingCycle = acknowledgeEdges.find((cycle) => cycle >= requestCycle && cycle - requestCycle >= minCycles && cycle - requestCycle <= maxCycles);
      if (matchingCycle !== undefined) continue;
      const firstLaterCycle = acknowledgeEdges.find((cycle) => cycle >= requestCycle);
      const observed = firstLaterCycle === undefined ? "no acknowledge rising edge at or after the request" : `no acknowledge rising edge in range (first later edge is ${firstLaterCycle - requestCycle} cycles after the request)`;
      add("LATENCY_RANGE_VIOLATION", `${basePath}.acknowledgeSignalId`, `Request '${request.name}' rises at cycle ${requestCycle}; ${observed}, expected ${minCycles}..${maxCycles} cycles.`, constraint.id, requestCycle);
    }
  });
  return problems;
}

function firstAssertedAtOrAfter(signal: Signal, cycle: number, polarity: "active-high" | "active-low"): SignalValueChange | undefined {
  if (signal.type === "clock" || signal.type === "commentRow") return undefined;
  return signal.values.find((change) => change.start >= cycle && asserted(change, polarity));
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
): TimingDiagnostic[] {
  const problems: TimingDiagnostic[] = [];
  const signals = new Map(document.signals.map((signal) => [signal.id, signal]));
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
    const request = signals.get(requestId);
    const acknowledge = signals.get(acknowledgeId);
    if (!request || request.type === "clock" || request.type === "commentRow") {
      addConstraintProblem("HANDSHAKE_CONSTRAINT_INVALID", `${basePath}.requestSignalId`, `Request signal '${requestId}' does not reference a value signal.`, constraint.id);
      return;
    }
    if (!acknowledge || acknowledge.type === "clock" || acknowledge.type === "commentRow") {
      addConstraintProblem("HANDSHAKE_CONSTRAINT_INVALID", `${basePath}.acknowledgeSignalId`, `Acknowledge signal '${acknowledgeId}' does not reference a value signal.`, constraint.id);
      return;
    }
    const stableSignals = stableIds.map((id) => signals.get(id));
    if (stableSignals.some((signal) => signal === undefined || signal.type === "clock" || signal.type === "commentRow")) {
      addConstraintProblem("HANDSHAKE_CONSTRAINT_INVALID", `${basePath}.stableSignalIds`, "Every stable signal must reference a value signal.", constraint.id);
      return;
    }
    const requestPolarity = polarityFrom(data, ["requestPolarity", "requestActiveLevel"]);
    const acknowledgePolarity = polarityFrom(data, ["acknowledgePolarity", "ackPolarity", "ackActiveLevel"]);
    const requestChanges = request.values;
    requestChanges.forEach((requestChange) => {
      if (!asserted(requestChange, requestPolarity)) return;
      const ackChange = firstAssertedAtOrAfter(acknowledge, requestChange.start, acknowledgePolarity);
      if (!ackChange) {
        if (enabled.has("protocol")) addConstraintProblem("HANDSHAKE_NO_ACK", `${basePath}.acknowledgeSignalId`, `Handshake request '${request.name}' at cycle ${requestChange.start} has no acknowledge assertion before the timeline ends.`, constraint.id);
        return;
      }
      if (!enabled.has("stability")) return;
      stableSignals.forEach((stableSignal) => {
        if (!stableSignal || stableSignal.type === "clock" || stableSignal.type === "commentRow") return;
        stableSignal.values.forEach((change, changeIndex) => {
          if (change.start <= requestChange.start || change.start >= ackChange.start) return;
          const index = document.signals.indexOf(stableSignal);
          problems.push(signalProblem(
            "HANDSHAKE_DATA_UNSTABLE",
            "stability",
            signalValuePath(index, "values", changeIndex, "start"),
            `Signal '${stableSignal.name}' changes at cycle ${change.start} before handshake acknowledge at cycle ${ackChange.start}.`,
            stableSignal,
            change.value,
          ));
        });
      });
    });
  });
  return problems;
}

/** Evaluate JSON constraints of the form REQ edge -> ACK edge within N..M cycles. */
function latencyDiagnostics(document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>): TimingDiagnostic[] {
  if (!enabled.has("protocol")) return [];
  const problems: TimingDiagnostic[] = [];
  const signals = new Map(document.signals.map((signal) => [signal.id, signal]));
  document.constraints.forEach((constraint, constraintIndex) => {
    if (constraint.type.toLowerCase() !== "latency") return;
    const data = constraintData(constraint.data);
    const triggerId = textFrom(data, ["triggerSignalId"]) as SignalId | undefined;
    const responseId = textFrom(data, ["responseSignalId"]) as SignalId | undefined;
    const triggerEdge = textFrom(data, ["triggerEdge"]);
    const responseEdge = textFrom(data, ["responseEdge"]);
    const minCycles = numberFrom(data, "minCycles");
    const maxCycles = numberFrom(data, "maxCycles");
    const trigger = triggerId ? signals.get(triggerId) : undefined;
    const response = responseId ? signals.get(responseId) : undefined;
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
    const responseIndexInDocument = document.signals.indexOf(response);
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
  readonly category: TimingDiagnosticCategory;
  readonly evaluate: (document: CanonicalDocument, enabled: ReadonlySet<TimingDiagnosticCategory>) => readonly TimingDiagnostic[];
}

/** Shared derived-rule registry. Results remain outside CanonicalDocument. */
export const TIMING_DIAGNOSTIC_RULES: readonly TimingDiagnosticRule[] = [
  { id: "timing.unknown-value", category: "unknown-value", evaluate: valueDiagnostics },
  { id: "timing.handshake", category: "protocol", evaluate: handshakeDiagnostics },
  { id: "timing.latency-range", category: "protocol", evaluate: latencyRangeDiagnostics },
  { id: "timing.latency", category: "protocol", evaluate: latencyDiagnostics },
];

/** Derive deterministic, non-persistent timing/protocol Problems from Canonical data. */
export function deriveTimingDiagnostics(document: CanonicalDocument, options: TimingDiagnosticOptions = {}): readonly TimingDiagnostic[] {
  const configured = options.enabledCategories ?? document.checkSettings.enabledCategories;
  const enabled = new Set<TimingDiagnosticCategory>(configured === undefined ? TIMING_DIAGNOSTIC_CATEGORIES : configured.filter((category): category is TimingDiagnosticCategory => TIMING_DIAGNOSTIC_CATEGORIES.some((known) => known === category)));
  return TIMING_DIAGNOSTIC_RULES.flatMap((rule) => rule.evaluate(document, enabled)
    .filter(() => enabled.has(rule.category))
    .map((diagnostic) => ({ ...diagnostic, ruleId: rule.id, stableKey: `${rule.id}:${diagnostic.code}:${diagnostic.objectId ?? diagnostic.entityId ?? ""}:${diagnostic.path}${diagnostic.sourceCycle === undefined ? "" : `:cycle:${diagnostic.sourceCycle}`}` })))
    .sort(diagnosticOrder);
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
): Readonly<{ diagnostics: readonly TimingDiagnostic[]; recomputed: boolean }> {
  if (previousDocument.signals === nextDocument.signals
    && previousDocument.constraints === nextDocument.constraints
    && previousDocument.checkSettings === nextDocument.checkSettings) {
    return { diagnostics: previousDiagnostics, recomputed: false };
  }
  return { diagnostics: deriveTimingDiagnostics(nextDocument), recomputed: true };
}
