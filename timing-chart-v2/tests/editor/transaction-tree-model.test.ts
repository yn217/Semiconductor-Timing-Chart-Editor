import { describe, expect, it, vi } from "vitest";
import type { Transaction, TransactionGroup } from "@timing-chart-v2/schema";
import { buildGroupedTransactionTreeModel } from "../../apps/editor/src/transaction-tree-model.js";

const group = (id: string, order: number): TransactionGroup => ({ id: id as TransactionGroup["id"], name: id, order, color: "#888888" });
const transaction = (id: string, start: number, groupId?: TransactionGroup["id"]): Transaction => ({ id: id as Transaction["id"], name: id, start, end: start + 1, groupId, color: "#888888" });

describe("grouped Transaction tree model", () => {
  it("filters each canonical Transaction once, buckets once, and sorts deterministically", () => {
    const groups = [group("g1", 0), group("g2", 1)];
    const transactions = [
      transaction("late", 8, groups[0]!.id),
      transaction("ungrouped", 3),
      transaction("early", 2, groups[0]!.id),
      transaction("other", 1, groups[1]!.id),
    ];
    const matches = vi.fn((item: Transaction) => item.id !== "other");

    const model = buildGroupedTransactionTreeModel(transactions, groups, matches);

    expect(matches).toHaveBeenCalledTimes(transactions.length);
    expect(model.totalVisibleCount).toBe(3);
    expect(model.transactionsByGroup.get(groups[0]!.id)?.map((item) => item.id)).toEqual(["early", "late"]);
    expect(model.transactionsByGroup.get(groups[1]!.id)).toEqual([]);
    expect(model.transactionsByGroup.get(undefined)?.map((item) => item.id)).toEqual(["ungrouped"]);
  });

  it("does not include rows whose group is absent from the visible tree", () => {
    const model = buildGroupedTransactionTreeModel(
      [transaction("orphan", 1, "missing" as TransactionGroup["id"]), transaction("ungrouped", 2)],
      [],
      () => true,
    );

    expect(model.totalVisibleCount).toBe(1);
    expect([...model.transactionsByGroup.keys()]).toEqual([undefined]);
  });
});
