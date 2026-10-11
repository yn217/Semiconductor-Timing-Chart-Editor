import { describe, expect, it, vi } from "vitest";
import type { TransactionId } from "@timing-chart-v2/schema";
import { TransactionBottomDraftStore, type TransactionRowDraft } from "../../apps/editor/src/runtime/transaction-bottom-draft-store.js";

const base: TransactionRowDraft = { name: "Read", start: 1, end: 5, laneId: "lane_0", groupId: undefined, color: "#8895a7", description: "" };

describe("TransactionBottomDraftStore", () => {
  it("keeps edits by stable Transaction ID and clears them only when reverted or reset", () => {
    const store = new TransactionBottomDraftStore();
    const changed = { ...base, name: "Read draft" };
    const listener = vi.fn();
    store.subscribe(listener);

    store.set("read" as TransactionId, base, changed);
    expect(store.get("read" as TransactionId)).toEqual({ base, draft: changed });
    expect(store.hasUnappliedDrafts()).toBe(true);

    store.set("read" as TransactionId, base, base);
    expect(store.get("read" as TransactionId)).toBeUndefined();
    expect(store.hasUnappliedDrafts()).toBe(false);

    store.set("read" as TransactionId, base, changed);
    store.clearAll();
    expect(store.get("read" as TransactionId)).toBeUndefined();
    expect(store.hasUnappliedDrafts()).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it("retains a non-default create draft and clears it after successful creation", () => {
    const store = new TransactionBottomDraftStore();
    const baseline = { name: "Transaction", start: 1, end: 5, laneId: "" };
    const changed = { ...baseline, name: "Draft Transaction" };
    store.setCreateDraft(changed, baseline);
    expect(store.hasUnappliedDrafts()).toBe(true);
    expect(store.getCreateDraft(baseline)).toEqual(changed);
    store.clearCreateDraft();
    expect(store.hasUnappliedDrafts()).toBe(false);
  });

  it("drops drafts for deleted Transactions so they cannot block Save or return after Undo", () => {
    const store = new TransactionBottomDraftStore();
    store.set("deleted" as TransactionId, base, { ...base, name: "Draft" });
    store.removeMissingTransactions(new Set());
    expect(store.get("deleted" as TransactionId)).toBeUndefined();
    expect(store.hasUnappliedDrafts()).toBe(false);
    store.removeMissingTransactions(new Set(["deleted" as TransactionId]));
    expect(store.get("deleted" as TransactionId)).toBeUndefined();
  });
});
