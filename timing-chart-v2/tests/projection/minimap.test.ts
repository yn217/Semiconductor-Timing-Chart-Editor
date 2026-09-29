import { describe, expect, it } from "vitest";
import { buildMiniMapOverview, buildMiniMapTransactionOverview, updateMiniMapOverview, updateMiniMapTransactionOverview } from "@timing-chart-v2/projection";
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

  it("rebuilds only the edited Signal row and visits only its value changes", () => {
    const source = canonicalFixture();
    const previous = buildMiniMapOverview(source);
    const data = source.signals.find((signal) => signal.id === "sig_data")!;
    const changed = { ...data, values: [...data.values, { start: 6, value: "FF" }] };
    const next = { ...source, signals: source.signals.map((signal) => signal.id === data.id ? changed : signal) };
    const updated = updateMiniMapOverview(previous, source.signals, source.signalGroups, next);
    expect(updated.rows.find((row) => row.rowId === "sig_clk")).toBe(previous.rows.find((row) => row.rowId === "sig_clk"));
    expect(updated.rows.find((row) => row.rowId === "sig_data")).not.toBe(previous.rows.find((row) => row.rowId === "sig_data"));
    expect(updated.rowsRebuilt).toBe(1);
    expect(updated.valueChangesVisited).toBe(changed.values.length);
    expect(updated.rows.find((row) => row.rowId === "sig_data")?.segments).toHaveLength(changed.values.length);
  });

  it("uses a stable Signal hint to avoid scanning unrelated rows for a one-value edit", () => {
    const source = canonicalFixture();
    const template = source.signals.find((signal) => signal.id === "sig_data")!;
    const signals = Array.from({ length: 10_000 }, (_, index) => ({ ...template, id: `signal_${index}` as SignalId }));
    const groups = [{ ...source.signalGroups[0]!, rows: signals.map((signal) => signal.id) }];
    const before = { ...source, signals, signalGroups: groups };
    const previous = buildMiniMapOverview(before);
    const changed = { ...signals[5]!, values: [...signals[5]!.values, { start: 6, value: "FF" }] };
    const next = { ...before, signals: signals.map((signal, index) => index === 5 ? changed : signal) };
    const updated = updateMiniMapOverview(previous, signals, groups, next, [changed]);
    expect(updated.rowsRebuilt).toBe(1);
    expect(updated.signalLookups).toBe(1);
    expect(updated.valueChangesVisited).toBe(changed.values.length);
    expect(updated.rows[4]).toBe(previous.rows[4]);
    expect(updated.rows[5]).not.toBe(previous.rows[5]);
  });

  it("reuses all Signal rows for a name-only edit", () => {
    const source = canonicalFixture();
    const previous = buildMiniMapOverview(source);
    const next = { ...source, signals: source.signals.map((signal) => signal.id === "sig_data" ? { ...signal, name: "RENAMED" } : signal) };
    const updated = updateMiniMapOverview(previous, source.signals, source.signalGroups, next);
    expect(updated.rows).toBe(previous.rows);
    expect(updated.rowsRebuilt).toBe(0);
    expect(updated.valueChangesVisited).toBe(0);
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
    expect(updated.laneBucketsRebuilt).toBe(1);
    expect(updated.updateKind).toBe("incremental");
  });

  it("uses a stable changed-Transaction hint to visit one row and rebuild only its lane", () => {
    const source = canonicalFixture();
    const transactions = Array.from({ length: 10_000 }, (_, index) => ({ id: `txn_${index}`, name: `T${index}`, start: index % 7, end: index % 7 + 1, laneId: `lane_${index % 8}`, linkedSignals: [] }));
    const before = { ...source, transactions };
    const previous = buildMiniMapTransactionOverview(before);
    const afterChanged = { ...transactions[5]!, start: 2, end: 3 };
    const nextTransactions = transactions.map((transaction, index) => index === 5 ? afterChanged : transaction);
    const updated = updateMiniMapTransactionOverview(previous, transactions, before.transactionGroups, { ...before, transactions: nextTransactions }, [afterChanged]);
    expect(updated.transactionsVisited).toBe(1);
    expect(updated.laneBucketsRebuilt).toBe(1);
    expect(updated.updateKind).toBe("incremental");
    expect(updated.rows.find((row) => row.key === "ungrouped:lane_5")?.segments).toContainEqual({ start: 2, end: 3, color: "#8895a7" });
    expect(updated.rows.find((row) => row.key === "ungrouped:lane_0")).toBe(previous.rows.find((row) => row.key === "ungrouped:lane_0"));
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
    expect(updated.rows).toHaveLength(2);
    expect(updated.rows.map((row) => row.key)).toEqual(["ungrouped:lane_0", "ungrouped:lane_1"]);
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
    expect(updated.rows.map((row) => row.key)).toEqual(["group_b:lane_0", "group_a:lane_0"]);
    expect(updated.rows[0]?.segments[0]?.color).toBe("#bbbbbb");
  });
});
