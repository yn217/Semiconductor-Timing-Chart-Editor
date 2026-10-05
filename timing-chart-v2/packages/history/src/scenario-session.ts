import { type ChangeSet, type CommandResult, type SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSessionMetrics, CanonicalSnapshot } from "@timing-chart-v2/core";
import { deleteScenario, duplicateScenario, projectScenarioAsV2, renameScenario, updateScenarioModelFromV2Projection, validateScenarioDocumentModel, type CanonicalDocument, type CommandId, type ScenarioDocumentModel, type ScenarioId } from "@timing-chart-v2/schema";
import { CommandHistorySession } from "./session.js";
import { HISTORY_RETENTION_POLICY, type HistoryMetrics, type HistoryState, type RecordedAction } from "./types.js";

interface ScenarioHistoryEntry {
  readonly action: RecordedAction | Readonly<{ type: "scenario.rename" | "scenario.duplicate" | "scenario.delete"; scenarioId: ScenarioId }> | Readonly<{ type: "scenario.generate"; scenarioIds: readonly ScenarioId[] }>;
  readonly before: ScenarioDocumentModel;
  readonly after: ScenarioDocumentModel;
  readonly beforeActiveScenarioId: ScenarioId;
  readonly afterActiveScenarioId: ScenarioId;
  readonly changeSet: ChangeSet;
}

const emptyMetrics: HistoryMetrics = Object.freeze({ commandAttempts: 0, committedActions: 0, undoOperations: 0, redoOperations: 0, evictedEntries: 0, retainedEntryCount: 0, retainedSnapshotEstimate: 0 });

function noHistory(operation: "Undo" | "Redo"): CommandResult {
  return { ok: false, reason: "no-op", problems: [{ code: "NO_HISTORY", path: "$", message: `${operation} history is empty.` }] };
}

function freezeModel<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeModel(child);
    Object.freeze(value);
  }
  return value;
}

function cloneModel<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneModel(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, cloneModel(child)])) as T;
  }
  return value;
}

/**
 * Scenario-aware semantic History owner. Commands still plan/validate against
 * the existing CanonicalDocument projection; History retains the complete
 * Scenario model so Undo/Redo remains global when the active Scenario changes.
 */
export class ScenarioCommandHistorySession {
  #model: ScenarioDocumentModel;
  #activeScenarioId: ScenarioId;
  #activeProjection: CommandHistorySession;
  #revision = 0;
  #snapshot: CanonicalSnapshot;
  #undo: ScenarioHistoryEntry[] = [];
  #redo: ScenarioHistoryEntry[] = [];
  #cleanModel: ScenarioDocumentModel;
  #metrics: HistoryMetrics = { ...emptyMetrics };
  #priorSessionMetrics: CanonicalSessionMetrics = { validationRuns: 0, commits: 0 };

  constructor(model: ScenarioDocumentModel, activeScenarioId = model.scenarios[0]?.id) {
    const ownedModel = cloneModel(model);
    const problems = validateScenarioDocumentModel(ownedModel);
    if (problems.length > 0) throw new Error(`Initial Scenario model is invalid: ${problems.map((item) => item.code).join(", ")}`);
    if (activeScenarioId === undefined || !ownedModel.scenarios.some((scenario) => scenario.id === activeScenarioId)) throw new Error("Active Scenario must identify a Scenario in the document.");
    this.#model = freezeModel(ownedModel);
    this.#activeScenarioId = activeScenarioId;
    this.#cleanModel = ownedModel;
    this.#activeProjection = this.#createProjection(model, activeScenarioId);
    this.#snapshot = this.#publishSnapshot();
  }

