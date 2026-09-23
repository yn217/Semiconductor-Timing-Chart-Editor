import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Deliberately a *static* source audit, not `import` -- ai-bridge-server.mjs
// calls `server.listen(...)` at module scope (it is a standalone script,
// always run out-of-process via `node scripts/ai-bridge-server.mjs` or the
// spawn in tests/e2e/ai-bridge.spec.ts), so importing it here would bind a
// real socket as a side effect of running the unit test suite.

// #395 PR5 (security-closure pass): the Agent Bridge's own security
// properties are mechanically re-checked here rather than left as
// something only a code comment claims. This complements
// tests/e2e/ai-bridge.spec.ts (which exercises the *behavioral* side --
// wrong token rejected, unknown tool rejected, disconnect/reconnect --
// against a real running process) with a *static* audit of the source
// itself, so a future edit that quietly adds a filesystem/shell escape
// hatch or loosens the localhost binding fails a fast unit test instead
// of only being caught (if at all) by a slower, harder-to-notice e2e
// regression.
const source = readFileSync(resolve(import.meta.dirname, "../../scripts/ai-bridge-server.mjs"), "utf8");

describe("Agent Bridge security boundaries (#395 item 11)", () => {
  it("binds to localhost only, never a wildcard/all-interfaces address", () => {
    expect(source).toMatch(/HOST\s*=\s*["']127\.0\.0\.1["']/);
    // Comments are allowed to mention 0.0.0.0 (this file's own header
    // comment does, precisely to explain why it must never be assigned)
    // -- what must never appear is an actual assignment to it.
    expect(source).not.toMatch(/HOST\s*=\s*["']0\.0\.0\.0["']/);
    expect(source).not.toMatch(/HOST\s*=\s*["']::["']/);
  });

  it("generates a real random token by default and compares it in constant time", () => {
    expect(source).toMatch(/TOKEN\s*=\s*process\.env\.AI_BRIDGE_TOKEN\s*\?\?\s*randomBytes\(\d+\)\.toString\(["']hex["']\)/);
    expect(source).toContain("timingSafeEqual");
  });

  it("imports no filesystem, child-process, or dynamic-code-execution module", () => {
    // Only the modules this bridge actually needs (http transport, and
    // crypto for the token/request-id machinery) may be imported. Any of
    // these appearing would be exactly the "no arbitrary file-system
    // access" / "no arbitrary shell execution" principle (#395 item 11)
    // silently regressing.
    const forbiddenModules = ["fs", "node:fs", "child_process", "node:child_process", "vm", "node:vm", "worker_threads", "node:worker_threads", "net", "node:net", "dgram", "node:dgram"];
    for (const moduleName of forbiddenModules) {
      expect(source, `must not import '${moduleName}'`).not.toMatch(new RegExp(`from\\s+["']${moduleName}["']`));
    }
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/new\s+Function\s*\(/);
  });

  it("exposes only the documented MCP tool whitelist -- nothing generic", () => {
    // tools/call must reject anything outside the explicit
    // READ_TOOLS/VIEW_ONLY_TOOLS/PROPOSAL_TOOLS sets before ever queuing
    // a call for the browser tab to execute -- there is no code path
    // that forwards an arbitrary tool name.
    expect(source).toMatch(/READ_TOOLS\.has\(name\)\s*\|\|\s*VIEW_ONLY_TOOLS\.has\(name\)\s*\|\|\s*PROPOSAL_TOOLS\.has\(name\)/);
    const catalogNames = [...source.matchAll(/name:\s*"([a-z_]+)"/g)].map((match) => match[1]);
    expect(new Set(catalogNames)).toEqual(new Set(["list_editor_sessions", "get_document_summary", "get_view_context", "get_selection", "get_viewport_snapshot", "get_signals", "get_signal", "get_signal_groups", "get_transactions", "get_transaction", "get_transaction_groups", "get_transaction_phases", "get_linked_signals", "get_annotations", "get_bookmarks", "get_time_groups", "get_problems", "fit_all", "propose_edit", "propose_rename_signal", "propose_update_signal", "propose_move_signal", "propose_insert_cycles", "propose_delete_cycles", "propose_move_range", "propose_create_signal_group", "propose_rename_signal_group", "propose_create_transaction", "propose_move_transaction", "propose_resize_transaction", "propose_delete_transaction", "propose_create_bookmark", "propose_move_bookmark", "propose_delete_bookmark", "propose_create_annotation", "propose_update_annotation", "propose_delete_annotation", "propose_add_phase", "propose_update_phase", "propose_delete_phase", "propose_link_signal", "propose_unlink_signal"]));
  });

  it("requires the bearer token on every route, including the poll/respond pair, before any routing decision", () => {
    // The token check must run once, ahead of the /mcp, /bridge/poll and
    // /bridge/respond branches -- not duplicated (and possibly forgotten)
    // per-route.
    const tokenCheckIndex = source.indexOf("timingSafeTokenEquals(bearerToken(req, url))");
    const mcpRouteIndex = source.indexOf('url.pathname === "/mcp"');
    const pollRouteIndex = source.indexOf('url.pathname === "/bridge/poll"');
    const respondRouteIndex = source.indexOf('url.pathname === "/bridge/respond"');
    expect(tokenCheckIndex).toBeGreaterThan(-1);
    expect(tokenCheckIndex).toBeLessThan(mcpRouteIndex);
    expect(tokenCheckIndex).toBeLessThan(pollRouteIndex);
    expect(tokenCheckIndex).toBeLessThan(respondRouteIndex);
  });

  it("binds every pending request and response to an explicit Editor session", () => {
    expect(source).toContain("call.editorSessionId === session.editorSessionId");
    expect(source).toContain("body.editorSessionId !== call.editorSessionId");
    expect(source).toContain("Tool '${name}' requires an explicit editorSessionId");
    expect(source).toContain("requests are never redirected to another tab");
  });

  it("bounds request body size so the bridge cannot be used to exhaust memory", () => {
    expect(source).toMatch(/size\s*>\s*65_?536/);
  });
});
