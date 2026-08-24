import type { ChangeSet, CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { CanonicalDocument, CommandId } from "@timing-chart-v2/schema";

export type RecordedAction = SemanticCommand | Readonly<{ id: CommandId; type: "batch"; commands: readonly SemanticCommand[] }>;

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

export interface HistoryController {
  historyState(): HistoryState;
  undo(): CommandResult;
  redo(): CommandResult;
  markClean(): void;
}
