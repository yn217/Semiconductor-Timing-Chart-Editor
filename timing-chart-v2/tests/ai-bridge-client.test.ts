import { describe, expect, it, vi } from "vitest";
import type { GroupId, SignalId } from "@timing-chart-v2/schema";
import { executeAIBridgeTool, type AIBridgeContext } from "../apps/editor/src/ai-bridge-client.js";
import { canonicalFixture } from "./fixtures/canonical.js";

describe("Agent Bridge view-only selection", () => {
  it("selects an existing stable ID without changing the canonical document", () => {
    const document = canonicalFixture();
    const onSetSelection = vi.fn();
    const context = { document, onSetSelection } as unknown as AIBridgeContext;

    const result = executeAIBridgeTool("set_selection", { entityType: "signal", entityId: "sig_clk" }, context);

    expect(result).toEqual({ selected: { entityType: "signal", entityId: "sig_clk", name: "CLK" }, canonicalDelta: 0, historyDelta: 0, dirtyDelta: 0 });
    expect(onSetSelection).toHaveBeenCalledOnce();
    expect(onSetSelection).toHaveBeenCalledWith({ entityType: "signal", entityId: "sig_clk" });
    expect(document.signals[0]?.id).toBe("sig_clk");
  });

  it("rejects missing IDs and invalid entity kinds without selecting", () => {
    const onSetSelection = vi.fn();
    const context = { document: canonicalFixture(), onSetSelection } as unknown as AIBridgeContext;

    expect(() => executeAIBridgeTool("set_selection", { entityType: "transaction", entityId: "missing" }, context)).toThrow("does not exist");
    expect(() => executeAIBridgeTool("set_selection", { entityType: "signal", entityId: "" }, context)).toThrow("stable entityId");
    expect(onSetSelection).not.toHaveBeenCalled();
  });
});

describe("Agent Bridge workspace view-only operations", () => {
  it("routes valid mode, panel, and source-range operations without document mutation", () => {
    const onViewOperation = vi.fn();
    const context = { document: canonicalFixture(), onViewOperation } as unknown as AIBridgeContext;
    for (const [tool, args] of [
      ["switch_mode", { mode: "Combined" }],
      ["open_panel", { panel: "inspector" }],
      ["set_visible_time_range", { startCycle: 2, endCycle: 8 }],
    ] as const) {
      expect(executeAIBridgeTool(tool, args, context)).toEqual({ applied: true, canonicalDelta: 0, historyDelta: 0, dirtyDelta: 0 });
    }
    expect(onViewOperation.mock.calls).toEqual([
      ["switch_mode", { mode: "Combined" }],
      ["open_panel", { panel: "inspector" }],
      ["set_visible_time_range", { startCycle: 2, endCycle: 8 }],
    ]);
  });

  it("rejects invalid operation values and out-of-document ranges before routing", () => {
    const onViewOperation = vi.fn();
    const context = { document: canonicalFixture(), onViewOperation } as unknown as AIBridgeContext;
    expect(() => executeAIBridgeTool("switch_mode", { mode: "Other" }, context)).toThrow("mode Cycle, Transaction, or Combined");
    expect(() => executeAIBridgeTool("open_panel", { panel: "secret" }, context)).toThrow("panel inspector or bottom");
    expect(() => executeAIBridgeTool("set_visible_time_range", { startCycle: 4, endCycle: 4 }, context)).toThrow("startCycle < endCycle");
    expect(() => executeAIBridgeTool("set_visible_time_range", { startCycle: 0, endCycle: Number.MAX_SAFE_INTEGER }, context)).toThrow("within the document");
    expect(onViewOperation).not.toHaveBeenCalled();
  });
});

