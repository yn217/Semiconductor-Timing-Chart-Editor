import { describe, expect, it } from "vitest";
import { buildMiniMapOverview, buildMiniMapTransactionOverview, updateMiniMapTransactionOverview } from "@timing-chart-v2/projection";
import type { SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("MiniMap overview derivation", () => {
  it("uses stable row IDs and preserves signal segment tones", () => {
    const overview = buildMiniMapOverview(canonicalFixture());
    expect(overview.rows.length).toBeGreaterThan(0);
    expect(new Set(overview.rows.map((row) => row.rowId)).size).toBe(overview.rows.length);
    expect(overview.signalLookups).toBe(overview.rows.length);
    expect(overview.rows[0]?.segments.length).toBeGreaterThan(0);
    expect(Object.isFrozen(overview)).toBe(true);
    expect(Object.isFrozen(overview.rows)).toBe(true);
  });

  it("derives a large overview with one map lookup per row", () => {
    const source = canonicalFixture();
    const template = source.signals[0]!;
    const signals = Array.from({ length: 1_000 }, (_, index) => ({ ...template, id: `mini_${index}` as SignalId }));
    const document = { ...source, signals, signalGroups: [{ ...source.signalGroups[0]!, rows: signals.map((signal) => signal.id) }] };
    const overview = buildMiniMapOverview(document);
    expect(overview.rows).toHaveLength(1_000);
    expect(overview.signalLookups).toBe(1_000);
    expect(overview.rows[999]?.rowId).toBe("mini_999");
  });

  it("updates only the changed Transaction lane and reuses unaffected rows", () => {
    const source = canonicalFixture();
    const transactions = [
      { id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", linkedSignals: [] },
      { id: "txn_b", name: "B", start: 5, end: 8, laneId: "lane_1", linkedSignals: [] },
    ];
    const before = { ...source, transactions };
    const previous = buildMiniMapTransactionOverview(before);
    const next = { ...before, transactions: [{ ...transactions[0]!, start: 2, end: 5 }, transactions[1]!] };
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next);
    expect(updated).not.toBe(previous);
    expect(updated.rows.find((row) => row.key === "ungrouped:lane_0")?.segments[0]).toEqual({ start: 2, end: 5, color: "#8895a7" });
    expect(updated.rows.find((row) => row.key === "ungrouped:lane_1")).toBe(previous.rows.find((row) => row.key === "ungrouped:lane_1"));
  });

  it("falls back to a full overview when a new lane is introduced", () => {
    const source = canonicalFixture();
    const before = { ...source, transactions: [{ id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", linkedSignals: [] }] };
    const previous = buildMiniMapTransactionOverview(before);
    const next = { ...before, transactions: [...before.transactions, { id: "txn_b", name: "B", start: 5, end: 8, laneId: "lane_1", linkedSignals: [] }] };
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next);
    expect(updated).not.toBe(previous);
    expect(updated.rows).toHaveLength(2);
  });

  it("refreshes both buckets when a Transaction moves between lanes", () => {
    const source = canonicalFixture();
    const transactions = [
      { id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", linkedSignals: [] },
      { id: "txn_b", name: "B", start: 5, end: 8, laneId: "lane_1", linkedSignals: [] },
      { id: "txn_c", name: "C", start: 9, end: 10, laneId: "lane_0", linkedSignals: [] },
    ];
    const before = { ...source, transactions };
    const previous = buildMiniMapTransactionOverview(before);
    const next = { ...before, transactions: [{ ...transactions[0]!, laneId: "lane_1" }, transactions[1]!, transactions[2]!] };
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next);
    expect(updated.rows.find((row) => row.key === "ungrouped:lane_0")?.segments).toEqual([
      { start: 9, end: 10, color: "#8895a7" },
    ]);
    expect(updated.rows.find((row) => row.key === "ungrouped:lane_1")?.segments).toEqual([
      { start: 1, end: 4, color: "#8895a7" },
      { start: 5, end: 8, color: "#8895a7" },
    ]);
  });
});
