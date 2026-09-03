import type { CanonicalDocument, GroupId, SignalGroup, SignalId } from "@timing-chart-v2/schema";

export type InsertionTarget = Readonly<{ group: SignalGroup; index: number }>;

/** Resolves the row insertion point shared by Tree Add and Insert Ribbon. */
export function resolveInsertionTarget(document: CanonicalDocument, selectedSignalId: SignalId | undefined, selectedGroupId: GroupId | undefined): InsertionTarget | undefined {
  const selectedGroup = selectedGroupId === undefined ? undefined : document.signalGroups.find((group) => group.id === selectedGroupId);
  const selectedSignalGroup = selectedSignalId === undefined ? undefined : document.signalGroups.find((group) => group.rows.includes(selectedSignalId));
  const group = selectedGroup ?? selectedSignalGroup ?? document.signalGroups.at(-1);
  if (!group) return undefined;
  const selectedRowIndex = selectedSignalId === undefined ? -1 : group.rows.indexOf(selectedSignalId);
  return { group, index: selectedRowIndex >= 0 ? selectedRowIndex + 1 : group.rows.length };
}

/** Resolves the group insertion point shared by Tree Add and Insert Ribbon. */
export function resolveGroupInsertionIndex(document: CanonicalDocument, selectedSignalId: SignalId | undefined, selectedGroupId: GroupId | undefined): number {
  const selectedGroupIndex = selectedGroupId === undefined ? -1 : document.signalGroups.findIndex((group) => group.id === selectedGroupId);
  if (selectedGroupIndex >= 0) return selectedGroupIndex + 1;
  const selectedSignalGroupIndex = selectedSignalId === undefined ? -1 : document.signalGroups.findIndex((group) => group.rows.includes(selectedSignalId));
  return selectedSignalGroupIndex >= 0 ? selectedSignalGroupIndex + 1 : document.signalGroups.length;
}
