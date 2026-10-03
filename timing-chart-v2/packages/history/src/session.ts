import {
  mergeChangeSets,
  planCommand,
  type ChangeSet,
  type CommandResult,
  type SemanticBatchDispatcher,
  type SemanticCommand,
  type SemanticCommandDispatcher,
} from "@timing-chart-v2/commands";
import {
  CanonicalCommitError,
  DocumentSession,
  type CanonicalSessionMetrics,
  type CanonicalSnapshot,
  type CanonicalStore,
} from "@timing-chart-v2/core";
import { isStableId, type CanonicalDocument, type CommandId, type ParsedCanonicalDocument } from "@timing-chart-v2/schema";
import { HISTORY_RETENTION_POLICY, type HistoryController, type HistoryEntry, type HistoryMetrics, type HistoryState, type RecordedAction } from "./types.js";

const noHistory = (operation: "Undo" | "Redo"): CommandResult => ({ ok: false, reason: "no-op", problems: [{ code: "NO_HISTORY", path: "$", message: `${operation} history is empty.` }] });

// #275: a professional editor session must not retain unbounded Undo
// history forever -- an open-ended array of HistoryEntry (each holding a
// full before/after CanonicalSnapshot) is the actual unbounded-memory risk,
// not per-command copying (commits already preserve structural sharing).
// This horizon only trims the *array*, dropping the oldest entry
// references so they become garbage-collectible; it never touches,
// serializes, or deep-clones the current or retained documents. Redo needs
// no separate cap: it can only ever hold entries popped off #undo via
// undo(), so it is already bounded by the same limit.
export const HISTORY_RETENTION_LIMIT = HISTORY_RETENTION_POLICY.maxEntries;

