import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { HistoryState } from "@timing-chart-v2/history";
import type {
  AnnotationId,
  GroupId,
  SignalId,
  TransactionId,
} from "@timing-chart-v2/schema";
import type { CommandId } from "@timing-chart-v2/schema";

/**
 * Coarse Application / Document / Session owner.
 *
 * This module deliberately begins as a port/adaptor.  Move the existing
 * implementations behind this interface in large chunks instead of extracting
 * dozens of tiny helpers.
 */
export interface MinimalCycleApplicationSource {
  readonly snapshot: CanonicalSnapshot;
  readonly history: HistoryState;

  readonly executeSemantic: (command: SemanticCommand) => CommandResult;
  readonly executeSemanticBatch?: (id: CommandId, commands: readonly SemanticCommand[]) => CommandResult;
  readonly undo: () => void;
  readonly redo: () => void;

  readonly selectedSignalId?: SignalId;
  readonly selectedGroupId?: GroupId;
  readonly selectedAnnotationId?: AnnotationId;
  readonly selectedTransactionId?: TransactionId;

  readonly clearSelection: () => void;

  readonly requestNewDocument: () => void;
  readonly requestOpenText: (text: string) => void;
  readonly saveDocumentText: () => string | undefined;

  readonly copySelection: () => void;
  readonly cutSelection: () => void;
  readonly pasteSelection: () => void;
  readonly duplicateSelection: () => void;
  readonly deleteSelection: () => void;

  readonly refreshDiagnostics: () => void;
}
export interface MinimalCycleApplicationPort {
  readonly snapshot: CanonicalSnapshot;
  readonly history: HistoryState;

  readonly command: Readonly<{
    execute: (command: SemanticCommand) => CommandResult;
    executeBatch: (id: CommandId, commands: readonly SemanticCommand[]) => CommandResult;
    undo: () => void;
    redo: () => void;
  }>;

  readonly selection: Readonly<{
    signalId?: SignalId;
    groupId?: GroupId;
    annotationId?: AnnotationId;
    transactionId?: TransactionId;
    clear: () => void;
  }>;

  readonly document: Readonly<{
    newDocument: () => void;
    openText: (text: string) => void;
    saveText: () => string | undefined;
  }>;

  readonly clipboard: Readonly<{
    copy: () => void;
    cut: () => void;
    paste: () => void;
    duplicate: () => void;
    delete: () => void;
  }>;

  readonly diagnostics: Readonly<{
    refresh: () => void;
  }>;
}

export function createMinimalCycleApplicationPort(
  source: MinimalCycleApplicationSource,
): MinimalCycleApplicationPort {
  return {
    snapshot: source.snapshot,
    history: source.history,
    command: {
      execute: source.executeSemantic,
      executeBatch: source.executeSemanticBatch ?? (() => ({ ok: false, reason: "no-op", problems: [] })),
      undo: source.undo,
      redo: source.redo,
    },
    selection: {
      ...(source.selectedSignalId === undefined ? {} : { signalId: source.selectedSignalId }),
      ...(source.selectedGroupId === undefined ? {} : { groupId: source.selectedGroupId }),
      ...(source.selectedAnnotationId === undefined ? {} : { annotationId: source.selectedAnnotationId }),
      ...(source.selectedTransactionId === undefined ? {} : { transactionId: source.selectedTransactionId }),
      clear: source.clearSelection,
    },
    document: {
      newDocument: source.requestNewDocument,
      openText: source.requestOpenText,
      saveText: source.saveDocumentText,
    },
    clipboard: {
      copy: source.copySelection,
      cut: source.cutSelection,
      paste: source.pasteSelection,
      duplicate: source.duplicateSelection,
      delete: source.deleteSelection,
    },
    diagnostics: {
      refresh: source.refreshDiagnostics,
    },
  };
}
