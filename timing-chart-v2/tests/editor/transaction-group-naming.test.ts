import { describe, expect, it } from "vitest";
import { compareLaneIds, nextTransactionGroupDraft } from "../../apps/editor/src/application/transaction-group-naming.js";

describe("nextTransactionGroupDraft", () => {
  it("starts at Group 1 with order 0 when there are no Groups", () => {
    expect(nextTransactionGroupDraft(undefined)).toEqual({ name: "Group 1", order: 0 });
    expect(nextTransactionGroupDraft([])).toEqual({ name: "Group 1", order: 0 });
  });

  it("never reuses an order after a middle Group is deleted", () => {
    // Create 3 Groups (orders 0,1,2), delete "Group 2" (order 1): the survivors keep 0 and 2.
    const survivors = [{ name: "Group 1", order: 0 }, { name: "Group 3", order: 2 }];
    expect(nextTransactionGroupDraft(survivors)).toEqual({ name: "Group 2", order: 3 });
  });

  it("reuses the lowest free Group number after a deletion without colliding on order", () => {
    const groups = [{ name: "Group 1", order: 0 }, { name: "Group 3", order: 2 }];
    const first = nextTransactionGroupDraft(groups);
    const second = nextTransactionGroupDraft([...groups, { name: first.name, order: first.order }]);
    expect(first.name).toBe("Group 2");
    expect(second.name).toBe("Group 4");
    expect(second.order).not.toBe(first.order);
  });

  it("ignores custom names when picking the number", () => {
    expect(nextTransactionGroupDraft([{ name: "Pipeline", order: 0 }, { name: "Group 1", order: 1 }])).toEqual({ name: "Group 2", order: 2 });
  });

  it("places the new Group after the highest order even when the list is unsorted", () => {
    expect(nextTransactionGroupDraft([{ name: "Group 2", order: 5 }, { name: "Group 1", order: 0 }]).order).toBe(6);
  });
});

describe("compareLaneIds", () => {
  it("sorts numeric suffixes numerically (lane_2 before lane_10)", () => {
    expect(["lane_10", "lane_2", "lane_0", "lane_1"].sort(compareLaneIds)).toEqual(["lane_0", "lane_1", "lane_2", "lane_10"]);
  });

  it("keeps plain code-unit order for names without digits", () => {
    expect(["beta", "alpha", "gamma"].sort(compareLaneIds)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("returns 0 for identical IDs", () => {
    expect(compareLaneIds("lane_3", "lane_3")).toBe(0);
  });
});
