import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { SelectionOwner } from "./use-selection-owner.js";
import type { ClipboardActions } from "./clipboard-actions.js";
import { repairSelectionAgainstDocument, restoredAnnotationIds } from "./selection-history-repair.js";

export interface EditorCommandRouterInput {
  readonly application: EditorApplicationOwner;
  readonly selection: SelectionOwner;
  readonly editActions: ClipboardActions;
  readonly selectAllRef: Readonly<{ current: () => void }>;
}

export interface EditorCommandRouter {
  readonly commandRegistry: MutableRefObject<UiCommandRegistry>;
  readonly executeBatch: EditorApplicationOwner["executeBatch"];
}

export function useEditorCommandRouter(input: EditorCommandRouterInput): EditorCommandRouter {
  const commandRegistry = useRef(new UiCommandRegistry());

  const repairSelectionAfterHistoryChange = (result: CommandResult, previousDocument: CanonicalDocument) => {
    if (!result.ok) return;
    const current = input.selection.refs.state.current;
    const repaired = repairSelectionAgainstDocument(current, result.snapshot.document);
    if (repaired !== current) input.selection.selectTarget(repaired);
    const addedIds = result.changeSet.addedSignals ?? [];
    const nothingSelected = current.signalId === undefined
      && current.signalIds.size === 0
      && current.groupId === undefined
      && current.spacerId === undefined
      && current.annotationId === undefined
      && current.annotationIds.size === 0
      && current.transactionId === undefined
      && current.transactionIds.size === 0
      && current.transactionPhaseId === undefined
      && !current.legendSelected;
    const restoredAnnotations = restoredAnnotationIds(previousDocument, result.snapshot.document);
    if (nothingSelected && addedIds.length === 1) input.selection.selectSignal(addedIds[0]!);
    else if (nothingSelected && restoredAnnotations.length > 0) input.selection.selectAnnotation(restoredAnnotations[0]!);
  };

  useEffect(() => {
    const registry = commandRegistry.current;
    const unregister = [
      registry.register<SemanticCommand>("semantic.execute", (command) => input.application.execute(command)),
      registry.register("selection.delete", input.editActions.deleteSelection),
      registry.register<{ readonly name: string }>("selection.rename", ({ name }) => input.editActions.rename(name)),
      registry.register<{ readonly visible: boolean }>("selection.visibility", ({ visible }) => input.editActions.setVisibility(visible)),
      registry.register("selection.isolate", () => input.editActions.isolateSelection()),
      registry.register("history.undo", () => { const previousDocument = input.application.runtime.session.current().getSnapshot().document; const result = input.application.undo(); repairSelectionAfterHistoryChange(result, previousDocument); return result; }),
      registry.register("history.redo", () => { const previousDocument = input.application.runtime.session.current().getSnapshot().document; const result = input.application.redo(); repairSelectionAfterHistoryChange(result, previousDocument); return result; }),
      registry.register("clipboard.copy", input.editActions.copy),
      registry.register("clipboard.cut", input.editActions.cut),
      registry.register("clipboard.paste", input.editActions.paste),
      registry.register("clipboard.duplicate", input.editActions.duplicate),
      registry.register("selection.selectAll", () => input.selectAllRef.current()),
    ];
    return () => unregister.forEach((dispose) => dispose());
  }, []);

  return { commandRegistry, executeBatch: input.application.executeBatch };
}
