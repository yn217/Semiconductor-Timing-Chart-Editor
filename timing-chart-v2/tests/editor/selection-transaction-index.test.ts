import { describe, expect, it } from "vitest";
import { deriveSelectionCapabilities, type SelectionState } from "../../apps/editor/src/application/use-selection-owner.js";
import { selectedTransactionsInDocumentOrder, transactionById } from "../../apps/editor/src/runtime/transaction-selection-index.js";
import type { Transaction, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Transaction selection capability indexing", () => {
  it("resolves primary and bulk selection from the cached index without rescanning the collection", () => {
    const transactions = Array.from({ length: 10_000 }, (_, index) => ({
      id: `txn_${index}` as TransactionId,
      name: `Transaction ${index}`,
      start: index,
      end: index + 1,
      visible: index !== 9_999,
    })) as Transaction[];
    const selectedId = transactions[transactions.length - 1]!.id;
    const guardedTransactions = new Proxy(transactions, {
      get(target, property, receiver) {
        if (property === "find" || property === "filter") {
          return () => { throw new Error(`unexpected full Transaction scan via ${String(property)}`); };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    // Build the collection-identity index once, as an ordinary Transaction
    // editor surface can do before selection capabilities are derived.
    expect(transactionById(guardedTransactions, selectedId)?.id).toBe(selectedId);
    expect(selectedTransactionsInDocumentOrder(guardedTransactions, new Set([selectedId])).map((item) => item.id)).toEqual([selectedId]);

    const selection: SelectionState = {
      signalId: undefined,
      signalIds: new Set(),
      groupId: undefined,
      spacerId: undefined,
      annotationId: undefined,
      annotationIds: new Set(),
      transactionId: selectedId,
      legendSelected: false,
      transactionIds: new Set([selectedId]),
    };
    const document = { ...canonicalFixture(), transactions: guardedTransactions };

    expect(deriveSelectionCapabilities(document, selection)).toMatchObject({
      hasSelectedEntity: true,
      hasSelectedClipboard: true,
      hasDeletableSelection: true,
      canRename: true,
      canShow: true,
      canHide: false,
    });
  });
});
