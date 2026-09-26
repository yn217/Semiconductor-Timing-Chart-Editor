import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeAIBridge } from "../apps/editor/src/ai-bridge-client.js";

type RpcResponse = { result?: { content?: readonly { text: string }[]; isError?: boolean }; error?: { code: number; message: string } };
type EditorSession = { tabId: string; editorSessionId: string; documentId: string; documentTitle: string };

const token = `session-test-${randomUUID()}`;
const editorToken = `editor-session-test-${randomUUID()}`;
let bridge: ChildProcess | undefined;
let baseUrl: string;
let stderr = "";

async function startBridge(): Promise<void> {
  bridge = spawn(process.execPath, ["scripts/ai-bridge-server.mjs"], {
    env: { ...process.env, AI_BRIDGE_PORT: "0", AI_BRIDGE_TOKEN: token, AI_BRIDGE_EDITOR_TOKEN: editorToken },
    stdio: ["ignore", "pipe", "pipe"],
  });
  bridge.stderr?.setEncoding("utf8");
  bridge.stderr?.on("data", (chunk: string) => { stderr += chunk; });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Agent Bridge did not start. stderr=${stderr}`)), 10_000);
    bridge?.stdout?.setEncoding("utf8");
    bridge?.stdout?.on("data", (chunk: string) => {
      output += chunk;
      const match = output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      baseUrl = `http://127.0.0.1:${match[1]}`;
      resolve();
    });
    bridge?.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`Agent Bridge exited before listening (code=${code}, signal=${signal}). stderr=${stderr}`));
    });
  });
}

function session(tabLabel: string, documentLabel = tabLabel): EditorSession {
  return {
    tabId: `${tabLabel}-${randomUUID()}`,
    editorSessionId: `${tabLabel}-session-${randomUUID()}`,
    documentId: `${documentLabel}-document-${randomUUID()}`,
    documentTitle: `Document ${documentLabel}`,
  };
}

async function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${editorToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function registerEditor(sessionInfo: EditorSession) {
  const response = await post("/bridge/poll", { ...sessionInfo, mode: "Combined", revision: 3, cycleCount: 160, signalCount: 8, transactionCount: 2, annotationCount: 1, bookmarkCount: 1 });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ requestId: string | null; editorSessionId: string }>;
}

async function callTool(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method: "tools/call", params: { name, arguments: args } }) });
  return response.json() as Promise<RpcResponse>;
}

