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
import { isStableId, serializeCanonicalDocument, type CanonicalDocument, type CommandId } from "@timing-chart-v2/schema";
import type { HistoryController, HistoryEntry, HistoryState, RecordedAction } from "./types.js";

const noHistory = (operation: "Undo" | "Redo"): CommandResult => ({ ok: false, reason: "no-op", problems: [{ code: "NO_HISTORY", path: "$", message: `${operation} history is empty.` }] });

export class CommandHistorySession implements CanonicalStore, SemanticCommandDispatcher, SemanticBatchDispatcher, HistoryController {
  readonly #documents: DocumentSession;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #cleanText: string;

  constructor(initial: CanonicalDocument) {
    this.#documents = new DocumentSession(initial);
    this.#cleanText = serializeCanonicalDocument(initial);
  }

  getSnapshot(): CanonicalSnapshot {
    return this.#documents.getSnapshot();
  }

  metrics(): CanonicalSessionMetrics {
    return this.#documents.metrics();
  }

  historyState(): HistoryState {
    return {
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      undoDepth: this.#undo.length,
      redoDepth: this.#redo.length,
      dirty: serializeCanonicalDocument(this.getSnapshot().document) !== this.#cleanText,
    };
  }

  markClean(): void {
    this.#cleanText = serializeCanonicalDocument(this.getSnapshot().document);
  }

  execute(command: SemanticCommand): CommandResult {
    const before = this.getSnapshot();
    const plan = planCommand(before.document, command);
    if (!plan.ok) return { ok: false, reason: plan.reason, problems: plan.problems };
    return this.#commit(command, before, plan.document, plan.changeSet, plan.inverseChangeSet);
  }

  executeBatch(id: CommandId, commands: readonly SemanticCommand[]): CommandResult {
    if (!isStableId(id)) return { ok: false, reason: "invalid", problems: [{ code: "INVALID_COMMAND_ID", path: "$.id", message: "Batch ID must be a stable ID." }] };
    if (commands.length === 0) return { ok: false, reason: "no-op", problems: [{ code: "EMPTY_BATCH", path: "$", message: "Atomic batch contains no commands." }] };
    const before = this.getSnapshot();
    let candidate = before.document;
    const forward: ChangeSet[] = [];
    const inverse: ChangeSet[] = [];
    for (const command of commands) {
      const plan = planCommand(candidate, command);
      if (!plan.ok) return { ok: false, reason: plan.reason, problems: plan.problems };
      candidate = plan.document;
      forward.push(plan.changeSet);
      inverse.unshift(plan.inverseChangeSet);
    }
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
      return { ok: true, snapshot, changeSet: entry.changeSet };
    } catch (error) {
      if (error instanceof CanonicalCommitError) return { ok: false, reason: error.reason === "stale" ? "stale" : "invalid", problems: error.problems };
      throw error;
    }
  }
}
