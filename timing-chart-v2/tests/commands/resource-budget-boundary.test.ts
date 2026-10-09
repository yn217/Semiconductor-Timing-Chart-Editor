import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DOCUMENT_RESOURCE_BUDGET, type CommandId, type Signal, type SignalId, type Transaction, type TransactionGroupId, type TransactionId } from "@timing-chart-v2/schema";
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

  it("rejects an over-budget Clock generator command atomically", () => {
    const base = canonicalFixture();
    const clock = base.signals.find((signal) => signal.type === "clock");
    if (!clock || clock.type !== "clock") throw new Error("Expected fixture Clock.");
    const cycleCount = DOCUMENT_RESOURCE_BUDGET.cycleCount;
    const halfBudget = DOCUMENT_RESOURCE_BUDGET.clockSuppressedPeriodCount / 2;
    const secondClock = { ...clock, id: "budget_clock_two" as SignalId, name: "CLK2", source: { ...clock.source, signalName: "CLK2" }, display: { ...clock.display, name: "CLK2" } };
    const signals: Signal[] = [
      { ...clock, generator: { ...clock.generator, suppressedPeriods: Array.from({ length: halfBudget }, (_, index) => index) } },
      { ...secondClock, generator: { ...secondClock.generator, suppressedPeriods: Array.from({ length: halfBudget }, (_, index) => index) } },
      ...base.signals.filter((signal) => signal.id !== clock.id),
    ];
    const document = { ...base, timeline: { ...base.timeline, cycleCount, end: cycleCount }, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signals.map((signal) => signal.id) }] };
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const historyBefore = session.historyState();
    const result = session.execute({ id: commandId("update_over_budget_clock_suppressions"), type: "signal.updateClockGenerator", signalId: secondClock.id, generator: { ...secondClock.generator, period: 1, suppressedPeriods: Array.from({ length: halfBudget + 1 }, (_, index) => index) } });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.signals[*].generator.suppressedPeriods",
      value: DOCUMENT_RESOURCE_BUDGET.clockSuppressedPeriodCount + 1,
    })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });

  it("rejects Transaction.create when it crosses the aggregate Phase budget", () => {
    const base = canonicalFixture();
    const firstPhaseCount = DOCUMENT_RESOURCE_BUDGET.transactionPhaseCount;
    const timeline = { ...base.timeline, cycleCount: firstPhaseCount, end: firstPhaseCount };
    const phases = Array.from({ length: firstPhaseCount }, (_, index) => ({ id: `budget_phase_${index}` as never, name: `Phase ${index}`, start: index, end: index + 1 }));
    const existing: Transaction = { id: "budget_phase_existing" as TransactionId, name: "Existing", start: 0, end: firstPhaseCount, phases };
    const session = new CommandHistorySession({ ...base, timeline, transactions: [existing] });
    const before = session.getSnapshot();
    const historyBefore = session.historyState();
    const transaction: Transaction = { id: "budget_phase_new" as TransactionId, name: "Phase budget", start: 0, end: 1, phases: [{ id: "budget_phase_extra" as never, name: "Extra", start: 0, end: 1 }] };
    const result = session.execute({ id: commandId("create_over_budget_phases"), type: "transaction.create", transaction });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.transactions[*].phases",
      value: DOCUMENT_RESOURCE_BUDGET.transactionPhaseCount + 1,
    })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });

  it("rejects a dense transaction.bulkLinkSignals command despite each root collection being within budget", () => {
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
    }));
    const document = { ...base, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signalIds }], transactions };
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const historyBefore = session.historyState();
    const links = transactions.flatMap((transaction, transactionIndex) => signalIds.slice(0, Math.min(signalIds.length, DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1 - transactionIndex * signalIds.length)).map((signalId) => ({ transactionId: transaction.id, signalId })));
    const result = session.execute({ id: commandId("create_over_budget_transaction_links"), type: "transaction.bulkLinkSignals", links });
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      path: "$.transactions[*].linkedSignals",
      value: DOCUMENT_RESOURCE_BUDGET.transactionLinkedSignalCount + 1,
    })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual(historyBefore);
  });
});
