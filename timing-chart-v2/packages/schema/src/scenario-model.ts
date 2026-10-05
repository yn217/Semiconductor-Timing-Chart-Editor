import type {
  CanonicalDocument,
  ClockSignal,
  ScenarioDocumentModel,
  ScenarioSignalDefinition,
  ScenarioSignalState,
  ScenarioId,
  SignalId,
  Signal,
  TimingScenario,
  ValueSignal,
  DocumentProblem,
} from "./types.js";
import { canonicalEntityInventory, type CanonicalEntityKind } from "./canonical-inventory.js";
import { DOCUMENT_RESOURCE_BUDGET, validateDocumentResourceBudget, validateDocumentInputComplexity } from "./resource-budget.js";
import { isStableId } from "./stable-id.js";
import { validateCanonicalDocument } from "./validation.js";

const DEFAULT_SCENARIO_ID = "scenario_default" as ScenarioId;

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
  const scenarioIds = new Map<string, number>();
  const definitions = new Map<string, ScenarioSignalDefinition>();
  typed.signalDefinitions.forEach((definition, index) => {
    if (!definition || typeof definition !== "object" || typeof definition.id !== "string" || !isStableId(definition.id)) {
      problems.push({ code: "INVALID_STABLE_ID", path: `$.signalDefinitions[${index}].id`, message: "Signal definition must have a valid stable ID." });
      return;
    }
    rejectUnknownKeys(definition, ["id", "name", "type", "role", "source", "display", "values", "generator", "enable", "edgeCounter", "width", "displayFormat", "enumId", "resetSemantics", "title", "body", "spacingBefore", "spacingAfter"], `$.signalDefinitions[${index}]`, problems);
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
  const sharedKinds = new Set<CanonicalEntityKind>(["document", "signal", "signalGroup", "spacer", "enumDefinition"]);
  const projectedScenarioKinds = new Set<CanonicalEntityKind>(["annotation", "annotationGroup", "transaction", "transactionGroup", "bookmark", "timeGroup", "labelAnchor", "constraint"]);
  let registeredSharedIds = false;
  const aggregate = { annotations: 0, annotationGroups: 0, transactions: 0, transactionGroups: 0, bookmarks: 0, timeGroups: 0, constraints: 0, labelAnchors: 0, valueChanges: 0 };
  const aggregateLimits: ReadonlyArray<readonly [keyof typeof aggregate, number, string]> = [
    ["annotations", DOCUMENT_RESOURCE_BUDGET.annotationCount, "annotations"], ["annotationGroups", DOCUMENT_RESOURCE_BUDGET.annotationGroupCount, "annotationGroups"],
    ["transactions", DOCUMENT_RESOURCE_BUDGET.transactionCount, "transactions"], ["transactionGroups", DOCUMENT_RESOURCE_BUDGET.transactionGroupCount, "transactionGroups"],
    ["bookmarks", DOCUMENT_RESOURCE_BUDGET.bookmarkCount, "bookmarks"], ["timeGroups", DOCUMENT_RESOURCE_BUDGET.timeGroupCount, "timeGroups"],
    ["constraints", DOCUMENT_RESOURCE_BUDGET.constraintCount, "constraints"], ["labelAnchors", DOCUMENT_RESOURCE_BUDGET.labelAnchorCount, "labelAnchors"],
    ["valueChanges", DOCUMENT_RESOURCE_BUDGET.valueChangeCount, "valueChanges"],
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
    const perScenarioBudget = validateDocumentResourceBudget(projection).filter((item) => !["$.annotations", "$.annotationGroups", "$.transactions", "$.transactionGroups", "$.bookmarks", "$.timeGroups", "$.constraints", "$.timeline.labelAnchors", "$.signals[*].values"].includes(item.path));
    problems.push(...perScenarioBudget);
    if (projectionProblems.length === 0) {
      for (const entry of canonicalEntityInventory(projection)) {
        if (sharedKinds.has(entry.kind)) {
          if (!registeredSharedIds) registerOwnedId(entry.id, entry.path);
          continue;
        }
        if (projectedScenarioKinds.has(entry.kind)) registerOwnedId(entry.id, `$.scenarios[${scenarioIndex}]${entry.path.slice(1)}`);
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
    for (const state of Object.values(scenario.signalStates)) {
      if (state?.kind === "values") aggregate.valueChanges += state.values.length;
    }
  });

  for (const [metric, limit, pathName] of aggregateLimits) {
    const current = aggregate[metric];
    if (current > limit) problems.push({ code: "RESOURCE_LIMIT_EXCEEDED", path: `$.scenarios[*].${pathName}`, message: `Scenario resource limit exceeded for ${pathName}: ${current.toLocaleString()} exceeds ${limit.toLocaleString()}.`, expected: String(limit), value: current, detail: `resource-budget;metric=scenario.${pathName};current=${current};limit=${limit}` } as DocumentProblem);
  }
  return problems;
}
