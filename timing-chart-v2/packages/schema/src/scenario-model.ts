import type {
  CanonicalDocument,
  AnnotationId,
  AnnotationGroupId,
  BookmarkId,
  ClockSignal,
  ConstraintId,
  LabelAnchorId,
  ScenarioDocumentModel,
  ScenarioSignalDefinition,
  ScenarioSignalState,
  ScenarioId,
  SignalId,
  Signal,
  TimingScenario,
  TimeGroupId,
  TransactionGroupId,
  TransactionId,
  TransactionPhaseId,
  ValueSignal,
  DocumentProblem,
  SignalValueChange,
} from "./types.js";
import { canonicalEntityInventory, type CanonicalEntityKind } from "./canonical-inventory.js";
import { countClockSuppressedPeriods, countNestedArrayItems, countSignalChangePoints, DOCUMENT_RESOURCE_BUDGET, validateDocumentResourceBudget, validateDocumentInputComplexity } from "./resource-budget.js";
import { isStableId, opaqueDerivedId } from "./stable-id.js";
import { validateCanonicalDocument } from "./validation.js";

const DEFAULT_SCENARIO_ID = "scenario_default" as ScenarioId;

// Exhaustive: a new stable-ID kind must explicitly declare its ownership.
const ENTITY_OWNERSHIP = {
  document: "shared", signal: "shared", signalValueChange: "scenario", signalGroup: "shared", spacer: "shared", enumDefinition: "shared",
  annotation: "scenario", annotationGroup: "scenario", transaction: "scenario", transactionPhase: "scenario",
  transactionGroup: "scenario", bookmark: "scenario", timeGroup: "scenario", labelAnchor: "scenario", constraint: "scenario",
} satisfies Record<CanonicalEntityKind, "shared" | "scenario">;

function rejectUnknownKeys(value: object, allowed: readonly string[], path: string, problems: DocumentProblem[]): void {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) problems.push({ code: "SCENARIO_MODEL_UNKNOWN_FIELD", path: `${path}.${key}`, message: `Unknown Scenario model field '${key}'.` });
  }
}

function definitionOf(signal: Signal): ScenarioSignalDefinition {
  if (signal.type === "clock") {
    const { generator: _generator, enable: _enable, edgeCounter: _edgeCounter, ...definition } = signal;
    return definition;
  }
  if (signal.type !== "commentRow") {
    const { values: _values, resetSemantics: _resetSemantics, ...definition } = signal;
    return definition;
  }
  return signal;
}

function stateOf(signal: Signal): ScenarioSignalState | undefined {
  if (signal.type === "clock") {
    return {
      kind: "clock",
      generator: signal.generator,
      ...(signal.enable === undefined ? {} : { enable: signal.enable }),
      edgeCounter: signal.edgeCounter,
    };
  }
  if (signal.type === "commentRow") return undefined;
  return {
    kind: "values",
    values: signal.values,
    ...(signal.resetSemantics === undefined ? {} : { resetSemantics: signal.resetSemantics }),
  };
}

/** Move the existing v2 semantic collections under one deterministic Scenario. */
export function scenarioModelFromV2(document: CanonicalDocument): ScenarioDocumentModel {
  const { physicalTimebase, ...timeline } = document.timeline;
  const signalStates: Partial<Record<SignalId, ScenarioSignalState>> = {};
  for (const signal of document.signals) {
    const state = stateOf(signal);
    if (state !== undefined) signalStates[signal.id] = state;
  }
  const scenario: TimingScenario = {
    id: DEFAULT_SCENARIO_ID,
    name: "Scenario 1",
    timeline,
    signalStates,
    bookmarks: document.bookmarks,
    timeGroups: document.timeGroups,
    annotations: document.annotations,
    annotationGroups: document.annotationGroups,
    transactions: document.transactions,
    ...(document.transactionGroups === undefined ? {} : { transactionGroups: document.transactionGroups }),
    ...(document.transactionTimeScale === undefined ? {} : { transactionTimeScale: document.transactionTimeScale }),
    constraints: document.constraints,
  };
  return {
    formatVersion: 3,
    document: document.document,
    ...(physicalTimebase === undefined ? {} : { physicalTimebase }),
    signalGroups: document.signalGroups,
    signalDefinitions: document.signals.map(definitionOf),
    ...(document.enumDefinitions === undefined ? {} : { enumDefinitions: document.enumDefinitions }),
    scenarios: [scenario],
    legend: document.legend,
    layout: document.layout,
    checkSettings: document.checkSettings,
  };
}

/** A Signal state copied from the edited Scenario into another one must not share Transition IDs with it: IDs are unique across the whole document. */
function stateForScenario(state: ScenarioSignalState | undefined, scenarioId: ScenarioId): ScenarioSignalState | undefined {
  if (state === undefined || state.kind !== "values") return state;
  return { ...state, values: state.values.map((change) => change.id === undefined ? change : { ...change, id: `${change.id}_in_${scenarioId}` }) };
}

/**
 * Reconcile one existing editor Canonical projection back into the v3 owner.
 * Shared definitions/layout are refreshed document-wide; timing payload and
 * semantic collections are replaced only for the edited Scenario.
 */
