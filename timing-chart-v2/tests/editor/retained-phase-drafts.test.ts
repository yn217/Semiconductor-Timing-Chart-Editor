import { describe, expect, it } from "vitest";
import type { Transaction } from "@timing-chart-v2/schema";
import { addPhaseToDraft, clearPhaseDraft, pendingPhaseDraft, retainedPhaseDrafts } from "../../apps/editor/src/transaction-bottom-tabs.js";

const transaction = (id: string, phases: Transaction["phases"] = [{ name: "P1", start: 0, end: 2 }]): Transaction => ({ id, name: `Name ${id}`, start: 0, end: 10, phases } as unknown as Transaction);

describe("retained Phase drafts (#763)", () => {
  it("lists drafts kept for other Transactions under their stable ID, never the current one", () => {
    const a = transaction("a"); const b = transaction("b");
    addPhaseToDraft(a);
    expect(pendingPhaseDraft(a)).toBeDefined();
    expect(retainedPhaseDrafts([a, b], "b")).toEqual([{ id: "a", name: "Name a" }]);
    expect(retainedPhaseDrafts([a, b], "a")).toEqual([]);
    clearPhaseDraft("a");
    expect(retainedPhaseDrafts([a, b], "b")).toEqual([]);
  });

  it("drops the draft of a deleted Transaction so it can never be resurrected", () => {
    const a = transaction("gone");
    addPhaseToDraft(a);
    expect(retainedPhaseDrafts([a], undefined)).toHaveLength(1);
    expect(retainedPhaseDrafts([], undefined)).toEqual([]);
    // Restoring an identical Transaction later (e.g. by Undo of the delete) must not bring the old draft back.
    expect(pendingPhaseDraft(a)).toBeUndefined();
    expect(retainedPhaseDrafts([a], undefined)).toEqual([]);
  });

  it("drops a draft whose committed Phases changed underneath it (stale base)", () => {
    const a = transaction("stale");
    addPhaseToDraft(a);
    const changed = transaction("stale", [{ name: "P1", start: 0, end: 3 }]);
    expect(retainedPhaseDrafts([changed], undefined)).toEqual([]);
    expect(pendingPhaseDraft(changed)).toBeUndefined();
  });
});
