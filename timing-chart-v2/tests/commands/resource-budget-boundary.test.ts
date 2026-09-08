import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DOCUMENT_RESOURCE_BUDGET, type CommandId, type TransactionGroupId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (value: string) => value as CommandId;

function nearCycleLimit(cycleCount: number) {
  const base = canonicalFixture();
  return { ...base, timeline: { ...base.timeline, cycleCount, end: cycleCount } };
}

describe("authoritative product resource budget boundary", () => {
  it("allows the exact cycle limit, then rejects overflow without changing history or dirty state", () => {
    const session = new CommandHistorySession(nearCycleLimit(DOCUMENT_RESOURCE_BUDGET.cycleCount - 1));
    const before = session.getSnapshot();
    const accepted = session.execute({ id: commandId("timeline_insert_to_limit"), type: "timeline.insert", at: before.document.timeline.cycleCount, count: 1 });
    expect(accepted).toMatchObject({ ok: true, snapshot: { document: { timeline: { cycleCount: DOCUMENT_RESOURCE_BUDGET.cycleCount } } } });

    const atLimit = session.getSnapshot();
    const beforeHistory = session.historyState();
    const rejected = session.execute({ id: commandId("timeline_insert_over_limit"), type: "timeline.insert", at: atLimit.document.timeline.cycleCount, count: 1 });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.timeline.cycleCount", value: DOCUMENT_RESOURCE_BUDGET.cycleCount + 1 })] });
    expect(session.getSnapshot()).toBe(atLimit);
    expect(session.historyState()).toEqual(beforeHistory);

    expect(session.undo()).toMatchObject({ ok: true });
    expect(session.getSnapshot()).toBeTruthy();
    expect(session.redo()).toMatchObject({ ok: true });
    expect(session.getSnapshot().document.timeline.cycleCount).toBe(DOCUMENT_RESOURCE_BUDGET.cycleCount);
  });

  it("rejects an over-budget batch atomically after planning all commands", () => {
    const session = new CommandHistorySession(nearCycleLimit(DOCUMENT_RESOURCE_BUDGET.cycleCount));
    const before = session.getSnapshot();
    const beforeHistory = session.historyState();
    const result = session.executeBatch(commandId("over_budget_batch"), [
      { id: commandId("change_edge"), type: "timeline.setReferenceEdge", edge: "falling" },
      { id: commandId("insert_over_limit"), type: "timeline.insert", at: DOCUMENT_RESOURCE_BUDGET.cycleCount, count: 1 },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED" })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(beforeHistory);
  });

  it("enforces the TransactionGroup collection budget at the canonical command boundary", () => {
    const base = canonicalFixture();
    const group = (index: number) => ({ id: `budget_txn_group_${index}` as TransactionGroupId, name: `Group ${index}`, order: index });
    const session = new CommandHistorySession({ ...base, transactionGroups: Array.from({ length: DOCUMENT_RESOURCE_BUDGET.transactionGroupCount }, (_, index) => group(index)) });
    const before = session.getSnapshot();
    const historyBefore = session.historyState();
    const rejected = session.execute({ id: commandId("transaction_group_overflow"), type: "transactionGroup.create", group: group(DOCUMENT_RESOURCE_BUDGET.transactionGroupCount) });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.transactionGroups" })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });
});
