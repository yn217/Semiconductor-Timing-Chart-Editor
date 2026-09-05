#!/usr/bin/env node
// #395 PR3: a small local Agent Bridge -- localhost-only, token-gated,
// exposing exactly the whitelisted read/view-only MCP tools this file
// implements below. No arbitrary Canonical JSON patch endpoint, no
// filesystem access, no shell execution: this process only ever relays a
// fixed set of named tool calls to a connected browser tab (which
// executes them against its own live document state) and returns
// whatever that tab reports back.
//
// Transport: a minimal HTTP JSON-RPC 2.0 surface (MCP's "Streamable
// HTTP" transport, simplified to one request per call rather than a
// persistent SSE session) for the MCP client side, plus a short-poll
// HTTP pair (/bridge/poll, /bridge/respond) the browser tab uses to pick
// up pending tool calls and post results back. Every request on every
// endpoint must carry the same bearer token this process generates (or
// is given) at startup; anything else is rejected with 401.
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const HOST = "127.0.0.1"; // never 0.0.0.0 -- localhost-only by construction.
const PORT = Number(process.env.AI_BRIDGE_PORT ?? 4610);
const TOKEN = process.env.AI_BRIDGE_TOKEN ?? randomBytes(24).toString("hex");
const POLL_TIMEOUT_MS = 25_000;

// #395 item 4 (MCP Tool Surface): the exact whitelist. Nothing outside
// this list can ever be invoked, regardless of what a client sends --
// tools/call rejects any name not in this map before it is ever queued
// for the browser.
const READ_TOOLS = new Set(["get_document_summary", "get_selection", "get_viewport_snapshot"]);
const VIEW_ONLY_TOOLS = new Set(["fit_all"]);
// #395 PR4: propose_edit is the one tool that reaches into document-changing
// territory, but it still only ever builds a Preview (identical to the user
// typing the same query and clicking Preview themselves) -- it never
// validates or applies on its own. There is deliberately no bridge-side
// "apply" tool for a document-changing proposal at all: a human must open
// the AI Assistant panel and manually Validate + Apply it.
const PROPOSAL_TOOLS = new Set(["propose_edit"]);
const TOOL_CATALOG = [
  { name: "get_document_summary", description: "Read-only summary of the current document (title, signal/annotation/transaction counts, timeline length). Never mutates anything." },
  { name: "get_selection", description: "Read-only current selection (selected Signal/Group/Annotation/Transaction id, if any). Never mutates anything." },
  { name: "get_viewport_snapshot", description: "Read-only structured Element Map: every signal's stable id, name, role, type, group, split-pane assignment and visibility, plus current selection, zoom and cycle count. Does not include a raw pixel image -- edits must target the stable ids returned here, never pixel coordinates. Never mutates anything." },
  { name: "fit_all", description: "View-only: fit the complete timeline into the viewport. Canonical/History/Dirty delta is always 0." },
  { name: "propose_edit", description: "Submit a document-changing edit request as a Preview only -- it is never auto-validated or auto-applied. A human must open the AI Assistant panel and manually Validate + Apply it. Takes a single 'query' string argument." },
];

function timingSafeTokenEquals(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(req, url) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return url.searchParams.get("token") ?? undefined;
}

// Deliberately simple: no long-poll/waiter matching. /bridge/poll always
// answers immediately (queued call or null); the browser tab is
// responsible for polling on its own short interval (see
// ai-bridge-client.ts). This trades a little latency for a design with no
// concurrent-request races to get right.
/** Not-yet-dispatched calls, in arrival order. */
const queuedCalls = [];
/** Dispatched to a poller, awaiting /bridge/respond, keyed by requestId. */
const inFlightCalls = new Map();

function removeEverywhere(requestId) {
  const index = queuedCalls.findIndex((call) => call.requestId === requestId);
  if (index >= 0) queuedCalls.splice(index, 1);
  inFlightCalls.delete(requestId);
}