export function updateScenarioModelFromV2Projection(
  model: ScenarioDocumentModel,
  scenarioId: ScenarioId,
  projection: CanonicalDocument,
): ScenarioDocumentModel {
  const existing = model.scenarios.find((scenario) => scenario.id === scenarioId);
  if (!existing) throw new Error(`Scenario '${scenarioId}' does not exist.`);
  const converted = scenarioModelFromV2(projection);
  const projectedScenario = converted.scenarios[0]!;
  const nextDefinitions = converted.signalDefinitions;
  const nextScenario: TimingScenario = { ...projectedScenario, id: existing.id, name: existing.name };
  const timingDefinitionIds = new Set(nextDefinitions.filter((definition) => definition.type !== "commentRow").map((definition) => definition.id));
  const scenarios = model.scenarios.map((scenario) => {
    if (scenario.id === scenarioId) return nextScenario;
    const signalStates: Partial<Record<SignalId, ScenarioSignalState>> = {};
    for (const signalId of timingDefinitionIds) {
      const definition = nextDefinitions.find((item) => item.id === signalId)!;
      const previous = scenario.signalStates[signalId];
      const projectedState = projectedScenario.signalStates[signalId];
      const expectedKind = definition.type === "clock" ? "clock" : "values";
      signalStates[signalId] = previous?.kind === expectedKind ? previous : stateForScenario(projectedState, scenario.id);
    }
    return { ...scenario, signalStates };
  });
  const next: ScenarioDocumentModel = {
    formatVersion: 3,
    document: converted.document,
    ...(converted.physicalTimebase === undefined ? {} : { physicalTimebase: converted.physicalTimebase }),
    signalGroups: converted.signalGroups,
    signalDefinitions: nextDefinitions,
    ...(converted.enumDefinitions === undefined ? {} : { enumDefinitions: converted.enumDefinitions }),
    scenarios,
    legend: converted.legend,
    layout: converted.layout,
    checkSettings: converted.checkSettings,
  };
  const problems = validateScenarioDocumentModel(next);
  if (problems.length > 0) {
    const error = new Error(`Scenario projection reconciliation produced an invalid model (${problems.length} problem(s)).`);
    Object.assign(error, { name: "ScenarioProjectionReconciliationError", problems });
    throw error;
  }
  return next;
}

/** Build the existing editor-facing canonical projection without duplicating persisted ownership. */
export function projectScenarioAsV2(document: ScenarioDocumentModel, scenarioId: ScenarioId): CanonicalDocument {
  const scenario = document.scenarios.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error(`Scenario '${scenarioId}' does not exist.`);
  const signals: Signal[] = document.signalDefinitions.map((definition) => {
    if (definition.type === "commentRow") return definition;
    const state = scenario.signalStates[definition.id];
    if (definition.type === "clock") {
      if (!state || state.kind !== "clock") throw new Error(`Scenario '${scenarioId}' is missing Clock state for '${definition.id}'.`);
      return { ...definition, generator: state.generator, ...(state.enable === undefined ? {} : { enable: state.enable }), edgeCounter: state.edgeCounter } as ClockSignal;
    }
    if (!state || state.kind !== "values") throw new Error(`Scenario '${scenarioId}' is missing value state for '${definition.id}'.`);
    return { ...definition, values: state.values, ...(state.resetSemantics === undefined ? {} : { resetSemantics: state.resetSemantics }) } as ValueSignal;
  });
  return {
    formatVersion: 2,
    document: document.document,
    timeline: { ...scenario.timeline, ...(document.physicalTimebase === undefined ? {} : { physicalTimebase: document.physicalTimebase }) },
    signalGroups: document.signalGroups,
    signals,
    bookmarks: scenario.bookmarks,
    timeGroups: scenario.timeGroups,
    annotations: scenario.annotations,
    annotationGroups: scenario.annotationGroups,
    legend: document.legend,
    layout: document.layout,
    transactions: scenario.transactions,
    ...(scenario.transactionGroups === undefined ? {} : { transactionGroups: scenario.transactionGroups }),
    ...(document.enumDefinitions === undefined ? {} : { enumDefinitions: document.enumDefinitions }),
    ...(scenario.transactionTimeScale === undefined ? {} : { transactionTimeScale: scenario.transactionTimeScale }),
    constraints: scenario.constraints,
    checkSettings: document.checkSettings,
  };
}

/** Rename a Scenario without changing its semantic identity or owned data. */
export function renameScenario(document: ScenarioDocumentModel, scenarioId: ScenarioId, name: string): ScenarioDocumentModel {
  if (name.trim().length === 0) throw new Error("Scenario name must be a non-empty string.");
  if (document.scenarios.some((scenario) => scenario.id !== scenarioId && scenario.name.trim() === name.trim())) throw new Error(`Scenario name '${name.trim()}' is already used by another Scenario.`);
  let found = false;
  let changed = false;
  const scenarios = document.scenarios.map((scenario) => {
    if (scenario.id !== scenarioId) return scenario;
    found = true;
    if (scenario.name === name) return scenario;
    changed = true;
    return { ...scenario, name };
  });
  if (!found) throw new Error(`Scenario '${scenarioId}' does not exist.`);
  if (!changed) return document;
  const next = { ...document, scenarios };
  const problems = validateScenarioDocumentModel(next);
  if (problems.length > 0) throw new Error(`Scenario rename produced an invalid model (${problems.length} problem(s)).`);
  return next;
}

/** Delete by stable ID; a valid Scenario document always retains one Scenario. */
export function deleteScenario(document: ScenarioDocumentModel, scenarioId: ScenarioId): ScenarioDocumentModel {
  const index = document.scenarios.findIndex((scenario) => scenario.id === scenarioId);
  if (index < 0) throw new Error(`Scenario '${scenarioId}' does not exist.`);
  if (document.scenarios.length === 1) throw new Error("Cannot delete the final Scenario in a Timing Document.");
  const scenarios = document.scenarios.filter((scenario) => scenario.id !== scenarioId);
  const next = { ...document, scenarios };
  const problems = validateScenarioDocumentModel(next);
  if (problems.length > 0) throw new Error(`Scenario deletion produced an invalid model (${problems.length} problem(s)).`);
  return next;
}

