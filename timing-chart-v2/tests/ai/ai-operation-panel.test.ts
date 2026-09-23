import { describe, expect, it } from "vitest";
import { isAIPreviewFresh } from "../../apps/editor/src/ai-operation-panel.js";
import { buildAIClientConfig, buildAIMcpEndpoint } from "../../apps/editor/src/ai-connection-guide.js";
import { classifyAIBridgeFailure, isLoopbackBridgeHost } from "../../apps/editor/src/ai-bridge-client.js";

describe("AI document-scoped freshness", () => {
  it("rejects same-revision proposals from an older document epoch synchronously", () => {
    expect(isAIPreviewFresh({ proposalEpoch: 4, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(false);
    expect(isAIPreviewFresh({ proposalEpoch: 5, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(true);
  });

  it("requires both the shared epoch and revision for a validated Apply", () => {
    expect(isAIPreviewFresh({ proposalEpoch: undefined, currentEpoch: 5, proposalRevision: 7, currentRevision: 7 })).toBe(false);
    expect(isAIPreviewFresh({ proposalEpoch: 5, currentEpoch: 5, proposalRevision: 6, currentRevision: 7 })).toBe(false);
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
