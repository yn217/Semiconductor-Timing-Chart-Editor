import { buildTimeGroupHierarchy, type CanonicalDocument, type TimeGroup, type TimeGroupId } from "@timing-chart-v2/schema";
import type { CommandPolicyCode } from "./policy.js";

export type GroupRangeResolution =
  | { readonly ok: true; readonly parentId?: TimeGroupId; readonly enclosedIds: ReadonlySet<TimeGroupId> }
  | { readonly ok: false; readonly code: CommandPolicyCode; readonly message: string };

/** Shared capability/preflight for GUI, keyboard and the command planner. */
export function resolveTimeGroupRange(document: CanonicalDocument, range?: Readonly<{ start: number; end: number }>): GroupRangeResolution {
  if (!range || range.start >= range.end) return { ok: false, code: "TIME_GROUP_SELECTION_EMPTY", message: "Select a non-empty time range to group." };
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > document.timeline.cycleCount) return { ok: false, code: "TIMELINE_OUT_OF_RANGE", message: "Group range must use integer boundaries within the timeline." };
  const hierarchy = buildTimeGroupHierarchy(document.timeGroups);
  let parent: TimeGroup | undefined;
  const enclosedIds = new Set<TimeGroupId>();
  for (const group of document.timeGroups) {
    if (range.start === group.start && range.end === group.end) return { ok: false, code: "TIME_GROUP_EQUAL_RANGE", message: `Range already belongs to TimeGroup '${group.name}'.` };
    if (range.end <= group.start || range.start >= group.end) continue;
    if (range.start <= group.start && range.end >= group.end) enclosedIds.add(group.id);
    else if (group.start <= range.start && group.end >= range.end) {
      if (!parent || group.end - group.start < parent.end - parent.start || (group.end - group.start === parent.end - parent.start && ((hierarchy.depthById.get(group.id) ?? 0) > (hierarchy.depthById.get(parent.id) ?? 0) || ((hierarchy.depthById.get(group.id) ?? 0) === (hierarchy.depthById.get(parent.id) ?? 0) && group.id < parent.id)))) parent = group;
    } else return { ok: false, code: "TIME_GROUP_PARTIAL_OVERLAP", message: `Cannot group [${range.start}, ${range.end}): partially overlaps '${group.name}' [${group.start}, ${group.end}). Select a range inside, outside, or fully containing this group.` };
  }
  return { ok: true, ...(parent ? { parentId: parent.id } : {}), enclosedIds };
}

export function promoteTimeGroupChildren(groups: readonly TimeGroup[], removed: TimeGroup): readonly TimeGroup[] {
  return groups.filter(group => group.id !== removed.id).map(group => {
    if (group.parentId !== removed.id) return group;
    const { parentId: _parent, ...rest } = group;
    return { ...rest, ...(removed.parentId === undefined ? {} : { parentId: removed.parentId }) };
  });
}
