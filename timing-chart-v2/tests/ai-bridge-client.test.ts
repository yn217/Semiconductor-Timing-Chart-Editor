import { describe, expect, it, vi } from "vitest";
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
