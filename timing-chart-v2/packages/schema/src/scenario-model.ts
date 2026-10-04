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
} from "./types.js";

const DEFAULT_SCENARIO_ID = "scenario_default" as ScenarioId;

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
