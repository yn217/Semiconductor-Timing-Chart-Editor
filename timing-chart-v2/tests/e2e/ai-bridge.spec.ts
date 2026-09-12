import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";

// #395 PR3: exercises the real local Agent Bridge (scripts/ai-bridge-server.mjs)
// end to end -- spawns the actual bridge process, connects a real browser
// tab to it through the Editor's own Settings UI, then issues genuine HTTP
// JSON-RPC calls against it exactly as an external MCP client would (per
// the issue's own acceptance list: "External bridge can connect a test MCP
// client", "External client can read document summary/selection without
// mutation", "External client can request a view-only operation with
// Canonical/History/Dirty = 0", "Unauthorized MCP capability is rejected").

const PORT = 4610;
const TOKEN = "e2e-test-bridge-token";
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForBridgeReady(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" }) });
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("ai-bridge-server.mjs did not become ready in time.");
}

async function callTool(name: string, token = TOKEN, args?: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  return { status: response.status, body: (await response.json()) as { result?: { content: readonly { text: string }[] }; error?: { code: number; message: string } } };
}

// Both tests in this file spawn a bridge on the Editor's one hardcoded
// port (minimal-cycle-view.tsx's aiBridgePort) -- serial so a second
// test's bridge never tries to bind that same port while the first
// test's is still shutting down.
test.describe.configure({ mode: "serial" });

let bridge: ChildProcess | undefined;

test.beforeEach(async () => {
  bridge = spawn(process.execPath, ["scripts/ai-bridge-server.mjs"], { env: { ...process.env, AI_BRIDGE_PORT: String(PORT), AI_BRIDGE_TOKEN: TOKEN }, stdio: "ignore" });
  await waitForBridgeReady();
});

test.afterEach(() => {
  bridge?.kill();
  bridge = undefined;
});

test("a test MCP client can connect, read the live document/selection, and request a view-only operation with zero Canonical/History/Dirty delta", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveText("Status: Connected", { timeout: 10_000 });
  await expect(page.getByTestId("ai-provider-status")).toContainText("external agent connected");

  // initialize + tools/list, exactly as a real MCP client's handshake would.
  const initResponse = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" }) });
  expect((await initResponse.json()).result.serverInfo.name).toBe("timing-chart-v2-ai-bridge");
  const listResponse = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }) });
  const tools = ((await listResponse.json()).result.tools as { name: string }[]).map((tool) => tool.name);
  expect(tools).toEqual(["get_document_summary", "get_selection", "get_viewport_snapshot", "fit_all", "propose_edit"]);

  // Read-only: reflects the real, live document -- never a canned/fake value.
  const summary = await callTool("get_document_summary");
  const parsedSummary = JSON.parse(summary.body.result!.content[0]!.text) as { title: string; signalCount: number };
  expect(parsedSummary.title).toBe("Sample -- Transaction Mode");
  expect(parsedSummary.signalCount).toBe(8);

  const selection = await callTool("get_selection");
  const parsedSelection = JSON.parse(selection.body.result!.content[0]!.text) as { selectedSignalId: string };
  expect(parsedSelection.selectedSignalId).toBe("sig_cycle_request");

  // #395 PR5: get_viewport_snapshot is read-only too -- a structured
  // Element Map (real stable ids, not pixel coordinates) plus zoom/cycle
  // count/selection, exactly what the issue's own constraint requires an
  // edit to target.
  const viewportSnapshot = await callTool("get_viewport_snapshot");
  const parsedViewportSnapshot = JSON.parse(viewportSnapshot.body.result!.content[0]!.text) as { zoom: number; cycleCount: number; selection: { selectedSignalId: string }; elementMap: readonly { id: string; name: string; role: string; groupId?: string }[] };
  expect(parsedViewportSnapshot.cycleCount).toBe(160);
  expect(parsedViewportSnapshot.selection.selectedSignalId).toBe("sig_cycle_request");
  expect(parsedViewportSnapshot.elementMap).toContainEqual(expect.objectContaining({ id: "sig_cycle_request", name: "REQUEST", role: "input" }));
  expect(parsedViewportSnapshot.elementMap.length).toBe(parsedSummary.signalCount);

  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };

  // View-only: a real effect (the timeline actually fits), zero mutation.
  const fitAll = await callTool("fit_all");
  expect(fitAll.body.result!.isError).toBe(false);
  const parsedFitAll = JSON.parse(fitAll.body.result!.content[0]!.text) as { applied: boolean; canonicalDelta: number; historyDelta: number; dirtyDelta: number };
  expect(parsedFitAll).toEqual({ applied: true, canonicalDelta: 0, historyDelta: 0, dirtyDelta: 0 });
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});

