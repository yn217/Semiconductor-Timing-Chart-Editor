import { describe, expect, it } from "vitest";
import { commandPlannerMetrics, planCommand } from "@timing-chart-v2/commands";
import { canonicalReferenceMetrics, type SignalId } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "../../packages/testing/src/index.js";

describe("planner reference-index scaling", () => {
  it("keeps multi-row invalidation and bulk deletion on indexed target queries at product-scale fixture size", () => {
    const base = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 500 });
    const document = {
      ...base,
      annotations: Array.from({ length: 20_000 }, (_, index) => {
        const signalId = base.signals[index % base.signals.length]!.id;
        const start = index % 498;
        return { id: `ann_planner_scale_${index}` as never, type: "measurement" as const, label: `M${index}`, visible: true,
          start: { signalId, cycle: start, point: "cycle-start" as const }, end: { signalId, cycle: start + 2, point: "cycle-end" as const } };
      }),
      transactions: Array.from({ length: 10_000 }, (_, index) => {
        const start = index % 496;
        return { id: `txn_planner_scale_${index}` as never, name: `T${index}`, start, end: start + 4, laneId: `lane_${index % 8}`, linkedSignals: [base.signals[index]!.id] };
      }),
    };
    const beforeRefs = canonicalReferenceMetrics();
    const beforePlanner = commandPlannerMetrics();

    const move = planCommand(document, { id: "cmd_scale_move" as never, type: "signal.move", signalId: base.signals[1]!.id, targetGroupId: base.signalGroups[0]!.id, index: 0 });
    const visibility = planCommand(document, { id: "cmd_scale_visibility" as never, type: "signal.setVisibility", signalId: base.signals[0]!.id, visible: false });
    const groupMove = planCommand(document, { id: "cmd_scale_group_move" as never, type: "group.move", groupId: base.signalGroups[1]!.id, index: 0 });
    const groupLayout = planCommand(document, { id: "cmd_scale_group_layout" as never, type: "group.updateLayout", groupId: base.signalGroups[0]!.id, spacingAfter: 3 });
    const blockedBulkDelete = planCommand(document, { id: "cmd_scale_bulk_delete" as never, type: "signal.bulkDelete", signalIds: [base.signals[9_998]!.id, base.signals[9_999]!.id] as SignalId[] });
    const isolatedRename = planCommand(document, { id: "cmd_scale_rename" as never, type: "signal.rename", signalId: base.signals[2]!.id, name: "RENAMED" });

    expect([move, visibility, groupMove, groupLayout, isolatedRename].every((result) => result.ok)).toBe(true);
    expect(blockedBulkDelete).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "SIGNAL_HAS_DEPENDENTS" })] });
    const afterRefs = canonicalReferenceMetrics();
    const afterPlanner = commandPlannerMetrics();
    expect(afterRefs.indexBuilds - beforeRefs.indexBuilds).toBe(1);
    expect(afterRefs.targetQueries - beforeRefs.targetQueries).toBe(5);
    expect(afterRefs.referencesVisited).toBeGreaterThan(beforeRefs.referencesVisited);
    expect(afterPlanner.calls - beforePlanner.calls).toBe(6);
    expect(afterPlanner.affectedSignalCount - beforePlanner.affectedSignalCount).toBeGreaterThan(10_000);
    expect(afterPlanner.durationMs).toBeGreaterThanOrEqual(beforePlanner.durationMs);
  });
});
