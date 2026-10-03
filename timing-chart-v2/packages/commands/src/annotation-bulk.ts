import type { Annotation, AnnotationGroup, AnnotationGroupId, AnnotationId, CanonicalDocument } from "@timing-chart-v2/schema";
import { isStableId } from "@timing-chart-v2/schema";
import type { CommandPlanResult } from "./planner.js";
import type { CommandPolicyCode } from "./policy.js";
import type { ChangeSet } from "./types.js";

const fail = (reason: "invalid" | "no-op", code: CommandPolicyCode, path: string, message: string): CommandPlanResult => ({ ok: false, reason, problems: [{ code, path, message }] });

/**
 * #864 `annotation.bulkCreate`: appends N Annotations (and optionally new Annotation Groups over them) in ONE indexed
 * O(N+K) pass. Per-item validation mirrors `annotation.create` (stable, unique ID); per-group validation mirrors
 * `annotationGroup.create` (stable unique ID, >= 2 members, members exist, at most one group per member). Cross-entity
 * references (Signals, Bookmarks) and the resource budget are validated by the normal post-plan document validation.
 */
export function planAnnotationBulkCreate(document: CanonicalDocument, annotations: readonly Annotation[], groups: readonly AnnotationGroup[] = []): CommandPlanResult {
  if (annotations.length === 0) return fail("no-op", "NO_OP", "$.annotations", "Bulk Annotation creation requires at least one item.");
  const ids = new Set<AnnotationId>(document.annotations.map((annotation) => annotation.id));
  for (const [index, annotation] of annotations.entries()) {
    if (!isStableId(annotation.id)) return fail("invalid", "INVALID_STABLE_ID", `$.annotations[${index}].id`, "Annotation ID must be stable.");
    if (ids.has(annotation.id)) return fail("invalid", "DUPLICATE_ID", `$.annotations[${index}].id`, `Annotation '${annotation.id}' already exists or is duplicated in this batch.`);
    ids.add(annotation.id);
  }
  const existingGroups = document.annotationGroups ?? [];
  const groupIds = new Set<AnnotationGroupId>(existingGroups.map((group) => group.id));
  const grouped = new Set<AnnotationId>(existingGroups.flatMap((group) => group.annotationIds));
  for (const [index, group] of groups.entries()) {
    if (!isStableId(group.id)) return fail("invalid", "INVALID_STABLE_ID", `$.groups[${index}].id`, "Annotation Group ID must be stable.");
    if (groupIds.has(group.id)) return fail("invalid", "DUPLICATE_ID", `$.groups[${index}].id`, `Annotation Group '${group.id}' already exists or is duplicated in this batch.`);
    if (group.annotationIds.length < 2) return fail("invalid", "ANNOTATION_GROUP_MEMBERS_REQUIRED", `$.groups[${index}].annotationIds`, "An Annotation Group needs at least 2 members.");
    for (const memberId of group.annotationIds) {
      if (!ids.has(memberId)) return fail("invalid", "ANNOTATION_NOT_FOUND", `$.groups[${index}].annotationIds`, `Annotation '${memberId}' does not exist.`);
      if (grouped.has(memberId)) return fail("invalid", "ANNOTATION_ALREADY_GROUPED", `$.groups[${index}].annotationIds`, `Annotation '${memberId}' already belongs to a group.`);
      grouped.add(memberId);
    }
    groupIds.add(group.id);
  }
  const created = annotations.map((annotation) => annotation.id);
  const changeSet: ChangeSet = { annotationPosition: created, annotationStyle: created, minimapOverview: true, ...(groups.length > 0 ? { annotationGroups: groups.map((group) => group.id) } : {}) };
  return {
    ok: true,
    document: { ...document, annotations: [...document.annotations, ...annotations], ...(groups.length > 0 ? { annotationGroups: [...existingGroups, ...groups] } : {}) },
    changeSet,
    inverseChangeSet: changeSet,
  };
}

/**
 * #864 `annotation.bulkDelete`: removes N Annotations in one indexed pass and prunes them from their Annotation Groups,
 * exactly like N `annotation.delete` commands would (a group may be left with fewer than two members, as single delete does).
 */
export function planAnnotationBulkDelete(document: CanonicalDocument, annotationIds: readonly AnnotationId[]): CommandPlanResult {
  if (annotationIds.length === 0) return fail("no-op", "NO_OP", "$.annotationIds", "No Annotations were selected for deletion.");
  const selected = new Set(annotationIds);
  if (selected.size !== annotationIds.length) return fail("invalid", "DUPLICATE_ID", "$.annotationIds", "Bulk Annotation deletion contains duplicate IDs.");
  const missing = new Set(selected);
  const annotations: Annotation[] = [];
  for (const annotation of document.annotations) {
    if (selected.has(annotation.id)) missing.delete(annotation.id);
    else annotations.push(annotation);
  }
  const firstMissing = annotationIds.find((id) => missing.has(id));
  if (firstMissing !== undefined) return fail("invalid", "ANNOTATION_NOT_FOUND", "$.annotationIds", `Annotation '${firstMissing}' does not exist.`);
  const changedGroups: AnnotationGroupId[] = [];
  const annotationGroups = (document.annotationGroups ?? []).map((group) => {
    const annotationIds = group.annotationIds.filter((id) => !selected.has(id));
    if (annotationIds.length === group.annotationIds.length) return group;
    changedGroups.push(group.id);
    return { ...group, annotationIds };
  });
  const changeSet: ChangeSet = { annotationPosition: annotationIds, annotationStyle: annotationIds, minimapOverview: true, ...(changedGroups.length > 0 ? { annotationGroups: changedGroups } : {}) };
  return { ok: true, document: { ...document, annotations, annotationGroups }, changeSet, inverseChangeSet: changeSet };
}