  getSnapshot(): CanonicalSnapshot { return this.#snapshot; }
  snapshot(): CanonicalSnapshot { return this.getSnapshot(); }
  current(): ScenarioCommandHistorySession { return this; }
  scenarioModel(): ScenarioDocumentModel { return this.#model; }
  activeScenarioId(): ScenarioId { return this.#activeScenarioId; }

  /** Scenario selection is workspace state: it changes the projection, not model revision or History. */
  switchScenario(scenarioId: ScenarioId): CanonicalSnapshot {
    if (!this.#model.scenarios.some((scenario) => scenario.id === scenarioId)) throw new Error(`Scenario '${scenarioId}' does not exist.`);
    if (scenarioId === this.#activeScenarioId) return this.#snapshot;
    this.#archiveProjectionMetrics();
    this.#activeScenarioId = scenarioId;
    this.#activeProjection = this.#createProjection(this.#model, scenarioId);
    return this.#publishSnapshot();
  }

  renameScenario(scenarioId: ScenarioId, name: string): CanonicalSnapshot {
    return this.#acceptModelMutation({ type: "scenario.rename", scenarioId }, renameScenario(this.#model, scenarioId, name), this.#activeScenarioId);
  }

  duplicateScenario(scenarioId: ScenarioId, name?: string): ScenarioId {
    const next = duplicateScenario(this.#model, scenarioId, name);
    const created = next.scenarios.find((scenario) => !this.#model.scenarios.some((current) => current.id === scenario.id));
    if (!created) throw new Error("Scenario duplication did not create a new Scenario.");
    this.#acceptModelMutation({ type: "scenario.duplicate", scenarioId }, next, created.id);
    return created.id;
  }

  deleteScenario(scenarioId: ScenarioId): CanonicalSnapshot {
    const next = deleteScenario(this.#model, scenarioId);
    const active = this.#activeScenarioId === scenarioId ? next.scenarios[Math.min(this.#model.scenarios.findIndex((scenario) => scenario.id === scenarioId), next.scenarios.length - 1)]!.id : this.#activeScenarioId;
    return this.#acceptModelMutation({ type: "scenario.delete", scenarioId }, next, active);
  }

  /** Accept a user-selected batch of generated Scenario candidates as one exact Undo step. */
  addGeneratedScenarios(model: ScenarioDocumentModel, createdScenarioIds: readonly ScenarioId[]): CanonicalSnapshot {
    if (createdScenarioIds.length === 0) throw new Error("At least one generated Scenario is required.");
    for (const id of createdScenarioIds) if (this.#model.scenarios.some((scenario) => scenario.id === id)) throw new Error(`Generated Scenario '${id}' already exists.`);
    const activeScenarioId = createdScenarioIds.at(-1)!;
    if (!model.scenarios.some((scenario) => scenario.id === activeScenarioId)) throw new Error("The generated model must contain its final selected Scenario.");
    return this.#acceptModelMutation({ type: "scenario.generate", scenarioIds: [...createdScenarioIds] }, model, activeScenarioId);
  }

  metrics(): CanonicalSessionMetrics {
    const current = this.#activeProjection.metrics();
    return { validationRuns: this.#priorSessionMetrics.validationRuns + current.validationRuns, commits: this.#priorSessionMetrics.commits + current.commits };
  }

  historyState(): HistoryState {
    return { canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0, undoDepth: this.#undo.length, redoDepth: this.#redo.length, dirty: this.#model !== this.#cleanModel };
  }

  historyMetrics(): HistoryMetrics { return Object.freeze({ ...this.#metrics }); }
  markClean(): void { this.#cleanModel = this.#model; }
  markFormatMigrationDirty(): void { this.#cleanModel = freezeModel(cloneModel(this.#model)); }

  execute(command: SemanticCommand): CommandResult {
    this.#metrics = { ...this.#metrics, commandAttempts: this.#metrics.commandAttempts + 1 };
    const before = this.#model;
    const result = this.#activeProjection.execute(command);
    if (!result.ok) return result;
    return this.#acceptProjection(command, before, result.changeSet, result.snapshot.document);
  }

  executeBatch(id: CommandId, commands: readonly SemanticCommand[]): CommandResult {
    this.#metrics = { ...this.#metrics, commandAttempts: this.#metrics.commandAttempts + 1 };
    const before = this.#model;
    const result = this.#activeProjection.executeBatch(id, commands);
    if (!result.ok) return result;
    return this.#acceptProjection({ id, type: "batch", commands }, before, result.changeSet, result.snapshot.document);
  }

  undo(): CommandResult {
    const entry = this.#undo.at(-1);
    if (!entry) return noHistory("Undo");
    this.#model = entry.before;
    this.#activeScenarioId = entry.beforeActiveScenarioId;
    this.#undo.pop();
    this.#redo.push(entry);
    this.#metrics = { ...this.#metrics, undoOperations: this.#metrics.undoOperations + 1 };
    this.#revision += 1;
    this.#resetActiveProjection();
    return { ok: true, snapshot: this.#snapshot, changeSet: { fullDocumentReplace: true } };
  }

  redo(): CommandResult {
    const entry = this.#redo.at(-1);
    if (!entry) return noHistory("Redo");
    this.#model = entry.after;
    this.#activeScenarioId = entry.afterActiveScenarioId;
    this.#redo.pop();
    this.#undo.push(entry);
    this.#metrics = { ...this.#metrics, redoOperations: this.#metrics.redoOperations + 1 };
    this.#revision += 1;
    this.#resetActiveProjection();
    return { ok: true, snapshot: this.#snapshot, changeSet: { fullDocumentReplace: true } };
  }

  #createProjection(model: ScenarioDocumentModel, scenarioId: ScenarioId): CommandHistorySession {
    return new CommandHistorySession(projectScenarioAsV2(model, scenarioId), { recordHistory: false });
  }

  #archiveProjectionMetrics(): void {
    const metrics = this.#activeProjection.metrics();
    this.#priorSessionMetrics = { validationRuns: this.#priorSessionMetrics.validationRuns + metrics.validationRuns, commits: this.#priorSessionMetrics.commits + metrics.commits };
  }

  #resetActiveProjection(): void {
    this.#archiveProjectionMetrics();
    this.#activeProjection = this.#createProjection(this.#model, this.#activeScenarioId);
    this.#publishSnapshot();
  }

  #publishSnapshot(): CanonicalSnapshot {
    this.#snapshot = Object.freeze({ revision: this.#revision, document: this.#activeProjection.getSnapshot().document });
    return this.#snapshot;
  }

  #acceptProjection(action: RecordedAction, before: ScenarioDocumentModel, changeSet: ChangeSet, document: Readonly<CanonicalDocument>): CommandResult {
    let after: ScenarioDocumentModel;
    try {
      after = freezeModel(updateScenarioModelFromV2Projection(this.#model, this.#activeScenarioId, document as CanonicalDocument));
    } catch (error) {
      this.#archiveProjectionMetrics();
      this.#activeProjection = this.#createProjection(before, this.#activeScenarioId);
      return { ok: false, reason: "invalid", problems: [{ code: "SCENARIO_RECONCILIATION_FAILED", path: "$.scenarios", message: error instanceof Error ? error.message : "Scenario projection could not be reconciled." }] };
    }
    this.#model = after;
    this.#revision += 1;
    this.#undo.push({ action, before, after, beforeActiveScenarioId: this.#activeScenarioId, afterActiveScenarioId: this.#activeScenarioId, changeSet });
    this.#redo = [];
    this.#metrics = { ...this.#metrics, committedActions: this.#metrics.committedActions + 1 };
    this.#trimHistory();
    return { ok: true, snapshot: this.#publishSnapshot(), changeSet };
  }

  #acceptModelMutation(
    action: Extract<ScenarioHistoryEntry["action"], { type: `scenario.${string}` }>,
    next: ScenarioDocumentModel,
    nextActiveScenarioId: ScenarioId,
  ): CanonicalSnapshot {
    if (next === this.#model && nextActiveScenarioId === this.#activeScenarioId) return this.#snapshot;
    const before = this.#model;
    const beforeActiveScenarioId = this.#activeScenarioId;
    const owned = freezeModel(cloneModel(next));
    const problems = validateScenarioDocumentModel(owned);
    if (problems.length > 0) throw new Error(`Scenario operation produced an invalid document (${problems.map((item) => item.code).join(", ")}).`);
    this.#model = owned;
    this.#activeScenarioId = nextActiveScenarioId;
    this.#revision += 1;
    this.#resetActiveProjection();
    this.#undo.push({ action, before, after: owned, beforeActiveScenarioId, afterActiveScenarioId: nextActiveScenarioId, changeSet: { fullDocumentReplace: true } });
    this.#redo = [];
    this.#metrics = { ...this.#metrics, committedActions: this.#metrics.committedActions + 1 };
    this.#trimHistory();
    return this.#snapshot;
  }

  #trimHistory(): void {
    while (this.#undo.length + this.#redo.length > HISTORY_RETENTION_POLICY.maxEntries) {
      if (this.#undo.length > 0) this.#undo.shift();
      else this.#redo.shift();
      this.#metrics = { ...this.#metrics, evictedEntries: this.#metrics.evictedEntries + 1 };
    }
    const retainedEntryCount = this.#undo.length + this.#redo.length;
    this.#metrics = { ...this.#metrics, retainedEntryCount, retainedSnapshotEstimate: retainedEntryCount * 2 };
  }
}