describe("Agent Bridge indexed read tools", () => {
  it("derives 10k Signal group ownership with bounded row-membership work", () => {
    const base = canonicalFixture();
    let membershipChecks = 0;
    const signals = Array.from({ length: 10_000 }, (_, index) => ({
      ...base.signals[1]!,
      id: `sig_${index}` as SignalId,
      name: `DATA_${index}`,
      display: { name: `DATA_${index}` },
    }));
    const groups = Array.from({ length: 25 }, (_, groupIndex) => {
      const rows = signals.slice(groupIndex * 400, (groupIndex + 1) * 400).map((signal) => signal.id);
      const countedRows = new Proxy(rows, {
        get(target, property, receiver) {
          if (property === "includes") return (value: unknown) => { membershipChecks += 1; return target.includes(value as SignalId); };
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
      return { id: `grp_${groupIndex}` as GroupId, name: `Group ${groupIndex}`, rows: countedRows };
    });
    const document = { ...base, signals, signalGroups: groups };
    const context = { document } as unknown as AIBridgeContext;

    performance.clearMeasures("timing-chart-v2:ai-bridge:get_signals");
    const startedAt = performance.now();
    const result = executeAIBridgeTool("get_signals", {}, context) as { signals: Array<{ id: string; groupId: string }> };
    const durationMs = performance.now() - startedAt;

    expect(result.signals).toHaveLength(10_000);
    expect(result.signals[0]?.groupId).toBe("grp_0");
    expect(result.signals.at(-1)?.groupId).toBe("grp_24");
    expect(membershipChecks).toBeLessThanOrEqual(10_000 + 25 * 400);
    expect(Number.isFinite(durationMs)).toBe(true);
    const recordedMetric = performance.getEntriesByName("timing-chart-v2:ai-bridge:get_signals", "measure").at(-1);
    expect(recordedMetric?.duration).toBeGreaterThanOrEqual(0);
    console.info("AI read latency", JSON.stringify({ tool: "get_signals", signals: 10_000, groups: 25, durationMs, membershipChecks }));
  });

  it("resolves linked IDs without rescanning the full Signal collection per link", () => {
    const base = canonicalFixture();
    let signalRowsVisited = 0;
    const signals = Array.from({ length: 2_000 }, (_, index) => ({
      ...base.signals[1]!,
      id: `sig_${index}` as SignalId,
      name: `DATA_${index}`,
      display: { name: `DATA_${index}` },
    }));
    const countedSignals = new Proxy(signals, {
      get(target, property, receiver) {
        if (property === Symbol.iterator) return function* () { for (const signal of target) { signalRowsVisited += 1; yield signal; } };
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const transaction = { id: "txn_read" as never, name: "Read", start: 0, end: 1, linkedSignals: signals.slice(0, 100).map((signal) => signal.id) };
    const document = { ...base, signals: countedSignals, transactions: [transaction] };
    const context = { document } as unknown as AIBridgeContext;
    executeAIBridgeTool("get_signal", { signalId: "sig_0" }, context);
    expect(signalRowsVisited).toBe(2_000);
    signalRowsVisited = 0;
    const result = executeAIBridgeTool("get_linked_signals", { transactionId: "txn_read" }, context) as { signals: unknown[]; unresolvedSignalIds: unknown[] };

    expect(result.signals).toHaveLength(100);
    expect(result.unresolvedSignalIds).toEqual([]);
    expect(signalRowsVisited).toBe(0);
  });

  it("rebuilds collection indexes when immutable document collections are replaced", () => {
    const base = canonicalFixture();
    const signal = { ...base.signals[1]!, id: "sig_cached" as SignalId, display: { name: "Cached" } };
    const firstDocument = { ...base, signals: [signal], signalGroups: [{ id: "grp_before" as GroupId, name: "Before", rows: [signal.id] }] };
    const first = executeAIBridgeTool("get_signals", {}, { document: firstDocument } as unknown as AIBridgeContext) as { signals: Array<{ groupId: string }> };
    expect(first.signals[0]?.groupId).toBe("grp_before");

    const secondDocument = { ...firstDocument, signalGroups: [{ id: "grp_after" as GroupId, name: "After", rows: [signal.id] }] };
    const second = executeAIBridgeTool("get_signals", {}, { document: secondDocument } as unknown as AIBridgeContext) as { signals: Array<{ groupId: string }> };
    expect(second.signals[0]?.groupId).toBe("grp_after");
  });

  it("returns the current authoritative problem snapshot instead of validating the document again", () => {
    const validationDiagnostics = [{ code: "TIMING_REVIEW", path: "$.timeline", message: "Review the timing reference." }];
    const result = executeAIBridgeTool("get_problems", {}, { document: canonicalFixture(), validationDiagnostics } as unknown as AIBridgeContext) as { problems: unknown[] };
    expect(result.problems).toEqual(validationDiagnostics);
  });
});
