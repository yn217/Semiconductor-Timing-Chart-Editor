import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isLoopbackBridgeHost } from "../../apps/editor/src/ai-bridge-client.js";

// #569: AI is used through subscription/account-authenticated external agents via the local Agent
// Bridge. The Editor never holds a provider API key or calls a usage-billed provider API itself.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("AI provider policy (#569)", () => {
  it("has no usage-billed provider endpoint or API-key handling in the Editor source", () => {
    const forbidden = /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|\bapiKey\b|\bapi_key\b/i;
    const hits = sourceFiles(resolve(import.meta.dirname, "../../apps/editor/src")).filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("only allows a loopback Agent Bridge host", () => {
    for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]"]) expect(isLoopbackBridgeHost(host), host).toBe(true);
    for (const host of ["0.0.0.0", "example.com", "api.openai.com", "192.168.1.5", "127.0.0.1.evil.com", ""]) expect(isLoopbackBridgeHost(host), host).toBe(false);
  });
});
