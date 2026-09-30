import type { CanonicalDocumentProblem, TimeGroup, TimeGroupId } from "./types.js";

/** Parent graph validation is iterative and linear, including arbitrarily deep chains. */
export function validateTimeGroupHierarchy(groups: readonly TimeGroup[]): readonly CanonicalDocumentProblem[] {
  const problems: CanonicalDocumentProblem[] = [];
  const byId = new Map<TimeGroupId, TimeGroup>();
  groups.forEach((group, index) => {
    if (byId.has(group.id)) problems.push({ code: "DUPLICATE_ID", path: `$.timeGroups[${index}].id`, entityId: group.id, message: "Duplicate TimeGroup ID." });
    byId.set(group.id, group);
  });
  const done = new Set<TimeGroupId>();
  groups.forEach((group, index) => {
    const path = `$.timeGroups[${index}].parentId`;
    const parent = group.parentId === undefined ? undefined : byId.get(group.parentId);
    if (group.parentId !== undefined && !parent) problems.push({ code: "TIME_GROUP_PARENT_NOT_FOUND", path, entityId: group.id, message: `Parent TimeGroup '${group.parentId}' was not found.` });
    if (parent && (group.start < parent.start || group.end > parent.end)) problems.push({ code: "TIME_GROUP_PARENT_CONTAINMENT", path, entityId: group.id, message: `TimeGroup '${group.id}' must be contained by parent '${parent.id}'.` });
    const chain = new Set<TimeGroupId>();
    let current: TimeGroup | undefined = group;
    while (current && !done.has(current.id)) {
      if (chain.has(current.id)) {
        problems.push({ code: "TIME_GROUP_PARENT_CYCLE", path, entityId: group.id, message: `TimeGroup '${group.id}' reaches a parent cycle through '${current.id}'.` });
        break;
      }
      chain.add(current.id);
      current = current.parentId === undefined ? undefined : byId.get(current.parentId);
    }
    for (const id of chain) done.add(id);
  });
  return problems;
}

export interface TimeGroupHierarchy {
  readonly roots: readonly TimeGroup[];
  readonly childrenByParent: ReadonlyMap<TimeGroupId, readonly TimeGroup[]>;
  /** Roots have depth 0; an empty forest has maxDepth 0. */
  readonly depthById: ReadonlyMap<TimeGroupId, number>;
  /** Groups prebucketed once so presentation can traverse outlines in O(groups). */
  readonly groupsByDepth: readonly (readonly TimeGroup[])[];
  readonly maxDepth: number;
}

/** Temporal order, then opaque ID tie-break; independent of canonical array order. */
export function buildTimeGroupHierarchy(groups: readonly TimeGroup[]): TimeGroupHierarchy {
  const problems = validateTimeGroupHierarchy(groups);
  if (problems.length) throw Object.assign(new Error("Invalid TimeGroup hierarchy."), { problems });
  const ordered = [...groups].sort((a, b) => a.start - b.start || b.end - a.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const roots: TimeGroup[] = [];
  const childrenByParent = new Map<TimeGroupId, TimeGroup[]>();
  for (const group of ordered) {
    if (group.parentId === undefined) roots.push(group);
    else {
      const siblings = childrenByParent.get(group.parentId) ?? [];
      siblings.push(group);
      childrenByParent.set(group.parentId, siblings);
    }
  }
  const depthById = new Map<TimeGroupId, number>();
  const groupsByDepth: TimeGroup[][] = [];
  const pending = roots.map(group => ({ group, depth: 0 }));
  let maxDepth = 0;
  for (let index = 0; index < pending.length; index++) {
    const { group, depth } = pending[index]!;
    depthById.set(group.id, depth);
    maxDepth = Math.max(maxDepth, depth);
    (groupsByDepth[depth] ??= []).push(group);
    for (const child of childrenByParent.get(group.id) ?? []) pending.push({ group: child, depth: depth + 1 });
  }
  return { roots, childrenByParent, depthById, groupsByDepth, maxDepth };
}

const hierarchyByCollection = new WeakMap<readonly TimeGroup[], TimeGroupHierarchy>();

/** Reuse derived hierarchy for immutable canonical TimeGroup collections in presentation paths. */
export function cachedTimeGroupHierarchy(groups: readonly TimeGroup[]): TimeGroupHierarchy {
  const cached = hierarchyByCollection.get(groups);
  if (cached) return cached;
  const hierarchy = buildTimeGroupHierarchy(groups);
  hierarchyByCollection.set(groups, hierarchy);
  return hierarchy;
}
