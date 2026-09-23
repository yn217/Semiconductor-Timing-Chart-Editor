export type AIClientSetup = "codex" | "claude-code" | "generic";

export function buildAIMcpEndpoint(host: string, port: number): string {
  const urlHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${urlHost}:${port}/mcp`;
}

export function buildAIClientConfig(client: AIClientSetup, endpoint: string): string {
  if (client === "codex") return `[mcp_servers.timing_chart]\nurl = "${endpoint}"\nbearer_token_env_var = "TIMING_CHART_MCP_TOKEN"`;
  return JSON.stringify({ mcpServers: { "timing-chart": { type: "http", url: endpoint, headers: { Authorization: "Bearer ${TIMING_CHART_MCP_TOKEN}" } } } }, null, 2);
}
