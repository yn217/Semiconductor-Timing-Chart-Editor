import { describe, expect, it } from "vitest";
import { deriveSelectionCapabilities, type SelectionState } from "../../apps/editor/src/application/use-selection-owner.js";
import { selectedTransactionsInDocumentOrder, transactionById } from "../../apps/editor/src/runtime/transaction-selection-index.js";
import { signalGroupSelectionIndex } from "../../apps/editor/src/runtime/signal-group-selection-index.js";
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

  it("derives selected Signal capabilities from a cached row-owner index", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => `sig_${index}`);
    const group = { id: "large_group", name: "Large", rows };
    const guardedRows = new Proxy(rows, {
      get(target, property, receiver) {
        if (property === "includes" || property === "indexOf") {
          return () => { throw new Error(`unexpected row scan via ${String(property)}`); };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const guardedGroup = { ...group, rows: guardedRows };
    const groups = new Proxy([guardedGroup], {
      get(target, property, receiver) {
        if (property === "find" || property === "findIndex") {
          return () => { throw new Error(`unexpected group scan via ${String(property)}`); };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const selectedId = "sig_9999" as SignalId;
    // Warm against the same immutable collection identity before guarding lookup paths.
    expect(signalGroupSelectionIndex(groups).groupByRowId.get(selectedId)?.id).toBe(group.id);
    const document = {
      ...canonicalFixture(),
      signals: [{ id: selectedId, name: "Selected", type: "signal", display: { name: "Selected", visible: true } }],
      signalGroups: groups,
    } as ReturnType<typeof canonicalFixture>;
    const selection: SelectionState = {
      signalId: selectedId,
      signalIds: new Set([selectedId]),
      groupId: undefined,
      spacerId: undefined,
      annotationId: undefined,
      annotationIds: new Set(),
      transactionId: undefined,
      legendSelected: false,
      transactionIds: new Set(),
    };

    expect(deriveSelectionCapabilities(document, selection)).toMatchObject({
      hasSelectedSignal: true,
      canMoveUp: true,
      canMoveDown: false,
    });
  });
});
