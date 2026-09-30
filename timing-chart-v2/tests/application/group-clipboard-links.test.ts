import { describe, expect, it } from "vitest";
import type { SignalId, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { serializeValidatedCanonicalDocument, parseDocument, type CommandId, type GroupId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { captureGroupTransactionLinks, remapGroupTransactionLinks } from "../../apps/editor/src/application/group-clipboard-links.js";

const commandId = (id: string) => id as CommandId;

describe("Group clipboard external Transaction links", () => {
  it("captures and remaps every contained Signal relationship exactly once", () => {
    const first = "sig_first" as SignalId;
    const second = "sig_second" as SignalId;
    const outside = "sig_outside" as SignalId;
    const transactions = [
      { id: "txn_a" as TransactionId, linkedSignals: [first, second, outside] },
      { id: "txn_b" as TransactionId, linkedSignals: [second] },
      { id: "txn_unlinked" as TransactionId, linkedSignals: [outside] },
    ] as unknown as readonly Transaction[];
    const captured = captureGroupTransactionLinks(transactions, new Set([first, second]));
    expect(captured).toEqual([
      { transactionId: "txn_a", signalId: first },
      { transactionId: "txn_a", signalId: second },
      { transactionId: "txn_b", signalId: second },
    ]);

    const remapped = remapGroupTransactionLinks(captured, new Map([
      [first, "sig_first_new" as SignalId],
      [second, "sig_second_new" as SignalId],
    ]));
    expect(remapped).toEqual({ ok: true, links: [
      { transactionId: "txn_a", signalId: "sig_first_new" },
      { transactionId: "txn_a", signalId: "sig_second_new" },
      { transactionId: "txn_b", signalId: "sig_second_new" },
    ] });
  });

  it("rejects incomplete ID remapping instead of silently dropping links", () => {
    const captured = [{ transactionId: "txn_a" as TransactionId, signalId: "sig_missing" as SignalId }];
    expect(remapGroupTransactionLinks(captured, new Map())).toEqual({ ok: false, missingSignalIds: ["sig_missing"] });
  });

  it("restores remapped links atomically across Cut/Paste, Undo/Redo, and Save/Open", () => {
    const source = canonicalFixture();
    const first = { ...source.signals[1]!, id: "sig_group_first" as SignalId, name: "FIRST" };
    const second = { ...source.signals[1]!, id: "sig_group_second" as SignalId, name: "SECOND" };
    const group = { id: "grp_cut_links" as GroupId, name: "Linked rows", rows: [first.id, second.id] };
    const transaction = { id: "txn_cut_links" as TransactionId, name: "Transfer", start: 1, end: 4, linkedSignals: [first.id, second.id, source.signals[1]!.id] };
    const initial = { ...source, signalGroups: [...source.signalGroups, group], signals: [...source.signals, first, second], transactions: [transaction] };
    const session = new CommandHistorySession(initial);
    const captured = captureGroupTransactionLinks(initial.transactions, new Set([first.id, second.id]));

    expect(session.executeBatch(commandId("cut_group_batch"), [
      { id: commandId("cut_group_signals"), type: "signal.bulkDelete", signalIds: [first.id, second.id] },
      { id: commandId("cut_group_delete"), type: "group.delete", groupId: group.id },
    ]).ok).toBe(true);
    const afterCut = session.getSnapshot().document;
    expect(afterCut.transactions[0]?.linkedSignals).toEqual([source.signals[1]!.id]);

    const newFirst = "sig_group_first_new" as SignalId;
    const newSecond = "sig_group_second_new" as SignalId;
    const newGroupId = "grp_cut_links_new" as GroupId;
    const remapped = remapGroupTransactionLinks(captured, new Map([[first.id, newFirst], [second.id, newSecond]]));
    expect(remapped.ok).toBe(true);
    if (!remapped.ok) return;
    expect(session.executeBatch(commandId("paste_group_batch"), [
      { id: commandId("paste_group_create"), type: "group.createWithContents", group: { ...group, id: newGroupId, rows: [newFirst, newSecond] }, signals: [{ ...first, id: newFirst }, { ...second, id: newSecond }], index: afterCut.signalGroups.length },
      ...remapped.links.map(({ transactionId, signalId }, index) => ({ id: commandId(`paste_group_link_${index}`), type: "transaction.linkSignal" as const, transactionId, signalId })),
    ]).ok).toBe(true);
    expect(session.historyState().undoDepth).toBe(2);
    expect(session.getSnapshot().document.transactions[0]?.linkedSignals).toEqual([source.signals[1]!.id, newFirst, newSecond]);

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(afterCut);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.redo().ok).toBe(true);
    expect(session.redo().ok).toBe(true);
    const saved = serializeValidatedCanonicalDocument(session.getSnapshot().document);
    const reopened = parseDocument(saved);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.document.transactions[0]?.linkedSignals).toEqual([source.signals[1]!.id, newFirst, newSecond]);
  });
});
