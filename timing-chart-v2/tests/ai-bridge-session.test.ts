import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type RpcResponse = { result?: { content?: readonly { text: string }[]; isError?: boolean }; error?: { code: number; message: string } };
type EditorSession = { tabId: string; editorSessionId: string; documentId: string; documentTitle: string };

const token = `session-test-${randomUUID()}`;
let bridge: ChildProcess | undefined;
let baseUrl: string;
let stderr = "";

async function startBridge(): Promise<void> {
  bridge = spawn(process.execPath, ["scripts/ai-bridge-server.mjs"], {
    env: { ...process.env, AI_BRIDGE_PORT: "0", AI_BRIDGE_TOKEN: token },
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
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function registerEditor(sessionInfo: EditorSession) {
  const response = await post("/bridge/poll", { ...sessionInfo, mode: "Combined", revision: 3, cycleCount: 160, signalCount: 8, transactionCount: 2, annotationCount: 1, bookmarkCount: 1 });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ requestId: string | null; editorSessionId: string }>;
}

async function callTool(name: string, args: Record<string, unknown>) {
  const response = await post("/mcp", { jsonrpc: "2.0", id: randomUUID(), method: "tools/call", params: { name, arguments: args } });
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
});
