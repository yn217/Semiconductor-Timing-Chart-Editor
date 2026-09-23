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
