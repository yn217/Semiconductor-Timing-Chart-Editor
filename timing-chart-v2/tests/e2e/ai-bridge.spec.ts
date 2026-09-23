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
  let editorSessionId = args?.editorSessionId;
  if (name !== "list_editor_sessions" && typeof editorSessionId !== "string") {
    const sessionsResponse = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/call", params: { name: "list_editor_sessions", arguments: {} } }) });
    if (!sessionsResponse.ok) return { status: sessionsResponse.status, body: await sessionsResponse.json() as { result?: { content: readonly { text: string }[] }; error?: { code: number; message: string } } };
    const sessionResult = (await sessionsResponse.json() as { result: { content: readonly { text: string }[] } }).result;
    const sessions = JSON.parse(sessionResult.content[0]!.text) as { editorSessionId: string }[];
    editorSessionId = sessions[0]?.editorSessionId;
  }
  const arguments_ = name === "list_editor_sessions" ? args ?? {} : { ...args, editorSessionId };
  const response = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: arguments_ } }) });
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

test("external AI setup guide exposes client configs without copying a bearer secret", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-connect-external").click();
  const guide = ai.getByTestId("ai-connection-guide");
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("npm run ai-bridge");
  await expect(guide).toContainText("get_document_summary");
  await expect(guide.getByTestId("ai-first-read-prompt")).toContainText("Do not edit the document");
  await expect(guide.getByTestId("ai-first-edit-prompt")).toContainText("Do not Validate or Apply it");
  await expect(guide.getByTestId("ai-bridge-probe")).toContainText(`Bridge found at 127.0.0.1:${PORT}`);
  await expect(guide.getByTestId("ai-client-config")).toContainText("bearer_token_env_var");
  await guide.getByLabel("MCP client setup").selectOption("claude-code");
  await expect(guide.getByTestId("ai-client-config")).toContainText('"type": "http"');
  await expect(guide.getByTestId("ai-client-config")).toContainText("${TIMING_CHART_MCP_TOKEN}");
  await expect(guide.getByLabel("Bridge connection token")).toHaveAttribute("type", "password");
  await expect(guide).not.toContainText(TOKEN);
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
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });
  await expect(page.getByTestId("ai-provider-status")).toContainText("external agent connected");

  // initialize + tools/list, exactly as a real MCP client's handshake would.
  const initResponse = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize" }) });
  expect((await initResponse.json()).result.serverInfo.name).toBe("timing-chart-v2-ai-bridge");
  const listResponse = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }) });
  const tools = ((await listResponse.json()).result.tools as { name: string }[]).map((tool) => tool.name);
  const addedTools = ["set_selection", "propose_create_time_group", "propose_update_time_group", "propose_delete_time_group", "fit_selection"];
  expect(tools.filter((tool) => addedTools.includes(tool))).toEqual(addedTools);
  const existingTools = tools.filter((tool) => !addedTools.includes(tool));
  expect(existingTools).toEqual(["list_editor_sessions", "get_document_summary", "get_view_context", "get_selection", "get_viewport_snapshot", "get_signals", "get_signal", "get_signal_groups", "get_transactions", "get_transaction", "get_transaction_groups", "get_transaction_phases", "get_linked_signals", "get_annotations", "get_bookmarks", "get_time_groups", "get_problems", "fit_all", "propose_edit", "propose_create_signal", "propose_rename_signal", "propose_update_signal", "propose_move_signal", "propose_insert_cycles", "propose_delete_cycles", "propose_move_range", "propose_duplicate_range", "propose_create_signal_group", "propose_rename_signal_group", "propose_create_transaction_group", "propose_rename_transaction_group", "propose_delete_transaction_group", "propose_create_transaction", "propose_update_transaction", "propose_move_transaction", "propose_resize_transaction", "propose_delete_transaction", "propose_add_phase", "propose_update_phase", "propose_delete_phase", "propose_link_signal", "propose_unlink_signal", "propose_create_bookmark", "propose_move_bookmark", "propose_update_bookmark", "propose_delete_bookmark", "propose_create_annotation", "propose_update_annotation", "propose_delete_annotation"]);

  // Read-only: reflects the real, live document -- never a canned/fake value.
  const summary = await callTool("get_document_summary");
  const parsedSummary = JSON.parse(summary.body.result!.content[0]!.text) as { title: string; signalCount: number };
  expect(parsedSummary.title).toBe("Sample -- Transaction Mode");
  expect(parsedSummary.signalCount).toBe(8);
  const viewContext = await callTool("get_view_context");
  expect(JSON.parse(viewContext.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ mode: "Cycle", zoom: expect.any(Number), selection: expect.objectContaining({ selectedSignalId: "sig_cycle_request" }) }));

  const selection = await callTool("get_selection");
  const parsedSelection = JSON.parse(selection.body.result!.content[0]!.text) as { selectedSignalId: string };
  expect(parsedSelection.selectedSignalId).toBe("sig_cycle_request");

  const setSelection = await callTool("set_selection", TOKEN, { entityType: "signal", entityId: "sig_cycle_ready" });
  expect(setSelection.body.result!.isError).toBe(false);
  expect(JSON.parse(setSelection.body.result!.content[0]!.text)).toEqual({ selected: { entityType: "signal", entityId: "sig_cycle_ready", name: "READY" }, canonicalDelta: 0, historyDelta: 0, dirtyDelta: 0 });
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
  expect(JSON.parse((await callTool("get_selection")).body.result!.content[0]!.text)).toEqual(expect.objectContaining({ selectedSignalId: "sig_cycle_ready" }));

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

  const fitSelection = await callTool("fit_selection");
  expect(fitSelection.body.result!.isError).toBe(false);
  expect(JSON.parse(fitSelection.body.result!.content[0]!.text)).toEqual({ applied: true, canonicalDelta: 0, historyDelta: 0, dirtyDelta: 0 });
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});

