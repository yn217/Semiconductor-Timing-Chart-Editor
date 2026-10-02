import { describe, expect, it } from "vitest";
import type { CommandId, TransactionId } from "@timing-chart-v2/schema";
import { planCommand } from "@timing-chart-v2/commands";
import { canonicalFixture } from "../fixtures/canonical.js";

const commandId = (value: string) => value as CommandId;
const tx = (id: string, start: number) => ({ id: id as TransactionId, name: id, start, end: start + 1, laneId: "lane_0" });

describe("transaction.create afterTransactionId", () => {
  const base = { ...canonicalFixture(), transactions: [tx("txn_a", 0), tx("txn_b", 1), tx("txn_c", 2)] };

  it("inserts directly after the anchor in document order", () => {
    const plan = planCommand(base, { id: commandId("c1"), type: "transaction.create", transaction: tx("txn_new", 3), afterTransactionId: "txn_a" as TransactionId });
    expect(plan.ok && plan.document.transactions.map((item) => item.id)).toEqual(["txn_a", "txn_new", "txn_b", "txn_c"]);
  });

  it("appends when no anchor is given and when the anchor is last", () => {
    const appended = planCommand(base, { id: commandId("c2"), type: "transaction.create", transaction: tx("txn_new", 3) });
    expect(appended.ok && appended.document.transactions.map((item) => item.id)).toEqual(["txn_a", "txn_b", "txn_c", "txn_new"]);
    const afterLast = planCommand(base, { id: commandId("c3"), type: "transaction.create", transaction: tx("txn_new", 3), afterTransactionId: "txn_c" as TransactionId });
    expect(afterLast.ok && afterLast.document.transactions.map((item) => item.id)).toEqual(["txn_a", "txn_b", "txn_c", "txn_new"]);
  });

  it("rejects an anchor that does not exist without mutating", () => {
    const plan = planCommand(base, { id: commandId("c4"), type: "transaction.create", transaction: tx("txn_new", 3), afterTransactionId: "txn_missing" as TransactionId });
    expect(plan).toMatchObject({ ok: false, reason: "invalid" });
  });
});
