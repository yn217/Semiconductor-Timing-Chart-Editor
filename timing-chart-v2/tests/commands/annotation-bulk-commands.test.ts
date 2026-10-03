import { describe, expect, it } from "vitest";
import { commandPlannerMetrics, planCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DOCUMENT_RESOURCE_BUDGET, type Annotation, type AnnotationGroupId, type AnnotationId, type CanonicalDocument, type CommandId, type SignalId } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "../../packages/testing/src/index.js";

const commandId = (id: string) => id as CommandId;
const annotationId = (id: string) => id as AnnotationId;
const groupId = (id: string) => id as AnnotationGroupId;

function baseDocument(): CanonicalDocument {
  const document = generatePerformanceDocument({ signalCount: 50, cycleCount: 100, profile: "annotation-heavy" }); // 100 Annotations
  return { ...document, annotationGroups: [{ id: groupId("ag_src"), name: "Source", annotationIds: [annotationId("ann_perf_0"), annotationId("ann_perf_1"), annotationId("ann_perf_2")] }] };
}
const copies = (sources: readonly Annotation[], prefix = "ann_copy") => sources.map((annotation, index) => ({ ...annotation, id: annotationId(`${prefix}_${index}`) }));

describe("#864 annotation.bulkCreate / annotation.bulkDelete", () => {
  it("creates N Annotations plus a mirrored group in one plan and one History entry with exact Undo/Redo", () => {
    const initial = baseDocument();
    const session = new CommandHistorySession(initial);
    const created = copies(initial.annotations);
    const group = { id: groupId("ag_copy"), name: "Source", annotationIds: [created[0]!.id, created[1]!.id, created[2]!.id] };
    const plans = commandPlannerMetrics().internalPlans;
    const result = session.execute({ id: commandId("cmd_ann_bulk_create"), type: "annotation.bulkCreate", annotations: created, groups: [group] });
    expect(result.ok).toBe(true);
    expect(commandPlannerMetrics().internalPlans - plans).toBe(1);
    expect(session.historyState().undoDepth).toBe(1);
    const after = session.getSnapshot().document;
    expect(after.annotations).toHaveLength(200);
    expect(after.annotations.slice(100)).toEqual(created);
    expect(after.annotations.slice(100).map(({ id: _id, ...rest }) => rest), "references preserved, only IDs change").toEqual(initial.annotations.map(({ id: _id, ...rest }) => rest));
    expect(after.annotationGroups).toEqual([...initial.annotationGroups, group]);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });

  it("rejects atomically: duplicate / unstable IDs, bad groups, missing Signal references and the resource budget", () => {
    const initial = baseDocument();
    const plan = (annotations: readonly Annotation[], groups?: { id: AnnotationGroupId; annotationIds: AnnotationId[] }[]) =>
      planCommand(initial, { id: commandId("cmd_ann_bulk"), type: "annotation.bulkCreate", annotations, ...(groups ? { groups } : {}) });
    const created = copies(initial.annotations.slice(0, 3));
    const code = (result: ReturnType<typeof plan>) => (result.ok ? "ok" : result.problems[0]!.code);
    expect(code(plan([]))).toBe("NO_OP");
    expect(code(plan([...created, initial.annotations[0]!]))).toBe("DUPLICATE_ID");
    expect(code(plan([created[0]!, created[0]!]))).toBe("DUPLICATE_ID");
    expect(code(plan([{ ...created[0]!, id: annotationId("not stable!") }]))).toBe("INVALID_STABLE_ID");
    expect(code(plan(created, [{ id: groupId("ag_one"), annotationIds: [created[0]!.id] }]))).toBe("ANNOTATION_GROUP_MEMBERS_REQUIRED");
    expect(code(plan(created, [{ id: groupId("ag_src"), annotationIds: [created[0]!.id, created[1]!.id] }]))).toBe("DUPLICATE_ID");
    expect(code(plan(created, [{ id: groupId("ag_x"), annotationIds: [created[0]!.id, annotationId("ann_nope")] }]))).toBe("ANNOTATION_NOT_FOUND");
    expect(code(plan(created, [{ id: groupId("ag_x"), annotationIds: [created[0]!.id, created[1]!.id] }, { id: groupId("ag_y"), annotationIds: [created[1]!.id, created[2]!.id] }]))).toBe("ANNOTATION_ALREADY_GROUPED");

    const session = new CommandHistorySession(initial);
    const missing = [...created, { ...created[2]!, id: annotationId("ann_copy_bad"), start: { ...created[2]!.start!, signalId: "sig_missing_864" as SignalId } }];
    const rejected = session.execute({ id: commandId("cmd_ann_bulk_missing"), type: "annotation.bulkCreate", annotations: missing });
    expect(rejected.ok).toBe(false);
    expect(session.getSnapshot().document, "no partial create").toEqual(initial);
    expect(session.historyState().undoDepth).toBe(0);
  });

  it("accepts the largest legal batch (up to the Annotation budget) and rejects one more with RESOURCE_LIMIT_EXCEEDED", () => {
    const initial = baseDocument();
    const template = initial.annotations[0]!;
    const room = DOCUMENT_RESOURCE_BUDGET.annotationCount - initial.annotations.length;
    const batch = Array.from({ length: room + 1 }, (_, index) => ({ ...template, id: annotationId(`ann_budget_${index}`) }));
    const session = new CommandHistorySession(initial);
    const over = session.execute({ id: commandId("cmd_ann_budget_over"), type: "annotation.bulkCreate", annotations: batch });
    expect(over.ok).toBe(false);
    expect(over.ok ? [] : over.problems.map((problem) => problem.code)).toContain("RESOURCE_LIMIT_EXCEEDED");
    expect(session.getSnapshot().document.annotations).toHaveLength(initial.annotations.length);
    const legal = session.execute({ id: commandId("cmd_ann_budget_legal"), type: "annotation.bulkCreate", annotations: batch.slice(0, room) });
    expect(legal.ok).toBe(true);
    expect(session.getSnapshot().document.annotations).toHaveLength(DOCUMENT_RESOURCE_BUDGET.annotationCount);
    expect(session.historyState().undoDepth).toBe(1);
  });

  it("bulk-deletes in one pass, prunes group membership, rejects missing/duplicate IDs, and Undo restores exactly", () => {
    const initial = baseDocument();
    const session = new CommandHistorySession(initial);
    const ids = initial.annotations.filter((_, index) => index % 2 === 0).map((annotation) => annotation.id);
    expect(planCommand(initial, { id: commandId("cmd_ann_del_dup"), type: "annotation.bulkDelete", annotationIds: [ids[0]!, ids[0]!] }).ok).toBe(false);
    const missing = planCommand(initial, { id: commandId("cmd_ann_del_missing"), type: "annotation.bulkDelete", annotationIds: [ids[0]!, annotationId("ann_missing")] });
    expect(missing.ok ? "ok" : missing.problems[0]!.code).toBe("ANNOTATION_NOT_FOUND");
    expect(session.execute({ id: commandId("cmd_ann_del"), type: "annotation.bulkDelete", annotationIds: ids }).ok).toBe(true);
    const after = session.getSnapshot().document;
    expect(after.annotations).toHaveLength(50);
    expect(after.annotationGroups[0]!.annotationIds).toEqual(["ann_perf_1"]);
    expect(session.historyState().undoDepth).toBe(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(after);
  });
});
