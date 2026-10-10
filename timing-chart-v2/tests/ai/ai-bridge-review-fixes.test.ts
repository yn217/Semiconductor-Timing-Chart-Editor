import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBridgeRespondBody, AI_BRIDGE_RESPOND_BODY_LIMIT_BYTES, toBridgeToolOutcome } from "../../apps/editor/src/ai-bridge-client.js";
import { scopeViolationMessage } from "../../apps/editor/src/ai-operation-panel.js";
import { canonicalFixture } from "../fixtures/canonical.js";

type Command = Parameters<typeof scopeViolationMessage>[2];
type Document = Parameters<typeof scopeViolationMessage>[1];

const command = (value: Record<string, unknown>): Command => ({ id: "cmd_test", ...value }) as unknown as Command;
const document = (): Document => canonicalFixture() as unknown as Document;

describe("Selection scope fails closed", () => {
  it("leaves every command unrestricted under Document scope", () => {
    expect(scopeViolationMessage("document", document(), command({ type: "timeline.insert", at: 4, count: 2 }), undefined, undefined, undefined, undefined)).toBeUndefined();
  });

  it("refuses timeline, bookmark, time-group and creation commands under Selection scope", () => {
    const refused = [
      { type: "timeline.insert", at: 4, count: 2 },
      { type: "timeline.delete", start: 1, end: 3 },
      { type: "timeline.moveRange", start: 1, end: 3, to: 6 },
      { type: "bookmark.create", bookmark: { id: "bm_1", name: "B", start: 4 } },
      { type: "timeGroup.create", timeGroup: { id: "tg_1", name: "T", start: 0, end: 4 } },
      { type: "signal.create", signal: { id: "sig_new" }, targetGroupId: "grp_a", index: 0 },
      { type: "transaction.create", transaction: { id: "txn_new" } },
      { type: "signal.bulkDelete", signalIds: ["sig_clk"] },
    ];
    for (const value of refused) {
      const message = scopeViolationMessage("selection", document(), command(value), "sig_clk", undefined, undefined, undefined);
      expect(message, value.type).toContain("not allowed under the Selection scope");
    }
  });

  it("allows an edit only when its target is the selected entity", () => {
    expect(scopeViolationMessage("selection", document(), command({ type: "signal.rename", signalId: "sig_clk", name: "CLK2" }), "sig_clk", undefined, undefined, undefined)).toBeUndefined();
    expect(scopeViolationMessage("selection", document(), command({ type: "signal.rename", signalId: "sig_other", name: "X" }), "sig_clk", undefined, undefined, undefined)).toContain("outside the Selection scope");
    expect(scopeViolationMessage("selection", document(), command({ type: "signal.rename", signalId: "sig_clk", name: "X" }), undefined, undefined, undefined, undefined)).toContain("outside the Selection scope");
    expect(scopeViolationMessage("selection", document(), command({ type: "transaction.update", transactionId: "txn_a", name: "N", start: 0, end: 2 }), undefined, undefined, undefined, "txn_a")).toBeUndefined();
    expect(scopeViolationMessage("selection", document(), command({ type: "transaction.update", transactionId: "txn_a", name: "N", start: 0, end: 2 }), undefined, undefined, undefined, undefined)).toContain("outside the Selection scope");
    expect(scopeViolationMessage("selection", document(), command({ type: "group.rename", groupId: "grp_a", name: "G" }), undefined, "grp_a", undefined, undefined)).toBeUndefined();
  });
});

describe("Bridge tool outcomes", () => {
  it("turns a bare rejection object into an error outcome", () => {
    expect(toBridgeToolOutcome({ error: "Scope refused" })).toEqual({ error: "Scope refused" });
  });

  it("keeps a successful proposal summary as a result", () => {
    const summary = { summary: "Rename", baseRevision: 3, kind: "proposal", requiresApproval: true, message: "Review it." };
    expect(toBridgeToolOutcome(summary)).toEqual({ result: summary });
  });

  it("keeps ordinary read results as results", () => {
    expect(toBridgeToolOutcome({ signals: [] })).toEqual({ result: { signals: [] } });
  });

  it("sends the error field to the bridge when a tool fails", () => {
    const body = JSON.parse(buildBridgeRespondBody("req-1", "ses-1", { error: "Scope refused" }));
    expect(body).toEqual({ requestId: "req-1", editorSessionId: "ses-1", error: "Scope refused" });
  });

  it("replaces an oversize result with a clear error instead of sending it", () => {
    const huge = { text: "x".repeat(AI_BRIDGE_RESPOND_BODY_LIMIT_BYTES + 1024) };
    const body = JSON.parse(buildBridgeRespondBody("req-2", "ses-2", { result: huge }));
    expect(body.result).toBeUndefined();
    expect(body.error).toContain("bridge limit");
  });
});

// The transport tests run the real bridge as a child process on a random port,
// the same way tests/ai-bridge-session.test.ts does.
const token = `review-fix-${randomUUID()}`;
const editorToken = `review-fix-editor-${randomUUID()}`;
let bridge: ChildProcess | undefined;
let baseUrl = "";
let stdout = "";

type EditorSession = { tabId: string; editorSessionId: string; documentId: string; documentTitle: string };

function newSession(label: string): EditorSession {
  return { tabId: `${label}-${randomUUID()}`, editorSessionId: `${label}-session-${randomUUID()}`, documentId: `${label}-doc-${randomUUID()}`, documentTitle: label };
}

