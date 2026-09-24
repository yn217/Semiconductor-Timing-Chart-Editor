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
] as const;

export type TimingDiagnosticCode = typeof TIMING_DIAGNOSTIC_CODES[number];
export type TimingDiagnosticCategory = "unknown-value" | "protocol" | "stability";

export interface TimingDiagnostic extends DocumentProblem {
  readonly code: TimingDiagnosticCode;
  readonly category: TimingDiagnosticCategory;
  readonly severity: "warning";
  readonly source: "validation";
  readonly stage: "validate";
  /** Added by the registry evaluator; raw rule-local findings omit these. */
  readonly ruleId?: string;
  readonly stableKey?: string;
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
  const add = (code: TimingDiagnosticCode, path: string, message: string, constraintId: string): void => {
    problems.push({ code, category: "protocol", severity: "warning", path, message, entityId: constraintId, objectType: "constraint", objectId: constraintId, source: "validation", stage: "validate" });
  };

  document.constraints.forEach((constraint, index) => {
    if (constraint.type.toLowerCase() !== "latency-range") return;
    const data = constraintData(constraint.data);
    const requestId = textFrom(data, ["requestSignalId"]) as SignalId | undefined;
    const acknowledgeId = textFrom(data, ["acknowledgeSignalId"]) as SignalId | undefined;
    const minCycles = data.minCycles;
    const maxCycles = data.maxCycles;
    const basePath = `$.constraints[${index}].data`;
    if (!requestId || !acknowledgeId || typeof minCycles !== "number" || !Number.isInteger(minCycles) || minCycles < 0 || typeof maxCycles !== "number" || !Number.isInteger(maxCycles) || maxCycles < minCycles) {
      add("LATENCY_RANGE_CONSTRAINT_INVALID", basePath, "Latency-range constraint requires requestSignalId, acknowledgeSignalId, and integer minCycles/maxCycles with 0 <= minCycles <= maxCycles.", constraint.id);
      return;
    }
    const request = signals.get(requestId);
    const acknowledge = signals.get(acknowledgeId);
    if (!request || request.type === "clock" || request.type === "commentRow") {
      add("LATENCY_RANGE_CONSTRAINT_INVALID", `${basePath}.requestSignalId`, `Request signal '${requestId}' does not reference a value signal.`, constraint.id);
      return;
    }
    if (!acknowledge || acknowledge.type === "clock" || acknowledge.type === "commentRow") {
      add("LATENCY_RANGE_CONSTRAINT_INVALID", `${basePath}.acknowledgeSignalId`, `Acknowledge signal '${acknowledgeId}' does not reference a value signal.`, constraint.id);
      return;
    }
    const acknowledgeEdges = risingEdges(acknowledge);
    for (const requestCycle of risingEdges(request)) {
      const acknowledgeCycle = acknowledgeEdges.find((cycle) => cycle > requestCycle);
      const latency = acknowledgeCycle === undefined ? undefined : acknowledgeCycle - requestCycle;
      if (latency !== undefined && latency >= minCycles && latency <= maxCycles) continue;
      const observed = latency === undefined ? "no later acknowledge rising edge" : `acknowledge latency ${latency} cycles`;
      add("LATENCY_RANGE_VIOLATION", `${basePath}.acknowledgeSignalId`, `Request '${request.name}' rises at cycle ${requestCycle}; ${observed}, expected ${minCycles}..${maxCycles} cycles.`, constraint.id);
    }
  });
  return problems;
}

function firstAssertedAtOrAfter(signal: Signal, cycle: number, polarity: "active-high" | "active-low"): SignalValueChange | undefined {
  if (signal.type === "clock" || signal.type === "commentRow") return undefined;
  return signal.values.find((change) => change.start >= cycle && asserted(change, polarity));
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
];

/** Derive deterministic, non-persistent timing/protocol Problems from Canonical data. */
export function deriveTimingDiagnostics(document: CanonicalDocument, options: TimingDiagnosticOptions = {}): readonly TimingDiagnostic[] {
  const configured = options.enabledCategories ?? document.checkSettings.enabledCategories;
  const enabled = new Set<TimingDiagnosticCategory>(configured === undefined ? ["unknown-value", "protocol", "stability"] : configured.filter((category): category is TimingDiagnosticCategory => category === "unknown-value" || category === "protocol" || category === "stability"));
  return TIMING_DIAGNOSTIC_RULES.flatMap((rule) => rule.evaluate(document, enabled)
    .filter(() => enabled.has(rule.category))
    .map((diagnostic) => ({ ...diagnostic, ruleId: rule.id, stableKey: `${rule.id}:${diagnostic.code}:${diagnostic.objectId ?? diagnostic.entityId ?? ""}:${diagnostic.path}` })))
    .sort(diagnosticOrder);
}
