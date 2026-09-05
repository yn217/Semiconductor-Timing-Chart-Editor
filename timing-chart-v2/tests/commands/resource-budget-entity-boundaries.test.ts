import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DOCUMENT_RESOURCE_BUDGET, type AnnotationId, type CommandId, type GroupId, type Signal, type SignalId, type TransactionId } from "@timing-chart-v2/schema";
import { deterministicMockAIProposalProvider } from "../../apps/editor/src/ai-proposal-provider.js";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (value: string) => value as CommandId;

function documentWithSignalCount(count: number) {
  const base = canonicalFixture();
  const template = base.signals.find((signal) => signal.type === "bus")!;
  const additions = Array.from({ length: count - base.signals.length }, (_, index) => {
    const id = `budget_signal_${index}` as SignalId;
    const name = `BUDGET_${index}`;
    return { ...template, id, name, source: { ...template.source, signalName: name }, display: { ...template.display, name } };
  });
  const signals = [...base.signals, ...additions];
  return { ...base, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signals.map((signal) => signal.id) }] };
}

function documentWithGroupCount(count: number) {
  const base = canonicalFixture();
  const additions = Array.from({ length: count - base.signalGroups.length }, (_, index) => ({ id: `budget_group_${index}` as GroupId, name: `Budget Group ${index}`, rows: [] }));
  return { ...base, signalGroups: [...base.signalGroups, ...additions] };
}

function documentWithAnnotationCount(count: number) {
  const base = canonicalFixture();
  const additions = Array.from({ length: count }, (_, index) => ({ id: `budget_annotation_${index}` as AnnotationId, type: "text" as const, label: `Budget annotation ${index}`, visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 0, point: "value-start" as const } }));
  return { ...base, annotations: additions };
}

function documentWithTransactionCount(count: number) {
  const base = canonicalFixture();
  const additions = Array.from({ length: count }, (_, index) => ({ id: `budget_transaction_${index}` as TransactionId, name: `Budget transaction ${index}`, start: 0, end: 1 }));
  return { ...base, transactions: additions };
}

function binarySignal(id: string, values: readonly { start: number; value: number }[]): Signal {
  return { id: id as SignalId, name: id, type: "binary", role: "internal", source: { instancePath: [], signalName: id }, display: { name: id }, values };
}

describe("resource budget entity boundaries", () => {
  it.each([
    ["signals", DOCUMENT_RESOURCE_BUDGET.signalCount, documentWithSignalCount, { type: "signal.create", signal: { id: "budget_signal_new" as SignalId, name: "New", type: "bus", role: "internal", source: { instancePath: [], signalName: "New" }, display: { name: "New" }, width: 8, displayFormat: "hex", values: [{ start: 0, value: "00" }] }, targetGroupId: "grp_main" as GroupId, index: 2 }],
    ["groups", DOCUMENT_RESOURCE_BUDGET.groupCount, documentWithGroupCount, { type: "group.create", group: { id: "budget_group_new" as GroupId, name: "New", rows: [] }, index: DOCUMENT_RESOURCE_BUDGET.groupCount }],
    ["annotations", DOCUMENT_RESOURCE_BUDGET.annotationCount, documentWithAnnotationCount, { type: "annotation.create", annotation: { id: "budget_annotation_new" as AnnotationId, type: "text", label: "New", visible: true, anchor: { signalId: "sig_data" as SignalId, cycle: 0, point: "value-start" } } }],
    ["transactions", DOCUMENT_RESOURCE_BUDGET.transactionCount, documentWithTransactionCount, { type: "transaction.create", transaction: { id: "budget_transaction_new" as TransactionId, name: "New", start: 0, end: 1 } }],
  ] as const)("accepts the exact %s limit and rejects the next creation atomically", (metric, limit, buildDocument, command) => {
    const atLimit = new CommandHistorySession(buildDocument(limit));
    const before = atLimit.getSnapshot();
    const beforeHistory = atLimit.historyState();
    const rejected = atLimit.execute({ id: commandId(`budget_${metric}_overflow`), ...command } as never);
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED" })] });
    expect(atLimit.getSnapshot()).toBe(before);
    expect(atLimit.historyState()).toEqual(beforeHistory);
  });

  it("allows a generated value-change session to reach one million changes, then rejects the next change", () => {
    const full = Array.from({ length: 100_000 }, (_, start) => ({ start, value: start % 2 }));
    const almostFull = full.slice(0, 99_998);
    const nearLimitValues = [...Array.from({ length: 9 }, (_, index) => binarySignal(`budget_full_${index}`, full)), binarySignal("budget_almost_full", almostFull), binarySignal("budget_target", [{ start: 0, value: 0 }])];
    const base = canonicalFixture();
    const document = { ...base, timeline: { ...base.timeline, end: 100_000, cycleCount: 100_000 }, signals: [base.signals[0]!, ...nearLimitValues], signalGroups: [{ ...base.signalGroups[0]!, rows: nearLimitValues.map((signal) => signal.id).concat(base.signals[0]!.id) }] };
    const session = new CommandHistorySession(document);
    const accepted = session.execute({ id: commandId("budget_value_to_limit"), type: "signal.replaceValues", signalId: "budget_target" as SignalId, values: [{ start: 0, value: 0 }, { start: 1, value: 1 }] });
    expect(accepted).toMatchObject({ ok: true });
    const atLimit = session.getSnapshot();
    const beforeHistory = session.historyState();
    const rejected = session.execute({ id: commandId("budget_value_overflow"), type: "signal.replaceValues", signalId: "budget_target" as SignalId, values: [{ start: 0, value: 0 }, { start: 1, value: 1 }, { start: 2, value: 0 }] });
    expect(rejected).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.signals[*].values" })] });
    expect(session.getSnapshot()).toBe(atLimit);
    expect(session.historyState()).toEqual({ ...beforeHistory, dirty: true });
    expect(session.undo().ok).toBe(true);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document.signals.find((signal) => signal.id === "budget_target")?.values).toHaveLength(2);
  }, 30_000);

  it("keeps an AI create proposal behind the same canonical budget boundary", () => {
    const document = documentWithSignalCount(DOCUMENT_RESOURCE_BUDGET.signalCount);
    const session = new CommandHistorySession(document);
    const before = session.getSnapshot();
    const proposed = deterministicMockAIProposalProvider.propose({ document, revision: before.revision, query: "create signal named AI_OVERFLOW", selectedSignalId: undefined, selectedGroupId: "grp_main" as GroupId });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const result = session.execute(proposed.proposal.commands[0]!);
    expect(result).toMatchObject({ ok: false, reason: "invalid", problems: [expect.objectContaining({ code: "RESOURCE_LIMIT_EXCEEDED", path: "$.signals" })] });
    expect(session.getSnapshot()).toBe(before);
    expect(session.historyState()).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, dirty: false });
  });
});