test("get_transactions, get_annotations, get_bookmarks and get_problems are read-only semantic projections", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };
  const signals = await callTool("get_signals", TOKEN, { groupId: "grp_control" });
  expect(signals.body.result!.isError).toBe(false);
  const signalData = JSON.parse(signals.body.result!.content[0]!.text) as { signals: readonly { id: string; name: string; groupId?: string }[] };
  expect(signalData.signals).toContainEqual(expect.objectContaining({ id: "sig_cycle_request", name: "REQUEST", groupId: "grp_control" }));
  const signal = await callTool("get_signal", TOKEN, { signalId: "sig_cycle_request" });
  expect(JSON.parse(signal.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ signal: expect.objectContaining({ id: "sig_cycle_request", name: "REQUEST" }) }));
  const groups = await callTool("get_signal_groups");
  expect(JSON.parse(groups.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ groups: expect.arrayContaining([expect.objectContaining({ id: "grp_control", rows: expect.arrayContaining(["sig_cycle_request"]) })]) }));
  const transactions = await callTool("get_transactions");
  expect(transactions.body.result!.isError).toBe(false);
  const transactionData = JSON.parse(transactions.body.result!.content[0]!.text) as { transactionGroups: readonly { id: string; name: string }[]; transactions: readonly { id: string; name: string; start: number; end: number }[] };
  expect(transactionData.transactions.length).toBeGreaterThan(0);
  expect(transactionData.transactions[0]).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String), start: expect.any(Number), end: expect.any(Number) }));
  const transactionId = transactionData.transactions[0]!.id;
  const transaction = await callTool("get_transaction", TOKEN, { transactionId });
  expect(JSON.parse(transaction.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ transaction: expect.objectContaining({ id: transactionId }) }));
  const transactionGroups = await callTool("get_transaction_groups");
  expect(JSON.parse(transactionGroups.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ groups: expect.any(Array) }));
  const phases = await callTool("get_transaction_phases", TOKEN, { transactionId });
  expect(JSON.parse(phases.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ transactionId, phases: expect.any(Array) }));
  const linkedSignals = await callTool("get_linked_signals", TOKEN, { transactionId });
  expect(JSON.parse(linkedSignals.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ transactionId, signals: expect.any(Array) }));

  const annotations = await callTool("get_annotations");
  expect(annotations.body.result!.isError).toBe(false);
  const annotationData = JSON.parse(annotations.body.result!.content[0]!.text) as { annotations: readonly { id: string; type: string; visible: boolean; locked: boolean }[] };
  expect(Array.isArray(annotationData.annotations)).toBe(true);
  for (const annotation of annotationData.annotations) expect(annotation).toEqual(expect.objectContaining({ id: expect.any(String), type: expect.any(String), visible: expect.any(Boolean), locked: expect.any(Boolean) }));

  const annotationProposal = await callTool("propose_create_annotation", TOKEN, { type: "text", signalId: "sig_cycle_request", start: 4, end: 5, label: "External note" });
  expect(annotationProposal.body.result!.isError).toBe(false);
  expect(JSON.parse(annotationProposal.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ summary: expect.stringContaining("External note"), requiresApproval: true }));
  await expect(ai.getByText(/External note/)).toBeVisible();

  const bookmarks = await callTool("get_bookmarks");
  expect(bookmarks.body.result!.isError).toBe(false);
  const bookmarkData = JSON.parse(bookmarks.body.result!.content[0]!.text) as { bookmarks: readonly { id: string; name: string; cycle: number }[] };
  expect(Array.isArray(bookmarkData.bookmarks)).toBe(true);
  const timeGroups = await callTool("get_time_groups");
  expect(JSON.parse(timeGroups.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ timeGroups: expect.any(Array) }));

  const problems = await callTool("get_problems");
  expect(problems.body.result!.isError).toBe(false);
  const problemData = JSON.parse(problems.body.result!.content[0]!.text) as { problems: readonly { code: string; path: string; message: string }[] };
  expect(problemData.problems).toEqual([]);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});