async function waitForTargetedCall(target: EditorSession, other: EditorSession) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const otherPoll = await registerEditor(other);
    expect(otherPoll.requestId, "another tab must not consume the targeted MCP request").toBeNull();
    const targetPoll = await registerEditor(target);
    if (targetPoll.requestId) return targetPoll;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No call reached targeted session ${target.editorSessionId}.`);
}

describe("Agent Bridge Editor-session routing", () => {
  beforeAll(startBridge);
  afterAll(async () => {
    if (!bridge) return;
    bridge.kill();
    await new Promise<void>((resolve) => bridge?.once("exit", () => resolve()));
    bridge = undefined;
  });

  it("supports a loopback-only, no-secret setup liveness probe", async () => {
    const port = Number(new URL(baseUrl).port);
    expect(await probeAIBridge("127.0.0.1", port)).toBe(true);
    expect(await probeAIBridge("example.com", port)).toBe(false);
    const response = await fetch(`${baseUrl}/bridge/poll`, { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("separates MCP and Editor credentials and rejects query-string tokens", async () => {
    const editor = session("auth-tab");
    for (const path of ["/bridge/poll", "/bridge/respond", "/bridge/close"]) {
      const rejected = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(editor) });
      expect(rejected.status, `MCP token must not authorize ${path}`).toBe(401);
    }
    const editorOnMcp = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { authorization: `Bearer ${editorToken}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) });
    expect(editorOnMcp.status).toBe(401);
    const queryToken = await fetch(`${baseUrl}/mcp?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize" }) });
    expect(queryToken.status).toBe(401);
    const queryEditorToken = await fetch(`${baseUrl}/bridge/poll?token=${encodeURIComponent(editorToken)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editor) });
    expect(queryEditorToken.status).toBe(401);
  });

  it("refuses a startup configuration that collapses the two credential roles", async () => {
    const duplicate = `same-role-${randomUUID()}`;
    const child = spawn(process.execPath, ["scripts/ai-bridge-server.mjs"], {
      env: { ...process.env, AI_BRIDGE_PORT: "0", AI_BRIDGE_TOKEN: duplicate, AI_BRIDGE_EDITOR_TOKEN: duplicate },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let childError = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { childError += chunk; });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("Bridge with duplicate credential roles did not exit.")); }, 5_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
    });
    expect(exitCode).toBe(1);
    expect(childError).toContain("must be different credentials");
  });

  it("lists live sessions and sends a read call only to the explicitly selected document", async () => {
    const editorA = session("tab-a", "A");
    const editorB = session("tab-b", "B");
    await registerEditor(editorA);
    await registerEditor(editorB);

    const listed = await callTool("list_editor_sessions", {});
    const live = JSON.parse(listed.result!.content![0]!.text) as { editorSessionId: string; documentTitle: string; mode: string }[];
    expect(live).toEqual(expect.arrayContaining([
      expect.objectContaining({ editorSessionId: editorA.editorSessionId, documentTitle: editorA.documentTitle, mode: "Combined" }),
      expect.objectContaining({ editorSessionId: editorB.editorSessionId, documentTitle: editorB.documentTitle, mode: "Combined" }),
    ]));

    const missingTarget = await callTool("get_document_summary", {});
    expect(missingTarget.error?.code).toBe(-32602);
    const staleTarget = await callTool("get_document_summary", { editorSessionId: "closed-editor-session" });
    expect(staleTarget.error?.code).toBe(-32004);
    expect(staleTarget.error?.message).toContain("never redirected to another tab");

    const pendingCall = callTool("get_document_summary", { editorSessionId: editorB.editorSessionId });
    const request = await waitForTargetedCall(editorB, editorA);
    const response = await post("/bridge/respond", {
      requestId: request.requestId,
      editorSessionId: editorB.editorSessionId,
      result: { title: editorB.documentTitle, documentId: editorB.documentId },
    });
    expect(response.status).toBe(200);
    const resolved = await pendingCall;
    expect(JSON.parse(resolved.result!.content![0]!.text)).toEqual({ title: editorB.documentTitle, documentId: editorB.documentId });
  });

  it("rejects queued or in-flight calls when a tab replaces or closes its targeted session", async () => {
    const oldSession = session("replace-tab", "old");
    const unrelatedSession = session("unrelated-tab", "unrelated");
    await registerEditor(oldSession);
    await registerEditor(unrelatedSession);

    const pendingOld = callTool("propose_edit", { editorSessionId: oldSession.editorSessionId, query: "rename selected signal" });
    const dispatched = await waitForTargetedCall(oldSession, unrelatedSession);
    const newSession: EditorSession = { ...session("replace-tab", "new"), tabId: oldSession.tabId };
    await registerEditor(newSession);
    const replacedResult = await pendingOld;
    expect(replacedResult.error?.code).toBe(-32004);
    expect(replacedResult.error?.message).toContain("stale or unavailable");

    const lateResponse = await post("/bridge/respond", { requestId: dispatched.requestId, editorSessionId: oldSession.editorSessionId, result: { applied: true } });
    expect(lateResponse.status).toBe(404);
    expect((await registerEditor(unrelatedSession)).requestId).toBeNull();

    const pendingClose = callTool("get_selection", { editorSessionId: newSession.editorSessionId });
    const closeRequest = await waitForTargetedCall(newSession, unrelatedSession);
    const closeResponse = await post("/bridge/close", { tabId: newSession.tabId, editorSessionId: newSession.editorSessionId });
    expect(closeResponse.status).toBe(200);
    expect((await closeResponse.json()).closed).toBe(true);
    const closedResult = await pendingClose;
    expect(closedResult.error?.code).toBe(-32004);
    expect(closedResult.error?.message).toContain("stale or unavailable");
    expect((await post("/bridge/respond", { requestId: closeRequest.requestId, editorSessionId: newSession.editorSessionId, result: {} })).status).toBe(404);
    expect((await callTool("list_editor_sessions", {})).result!.content![0]!.text).not.toContain(newSession.editorSessionId);
  });

  it("does not evict a live Editor session when a mismatched tab claims its stable session ID", async () => {
    const editor = session("legitimate-tab", "legitimate-document");
    await registerEditor(editor);
    const attacker = { ...editor, tabId: "different-tab", documentId: "different-document" };
    const rejected = await post("/bridge/poll", attacker);
    expect(rejected.status).toBe(400);
    const listed = await callTool("list_editor_sessions", {});
    expect(listed.result?.content?.[0]?.text).toContain(editor.editorSessionId);
    expect((await registerEditor(editor)).editorSessionId).toBe(editor.editorSessionId);
  });
});
