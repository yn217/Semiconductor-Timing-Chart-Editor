import type { GroupId, SignalGroup, SignalId } from "@timing-chart-v2/schema";

type SignalGroupSelectionIndex = Readonly<{
  groupById: ReadonlyMap<GroupId, SignalGroup>;
  groupIndexById: ReadonlyMap<GroupId, number>;
  groupByRowId: ReadonlyMap<SignalId, SignalGroup>;
  rowIndexByGroupId: ReadonlyMap<GroupId, ReadonlyMap<SignalId, number>>;
}>;

const indexes = new WeakMap<readonly SignalGroup[], SignalGroupSelectionIndex>();

/** Build stable-ID and row-position lookups once for an immutable canonical group collection. */
export function signalGroupSelectionIndex(groups: readonly SignalGroup[]): SignalGroupSelectionIndex {
  const cached = indexes.get(groups);
  if (cached) return cached;

  const groupById = new Map<GroupId, SignalGroup>();
  const groupIndexById = new Map<GroupId, number>();
  const groupByRowId = new Map<SignalId, SignalGroup>();
  const rowIndexByGroupId = new Map<GroupId, ReadonlyMap<SignalId, number>>();
  groups.forEach((group, groupIndex) => {
    if (!groupById.has(group.id)) {
      groupById.set(group.id, group);
      groupIndexById.set(group.id, groupIndex);
    }
    const rowIndexes = new Map<SignalId, number>();
    group.rows.forEach((rowId, rowIndex) => {
      if (!rowIndexes.has(rowId as SignalId)) rowIndexes.set(rowId as SignalId, rowIndex);
      if (!groupByRowId.has(rowId as SignalId)) groupByRowId.set(rowId as SignalId, group);
    });
    rowIndexByGroupId.set(group.id, rowIndexes);
  });

  const index = { groupById, groupIndexById, groupByRowId, rowIndexByGroupId };
  indexes.set(groups, index);
  return index;
}
