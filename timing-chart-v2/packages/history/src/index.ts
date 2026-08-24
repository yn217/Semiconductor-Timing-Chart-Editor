import type { ChangeSet, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { CommandId } from "@timing-chart-v2/schema";

export interface HistoryEntry {
  readonly commandId: CommandId;
  readonly command: SemanticCommand;
  readonly before: CanonicalSnapshot;
  readonly after: CanonicalSnapshot;
  readonly changeSet: ChangeSet;
}

export interface HistoryPort {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  record(entry: HistoryEntry): void;
  undo(): HistoryEntry | undefined;
  redo(): HistoryEntry | undefined;
}