async function startBridge(): Promise<void> {
  bridge = spawn(process.execPath, ["scripts/ai-bridge-server.mjs"], {
    env: { ...process.env, AI_BRIDGE_PORT: "0", AI_BRIDGE_TOKEN: token, AI_BRIDGE_EDITOR_TOKEN: editorToken },
    stdio: ["ignore", "pipe", "pipe"],
  });
  bridge.stdout?.setEncoding("utf8");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Agent Bridge did not start. stdout=${stdout}`)), 10_000);
    bridge?.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      // Resolve only after the last startup line, so stdout holds the full banner.
      const match = stdout.match(/listening on http:\/\/127\.0\.0\.1:(\d+)[\s\S]*Use the MCP client token/);
      if (!match) return;
      clearTimeout(timer);
      baseUrl = `http://127.0.0.1:${match[1]}`;
      resolve();
    });
    bridge?.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Agent Bridge exited before listening (code=${code}).`)); });
  });
}

async function registerEditor(editor: EditorSession) {
  const response = await fetch(`${baseUrl}/bridge/poll`, {
    method: "POST",
    headers: { authorization: `Bearer ${editorToken}`, "content-type": "application/json" },
    body: JSON.stringify({ ...editor, mode: "Combined", revision: 1, cycleCount: 16, signalCount: 2, transactionCount: 0, annotationCount: 0, bookmarkCount: 0 }),
  });
  return response.json() as Promise<{ requestId: string | null }>;
}

async function waitForRequest(editor: EditorSession): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const poll = await registerEditor(editor);
    if (poll.requestId) return poll.requestId;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The MCP call never reached the Editor session.");
}

function startMcpCall(name: string, args: Record<string, unknown>): Promise<{ result?: { content?: { text: string }[]; isError?: boolean }; error?: { code: number; message: string } }> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method: "tools/call", params: { name, arguments: args } }),
  }).then((response) => response.json());
}

async function respond(editor: EditorSession, requestId: string, payload: Record<string, unknown>) {
  return fetch(`${baseUrl}/bridge/respond`, {
    method: "POST",
    headers: { authorization: `Bearer ${editorToken}`, "content-type": "application/json" },
    body: JSON.stringify({ requestId, editorSessionId: editor.editorSessionId, ...payload }),
  });
}

describe("Agent Bridge transport limits and error propagation", () => {
  beforeAll(startBridge);
  afterAll(async () => {
    if (!bridge) return;
    bridge.kill();
    await new Promise<void>((resolve) => bridge?.once("exit", () => resolve()));
    bridge = undefined;
  });

  it("delivers a tool result larger than 64 KB to the MCP caller", async () => {
    const editor = newSession("large-result");
    await registerEditor(editor);
    const pending = startMcpCall("get_document_summary", { editorSessionId: editor.editorSessionId });
    const requestId = await waitForRequest(editor);
    const response = await respond(editor, requestId, { result: { title: "big", text: "x".repeat(300_000) } });
    expect(response.status).toBe(200);
    const rpc = await pending;
    expect(rpc.result?.isError).toBe(false);
    expect(JSON.parse(rpc.result!.content![0]!.text).text).toHaveLength(300_000);
  });

  it("answers an oversize respond with a clear isError result instead of a dead socket", async () => {
    const editor = newSession("oversize-result");
    await registerEditor(editor);
    const pending = startMcpCall("get_document_summary", { editorSessionId: editor.editorSessionId });
    const requestId = await waitForRequest(editor);
    const response = await respond(editor, requestId, { result: { text: "x".repeat(AI_BRIDGE_RESPOND_BODY_LIMIT_BYTES + 1024) } });
    expect(response.status).toBe(413);
    const rpc = await pending;
    expect(rpc.result?.isError).toBe(true);
    expect(rpc.result?.content?.[0]?.text).toContain("bridge limit");
  });

  it("reports a rejected Editor tool call to the MCP caller as isError true", async () => {
    const editor = newSession("rejected-proposal");
    await registerEditor(editor);
    const pending = startMcpCall("propose_edit", { editorSessionId: editor.editorSessionId, query: "rename selected signal" });
    const requestId = await waitForRequest(editor);
    expect((await respond(editor, requestId, { error: "Timeline edits are outside the Selection scope." })).status).toBe(200);
    const rpc = await pending;
    expect(rpc.error).toBeUndefined();
    expect(rpc.result?.isError).toBe(true);
    expect(rpc.result?.content?.[0]?.text).toBe("Timeline edits are outside the Selection scope.");
  });

  it("answers an oversize request body with 413 JSON instead of resetting the socket", async () => {
    const editor = newSession("oversize-request");
    const response = await fetch(`${baseUrl}/bridge/poll`, {
      method: "POST",
      headers: { authorization: `Bearer ${editorToken}`, "content-type": "application/json" },
      body: JSON.stringify({ ...editor, padding: "x".repeat(100_000) }),
    });
    expect(response.status).toBe(413);
    expect((await response.json()).error).toContain("limit");
  });

  it("does not echo an environment-supplied token to stdout", () => {
    expect(stdout).toContain("not echoed");
    expect(stdout).not.toContain(token);
    expect(stdout).not.toContain(editorToken);
  });
});
