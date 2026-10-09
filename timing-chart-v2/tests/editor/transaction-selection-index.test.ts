import { describe, expect, it } from "vitest";
import type { Transaction, TransactionId } from "@timing-chart-v2/schema";
import { bottomTransactionActionIds, selectedTransactionsInDocumentOrder } from "../../apps/editor/src/runtime/transaction-selection-index.js";

function transaction(id: string): Transaction {
  return { id: id as TransactionId, name: id, start: 0, end: 1, linkedSignals: [] } as Transaction;
}

describe("selectedTransactionsInDocumentOrder", () => {
  it("keeps pinned/fixed Bottom bulk mutations on the displayed stable ID", () => {
    const transactions = [transaction("pinned"), transaction("live-a"), transaction("live-b")];
    const liveIds = new Set([transactions[1]!.id, transactions[2]!.id]);
    const fixed = bottomTransactionActionIds(transactions[0], liveIds, true);
    expect([...fixed]).toEqual([transactions[0]!.id]);
    expect(selectedTransactionsInDocumentOrder(transactions, fixed)).toEqual([transactions[0]]);
    expect([...bottomTransactionActionIds(undefined, liveIds, true)]).toEqual([]);
    expect(bottomTransactionActionIds(transactions[0], liveIds, false)).toBe(liveIds);
    expect([...liveIds]).toEqual([transactions[1]!.id, transactions[2]!.id]);
  });
  it("reuses one immutable collection index and preserves canonical order", () => {
    const source = Array.from({ length: 10_000 }, (_, index) => transaction(`txn-${index}`));
    let numericReads = 0;
    const transactions = new Proxy(source, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) numericReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const selected = new Set(["txn-9000", "txn-3", "txn-5000"] as TransactionId[]);

    const first = selectedTransactionsInDocumentOrder(transactions, selected);
    const readsAfterBuild = numericReads;
    const second = selectedTransactionsInDocumentOrder(transactions, selected);

    expect(first.map((item) => item.id)).toEqual(["txn-3", "txn-5000", "txn-9000"]);
    expect(second).toEqual(first);
    expect(readsAfterBuild).toBe(10_000);
    expect(numericReads).toBe(readsAfterBuild);
  });
});