/** A generated default name gets a numeric suffix when another Scenario already uses it. */
function uniqueScenarioName(document: ScenarioDocumentModel, base: string): string {
  const used = new Set(document.scenarios.map((scenario) => scenario.name.trim()));
  if (!used.has(base.trim())) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Duplicate one Scenario with fresh IDs for all Scenario-owned entities.
 * Shared Signal IDs and references to them intentionally remain unchanged.
 */
export function duplicateScenario(document: ScenarioDocumentModel, scenarioId: ScenarioId, name?: string): ScenarioDocumentModel {
  const source = document.scenarios.find((scenario) => scenario.id === scenarioId);
  if (!source) throw new Error(`Scenario '${scenarioId}' does not exist.`);
  const used = new Set<string>(document.scenarios.map((scenario) => scenario.id));
  for (const scenario of document.scenarios) {
    for (const item of canonicalEntityInventory(projectScenarioAsV2(document, scenario.id))) used.add(item.id);
  }
  const allocate = (kind: string, id: string): string => {
    const next = opaqueDerivedId(`scenario-copy:${source.id}:${kind}:${id}`, used);
    used.add(next);
    return next;
  };
  const copiedScenarioId = allocate("scenario", source.id) as ScenarioId;
  const timeGroupIds = new Map(source.timeGroups.map((item) => [item.id, allocate("timeGroup", item.id) as TimeGroupId]));
  const labelAnchorIds = new Map(source.timeline.labelAnchors.map((item) => [item.id, allocate("labelAnchor", item.id) as LabelAnchorId]));
  const bookmarkIds = new Map(source.bookmarks.map((item) => [item.id, allocate("bookmark", item.id) as BookmarkId]));
  const annotationIds = new Map(source.annotations.map((item) => [item.id, allocate("annotation", item.id) as AnnotationId]));
  const annotationGroupIds = new Map(source.annotationGroups.map((item) => [item.id, allocate("annotationGroup", item.id) as AnnotationGroupId]));
  const transactionGroupIds = new Map((source.transactionGroups ?? []).map((item) => [item.id, allocate("transactionGroup", item.id) as TransactionGroupId]));
  const transactionIds = new Map(source.transactions.map((item) => [item.id, allocate("transaction", item.id) as TransactionId]));
  const phaseIds = new Map(source.transactions.flatMap((item) => (item.phases ?? []).map((phase) => [phase.id, allocate("transactionPhase", phase.id) as TransactionPhaseId] as const)));
  const constraintIds = new Map(source.constraints.map((item) => [item.id, allocate("constraint", item.id) as ConstraintId]));
  const signalValueChangeIds = new Map<string, string>();
  for (const state of Object.values(source.signalStates)) {
    if (!state) continue;
    const changes = state.kind === "clock" ? state.enable ?? [] : state.values;
    for (const change of changes) {
      if (change.id !== undefined) signalValueChangeIds.set(change.id, allocate("signalValueChange", change.id));
    }
  }
  const signalStates = Object.fromEntries(Object.entries(source.signalStates).map(([signalId, state]) => {
    if (!state) return [signalId, state];
    if (state.kind === "clock") return [signalId, {
      ...state,
      ...(state.enable === undefined ? {} : { enable: state.enable.map((change) => ({ ...change, ...(change.id === undefined ? {} : { id: signalValueChangeIds.get(change.id)! }) })) }),
      ...(state.edgeCounter.anchorId === undefined ? {} : { edgeCounter: { ...state.edgeCounter, anchorId: bookmarkIds.get(state.edgeCounter.anchorId as BookmarkId) ?? state.edgeCounter.anchorId } }),
    }];
    return [signalId, { ...state, values: state.values.map((change) => ({ ...change, ...(change.id === undefined ? {} : { id: signalValueChangeIds.get(change.id)! }) })) }];
  }));
  const copiedName = name ?? uniqueScenarioName(document, `${source.name} Copy`);
  const copied: TimingScenario = {
    ...source,
    id: copiedScenarioId,
    name: copiedName,
    signalStates,
    timeline: {
      ...source.timeline,
      labelAnchors: source.timeline.labelAnchors.map((item) => ({
        ...item,
        id: labelAnchorIds.get(item.id)!,
        ...(item.ownerTimeGroupId === undefined ? {} : { ownerTimeGroupId: timeGroupIds.get(item.ownerTimeGroupId) ?? item.ownerTimeGroupId }),
      })),
    },
    timeGroups: source.timeGroups.map((item) => ({
      ...item,
      id: timeGroupIds.get(item.id)!,
      ...(item.parentId === undefined ? {} : { parentId: timeGroupIds.get(item.parentId) ?? item.parentId }),
      ...(item.presentation?.resumeLabelAnchorId === undefined ? {} : { presentation: { ...item.presentation, resumeLabelAnchorId: labelAnchorIds.get(item.presentation.resumeLabelAnchorId) ?? item.presentation.resumeLabelAnchorId } }),
    })),
    bookmarks: source.bookmarks.map((item) => ({ ...item, id: bookmarkIds.get(item.id)! })),
    annotations: source.annotations.map((item) => ({ ...item, id: annotationIds.get(item.id)! })),
    annotationGroups: source.annotationGroups.map((item) => ({ ...item, id: annotationGroupIds.get(item.id)!, annotationIds: item.annotationIds.map((id) => annotationIds.get(id) ?? id) })),
    ...(source.transactionGroups === undefined ? {} : { transactionGroups: source.transactionGroups.map((item) => ({ ...item, id: transactionGroupIds.get(item.id)! })) }),
    transactions: source.transactions.map((item) => ({
      ...item,
      id: transactionIds.get(item.id)!,
      ...(item.phases === undefined ? {} : { phases: item.phases.map((phase) => ({ ...phase, id: phaseIds.get(phase.id)! })) }),
      ...(item.groupId === undefined ? {} : { groupId: transactionGroupIds.get(item.groupId) ?? item.groupId }),
    })),
    constraints: source.constraints.map((item) => ({ ...item, id: constraintIds.get(item.id)! })),
  };
  const next = { ...document, scenarios: [...document.scenarios, copied] };
  const problems = validateScenarioDocumentModel(next);
  if (problems.length > 0) throw new Error(`Scenario duplication produced an invalid model: ${problems.map(({ code, path }) => `${code} at ${path}`).join(", ")}.`);
  return next;
}

export type HandshakeMissingCaseKind = "ack-before-request" | "request-before-ack" | "same-cycle" | "backpressure" | "consecutive-transfer" | "stable-data-while-stalled" | "reset-during-transaction" | "x-propagation";
export interface HandshakeMissingCaseSuggestion {
  readonly key: string;
  readonly constraintId: ConstraintId;
  readonly kind: HandshakeMissingCaseKind;
  readonly title: string;
  readonly detail: string;
  readonly requestSignalId: SignalId;
  readonly acknowledgeSignalId: SignalId;
  readonly stableSignalIds: readonly SignalId[];
  readonly resetSignalId?: SignalId;
  readonly unknownSignalId?: SignalId;
}

const handshakeCaseDuration: Readonly<Record<HandshakeMissingCaseKind, number>> = {
  "ack-before-request": 5,
  "request-before-ack": 4,
  "same-cycle": 2,
  backpressure: 5,
  "consecutive-transfer": 4,
  "stable-data-while-stalled": 5,
  "reset-during-transaction": 4,
  "x-propagation": 5,
};

const handshakeCaseStart = (scenario: TimingScenario): number => scenario.timeline.start;

const handshakeId = (data: unknown, keys: readonly string[]): SignalId | undefined => {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  for (const key of keys) if (typeof record[key] === "string" && record[key]) return record[key] as SignalId;
  return undefined;
};

function handshakeCaseConstraints(scenario: TimingScenario): readonly HandshakeMissingCaseSuggestion[] {
  const suggestions: HandshakeMissingCaseSuggestion[] = [];
  for (const constraint of scenario.constraints) {
    if (constraint.type.toLowerCase() !== "handshake") continue;
    const requestSignalId = handshakeId(constraint.data, ["requestSignalId", "request", "reqSignalId", "req"]);
    const acknowledgeSignalId = handshakeId(constraint.data, ["acknowledgeSignalId", "ackSignalId", "acknowledge", "ack"]);
    if (!requestSignalId || !acknowledgeSignalId) continue;
    const stableSignalIds = handshakeSignalIds(constraint.data, ["stableSignalIds", "dataSignalIds", "stableSignals", "dataSignals"]);
    const resetSignalId = handshakeId(constraint.data, ["resetSignalId"]);
    const prefix = `handshake:${constraint.id}:`;
    const cases: readonly Readonly<{ kind: HandshakeMissingCaseKind; title: string; detail: string }>[] = [
      { kind: "ack-before-request", title: "Acknowledge before request", detail: "READY asserts before VALID." },
      { kind: "request-before-ack", title: "Request before acknowledge", detail: "VALID asserts, then waits for READY." },
      { kind: "same-cycle", title: "Request and acknowledge together", detail: "VALID and READY assert on the same source cycle." },
      { kind: "backpressure", title: "Backpressure", detail: "VALID stays asserted for multiple cycles before READY." },
      { kind: "consecutive-transfer", title: "Consecutive transfers", detail: "Two separated request/acknowledge handshakes occur back-to-back." },
      ...(stableSignalIds.length > 0 ? [{ kind: "stable-data-while-stalled" as const, title: "Stable data while stalled", detail: "Configured stable Signals hold their value until acknowledge." }] : []),
      ...(resetSignalId ? [{ kind: "reset-during-transaction" as const, title: "Reset during transaction", detail: "The explicitly configured Reset asserts while a request is outstanding." }] : []),
      ...[{ kind: "x-propagation" as const, title: "X propagation", detail: "An unknown value propagates on a logic Handshake endpoint." }],
    ];
    for (const item of cases) {
      const unknownSignalId = item.kind === "x-propagation" ? requestSignalId : undefined;
      suggestions.push({ ...item, key: `${prefix}${item.kind}`, constraintId: constraint.id, requestSignalId, acknowledgeSignalId, stableSignalIds,
        ...(item.kind === "reset-during-transaction" && resetSignalId ? { resetSignalId } : {}),
        ...(unknownSignalId === undefined ? {} : { unknownSignalId }),
      });
    }
  }
  return suggestions;
}

function handshakeSignalIds(data: unknown, keys: readonly string[]): SignalId[] {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter((item): item is SignalId => typeof item === "string") as SignalId[];
    if (typeof value === "string") return [value as SignalId];
  }
  return [];
}

