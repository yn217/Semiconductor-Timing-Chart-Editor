import { describe, expect, it } from "vitest";
import { describeAIProposalCommands, isAIPreviewFresh } from "../../apps/editor/src/ai-operation-panel.js";
import { buildAIClientConfig, buildAIMcpEndpoint } from "../../apps/editor/src/ai-connection-guide.js";
import { classifyAIBridgeFailure, isLoopbackBridgeHost } from "../../apps/editor/src/ai-bridge-client.js";
import { buildTypedTransactionProposal } from "../../apps/editor/src/ai-proposal-provider.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("AI document-scoped freshness", () => {
  it("rejects equal-revision proposals across Scenario switches and round trips", () => {
    const proposal = { proposalEpoch: 5, currentEpoch: 5, proposalRevision: 7, currentRevision: 7, proposalGeneration: 2 };
    expect(isAIPreviewFresh({ ...proposal, currentGeneration: 2 })).toBe(true);
    expect(isAIPreviewFresh({ ...proposal, currentGeneration: 3 })).toBe(false);
    expect(isAIPreviewFresh({ ...proposal, currentGeneration: 4 })).toBe(false);
    expect(isAIPreviewFresh({ ...proposal, proposalGeneration: undefined, currentGeneration: 2 })).toBe(false);
  });

  it("rejects same-revision proposals from an older document epoch synchronously", () => {
    expect(isAIPreviewFresh({ proposalGeneration: 2, currentGeneration: 2, proposalEpoch: 4, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(false);
    expect(isAIPreviewFresh({ proposalGeneration: 2, currentGeneration: 2, proposalEpoch: 5, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(true);
  });

  it("requires both the shared epoch and revision for a validated Apply", () => {
    expect(isAIPreviewFresh({ proposalGeneration: 2, currentGeneration: 2, proposalEpoch: undefined, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(false);
    expect(isAIPreviewFresh({ proposalGeneration: 2, currentGeneration: 2, proposalEpoch: 5, currentEpoch: 5, proposalRevision: 6, currentRevision: 7 })).toBe(false);
  });
});

describe("AI proposal review details", () => {
  it("shows a proposed Bookmark name, source cycle and stable identity before Apply", () => {
    const details = describeAIProposalCommands(canonicalFixture(), [{
      id: "cmd_bookmark_review", type: "bookmark.create",
      bookmark: { id: "bookmark_review", name: "Batch checkpoint", start: 3 },
    }]);
    expect(details).toEqual([{ title: "Create Bookmark Batch checkpoint", detail: "At source cycle 3 · Bookmark ID bookmark_review" }]);
  });
  it("lists compound Transaction, Phase, and Signal-link commands with source ranges and stable IDs", () => {
    const base = canonicalFixture();
    const document = { ...base, timeline: { ...base.timeline, end: 24, cycleCount: 24 } };
    const built = buildTypedTransactionProposal(document, 7, "propose_create_transaction", {
      name: "MCP Read",
      start: 4,
      end: 20,
      phases: [{ name: "Address", start: 4, end: 8 }, { name: "Data", start: 8, end: 16 }, { name: "Response", start: 16, end: 20 }],
      linkedSignalIds: ["sig_clk", "sig_data"],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const details = describeAIProposalCommands(document, built.proposal.commands);
    expect(details).toHaveLength(6);
    expect(details.map((item) => item.title)).toEqual([
      "Create Transaction MCP Read",
      "Add Phase Address to MCP Read",
      "Add Phase Data to MCP Read",
      "Add Phase Response to MCP Read",
      "Link Signal CLK to MCP Read",
      "Link Signal DATA to MCP Read",
    ]);
    expect(details[0]?.detail).toMatch(/4–20 source cycles · ID transaction_/);
    expect(details[1]?.detail).toContain("4–8 source cycles");
    expect(details[4]?.detail).toContain("Signal ID sig_clk");
    expect(details[4]?.detail).toContain("Transaction ID transaction_");
  });
});

describe("external MCP setup config", () => {
  it("builds loopback endpoints including IPv6 host syntax", () => {
    expect(buildAIMcpEndpoint("127.0.0.1", 4610)).toBe("http://127.0.0.1:4610/mcp");
    expect(buildAIMcpEndpoint("::1", 4610)).toBe("http://[::1]:4610/mcp");
  });

  it("uses token environment references instead of embedding a secret", () => {
    const endpoint = buildAIMcpEndpoint("127.0.0.1", 4610);
    const codex = buildAIClientConfig("codex", endpoint);
    const claude = JSON.parse(buildAIClientConfig("claude-code", endpoint)) as { mcpServers: Record<string, { url: string; headers: { Authorization: string } }> };
    const generic = JSON.parse(buildAIClientConfig("generic", endpoint)) as { mcpServers: Record<string, { headers: { Authorization: string } }> };
    expect(codex).toContain(`url = "${endpoint}"`);
    expect(codex).toContain('bearer_token_env_var = "TIMING_CHART_MCP_TOKEN"');
    expect(claude.mcpServers["timing-chart"]?.url).toBe(endpoint);
    expect(claude.mcpServers["timing-chart"]?.headers.Authorization).toBe("Bearer ${TIMING_CHART_MCP_TOKEN}");
    expect(generic.mcpServers["timing-chart"]?.headers.Authorization).toBe("Bearer ${TIMING_CHART_MCP_TOKEN}");
  });
});

describe("bridge setup diagnostics", () => {
  it("classifies a missing process separately from a rejected token", () => {
    expect(classifyAIBridgeFailure(new TypeError("Failed to fetch"))).toBe("unavailable");
    expect(classifyAIBridgeFailure(new Error("Bridge rejected the configured token."))).toBe("invalid-token");
    expect(isLoopbackBridgeHost("127.0.0.1")).toBe(true);
    expect(isLoopbackBridgeHost("example.com")).toBe(false);
  });
});