function queueToolCall(tool, args) {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const timeout = setTimeout(() => {
      removeEverywhere(requestId);
      reject(new Error("Timed out waiting for the connected browser tab to respond (is a browser tab actually connected with the bridge enabled?)."));
    }, POLL_TIMEOUT_MS);
    queuedCalls.push({ requestId, tool, args: args ?? {}, resolve, reject, timeout });
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65_536) { reject(new Error("Request body too large.")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) { resolve(undefined); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); } catch { reject(new Error("Invalid JSON body.")); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

async function handleMcp(res, body) {
  const { id, method, params } = body ?? {};
  const reply = (result) => sendJson(res, 200, { jsonrpc: "2.0", id: id ?? null, result });
  const replyError = (code, message) => sendJson(res, 200, { jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (method === "initialize") { reply({ protocolVersion: "2024-11-05", serverInfo: { name: "timing-chart-v2-ai-bridge", version: "0.0.1" }, capabilities: { tools: {} } }); return; }
  if (method === "tools/list") { reply({ tools: TOOL_CATALOG }); return; }
  if (method === "tools/call") {
    const name = params?.name;
    if (typeof name !== "string" || !(READ_TOOLS.has(name) || VIEW_ONLY_TOOLS.has(name) || PROPOSAL_TOOLS.has(name))) { replyError(-32601, `Unknown or unauthorized tool '${name}'. Only ${[...READ_TOOLS, ...VIEW_ONLY_TOOLS, ...PROPOSAL_TOOLS].join(", ")} are exposed.`); return; }
    try {
      const result = await queueToolCall(name, params?.arguments);
      reply({ content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
    } catch (error) {
      replyError(-32000, error instanceof Error ? error.message : "Tool call failed.");
    }
    return;
  }
  replyError(-32601, `Unknown method '${method}'.`);
}

// The Editor tab (served from Vite's own localhost:<dev-port> origin) is
// cross-origin from this bridge, so the browser sends a CORS preflight
// before every request. `*` is safe to allow here specifically because
// this process never trusts origin/referer for authorization -- every
// real request still needs the bearer token below, which a page on an
// unrelated origin has no way to know; CORS only ever gates the
// *transport*, not the actual authorization decision.
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
}

const server = createServer(async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  if (!timingSafeTokenEquals(bearerToken(req, url))) { sendJson(res, 401, { error: "Missing or invalid bridge token." }); return; }

  if (req.method === "POST" && url.pathname === "/mcp") {
    let body;
    try { body = await readJsonBody(req); } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : "Bad request." }); return; }
    await handleMcp(res, body);
    return;
  }

  if (req.method === "GET" && url.pathname === "/bridge/poll") {
    const next = queuedCalls.shift();
    if (next) {
      inFlightCalls.set(next.requestId, next);
      sendJson(res, 200, { requestId: next.requestId, tool: next.tool, arguments: next.args });
      return;
    }
    sendJson(res, 200, { requestId: null });
    return;
  }

  if (req.method === "POST" && url.pathname === "/bridge/respond") {
    let body;
    try { body = await readJsonBody(req); } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : "Bad request." }); return; }
    const call = typeof body?.requestId === "string" ? inFlightCalls.get(body.requestId) : undefined;
    if (!call) { sendJson(res, 404, { error: "Unknown or already-resolved requestId." }); return; }
    removeEverywhere(body.requestId);
    clearTimeout(call.timeout);
    if (body.error) call.reject(new Error(String(body.error)));
    else call.resolve(body.result);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[ai-bridge] listening on http://${HOST}:${PORT} (localhost-only)`);
  console.log(`[ai-bridge] token: ${TOKEN}`);
  console.log("[ai-bridge] paste this token into the Editor's AI Settings > Agent Connection to authorize a browser tab.");
});

export { HOST, PORT, TOKEN, server };