export class CommandHistorySession implements CanonicalStore, SemanticCommandDispatcher, SemanticBatchDispatcher, HistoryController {
  readonly #documents: DocumentSession;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  // The savepoint is an identity token, not a strong reference to an old
  // Canonical root. History entries keep documents alive only while they are
  // inside the Undo/Redo horizon; a saved root outside that horizon must not
  // pin its large structural-sharing branches indefinitely.
  readonly #documentIdentities = new WeakMap<object, symbol>();
  #cleanDocumentIdentity: symbol;
  #historyMetrics: HistoryMetrics = {
    commandAttempts: 0,
    committedActions: 0,
    undoOperations: 0,
    redoOperations: 0,
    evictedEntries: 0,
    retainedEntryCount: 0,
    retainedSnapshotEstimate: 0,
  };

  constructor(initial: CanonicalDocument | ParsedCanonicalDocument) {
    this.#documents = new DocumentSession(initial);
    this.#cleanDocumentIdentity = this.#documentIdentity(this.#documents.getSnapshot().document);
  }

  getSnapshot(): CanonicalSnapshot {
    return this.#documents.getSnapshot();
  }

  metrics(): CanonicalSessionMetrics {
    return this.#documents.metrics();
  }

  historyState(): HistoryState {
    const document = this.getSnapshot().document;
    return {
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      undoDepth: this.#undo.length,
      redoDepth: this.#redo.length,
      dirty: this.#documentIdentity(document) !== this.#cleanDocumentIdentity,
    };
  }

  markClean(): void {
    this.#cleanDocumentIdentity = this.#documentIdentity(this.getSnapshot().document);
  }

  #documentIdentity(document: Readonly<CanonicalDocument>): symbol {
    let identity = this.#documentIdentities.get(document);
    if (identity === undefined) {
      identity = Symbol("canonical-document");
      this.#documentIdentities.set(document, identity);
    }
    return identity;
  }

  historyMetrics(): HistoryMetrics {
    return Object.freeze({ ...this.#historyMetrics });
  }

  #syncRetentionMetrics(): void {
    const retainedEntryCount = this.#undo.length + this.#redo.length;
    this.#historyMetrics = {
      ...this.#historyMetrics,
      retainedEntryCount,
      retainedSnapshotEstimate: retainedEntryCount * 2,
    };
  }

  #evictOldestEntries(): void {
    while (this.#undo.length + this.#redo.length > HISTORY_RETENTION_POLICY.maxEntries) {
      if (this.#undo.length > 0) this.#undo.shift();
      else this.#redo.shift();
      this.#historyMetrics = { ...this.#historyMetrics, evictedEntries: this.#historyMetrics.evictedEntries + 1 };
    }
    this.#syncRetentionMetrics();
  }

  execute(command: SemanticCommand): CommandResult {
    this.#historyMetrics = { ...this.#historyMetrics, commandAttempts: this.#historyMetrics.commandAttempts + 1 };
    const before = this.getSnapshot();
    const plan = planCommand(before.document, command);
    if (!plan.ok) return { ok: false, reason: plan.reason, problems: plan.problems };
    return this.#commit(command, before, plan.document, plan.changeSet, plan.inverseChangeSet);
  }

  executeBatch(id: CommandId, commands: readonly SemanticCommand[]): CommandResult {
    this.#historyMetrics = { ...this.#historyMetrics, commandAttempts: this.#historyMetrics.commandAttempts + 1 };
    if (!isStableId(id)) return { ok: false, reason: "invalid", problems: [{ code: "INVALID_COMMAND_ID", path: "$.id", message: "Batch ID must be a stable ID." }] };
    if (commands.length === 0) return { ok: false, reason: "no-op", problems: [{ code: "EMPTY_BATCH", path: "$", message: "Atomic batch contains no commands." }] };
    const before = this.getSnapshot();
    let candidate = before.document;
    const forward: ChangeSet[] = [];
    const inverse: ChangeSet[] = [];
    const renameCommands = commands.every((command): command is Extract<SemanticCommand, { type: "signal.rename" }> => command.type === "signal.rename") ? commands : undefined;
    const commandsToPlan: readonly SemanticCommand[] = renameCommands && renameCommands.length > 1
      ? [{ id, type: "signal.bulkRename", updates: renameCommands.map(({ signalId, name }) => ({ signalId, name })) }]
      : commands;
    for (const command of commandsToPlan) {
      const plan = planCommand(candidate, command);
      if (!plan.ok) return { ok: false, reason: plan.reason, problems: plan.problems };
      candidate = plan.document;
      forward.push(plan.changeSet);
      inverse.push(plan.inverseChangeSet);
    }
    inverse.reverse();
    const action: RecordedAction = { id, type: "batch", commands };
    return this.#commit(action, before, candidate, mergeChangeSets(forward), mergeChangeSets(inverse));
  }

  #commit(action: RecordedAction, before: CanonicalSnapshot, candidate: CanonicalDocument, changeSet: ChangeSet, inverseChangeSet: ChangeSet): CommandResult {
    try {
      const after = this.#documents.commit(candidate, before.revision);
      const entry: HistoryEntry = {
        commandId: action.id,
        action,
        inverse: { type: "document.restore", document: before.document },
        before,
        after,
        changeSet,
        inverseChangeSet,
      };
      this.#undo.push(entry);
      this.#redo = [];
      this.#historyMetrics = { ...this.#historyMetrics, committedActions: this.#historyMetrics.committedActions + 1 };
      this.#evictOldestEntries();
      return { ok: true, snapshot: after, changeSet };
    } catch (error) {
      if (error instanceof CanonicalCommitError) return { ok: false, reason: error.reason === "stale" ? "stale" : "invalid", problems: error.problems.length > 0 ? error.problems : [{ code: "STALE_REVISION", path: "$", message: error.message }] };
      throw error;
    }
  }

  undo(): CommandResult {
    const entry = this.#undo.at(-1);
    if (!entry) return noHistory("Undo");
    const current = this.getSnapshot();
    try {
      const snapshot = this.#documents.commit(entry.inverse.document, current.revision);
      this.#undo.pop();
      this.#redo.push(entry);
      this.#historyMetrics = { ...this.#historyMetrics, undoOperations: this.#historyMetrics.undoOperations + 1 };
      return { ok: true, snapshot, changeSet: entry.inverseChangeSet };
    } catch (error) {
      if (error instanceof CanonicalCommitError) return { ok: false, reason: error.reason === "stale" ? "stale" : "invalid", problems: error.problems };
      throw error;
    }
  }

  redo(): CommandResult {
    const entry = this.#redo.at(-1);
    if (!entry) return noHistory("Redo");
    const current = this.getSnapshot();
    try {
      const snapshot = this.#documents.commit(entry.after.document, current.revision);
      this.#redo.pop();
      this.#undo.push(entry);
      this.#historyMetrics = { ...this.#historyMetrics, redoOperations: this.#historyMetrics.redoOperations + 1 };
      return { ok: true, snapshot, changeSet: entry.changeSet };
    } catch (error) {
      if (error instanceof CanonicalCommitError) return { ok: false, reason: error.reason === "stale" ? "stale" : "invalid", problems: error.problems };
      throw error;
    }
  }
}
