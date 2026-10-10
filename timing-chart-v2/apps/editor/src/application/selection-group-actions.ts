import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, CommandId, GroupId, SignalGroup, SignalId } from "@timing-chart-v2/schema";
import { groupId } from "../minimal-cycle-view-fixture-helpers.js";
import { nextEntityId } from "../entity-id.js";
import type { EditorApplicationOwner } from "./use-editor-application-owner.js";
import type { SelectionOwner } from "./use-selection-owner.js";

type SelectionGroupActionsInput = Readonly<{
  document: CanonicalDocument;
  selection: SelectionOwner;
  application: EditorApplicationOwner;
  nextCommandId: (operation: string) => CommandId;
  reportStatus: (message: string) => void;
}>;

/** Default name for a new Signal Group: the lowest `Group N` not already used, so a deletion never makes a later Group reuse a live name. */
export function nextSignalGroupName(document: Pick<CanonicalDocument, "signalGroups">): string {
  const used = new Set(document.signalGroups.map((group) => group.name));
  let ordinal = 1;
  while (used.has(`Group ${ordinal}`)) ordinal += 1;
  return `Group ${ordinal}`;
}

/** Group-level operations over a multi-selection; all canonical changes go through one semantic batch. */
export function createSelectionGroupActions(input: SelectionGroupActionsInput) {
  const selectedSignalsInTreeOrder = () => {
    const remaining = new Set(input.selection.refs.signalIds.current);
    const ordered: SignalId[] = [];
    for (const group of input.document.signalGroups) for (const row of group.rows) {
      const id = row as SignalId;
      if (remaining.delete(id)) ordered.push(id);
    }
    return ordered;
  };
  const createGroupFromSignalSelection = () => {
    const signalIds = selectedSignalsInTreeOrder();
    if (signalIds.length === 0) return;
    const id = groupId(nextEntityId("group", input.document));
    const group: SignalGroup = { id, name: nextSignalGroupName(input.document), rows: [] };
    const commands: SemanticCommand[] = [
      { id: input.nextCommandId("selection_group_create"), type: "group.create", group, index: input.document.signalGroups.length },
      ...signalIds.map((signalId, index): SemanticCommand => ({ id: input.nextCommandId("selection_group_move_signal"), type: "signal.move", signalId, targetGroupId: id, index })),
    ];
    const result = input.application.executeBatch(input.nextCommandId("selection_group_create_batch"), commands);
    if (result.ok) input.selection.selectSignals(new Set(signalIds), signalIds[0]);
    else input.reportStatus(result.problems.map((problem) => problem.message).join(" "));
  };
  const moveSelectedSignalsToGroup = (targetGroupId: GroupId) => {
    const targetGroup = input.document.signalGroups.find((group) => group.id === targetGroupId);
    const signalIds = selectedSignalsInTreeOrder();
    if (!targetGroup || signalIds.length === 0) return;
    const selected = new Set(signalIds);
    const retainedRows = targetGroup.rows.filter((row) => !selected.has(row as SignalId));
    const desiredRows = [...retainedRows, ...signalIds];
    const alreadyInOrder = desiredRows.length === targetGroup.rows.length
      && targetGroup.rows.every((row, index) => row === desiredRows[index]);
    const allAlreadyInTarget = signalIds.every((id) => targetGroup.rows.includes(id));
    if (allAlreadyInTarget && alreadyInOrder) return;

    const workingRows = input.document.signalGroups.map((group) => [...group.rows]);
    const commands: SemanticCommand[] = [];
    signalIds.forEach((signalId, offset) => {
      const sourceIndex = workingRows.findIndex((rows) => rows.includes(signalId));
      const destinationIndex = input.document.signalGroups.findIndex((group) => group.id === targetGroupId);
      if (sourceIndex < 0 || destinationIndex < 0) return;
      const sourceRows = workingRows[sourceIndex]!;
      const targetRows = workingRows[destinationIndex]!;
      const sourceAfterRemoval = sourceRows.filter((row) => row !== signalId);
      const destinationAfterRemoval = sourceIndex === destinationIndex ? sourceAfterRemoval : targetRows;
      const index = retainedRows.length + offset;
      const nextTargetRows = [...destinationAfterRemoval];
      nextTargetRows.splice(index, 0, signalId);
      const unchanged = sourceIndex === destinationIndex
        && nextTargetRows.length === sourceRows.length
        && nextTargetRows.every((row, rowIndex) => row === sourceRows[rowIndex]);
      if (!unchanged) commands.push({ id: input.nextCommandId("selection_move_signal"), type: "signal.move", signalId, targetGroupId, index });
      if (sourceIndex === destinationIndex) workingRows[sourceIndex] = nextTargetRows;
      else {
        workingRows[sourceIndex] = sourceAfterRemoval;
        workingRows[destinationIndex] = nextTargetRows;
      }
    });
    if (commands.length === 0) return;
    const result = input.application.executeBatch(input.nextCommandId("selection_move_signals_batch"), commands);
    if (result.ok) input.selection.selectSignals(new Set(signalIds), signalIds[0]);
    else input.reportStatus(result.problems.map((problem) => problem.message).join(" "));
  };
  return { createGroupFromSignalSelection, moveSelectedSignalsToGroup };
}