/** Offer deterministic missing cases only for explicit Handshake constraints; signal identity and polarity come from the constraint. */
export function listHandshakeMissingCaseSuggestions(document: ScenarioDocumentModel, scenarioId: ScenarioId): readonly HandshakeMissingCaseSuggestion[] {
  const scenario = document.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Scenario '${scenarioId}' does not exist.`);
  const supportedTypes = new Set(["binary", "logic"]);
  return handshakeCaseConstraints(scenario).filter((suggestion) => {
    const request = document.signalDefinitions.find((signal) => signal.id === suggestion.requestSignalId);
    const acknowledge = document.signalDefinitions.find((signal) => signal.id === suggestion.acknowledgeSignalId);
    const requestState = scenario.signalStates[suggestion.requestSignalId];
    const acknowledgeState = scenario.signalStates[suggestion.acknowledgeSignalId];
    const reset = suggestion.resetSignalId === undefined ? undefined : document.signalDefinitions.find((signal) => signal.id === suggestion.resetSignalId);
    const resetState = suggestion.resetSignalId === undefined ? undefined : scenario.signalStates[suggestion.resetSignalId];
    const unknown = suggestion.unknownSignalId === undefined ? undefined : document.signalDefinitions.find((signal) => signal.id === suggestion.unknownSignalId);
    const start = handshakeCaseStart(scenario);
    return start + handshakeCaseDuration[suggestion.kind] <= scenario.timeline.end
      && request !== undefined && acknowledge !== undefined && supportedTypes.has(request.type) && supportedTypes.has(acknowledge.type)
      && requestState?.kind === "values" && acknowledgeState?.kind === "values"
      && (suggestion.resetSignalId === undefined || reset !== undefined && supportedTypes.has(reset.type) && resetState?.kind === "values")
      && (suggestion.unknownSignalId === undefined || unknown?.type === "logic")
      && suggestion.stableSignalIds.every((id) => scenario.signalStates[id]?.kind === "values");
  });
}

function activeLevel(constraint: TimingScenario["constraints"][number], keys: readonly string[]): number {
  if (constraint.data === undefined) return 1;
  for (const key of keys) if (constraint.data[key] === "active-low") return 0;
  return 1;
}

/** Replace the generated span [start, end). The original value in effect at `end` is restored so the generated value does not leak past the span. */
function replaceSignalSpan(state: ScenarioSignalState, start: number, end: number, events: readonly SignalValueChange[], allocateId: () => string): ScenarioSignalState {
  if (state.kind !== "values") return state;
  const values = [...state.values.filter((change) => change.start < start || change.start >= end), ...events].sort((left, right) => left.start - right.start);
  const originalAtEnd = latestChange(state.values, end);
  const hasEventAtEnd = values.some((change) => change.start === end);
  if (originalAtEnd !== undefined && !hasEventAtEnd && latestChange(values, end)?.value !== originalAtEnd.value) {
    values.push({ start: end, value: originalAtEnd.value, id: allocateId() });
    values.sort((left, right) => left.start - right.start);
  }
  return { ...state, values };
}

function latestChange(changes: readonly SignalValueChange[], cycle: number): SignalValueChange | undefined {
  let found: SignalValueChange | undefined;
  for (const change of changes) {
    if (change.start > cycle) break;
    found = change;
  }
  return found;
}

/** Every ID already used in the document, so generated change IDs stay unique across all Scenarios. */
function documentIds(document: ScenarioDocumentModel): Set<string> {
  const ids = new Set<string>();
  for (const scenario of document.scenarios) {
    ids.add(scenario.id);
    for (const item of canonicalEntityInventory(projectScenarioAsV2(document, scenario.id))) ids.add(item.id);
    for (const state of Object.values(scenario.signalStates)) {
      if (!state) continue;
      for (const change of state.kind === "clock" ? state.enable ?? [] : state.values) if (change.id !== undefined) ids.add(change.id);
    }
  }
  return ids;
}

function valueAt(state: ScenarioSignalState, cycle: number): string | number | undefined {
  if (state.kind !== "values") return undefined;
  let value: string | number | undefined;
  for (const event of state.values) {
    if (event.start > cycle) break;
    value = event.value;
  }
  return value ?? state.values[0]?.value;
}

function applyHandshakeCase(scenario: TimingScenario, suggestion: HandshakeMissingCaseSuggestion, usedIds: Set<string>): TimingScenario {
  const start = handshakeCaseStart(scenario);
  const requestState = scenario.signalStates[suggestion.requestSignalId];
  const acknowledgeState = scenario.signalStates[suggestion.acknowledgeSignalId];
  if (requestState?.kind !== "values" || acknowledgeState?.kind !== "values") throw new Error("Handshake case requires value-signal request and acknowledge states.");
  const constraint = scenario.constraints.find((item) => item.id === suggestion.constraintId);
  if (!constraint) throw new Error("Handshake case constraint no longer exists in its Scenario.");
  const requestActive = activeLevel(constraint, ["requestPolarity", "requestActiveLevel"]);
  const acknowledgeActive = activeLevel(constraint, ["acknowledgePolarity", "ackPolarity", "ackActiveLevel"]);
  const requestIdle = requestActive === 1 ? 0 : 1;
  const acknowledgeIdle = acknowledgeActive === 1 ? 0 : 1;
  const events = (cycles: readonly Readonly<{ cycle: number; value: number | string }>[]) => cycles.map(({ cycle, value }) => ({ start: cycle, value }));
  const cases: Record<HandshakeMissingCaseKind, Readonly<{ request: readonly Readonly<{ cycle: number; value: number | string }>[]; acknowledge: readonly Readonly<{ cycle: number; value: number | string }>[]; end: number }>> = {
    "ack-before-request": { request: [{ cycle: start + 2, value: requestActive }, { cycle: start + 4, value: requestIdle }], acknowledge: [{ cycle: start, value: acknowledgeActive }, { cycle: start + 3, value: acknowledgeIdle }], end: start + 5 },
    "request-before-ack": { request: [{ cycle: start, value: requestActive }, { cycle: start + 3, value: requestIdle }], acknowledge: [{ cycle: start + 2, value: acknowledgeActive }, { cycle: start + 3, value: acknowledgeIdle }], end: start + 4 },
    "same-cycle": { request: [{ cycle: start, value: requestActive }, { cycle: start + 1, value: requestIdle }], acknowledge: [{ cycle: start, value: acknowledgeActive }, { cycle: start + 1, value: acknowledgeIdle }], end: start + 2 },
    backpressure: { request: [{ cycle: start, value: requestActive }, { cycle: start + 4, value: requestIdle }], acknowledge: [{ cycle: start + 3, value: acknowledgeActive }, { cycle: start + 4, value: acknowledgeIdle }], end: start + 5 },
    "consecutive-transfer": { request: [{ cycle: start, value: requestActive }, { cycle: start + 1, value: requestIdle }, { cycle: start + 2, value: requestActive }, { cycle: start + 3, value: requestIdle }], acknowledge: [{ cycle: start, value: acknowledgeActive }, { cycle: start + 1, value: acknowledgeIdle }, { cycle: start + 2, value: acknowledgeActive }, { cycle: start + 3, value: acknowledgeIdle }], end: start + 4 },
    "stable-data-while-stalled": { request: [{ cycle: start, value: requestActive }, { cycle: start + 4, value: requestIdle }], acknowledge: [{ cycle: start + 3, value: acknowledgeActive }, { cycle: start + 4, value: acknowledgeIdle }], end: start + 5 },
    "reset-during-transaction": { request: [{ cycle: start, value: requestActive }, { cycle: start + 3, value: requestIdle }], acknowledge: [{ cycle: start, value: acknowledgeIdle }], end: start + 4 },
    "x-propagation": { request: [{ cycle: start, value: requestActive }, { cycle: start + 1, value: "X" }, { cycle: start + 2, value: requestIdle }], acknowledge: [{ cycle: start, value: acknowledgeIdle }], end: start + 5 },
  };
  const selected = cases[suggestion.kind];
  if (selected.end > scenario.timeline.end) throw new Error("Timeline is too short for this Handshake case.");
  let signalStates = { ...scenario.signalStates };
  const replaceSpan = (signalId: SignalId, state: ScenarioSignalState, changes: readonly SignalValueChange[]): ScenarioSignalState => replaceSignalSpan(state, start, selected.end, changes, () => {
    const id = opaqueDerivedId(`handshake-restore:${suggestion.constraintId}:${suggestion.kind}:${signalId}:${selected.end}`, usedIds);
    usedIds.add(id);
    return id;
  });
  signalStates[suggestion.requestSignalId] = replaceSpan(suggestion.requestSignalId, requestState, events(selected.request));
  signalStates[suggestion.acknowledgeSignalId] = replaceSpan(suggestion.acknowledgeSignalId, acknowledgeState, events(selected.acknowledge));
  if (suggestion.kind === "reset-during-transaction") {
    if (!suggestion.resetSignalId) throw new Error("Reset case requires an explicitly configured Reset Signal ID.");
    const resetState = signalStates[suggestion.resetSignalId];
    if (resetState?.kind !== "values") throw new Error("Reset case requires a value-signal Reset state.");
    const resetActive = activeLevel(constraint, ["resetPolarity"]);
    signalStates[suggestion.resetSignalId] = replaceSpan(suggestion.resetSignalId, resetState, events([{ cycle: start + 2, value: resetActive === 1 ? 1 : 0 }, { cycle: start + 3, value: resetActive === 1 ? 0 : 1 }]));
  }
  if (suggestion.kind === "stable-data-while-stalled") {
    for (const id of suggestion.stableSignalIds) {
      const state = signalStates[id];
      const held = state ? valueAt(state, start) : undefined;
      if (state?.kind !== "values" || held === undefined) throw new Error(`Stable Signal '${id}' has no value to hold during the generated stall.`);
      signalStates[id] = replaceSpan(id, state, [{ start, value: held }]);
    }
  }
  return { ...scenario, name: `${scenario.name} · ${suggestion.title}`, signalStates };
}

/** Apply only explicitly selected proposals to fresh, independent Scenarios; the input model remains untouched. */
export function createScenariosFromHandshakeSuggestions(
  document: ScenarioDocumentModel,
  scenarioId: ScenarioId,
  selectedKeys: readonly string[],
): Readonly<{ document: ScenarioDocumentModel; createdScenarioIds: readonly ScenarioId[] }> {
  const available = listHandshakeMissingCaseSuggestions(document, scenarioId);
  const selected = [...new Set(selectedKeys)].map((key) => {
    const suggestion = available.find((item) => item.key === key);
    if (!suggestion) throw new Error(`Unknown or unsupported Handshake case suggestion '${key}'.`);
    return suggestion;
  });
  if (selected.length === 0) throw new Error("Select at least one Handshake case suggestion.");
  let next = document;
  const createdScenarioIds: ScenarioId[] = [];
  for (const suggestion of selected) {
    const sourceScenario = next.scenarios.find((scenario) => scenario.id === scenarioId);
    const sourceConstraintIndex = sourceScenario?.constraints.findIndex((constraint) => constraint.id === suggestion.constraintId) ?? -1;
    if (sourceConstraintIndex < 0) throw new Error("Handshake case constraint no longer exists in its Scenario.");
    const duplicated = duplicateScenario(next, scenarioId, document.scenarios.find((item) => item.id === scenarioId)!.name);
    const created = duplicated.scenarios.find((candidate) => !next.scenarios.some((existing) => existing.id === candidate.id));
    if (!created) throw new Error("Selected Handshake case did not create a Scenario.");
    const copiedConstraint = created.constraints[sourceConstraintIndex];
    if (!copiedConstraint) throw new Error("Duplicated Scenario is missing its Handshake constraint.");
    const generated = applyHandshakeCase(created, { ...suggestion, constraintId: copiedConstraint.id }, documentIds(duplicated));
    next = { ...duplicated, scenarios: duplicated.scenarios.map((candidate) => candidate.id === created.id ? generated : candidate) };
    const problems = validateScenarioDocumentModel(next);
    if (problems.length > 0) throw new Error(`Generated Handshake Scenario is invalid (${problems.map((problem) => problem.code).join(", ")}).`);
    createdScenarioIds.push(created.id);
  }
  return { document: next, createdScenarioIds };
}

/**
 * Validate the scenario-owned model through the existing v2 semantic contract.
 * This is an adapter boundary only; JSON parse/save activation remains separate.
 */
export function validateScenarioDocumentModel(input: unknown): readonly DocumentProblem[] {
  const problems: DocumentProblem[] = [...validateDocumentInputComplexity(input)];
  if (problems.length > 0) return problems;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [{ code: "SCENARIO_MODEL_SHAPE", path: "$", message: "Scenario document must be an object." }];
  }
  const model = input as Record<string, unknown>;
  rejectUnknownKeys(model, ["formatVersion", "document", "physicalTimebase", "signalGroups", "signalDefinitions", "enumDefinitions", "scenarios", "legend", "layout", "checkSettings"], "$", problems);
  if (model.formatVersion !== 3) problems.push({ code: "SCENARIO_MODEL_VERSION", path: "$.formatVersion", message: "Scenario model formatVersion must be 3." });
  if (!Array.isArray(model.signalDefinitions)) problems.push({ code: "SCENARIO_MODEL_SHAPE", path: "$.signalDefinitions", message: "signalDefinitions must be an array." });
  if (!Array.isArray(model.scenarios) || model.scenarios.length === 0) {
    problems.push({ code: "SCENARIO_MODEL_SHAPE", path: "$.scenarios", message: "A Scenario document must contain at least one Scenario." });
  }
  if (problems.length > 0) return problems;

  const typed = input as ScenarioDocumentModel;
  if (typed.scenarios.length > DOCUMENT_RESOURCE_BUDGET.scenarioCount) {
    const current = typed.scenarios.length;
    const limit = DOCUMENT_RESOURCE_BUDGET.scenarioCount;
    return [{ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.scenarios", message: `Scenario resource limit exceeded for scenarios: ${current.toLocaleString()} exceeds ${limit.toLocaleString()}.`, expected: String(limit), value: current, detail: `resource-budget;metric=scenario.scenarios;current=${current};limit=${limit}` }];
  }
  const scenarioIds = new Map<string, number>();
  const definitions = new Map<string, ScenarioSignalDefinition>();
  typed.signalDefinitions.forEach((definition, index) => {
    if (!definition || typeof definition !== "object" || typeof definition.id !== "string" || !isStableId(definition.id)) {
      problems.push({ code: "INVALID_STABLE_ID", path: `$.signalDefinitions[${index}].id`, message: "Signal definition must have a valid stable ID." });
      return;
    }
    const definitionFields = definition.type === "clock"
      ? ["id", "name", "type", "role", "source", "display", "spacingBefore", "spacingAfter"]
      : definition.type === "commentRow"
        ? ["id", "name", "type", "role", "source", "display", "spacingBefore", "spacingAfter", "title", "body"]
        : ["id", "name", "type", "role", "source", "display", "spacingBefore", "spacingAfter", "width", "displayFormat", "enumId"];
    rejectUnknownKeys(definition, definitionFields, `$.signalDefinitions[${index}]`, problems);
    const previous = definitions.get(definition.id);
    if (previous) problems.push({ code: "DUPLICATE_ID", path: `$.signalDefinitions[${index}].id`, message: `Signal ID '${definition.id}' is duplicated.` , entityId: definition.id });
    else definitions.set(definition.id, definition);
  });

  const ownedIds = new Map<string, string>();
  const registerOwnedId = (id: string, path: string): void => {
    const previous = ownedIds.get(id);
    if (previous) problems.push({ code: "DUPLICATE_ID", path, message: `ID '${id}' is already owned at ${previous}.`, entityId: id });
    else ownedIds.set(id, path);
  };

  // Document-wide entities are registered once; scenario-specific entities
  // must remain globally unique across all scenario projections.
  let registeredSharedIds = false;
  const aggregate = { scenarios: 0, annotations: 0, annotationGroups: 0, transactions: 0, transactionGroups: 0, bookmarks: 0, timeGroups: 0, constraints: 0, labelAnchors: 0, valueChanges: 0, transactionLinkedSignals: 0, transactionPhases: 0, clockSuppressedPeriods: 0 };
  const aggregateLimits: ReadonlyArray<readonly [keyof typeof aggregate, number, string]> = [
    ["annotations", DOCUMENT_RESOURCE_BUDGET.annotationCount, "annotations"], ["annotationGroups", DOCUMENT_RESOURCE_BUDGET.annotationGroupCount, "annotationGroups"],
    ["transactions", DOCUMENT_RESOURCE_BUDGET.transactionCount, "transactions"], ["transactionGroups", DOCUMENT_RESOURCE_BUDGET.transactionGroupCount, "transactionGroups"],
    ["bookmarks", DOCUMENT_RESOURCE_BUDGET.bookmarkCount, "bookmarks"], ["timeGroups", DOCUMENT_RESOURCE_BUDGET.timeGroupCount, "timeGroups"],
    ["constraints", DOCUMENT_RESOURCE_BUDGET.constraintCount, "constraints"], ["labelAnchors", DOCUMENT_RESOURCE_BUDGET.labelAnchorCount, "labelAnchors"],
    ["valueChanges", DOCUMENT_RESOURCE_BUDGET.valueChangeCount, "valueChanges"],
    ["transactionLinkedSignals", DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount, "transactions[*].linkedSignals"],
    ["transactionPhases", DOCUMENT_RESOURCE_BUDGET.transactionPhaseCount, "transactions[*].phases"],
    ["clockSuppressedPeriods", DOCUMENT_RESOURCE_BUDGET.clockSuppressedPeriodCount, "signalStates[*].generator.suppressedPeriods"],
  ];

  typed.scenarios.forEach((scenario, scenarioIndex) => {
    if (!scenario || typeof scenario !== "object") {
      problems.push({ code: "SCENARIO_MODEL_SHAPE", path: `$.scenarios[${scenarioIndex}]`, message: "Scenario entry must be an object." });
      return;
    }
    rejectUnknownKeys(scenario, ["id", "name", "timeline", "signalStates", "bookmarks", "timeGroups", "annotations", "annotationGroups", "transactions", "transactionGroups", "transactionTimeScale", "constraints"], `$.scenarios[${scenarioIndex}]`, problems);
    if (typeof scenario.id !== "string" || !isStableId(scenario.id)) {
      problems.push({ code: "INVALID_STABLE_ID", path: `$.scenarios[${scenarioIndex}].id`, message: "Scenario must have a valid stable ID." });
    } else {
      const previous = scenarioIds.get(scenario.id);
      if (previous !== undefined) problems.push({ code: "DUPLICATE_ID", path: `$.scenarios[${scenarioIndex}].id`, message: `Scenario ID '${scenario.id}' is duplicated.`, entityId: scenario.id });
      else scenarioIds.set(scenario.id, scenarioIndex);
      registerOwnedId(scenario.id, `$.scenarios[${scenarioIndex}].id`);
    }
    if (typeof scenario.name !== "string" || scenario.name.trim().length === 0) problems.push({ code: "SCENARIO_MODEL_SHAPE", path: `$.scenarios[${scenarioIndex}].name`, message: "Scenario name must be a non-empty string." });
    if (scenario.signalStates === null || typeof scenario.signalStates !== "object" || Array.isArray(scenario.signalStates)) {
      problems.push({ code: "SCENARIO_MODEL_SHAPE", path: `$.scenarios[${scenarioIndex}].signalStates`, message: "signalStates must be an object keyed by Signal ID." });
      return;
    }
    const scenarioArrays = ["bookmarks", "timeGroups", "annotations", "annotationGroups", "transactions", "constraints"] as const;
    let arraysValid = true;
    for (const key of scenarioArrays) {
      if (!Array.isArray(scenario[key])) {
        problems.push({ code: "SCENARIO_MODEL_SHAPE", path: `$.scenarios[${scenarioIndex}].${key}`, message: `${key} must be an array.` });
        arraysValid = false;
      }
    }
    if (scenario.transactionGroups !== undefined && !Array.isArray(scenario.transactionGroups)) {
      problems.push({ code: "SCENARIO_MODEL_SHAPE", path: `$.scenarios[${scenarioIndex}].transactionGroups`, message: "transactionGroups must be an array when present." });
      arraysValid = false;
    }
    if (scenario.timeline === null || typeof scenario.timeline !== "object" || !Array.isArray(scenario.timeline.labelAnchors)) {
      problems.push({ code: "SCENARIO_MODEL_SHAPE", path: `$.scenarios[${scenarioIndex}].timeline`, message: "Scenario timeline must contain a labelAnchors array." });
      arraysValid = false;
    }
    if (!arraysValid) return;
    const stateMap = scenario.signalStates as Record<string, unknown>;
    for (const definition of definitions.values()) {
      if (definition.type !== "commentRow" && !Object.prototype.hasOwnProperty.call(stateMap, definition.id)) {
        problems.push({ code: "MISSING_SCENARIO_SIGNAL_STATE", path: `$.scenarios[${scenarioIndex}].signalStates.${definition.id}`, message: `Scenario '${scenario.id}' is missing timing state for Signal '${definition.id}'.`, entityId: definition.id });
      }
    }
    for (const stateId of Object.keys(stateMap)) {
      const definition = definitions.get(stateId);
      if (!definition || definition.type === "commentRow") {
        problems.push({ code: "UNKNOWN_SCENARIO_SIGNAL_STATE", path: `$.scenarios[${scenarioIndex}].signalStates.${stateId}`, message: `Scenario state references unknown or non-timing Signal '${stateId}'.`, entityId: stateId });
      } else if (!stateMap[stateId] || typeof stateMap[stateId] !== "object" || (definition.type === "clock" ? (stateMap[stateId] as { kind?: unknown }).kind !== "clock" : (stateMap[stateId] as { kind?: unknown }).kind !== "values")) {
        problems.push({ code: "SCENARIO_SIGNAL_STATE_KIND", path: `$.scenarios[${scenarioIndex}].signalStates.${stateId}`, message: `Scenario state kind does not match Signal '${stateId}'.`, entityId: stateId });
      } else {
        const state = stateMap[stateId] as Record<string, unknown>;
        rejectUnknownKeys(state, definition.type === "clock" ? ["kind", "generator", "enable", "edgeCounter"] : ["kind", "values", "resetSemantics"], `$.scenarios[${scenarioIndex}].signalStates.${stateId}`, problems);
      }
    }

    let projection: CanonicalDocument;
    try {
      projection = projectScenarioAsV2(typed, scenario.id as ScenarioId);
    } catch (error) {
      problems.push({ code: "SCENARIO_PROJECTION_INVALID", path: `$.scenarios[${scenarioIndex}]`, message: error instanceof Error ? error.message : "Scenario could not be projected." });
      return;
    }
    const projectionProblems = validateCanonicalDocument(projection);
    problems.push(...projectionProblems);
    const perScenarioBudget = validateDocumentResourceBudget(projection).filter((item) => !["$.annotations", "$.annotationGroups", "$.transactions", "$.transactionGroups", "$.bookmarks", "$.timeGroups", "$.constraints", "$.timeline.labelAnchors", "$.signals[*].values|$.signals[*].enable", "$.transactions[*].linkedSignals", "$.transactions[*].phases", "$.signals[*].generator.suppressedPeriods"].includes(item.path));
    problems.push(...perScenarioBudget);
    if (projectionProblems.length === 0) {
      for (const entry of canonicalEntityInventory(projection)) {
        if (ENTITY_OWNERSHIP[entry.kind] === "shared") {
          if (!registeredSharedIds) registerOwnedId(entry.id, entry.path);
          continue;
        }
        registerOwnedId(entry.id, `$.scenarios[${scenarioIndex}]${entry.path.slice(1)}`);
      }
    }
    registeredSharedIds = true;

    aggregate.annotations += scenario.annotations.length;
    aggregate.annotationGroups += scenario.annotationGroups.length;
    aggregate.transactions += scenario.transactions.length;
    aggregate.transactionGroups += scenario.transactionGroups?.length ?? 0;
    aggregate.bookmarks += scenario.bookmarks.length;
    aggregate.timeGroups += scenario.timeGroups.length;
    aggregate.constraints += scenario.constraints.length;
    aggregate.labelAnchors += scenario.timeline.labelAnchors.length;
    aggregate.valueChanges += countSignalChangePoints(Object.values(scenario.signalStates));
    aggregate.transactionLinkedSignals += countNestedArrayItems(scenario.transactions, "linkedSignals");
    aggregate.transactionPhases += countNestedArrayItems(scenario.transactions, "phases");
    aggregate.clockSuppressedPeriods += countClockSuppressedPeriods(Object.values(scenario.signalStates));
  });

  for (const [metric, limit, pathName] of aggregateLimits) {
    const current = aggregate[metric];
    if (current > limit) problems.push({ code: "RESOURCE_LIMIT_EXCEEDED", path: `$.scenarios[*].${pathName}`, message: `Scenario resource limit exceeded for ${pathName}: ${current.toLocaleString()} exceeds ${limit.toLocaleString()}.`, expected: String(limit), value: current, detail: `resource-budget;metric=scenario.${pathName};current=${current};limit=${limit}` } as DocumentProblem);
  }
  return problems;
}
