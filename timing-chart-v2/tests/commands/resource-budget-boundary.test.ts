import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DOCUMENT_RESOURCE_BUDGET, type CommandId, type Signal, type SignalId, type TransactionGroupId, type TransactionId } from "@timing-chart-v2/schema";
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

  it("rejects over-budget Clock suppression replacement atomically at the canonical boundary", () => {
    const base = canonicalFixture();
    const clock = base.signals.find((signal) => signal.type === "clock");
    if (!clock || clock.type !== "clock") throw new Error("Expected fixture Clock.");
    const session = new CommandHistorySession(base);
    const before = session.getSnapshot();
    const historyBefore = session.historyState();
    const document = {
      ...base,
      signals: base.signals.map((signal) => signal.id === clock.id ? {
        ...clock,
        generator: { ...clock.generator, suppressedPeriods: Array.from({ length: DOCUMENT_RESOURCE_BUDGET.clockSuppressedPeriodCount + 1 }, (_, index) => index) },
      } : signal),
    };
    const result = session.execute({ id: commandId("replace_over_budget_clock_suppressions"), type: "document.replace", document });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.signals[*].generator.suppressedPeriods",
      value: DOCUMENT_RESOURCE_BUDGET.clockSuppressedPeriodCount + 1,
    })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });

  it("rejects over-budget Transaction phase replacement atomically", () => {
    const base = canonicalFixture();
    const session = new CommandHistorySession(base);
    const before = session.getSnapshot();
    const historyBefore = session.historyState();
    const phases = Array.from({ length: DOCUMENT_RESOURCE_BUDGET.transactionPhaseCount + 1 }, (_, index) => ({ id: `budget_phase_${index}` as never, name: `Phase ${index}`, start: 0, end: 1 }));
    const transaction = { id: "budget_phase_owner" as TransactionId, name: "Phase budget", start: 0, end: 1, phases };
    const result = session.execute({ id: commandId("replace_over_budget_phases"), type: "document.replace", document: { ...base, transactions: [transaction] } });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.transactions[*].phases",
      value: DOCUMENT_RESOURCE_BUDGET.transactionPhaseCount + 1,
    })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });

  it("rejects a dense linked-Signal graph atomically despite each root collection being within budget", () => {
    const base = canonicalFixture();
    const clock = base.signals.find((signal) => signal.type === "clock");
    const template = base.signals.find((signal) => signal.type === "bus");
    if (!clock || clock.type !== "clock" || !template || template.type !== "bus") throw new Error("Expected Clock and Bus fixture Signals.");
    const signals: Signal[] = [clock, ...Array.from({ length: 99 }, (_, index) => {
      const id = `budget_link_signal_${index}` as SignalId;
      const name = `LINK_${index}`;
      return { ...template, id, name, source: { ...template.source, signalName: name }, display: { ...template.display, name } };
    })];
    const signalIds = signals.map(({ id }) => id);
    const transactions = Array.from({ length: Math.ceil((DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1) / signalIds.length) }, (_, index) => ({
      id: `budget_link_transaction_${index}` as TransactionId,
      name: `Link budget ${index}`,
      start: 0,
      end: 1,
      linkedSignals: signalIds.slice(0, Math.min(signalIds.length, DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1 - index * signalIds.length)),
    }));
    const document = { ...base, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signalIds }], transactions };
    const session = new CommandHistorySession(base);
    const before = session.getSnapshot();
    const historyBefore = session.historyState();
    const result = session.execute({ id: commandId("replace_over_budget_transaction_links"), type: "document.replace", document });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.transactions[*].linkedSignals",
      value: DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1,
    })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });
});