test("propose_edit builds a Preview only -- it never auto-validates or auto-applies, and a human must still Validate + Apply it themselves", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveText("Status: Connected", { timeout: 10_000 });

  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };

  const proposeEdit = await callTool("propose_edit", TOKEN, { query: "rename selected signal to REQ" });
  expect(proposeEdit.body.result!.isError).toBe(false);
  const parsedProposeEdit = JSON.parse(proposeEdit.body.result!.content[0]!.text) as { summary: string; baseRevision: number; kind: string; requiresApproval: boolean; message: string };
  expect(parsedProposeEdit).toEqual({ summary: "Rename REQUEST to REQ", baseRevision: 0, kind: "semantic-command", requiresApproval: true, message: "Proposal ready for review -- open the AI Assistant panel to Validate and Apply it." });

  // A Preview was built -- but it is only a Preview: zero Canonical/History/
  // Dirty delta so far, exactly as if nobody had clicked anything.
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(ai).toContainText("Proposal ready for review (submitted by external agent)");
  await expect(ai).toContainText("Rename REQUEST to REQ");
  const activityLog = ai.getByTestId("ai-activity-log");
  await expect(activityLog).toContainText("External agent");

  // A human must still explicitly Validate + Apply -- propose_edit itself
  // never does either.
  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(before.revision) + 1));
});

test("an unauthorized propose_edit call (bad token) never reaches the document, and an empty query is rejected before building any proposal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveText("Status: Connected", { timeout: 10_000 });

  const unauthorized = await callTool("propose_edit", "wrong-token", { query: "rename selected signal to REQ" });
  expect(unauthorized.status).toBe(401);

  const emptyQuery = await callTool("propose_edit", TOKEN, { query: "   " });
  expect(emptyQuery.body.error?.code).toBe(-32000);
  expect(emptyQuery.body.error?.message).toContain("non-empty");
});

test("rejects a request with an invalid token, and rejects any tool outside the exposed whitelist", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveText("Status: Connected", { timeout: 10_000 });

  const unauthorized = await callTool("get_document_summary", "wrong-token");
  expect(unauthorized.status).toBe(401);

  const unknownTool = await callTool("delete_everything");
  expect(unknownTool.body.error?.code).toBe(-32601);
  expect(unknownTool.body.error?.message).toContain("Unknown or unauthorized tool");

  // Never claims a connection it doesn't have -- an unenabled/disabled
  // client can't even reach the endpoints above being reachable at all
  // says nothing about *this specific page's* honesty, so also confirm
  // the Settings status itself never shows Connected for a bad token.
  await settings.getByLabel("Bridge connection token").fill("wrong-token");
  await settings.getByLabel("Enable external agents").uncheck();
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveText(/Disconnected/, { timeout: 10_000 });
});

// #395 PR5 (real-client E2E/security closure, acceptance item 15):
// "Bridge disconnect/reconnect is surfaced truthfully in the Ribbon/
// Settings." -- kills the real bridge process out from under an already-
// connected browser tab, confirms the Settings status stops claiming
// "Connected" once polling starts failing, then respawns a real bridge on
// the same port/token and confirms the same tab recovers on its own
// (no page reload, no re-entering the token) purely from its existing
// poll loop's own retry.
test("bridge disconnect is surfaced truthfully, and the same tab recovers on its own once the bridge comes back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveText("Status: Connected", { timeout: 10_000 });

  bridge?.kill();
  bridge = undefined;
  await expect(ai.getByTestId("ai-bridge-status")).not.toHaveText("Status: Connected", { timeout: 10_000 });

  bridge = spawn(process.execPath, ["scripts/ai-bridge-server.mjs"], { env: { ...process.env, AI_BRIDGE_PORT: String(PORT), AI_BRIDGE_TOKEN: TOKEN }, stdio: "ignore" });
  await waitForBridgeReady();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveText("Status: Connected", { timeout: 10_000 });

  // The recovered connection is not just a status label -- it is a real,
  // working connection again.
  const summary = await callTool("get_document_summary");
  expect(JSON.parse(summary.body.result!.content[0]!.text).signalCount).toBe(8);
});
