import type { ChangeSet, CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { CanonicalDocument, CommandId } from "@timing-chart-v2/schema";

export type RecordedAction = SemanticCommand | Readonly<{ id: CommandId; type: "batch"; commands: readonly SemanticCommand[] }>;

/**
 * History keeps the most recent 1,000 committed actions across Undo and Redo.
 * Entries retain canonical snapshot references; no serialization or deep clone
 * is performed for retention accounting or eviction.
 */
export const HISTORY_RETENTION_POLICY = Object.freeze({
  maxEntries: 1000,
  scope: "combined-undo-redo",
  coalescing: "none",
  retainedSnapshotEstimate: "two-snapshot-references-per-entry",
} as const);

export interface DocumentInverse {
  readonly type: "document.restore";
  readonly document: Readonly<CanonicalDocument>;
}

export interface HistoryEntry {
  readonly commandId: CommandId;
  readonly action: RecordedAction;
  readonly inverse: DocumentInverse;
  readonly before: CanonicalSnapshot;
  readonly after: CanonicalSnapshot;
  readonly changeSet: ChangeSet;
  readonly inverseChangeSet: ChangeSet;
}

export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly dirty: boolean;
}

export interface HistoryMetrics {
  readonly commandAttempts: number;
  readonly committedActions: number;
  readonly undoOperations: number;
  readonly redoOperations: number;
  /** Number of entries removed by the retention limit, excluding branch redo clearing. */
  readonly evictedEntries: number;
  /** Current number of retained entries across Undo and Redo. */
  readonly retainedEntryCount: number;
  /** Lightweight estimate: two snapshot references per retained entry. */
  readonly retainedSnapshotEstimate: number;
}

export interface HistoryController {
  historyState(): HistoryState;
  undo(): CommandResult;
  redo(): CommandResult;
  markClean(): void;
  historyMetrics(): HistoryMetrics;
}
