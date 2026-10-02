import type { GroupId, RowId, Signal, SignalGroup, SignalId } from "@timing-chart-v2/schema";

/** Resolve a Group's Signal rows in canonical row order using the caller's existing ID index. */
export function resolveGroupSignalsInRowOrder(rowIds: readonly RowId[], signalsById: ReadonlyMap<SignalId, Signal>): readonly Signal[] {
  const signals: Signal[] = [];
  for (const rowId of rowIds) {
    const signal = signalsById.get(rowId as SignalId);
    if (signal !== undefined) signals.push(signal);
  }
  return signals;
}

/** Resolve a clipboard insertion target through the caller's existing ID indexes. */
export function resolveClipboardSignalGroupTarget(input: {
  readonly groups: readonly SignalGroup[];
  readonly groupsById: ReadonlyMap<GroupId, SignalGroup>;
  readonly ownerBySignalId: ReadonlyMap<SignalId, Readonly<{ groupId: GroupId; index: number }>>;
  readonly selectedGroupId?: GroupId;
  readonly selectedSignalId?: SignalId;
  readonly sourceGroupId?: GroupId;
  readonly fallbackToLast?: boolean;
}): SignalGroup | undefined {
  const selectedGroup = input.selectedGroupId === undefined ? undefined : input.groupsById.get(input.selectedGroupId);
  if (selectedGroup) return selectedGroup;
  const selectedOwner = input.selectedSignalId === undefined ? undefined : input.ownerBySignalId.get(input.selectedSignalId);
  const signalGroup = selectedOwner === undefined ? undefined : input.groupsById.get(selectedOwner.groupId);
  if (signalGroup) return signalGroup;
  const sourceGroup = input.sourceGroupId === undefined ? undefined : input.groupsById.get(input.sourceGroupId);
  return sourceGroup ?? (input.fallbackToLast === false ? undefined : input.groups.at(-1));
}
