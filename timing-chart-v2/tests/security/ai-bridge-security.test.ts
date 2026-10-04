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
const capabilityMatrix = readFileSync(resolve(import.meta.dirname, "../../docs/AI_MCP_CAPABILITY_MATRIX.md"), "utf8");

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
    expect(source).toMatch(/EDITOR_TOKEN\s*=\s*process\.env\.AI_BRIDGE_EDITOR_TOKEN\s*\?\?\s*randomBytes\(\d+\)\.toString\(["']hex["']\)/);
    expect(source).toContain("if (TOKEN === EDITOR_TOKEN) throw new Error(");
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
    const addedViewTools = ["fit_selection", "set_selection", "reveal_entity", "switch_mode", "open_panel", "set_visible_time_range", "propose_create_time_group", "propose_update_time_group", "propose_delete_time_group"];
    const existingCatalogNames = catalogNames.filter((name) => !addedViewTools.includes(name));
    expect(new Set(existingCatalogNames)).toEqual(new Set(["list_editor_sessions", "get_document_summary", "get_view_context", "get_selection", "get_viewport_snapshot", "get_signals", "get_signal", "get_signal_groups", "get_transactions", "get_transaction", "get_transaction_groups", "get_transaction_phases", "get_linked_signals", "get_annotations", "get_bookmarks", "get_time_groups", "get_problems", "fit_all", "propose_edit", "submit_proposal", "propose_create_signal", "propose_rename_signal", "propose_update_signal", "propose_move_signal", "propose_insert_cycles", "propose_delete_cycles", "propose_move_range", "propose_duplicate_range", "propose_create_signal_group", "propose_rename_signal_group", "propose_move_signal_group", "propose_delete_signal_group", "propose_create_transaction_group", "propose_rename_transaction_group", "propose_delete_transaction_group", "propose_create_transaction", "propose_update_transaction", "propose_move_transaction", "propose_resize_transaction", "propose_delete_transaction", "propose_create_bookmark", "propose_move_bookmark", "propose_update_bookmark", "propose_delete_bookmark", "propose_create_annotation", "propose_update_annotation", "propose_delete_annotation", "propose_add_phase", "propose_update_phase", "propose_delete_phase", "propose_link_signal", "propose_unlink_signal"]));
    const inventoryLines = capabilityMatrix.split("\n").filter((line) => line.startsWith("`list_editor_sessions") || line.startsWith("`propose_create_time_group") || line.startsWith("`fit_selection") || line.startsWith("`switch_mode`") || line.startsWith("| Set selection / reveal entity |") || line.startsWith("| Multi-operation proposal |"));
    const inventoryNames = inventoryLines.flatMap((line) => [...line.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]));
    expect(inventoryNames.length, "matrix must contain the bridge tool inventory").toBeGreaterThan(0);
    expect(new Set(inventoryNames)).toEqual(new Set(catalogNames));
  });

  it("advertises the Transaction group, lane, and source-range filters to MCP clients", () => {
    const tool = source.match(/\{ name: "get_transactions",[\s\S]*?inputSchema: \{[\s\S]*?\n/);
    expect(tool?.[0]).toContain("groupId: { type: \"string\", minLength: 1 }");
    expect(tool?.[0]).toContain("laneId: { type: \"string\", minLength: 1 }");
    expect(tool?.[0]).toContain("visibleRange: { type: \"object\"");
    expect(tool?.[0]).toContain("start: { type: \"integer\", minimum: 0 }");
    expect(tool?.[0]).toContain("end: { type: \"integer\", minimum: 1 }");
  });

  it("documents semantic type-specific fields for Annotation reads, not pixel geometry", () => {
    const tool = source.match(/\{ name: "get_annotations",[\s\S]*?\n/);
    expect(tool?.[0]).toContain("Measurement profile/kind");
    expect(tool?.[0]).toContain("Ghost Trace source/offset");
    expect(tool?.[0]).toContain("never pixels");
  });

  it("advertises typed Measurement profile and threshold/ratio options", () => {
    const tool = source.match(/\{ name: "propose_create_annotation",[\s\S]*?\n/);
    expect(tool?.[0]).toContain("measurement: { type: \"object\"");
    expect(tool?.[0]).toContain("profile: { type: \"string\", enum: [\"cycle\", \"30-70\", \"10-90\", \"20-80\", \"50%\", \"custom\"] }");
    expect(tool?.[0]).toContain("anchorKind: { type: \"string\", enum: [\"threshold\", \"ratio\"] }");
    expect(tool?.[0]).toContain("startValue: { type: \"number\", minimum: 0, maximum: 1 }");
    expect(tool?.[0]).toContain("endValue: { type: \"number\", minimum: 0, maximum: 1 }");
    expect(tool?.[0]).toContain("additionalProperties: false");
  });

  it("advertises stable Ghost Trace source, cycle offset, and bounded opacity options", () => {
    const tool = source.match(/\{ name: "propose_create_annotation",[\s\S]*?\n/);
    expect(tool?.[0]).toContain("ghostTrace: { type: \"object\"");
    expect(tool?.[0]).toContain("sourceSignalId: { type: \"string\", minLength: 1 }");
    expect(tool?.[0]).toContain("traceOffsetCycles: { type: \"number\" }");
    expect(tool?.[0]).toContain("opacity: { type: \"number\", minimum: 0, maximum: 1 }");
    expect(tool?.[0]).toContain("Ghost Trace options identify its stable sourceSignalId");
    const updateTool = source.match(/\{ name: "propose_update_annotation",[\s\S]*?\n/);
    expect(updateTool?.[0]).toContain("sourceSignalId: { type: \"string\", minLength: 1 }");
    expect(updateTool?.[0]).toContain("traceOffsetCycles: { type: \"number\" }");
    expect(updateTool?.[0]).toContain("opacity: { type: \"number\", minimum: 0, maximum: 1 }");
  });

  it("advertises semantic Annotation anchor updates in source-cycle coordinates", () => {
    const updateTool = source.match(/\{ name: "propose_update_annotation",[\s\S]*?\n/);
    expect(updateTool?.[0]).toContain("anchorField: { type: \"string\", enum: [\"anchor\", \"start\", \"end\", \"from\", \"to\"] }");
    expect(updateTool?.[0]).toContain("anchorCycle: { type: \"integer\", minimum: 0 }");
    expect(updateTool?.[0]).toContain("anchorSignalId: { type: \"string\", minLength: 1 }");
    expect(updateTool?.[0]).toContain("anchorPoint: { type: \"string\", enum:");
    expect(updateTool?.[0]).toContain("canonical source cycles");
    expect(updateTool?.[0]).toContain("measurement: { type: \"object\"");
    expect(updateTool?.[0]).toContain("required: [\"measurement\"]");
  });

  it("uses distinct bearer credentials for MCP and Editor transport routes", () => {
    const routeCredentialIndex = source.indexOf("const expectedToken = url.pathname");
    const tokenCheckIndex = source.indexOf("timingSafeTokenEquals(bearerToken(req), expectedToken)");
    const mcpRouteIndex = source.indexOf('req.method === "POST" && url.pathname === "/mcp"');
    const pollRouteIndex = source.indexOf('req.method === "POST" && url.pathname === "/bridge/poll"');
    const respondRouteIndex = source.indexOf('req.method === "POST" && url.pathname === "/bridge/respond"');
    expect(routeCredentialIndex).toBeGreaterThan(-1);
    expect(routeCredentialIndex).toBeLessThan(tokenCheckIndex);
    expect(tokenCheckIndex).toBeGreaterThan(-1);
    expect(tokenCheckIndex).toBeLessThan(mcpRouteIndex);
    expect(tokenCheckIndex).toBeLessThan(pollRouteIndex);
    expect(tokenCheckIndex).toBeLessThan(respondRouteIndex);
    expect(source).toContain('url.pathname === "/mcp" ? TOKEN');
    expect(source).toContain('"/bridge/poll", "/bridge/respond", "/bridge/close"].includes(url.pathname) ? EDITOR_TOKEN');
    expect(source).not.toContain('searchParams.get("token")');
  });

  it("binds every pending request and response to an explicit Editor session", () => {
    expect(source).toContain("call.editorSessionId === session.editorSessionId");
    expect(source).toContain("body.editorSessionId !== call.editorSessionId");
    expect(source).toContain("Tool '${name}' requires an explicit editorSessionId");
    expect(source).toContain("requests are never redirected to another tab");
    expect(source).not.toContain("removeEditorSession(editorSessionId);\n    throw staleSessionError(editorSessionId);");
  });

  it("bounds request body size so the bridge cannot be used to exhaust memory", () => {
    expect(source).toMatch(/size\s*>\s*65_?536/);
  });
});
