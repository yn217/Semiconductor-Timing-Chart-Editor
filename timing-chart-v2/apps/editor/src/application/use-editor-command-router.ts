import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { SelectionOwner } from "./use-selection-owner.js";
import type { ClipboardActions } from "./clipboard-actions.js";

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

  const repairSelectionAfterHistoryChange = (result: CommandResult) => {
    if (!result.ok) return;
    const removedIds = result.changeSet.removedSignals ?? [];
    const currentSignalId = input.selection.refs.signalId.current;
    if (currentSignalId && removedIds.includes(currentSignalId)) {
      input.selection.clear();
      return;
    }
    const addedIds = result.changeSet.addedSignals ?? [];
    const nothingSelected = !input.selection.refs.signalId.current
      && !input.selection.refs.groupId.current
      && !input.selection.refs.spacerId.current
      && !input.selection.refs.annotationId.current
      && !input.selection.refs.transactionId.current;
    if (nothingSelected && addedIds.length === 1) input.selection.selectSignal(addedIds[0]!);
  };

  useEffect(() => {
    const registry = commandRegistry.current;
    const unregister = [
      registry.register<SemanticCommand>("semantic.execute", (command) => input.application.execute(command)),
      registry.register("selection.delete", input.editActions.deleteSelection),
      registry.register<{ readonly name: string }>("selection.rename", ({ name }) => input.editActions.rename(name)),
      registry.register<{ readonly visible: boolean }>("selection.visibility", ({ visible }) => input.editActions.setVisibility(visible)),
      registry.register("selection.isolate", () => input.editActions.isolateSelection()),
      registry.register("history.undo", () => { const result = input.application.undo(); repairSelectionAfterHistoryChange(result); return result; }),
      registry.register("history.redo", () => { const result = input.application.redo(); repairSelectionAfterHistoryChange(result); return result; }),
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
