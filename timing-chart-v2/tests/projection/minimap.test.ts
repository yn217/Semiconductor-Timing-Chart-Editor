import { describe, expect, it } from "vitest";
import { buildMiniMapOverview, buildMiniMapTransactionOverview, transactionLaneIdentityKey, updateMiniMapTransactionOverview } from "@timing-chart-v2/projection";
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
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next, [transactions[0]!.id as never]);
    expect(updated).not.toBe(previous);
    expect(updated.rows.find((row) => row.groupId === undefined && row.laneId === "lane_0")?.segments[0]).toEqual({ start: 2, end: 5, color: "#8895a7" });
    expect(updated.rows.find((row) => row.groupId === undefined && row.laneId === "lane_1")).toBe(previous.rows.find((row) => row.groupId === undefined && row.laneId === "lane_1"));
    expect(updated.transactionsVisited).toBe(3);
    expect(updated.laneBucketsRebuilt).toBe(1);
    expect(updated.rows).toEqual(buildMiniMapTransactionOverview(next).rows);

    const editedAgain = { ...next, transactions: [next.transactions[0]!, { ...next.transactions[1]!, start: 6, end: 9 }] };
    const updatedAgain = updateMiniMapTransactionOverview(updated, next.transactions, next.transactionGroups, editedAgain, [transactions[1]!.id as never]);
    expect(updatedAgain.transactionsVisited).toBe(3);
    expect(updatedAgain.rows).toEqual(buildMiniMapTransactionOverview(editedAgain).rows);
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
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next, [transactions[0]!.id as never]);
    expect(updated.rows.find((row) => row.groupId === undefined && row.laneId === "lane_0")?.segments).toEqual([
      { start: 9, end: 10, color: "#8895a7" },
    ]);
    expect(updated.rows.find((row) => row.groupId === undefined && row.laneId === "lane_1")?.segments).toEqual([
      { start: 1, end: 4, color: "#8895a7" },
      { start: 5, end: 8, color: "#8895a7" },
    ]);
    expect(updated.rows).toHaveLength(2);
    expect(updated.rows.map((row) => [row.groupId, row.laneId])).toEqual([[undefined, "lane_0"], [undefined, "lane_1"]]);
    expect(updated.transactionsVisited).toBe(7);
    expect(updated.laneBucketsRebuilt).toBe(2);
  });

  it("rebuilds exact rows when the last Transaction is deleted", () => {
    const source = canonicalFixture();
    const before = { ...source, transactions: [{ id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", linkedSignals: [] }] };
    const previous = buildMiniMapTransactionOverview(before);
    const next = { ...before, transactions: [] };
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next);
    expect(updated.rows).toEqual([]);
  });

  it("removes a deleted segment while preserving the remaining Transaction in its lane", () => {
    const source = canonicalFixture();
    const transactions = [
      { id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", linkedSignals: [] },
      { id: "txn_b", name: "B", start: 5, end: 8, laneId: "lane_0", linkedSignals: [] },
    ];
    const before = { ...source, transactions };
    const previous = buildMiniMapTransactionOverview(before);
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, { ...before, transactions: [transactions[1]!] });
    expect(updated.rows).toHaveLength(1);
    expect(updated.rows[0]?.segments).toEqual([{ start: 5, end: 8, color: "#8895a7" }]);
  });

  it("adds a created Transaction to an existing lane without duplicating the row", () => {
    const source = canonicalFixture();
    const before = { ...source, transactions: [{ id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", linkedSignals: [] }] };
    const previous = buildMiniMapTransactionOverview(before);
    const next = { ...before, transactions: [...before.transactions, { id: "txn_b", name: "B", start: 5, end: 8, laneId: "lane_0", linkedSignals: [] }] };
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next);
    expect(updated.rows).toHaveLength(1);
    expect(updated.rows[0]?.segments).toEqual([{ start: 1, end: 4, color: "#8895a7" }, { start: 5, end: 8, color: "#8895a7" }]);
  });

  it("rebuilds when timeline length or group presentation changes", () => {
    const source = canonicalFixture();
    const group = { id: "group_a", name: "A", order: 0, color: "#123456", transactionIds: [] };
    const transaction = { id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", groupId: group.id, linkedSignals: [] };
    const before = { ...source, transactions: [transaction], transactionGroups: [group] };
    const previous = buildMiniMapTransactionOverview(before);
    const recolored = { ...before, transactionGroups: [{ ...group, color: "#abcdef" }] };
    const recoloredOverview = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, recolored);
    expect(recoloredOverview.rows[0]?.segments[0]?.color).toBe("#abcdef");
    const resized = { ...recolored, timeline: { ...recolored.timeline, cycleCount: recolored.timeline.cycleCount + 5 } };
    expect(updateMiniMapTransactionOverview(recoloredOverview, recolored.transactions, recolored.transactionGroups, resized).cycleCount).toBe(resized.timeline.cycleCount);
  });

  it("preserves group order and color after a group presentation update", () => {
    const source = canonicalFixture();
    const groups = [
      { id: "group_a", name: "A", order: 0, color: "#111111", transactionIds: ["txn_a"] },
      { id: "group_b", name: "B", order: 1, color: "#222222", transactionIds: ["txn_b"] },
    ];
    const transactions = [
      { id: "txn_a", name: "A", start: 1, end: 4, laneId: "lane_0", groupId: "group_a", linkedSignals: [] },
      { id: "txn_b", name: "B", start: 5, end: 8, laneId: "lane_0", groupId: "group_b", linkedSignals: [] },
    ];
    const before = { ...source, transactions, transactionGroups: groups };
    const previous = buildMiniMapTransactionOverview(before);
    const next = { ...before, transactionGroups: [{ ...groups[1]!, order: 0, color: "#bbbbbb" }, { ...groups[0]!, order: 1 }] };
    const updated = updateMiniMapTransactionOverview(previous, before.transactions, before.transactionGroups, next);
    expect(updated.rows.map((row) => [row.groupId, row.laneId])).toEqual([["group_b", "lane_0"], ["group_a", "lane_0"]]);
    expect(updated.rows[0]?.segments[0]?.color).toBe("#bbbbbb");
  });

  it("keeps synthetic ungrouped and delimiter-bearing Group/Lane tuples distinct in full and incremental MiniMap paths", () => {
    const source = canonicalFixture();
    const transactionGroups = [
      { id: "ungrouped", name: "Real ungrouped", order: 0, color: "#111111", transactionIds: [] },
      { id: "a:b", name: "A:B", order: 1, color: "#222222", transactionIds: [] },
      { id: "a", name: "A", order: 2, color: "#333333", transactionIds: [] },
    ];
    const transactions = [
      { id: "txn_synthetic", name: "Synthetic", start: 1, end: 2, laneId: "lane_0", linkedSignals: [] },
      { id: "txn_real", name: "Real", start: 2, end: 3, laneId: "lane_0", groupId: "ungrouped", linkedSignals: [] },
      { id: "txn_colon_left", name: "Left", start: 3, end: 4, laneId: "c", groupId: "a:b", linkedSignals: [] },
      { id: "txn_colon_right", name: "Right", start: 4, end: 5, laneId: "b:c", groupId: "a", linkedSignals: [] },
    ];
    const before = { ...source, transactionGroups, transactions };
    const overview = buildMiniMapTransactionOverview(before);
    expect(overview.rows).toHaveLength(4);
    expect(new Set(overview.rows.map((row) => row.key)).size).toBe(4);
    expect(overview.rows.map((row) => [row.groupId, row.laneId])).toEqual([
      ["ungrouped", "lane_0"], ["a:b", "c"], ["a", "b:c"], [undefined, "lane_0"],
    ]);
    expect(overview.rows.map((row) => row.segments[0]?.color)).toEqual(["#111111", "#222222", "#333333", "#8895a7"]);
    expect(transactionLaneIdentityKey(undefined, "lane_0")).not.toBe(transactionLaneIdentityKey("ungrouped", "lane_0"));
    expect(transactionLaneIdentityKey("a:b", "c")).not.toBe(transactionLaneIdentityKey("a", "b:c"));

    const nextTransactions = transactions.map((transaction) => transaction.id === "txn_colon_right" ? { ...transaction, laneId: "c", groupId: "a:b" } : transaction);
    const next = { ...before, transactions: nextTransactions };
    const incrementallyUpdated = updateMiniMapTransactionOverview(overview, transactions, transactionGroups, next);
    expect(incrementallyUpdated.rows).toEqual(buildMiniMapTransactionOverview(next).rows);
    expect(incrementallyUpdated.rows.find((row) => row.groupId === "a:b" && row.laneId === "c")?.segments).toHaveLength(2);
    expect(incrementallyUpdated.rows.find((row) => row.groupId === "a" && row.laneId === "b:c")).toBeUndefined();
  });
});
