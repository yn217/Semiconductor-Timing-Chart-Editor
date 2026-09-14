import { describe, expect, it } from "vitest";
import { deriveTransactionExtent } from "../../apps/editor/src/runtime/transaction-extent.js";
import type { Transaction } from "@timing-chart-v2/schema";

describe("shared Transaction extent", () => {
  it.each([1_000, 5_000, 10_000])("derives the extent for %i Transactions", (count) => {
    const transactions = Array.from({ length: count }, (_, index) => ({ id: `txn_${index}`, name: `T${index}`, start: index, end: index + 4, laneId: "lane_0" } as Transaction));
    const started = performance.now();
    const extent = deriveTransactionExtent(transactions);
    expect(performance.now() - started).toBeLessThan(100);
    expect(extent).toEqual({ start: 0, end: count + 3 });
  });
});