test("external Transaction+Phases+Signals proposal validates and applies as one atomic History entry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeDirty = await page.getByTestId("dirty-status").textContent();

  const response = await callTool("propose_create_transaction", TOKEN, {
    name: "MCP_READ", start: 10, end: 40,
    phases: [{ name: "Address", start: 10, end: 16 }, { name: "Data", start: 16, end: 32 }, { name: "Response", start: 32, end: 40 }],
    linkedSignalIds: ["sig_cycle_request", "sig_cycle_ready"],
  });
  expect(response.body.result!.isError).toBe(false);
  expect(JSON.parse(response.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ summary: "Create Transaction MCP_READ with 3 Phases and 2 linked Signals", requiresApproval: true }));
  await expect(ai.getByTestId("ai-preview")).toContainText("3 Phases and 2 linked Signals");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText(beforeDirty!);

  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Applied · one atomic SemanticCommand transaction");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const lanes = page.getByTestId("transaction-lanes");
  await expect(lanes.locator('[data-transaction-id][title="MCP_READ"]')).toBeVisible();

  await page.locator(".ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(lanes.locator('[data-transaction-id][title="MCP_READ"]')).toHaveCount(0);
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
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

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

test("propose_rename_signal targets a stable Signal ID and still requires human Validate and Apply", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

  const snapshot = await callTool("get_viewport_snapshot");
  const elementMap = JSON.parse(snapshot.body.result!.content[0]!.text) as { elementMap: readonly { id: string; name: string }[] };
  const target = elementMap.elementMap.find((signal) => signal.id === "sig_cycle_request");
  expect(target?.name).toBe("REQUEST");
  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };

  const proposal = await callTool("propose_rename_signal", TOKEN, { signalId: target!.id, name: "REQ" });
  expect(proposal.body.result!.isError).toBe(false);
  expect(JSON.parse(proposal.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ summary: "Rename REQUEST to REQ", baseRevision: 0, requiresApproval: true }));
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(ai).toContainText("Rename REQUEST to REQ");

  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(before.revision) + 1));
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQ");

  const beforeCancelledUpdate = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };
  const update = await callTool("propose_update_signal", TOKEN, { signalId: target!.id, role: "output" });
  expect(update.body.result!.isError).toBe(false);
  expect(JSON.parse(update.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ summary: expect.stringContaining("role to output"), requiresApproval: true }));
  await ai.getByRole("button", { name: "Cancel" }).click();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeCancelledUpdate.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeCancelledUpdate.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(beforeCancelledUpdate.dirty!);
});

test("propose_create_signal uses a stable Group ID and remains a Preview until explicit Apply", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await settings.getByLabel("Bridge connection token").fill(TOKEN);
  await settings.getByLabel("Enable external agents").check();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });
  const groupsResponse = await callTool("get_signal_groups");
  const groups = JSON.parse(groupsResponse.body.result!.content![0]!.text) as { groups: readonly { id: string }[] };
  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };
  const proposal = await callTool("propose_create_signal", TOKEN, { name: "READY", type: "event", role: "output", groupId: groups.groups[0]!.id, initialValue: "rise" });
  expect(proposal.body.result!.isError).toBe(false);
  expect(JSON.parse(proposal.body.result!.content[0]!.text)).toEqual(expect.objectContaining({ summary: expect.stringContaining("Create event signal READY"), requiresApproval: true }));
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(ai).toContainText("Create event signal READY");
  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(before.revision) + 1));
  await expect(host.locator("[data-role='frozen-row']").filter({ hasText: "READY" })).toBeVisible();
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
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

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
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

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
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

  bridge?.kill();
  bridge = undefined;
  await expect(ai.getByTestId("ai-bridge-status")).not.toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

  bridge = spawn(process.execPath, ["scripts/ai-bridge-server.mjs"], { env: { ...process.env, AI_BRIDGE_PORT: String(PORT), AI_BRIDGE_TOKEN: TOKEN }, stdio: "ignore" });
  await waitForBridgeReady();
  await expect(ai.getByTestId("ai-bridge-status")).toHaveAttribute("data-bridge-status", "connected-external-client", { timeout: 10_000 });

  // The recovered connection is not just a status label -- it is a real,
  // working connection again.
  const summary = await callTool("get_document_summary");
  expect(JSON.parse(summary.body.result!.content[0]!.text).signalCount).toBe(8);
});
