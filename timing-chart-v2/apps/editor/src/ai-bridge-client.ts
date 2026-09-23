import { useEffect, useRef, useState } from "react";
import { validateCanonicalDocument, type CanonicalDocument, type GroupId, type SignalId } from "@timing-chart-v2/schema";
import type { AIViewIntent } from "./ai-proposal-provider.js";

// #395 PR3: the browser-side half of the local Agent Bridge
// (scripts/ai-bridge-server.mjs). This only ever executes the exact
// three named tools below against props already flowing through
// AIOperationPanel -- there is no generic "run this JSON-RPC method"
// escape hatch, no Canonical JSON patch path, and no filesystem/network
// access beyond polling the one configured localhost bridge URL. It is
// off by default and only starts polling once the caller passes
// `enabled: true` (the Settings "Enable external agents" toggle).
// #778 Phase 1: "connected" alone conflated two very different truths -- the local Bridge process being
// reachable (this Editor tab's own poll loop succeeding) versus a real external MCP client (Claude Code,
// Codex, or any other MCP-speaking agent) actually having connected to it. Reporting the former as if it were
// the latter is an explicitly prohibited shortcut. "connected" now means Bridge-reachable-but-no-external-
// client-seen; "connected-external-client" means a real client has spoken to the bridge's /mcp endpoint
// within the last EXTERNAL_CLIENT_TIMEOUT_MS window server-side.
export type AIBridgeStatus = "disabled" | "connecting" | "connected" | "connected-external-client" | "token-required" | "invalid-token" | "unavailable" | "error";

export type AIBridgeContext = {
  readonly document: CanonicalDocument;
  readonly documentEpoch: number;
  readonly revision: number;
  readonly mode: "Cycle" | "Transaction" | "Combined";
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly selectedAnnotationId: string | undefined;
  readonly selectedTransactionId: string | undefined;
  readonly onViewIntent: ((intent: AIViewIntent) => void) | undefined;
  // #395 PR4: propose_edit's only effect is building a Preview (exactly
  // what clicking Preview in the UI does) -- it never validates or
  // applies on its own. There is deliberately no bridge-side "apply" tool
  // for a document-changing proposal: a human must still open the AI
  // Assistant panel and click Validate + Apply themselves.
  readonly onProposeEdit: ((query: string) => { readonly error: string } | { readonly summary: string; readonly baseRevision: number; readonly kind: string; readonly requiresApproval: true; readonly message: string }) | undefined;
  readonly onProposeTypedEdit: ((tool: string, args: Readonly<Record<string, unknown>>) => { readonly error: string } | { readonly summary: string; readonly baseRevision: number; readonly kind: string; readonly requiresApproval: true; readonly message: string }) | undefined;
  // #395 PR5: get_viewport_snapshot is read-only -- see the comment on
  // its implementation in ai-operation-panel.tsx for exactly what it
  // returns and why it deliberately omits a raw pixel image.
  readonly onGetViewportSnapshot: (() => unknown) | undefined;
  readonly onGetViewContext: (() => unknown) | undefined;
};

function documentSummary(document: CanonicalDocument) {
  return {
    title: document.document.title,
    signalCount: document.signals.length,
    annotationCount: document.annotations.length,
    transactionCount: document.transactions.length,
    cycleCount: document.timeline.cycleCount,
  };
}

function executeTool(tool: string, args: Record<string, unknown>, context: AIBridgeContext): unknown {
  if (tool === "get_document_summary") return documentSummary(context.document);
  if (tool === "get_view_context") {
    if (!context.onGetViewContext) throw new Error("get_view_context is not available in the current surface.");
    return context.onGetViewContext();
  }
  if (tool === "get_selection") return { selectedSignalId: context.selectedSignalId, selectedGroupId: context.selectedGroupId, selectedAnnotationId: context.selectedAnnotationId, selectedTransactionId: context.selectedTransactionId };
  if (tool === "fit_all") {
    if (!context.onViewIntent) throw new Error("fit_all is not available in the current surface.");
    context.onViewIntent("fit-all");
    return { applied: true, canonicalDelta: 0, historyDelta: 0, dirtyDelta: 0 };
  }
  if (tool === "get_viewport_snapshot") {
    if (!context.onGetViewportSnapshot) throw new Error("get_viewport_snapshot is not available in the current surface.");
    return context.onGetViewportSnapshot();
  }
  if (tool === "get_signals") {
    const { groupId, visible, type } = args;
    if (groupId !== undefined && typeof groupId !== "string") throw new Error("groupId must be a string.");
    if (visible !== undefined && typeof visible !== "boolean") throw new Error("visible must be a boolean.");
    if (type !== undefined && typeof type !== "string") throw new Error("type must be a string.");
    const groupRows = groupId === undefined ? undefined : context.document.signalGroups.find((group) => group.id === groupId)?.rows;
    if (groupId !== undefined && !groupRows) return { signals: [] };
    return { signals: context.document.signals.filter((signal) => signal.type !== "commentRow" && (groupRows === undefined || groupRows.includes(signal.id)) && (visible === undefined || (signal.display.visible !== false) === visible) && (type === undefined || signal.type === type)).map((signal) => ({ id: signal.id, name: signal.display.name, role: signal.role, type: signal.type, groupId: context.document.signalGroups.find((group) => group.rows.includes(signal.id))?.id, visible: signal.display.visible !== false })) };
  }
  if (tool === "get_signal") {
    const signalId = args.signalId;
    if (typeof signalId !== "string" || !signalId) throw new Error("get_signal requires a stable signalId.");
    const signal = context.document.signals.find((item) => item.id === signalId && item.type !== "commentRow");
    if (!signal) return { signal: null };
    return { signal: { ...signal, groupId: context.document.signalGroups.find((group) => group.rows.includes(signal.id))?.id, visible: signal.display.visible !== false } };
  }
  if (tool === "get_signal_groups") {
    return { groups: context.document.signalGroups.map((group) => ({ id: group.id, name: group.name, rows: [...group.rows] })) };
  }
  if (tool === "get_transaction") {
    const transactionId = args.transactionId;
    if (typeof transactionId !== "string" || !transactionId) throw new Error("get_transaction requires a stable transactionId.");
    return { transaction: context.document.transactions.find((item) => item.id === transactionId) ?? null };
  }
  if (tool === "get_transaction_groups") {
    return { groups: (context.document.transactionGroups ?? []).map((group) => ({ id: group.id, name: group.name, color: group.color })) };
  }
  if (tool === "get_transaction_phases") {
    const transactionId = args.transactionId;
    if (typeof transactionId !== "string" || !transactionId) throw new Error("get_transaction_phases requires a stable transactionId.");
    const transaction = context.document.transactions.find((item) => item.id === transactionId);
    return { transactionId, phases: transaction?.phases?.map((phase) => ({ name: phase.name, start: phase.start, end: phase.end })) ?? null };
  }
  if (tool === "get_linked_signals") {
    const transactionId = args.transactionId;
    if (typeof transactionId !== "string" || !transactionId) throw new Error("get_linked_signals requires a stable transactionId.");
    const transaction = context.document.transactions.find((item) => item.id === transactionId);
    if (!transaction) return { transactionId, signals: null };
    const linkedIds = transaction.linkedSignals ?? [];
    const signals = linkedIds.map((id) => context.document.signals.find((signal) => signal.id === id && signal.type !== "commentRow")).filter((signal) => signal !== undefined).map((signal) => ({ id: signal.id, name: signal.display.name, role: signal.role, type: signal.type }));
    return { transactionId, signals, unresolvedSignalIds: linkedIds.filter((id) => !context.document.signals.some((signal) => signal.id === id)) };
  }
  if (tool === "get_transactions") {
    return {
      transactionGroups: (context.document.transactionGroups ?? []).map((group) => ({ id: group.id, name: group.name, color: group.color })),
      transactions: context.document.transactions.map((transaction) => ({ id: transaction.id, name: transaction.name, groupId: transaction.groupId, laneId: transaction.laneId, start: transaction.start, end: transaction.end, color: transaction.color, description: transaction.description, linkedSignalIds: transaction.linkedSignals ?? [], phaseCount: transaction.phases?.length ?? 0 })),
    };
  }
  if (tool === "get_annotations") {
    const type = args.type;
    const visibleRange = args.visibleRange;
    if (type !== undefined && typeof type !== "string") throw new Error("type must be a string.");
    if (visibleRange !== undefined && (typeof visibleRange !== "object" || visibleRange === null || typeof (visibleRange as { start?: unknown }).start !== "number" || typeof (visibleRange as { end?: unknown }).end !== "number" || !Number.isFinite((visibleRange as { start: number }).start) || !Number.isFinite((visibleRange as { end: number }).end) || (visibleRange as { start: number }).start > (visibleRange as { end: number }).end)) throw new Error("visibleRange must contain finite source-cycle start/end values with start <= end.");
    const sourceRange = visibleRange as { start: number; end: number } | undefined;
    const anchorSummary = (anchor: { readonly signalId?: SignalId; readonly cycle: number } | undefined) => anchor === undefined ? undefined : { signalId: anchor.signalId, cycle: anchor.cycle };
    const annotations = context.document.annotations.filter((annotation) => {
      if (type !== undefined && annotation.type !== type) return false;
      if (sourceRange === undefined) return true;
      const cycles = [annotation.anchor?.cycle, annotation.start?.cycle, annotation.end?.cycle, annotation.from?.cycle, annotation.to?.cycle].filter((cycle): cycle is number => typeof cycle === "number");
      return cycles.length > 0 && Math.max(...cycles) >= sourceRange.start && Math.min(...cycles) <= sourceRange.end;
    });
    return {
      annotations: annotations.map((annotation) => ({ id: annotation.id, type: annotation.type, label: annotation.label, visible: annotation.visible, locked: annotation.locked ?? false, anchor: anchorSummary(annotation.anchor), start: anchorSummary(annotation.start), end: anchorSummary(annotation.end), from: anchorSummary(annotation.from), to: anchorSummary(annotation.to) })),
    };
  }
  if (tool === "get_bookmarks") {
    return { bookmarks: context.document.bookmarks.map((bookmark) => ({ id: bookmark.id, name: bookmark.name, cycle: bookmark.start, comment: bookmark.comment })) };
  }
  if (tool === "get_time_groups") {
    return { timeGroups: context.document.timeGroups.map((group) => ({ id: group.id, name: group.name, start: group.start, end: group.end, category: group.category })) };
  }
  if (tool === "get_problems") {
    return { problems: validateCanonicalDocument(context.document).map((problem) => ({ code: problem.code, path: problem.path, message: problem.message })) };
  }
  if (tool === "propose_edit") {
    if (!context.onProposeEdit) throw new Error("propose_edit is not available in the current surface.");
    const query = args.query;
    if (typeof query !== "string" || !query.trim()) throw new Error("propose_edit requires a non-empty 'query' string argument.");
    return context.onProposeEdit(query);
  }
  if (tool === "propose_create_signal" || tool === "propose_rename_signal" || tool === "propose_update_signal" || tool === "propose_move_signal" || tool === "propose_insert_cycles" || tool === "propose_delete_cycles" || tool === "propose_move_range" || tool === "propose_duplicate_range" || tool === "propose_create_signal_group" || tool === "propose_rename_signal_group" || tool === "propose_create_transaction_group" || tool === "propose_rename_transaction_group" || tool === "propose_delete_transaction_group" || tool === "propose_create_transaction" || tool === "propose_update_transaction" || tool === "propose_move_transaction" || tool === "propose_resize_transaction" || tool === "propose_delete_transaction" || tool === "propose_create_bookmark" || tool === "propose_move_bookmark" || tool === "propose_update_bookmark" || tool === "propose_delete_bookmark" || tool === "propose_create_annotation" || tool === "propose_update_annotation" || tool === "propose_delete_annotation" || tool === "propose_add_phase" || tool === "propose_update_phase" || tool === "propose_delete_phase" || tool === "propose_link_signal" || tool === "propose_unlink_signal") {
    if (!context.onProposeTypedEdit) throw new Error(`${tool} is not available in the current surface.`);
    return context.onProposeTypedEdit(tool, args);
  }
  throw new Error(`Unknown tool '${tool}'.`);
}

const LOOPBACK_BRIDGE_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export function isLoopbackBridgeHost(host: string): boolean {
  return LOOPBACK_BRIDGE_HOSTS.has(host.trim().toLowerCase());
}

/** A no-credential liveness probe; the bridge's OPTIONS handler returns no
 * document or token data. Keep it loopback-only and use it only for setup UX. */
export async function probeAIBridge(host: string, port: number): Promise<boolean> {
  if (!isLoopbackBridgeHost(host)) return false;
  try {
    const response = await fetch(`http://${host}:${port}/bridge/poll`, { method: "OPTIONS", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export function classifyAIBridgeFailure(error: unknown): AIBridgeStatus {
  if (error instanceof Error && error.message === "Bridge rejected the configured token.") return "invalid-token";
  if (error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror/i.test(error.message))) return "unavailable";
  return "error";
}

export function useAIBridgeClient(enabled: boolean, host: string, port: number, token: string, context: AIBridgeContext): AIBridgeStatus {
  const [status, setStatus] = useState<AIBridgeStatus>("disabled");
  const contextRef = useRef(context);
  contextRef.current = context;
  const tabIdRef = useRef<string | undefined>(undefined);
  if (!tabIdRef.current) tabIdRef.current = globalThis.crypto.randomUUID();
  const sessionRef = useRef<{ readonly documentKey: string; readonly editorSessionId: string } | undefined>(undefined);

  useEffect(() => {
    if (!enabled) { setStatus("disabled"); return undefined; }
    if (!token) { setStatus("token-required"); return undefined; }
    // The Editor only ever talks to a local Agent Bridge (#569): never poll or answer a non-loopback host.
    if (!isLoopbackBridgeHost(host)) { setStatus("error"); return undefined; }
    let cancelled = false;
    // An aborted in-flight poll must never be allowed to keep running in
    // the background: a stale, already-cancelled loop that still holds a
    // queued tool call (because it won the request right as this effect
    // was torn down) would otherwise silently swallow that call forever
    // -- no result, no error, no /bridge/respond -- since the plain
    // `cancelled` flag alone only stops the *next* iteration, not an
    // already-in-flight fetch. The AbortController below cancels the
    // actual network request on cleanup so no stale loop can linger.
    const controller = new AbortController();
    setStatus("connecting");
    const baseUrl = `http://${host}:${port}`;
    const authHeaders = { authorization: `Bearer ${token}` };
    const getSession = (currentContext: AIBridgeContext, forceNew = false) => {
      const documentKey = `${currentContext.documentEpoch}:${currentContext.document.document.id}`;
      if (forceNew || !sessionRef.current || sessionRef.current.documentKey !== documentKey) {
        sessionRef.current = { documentKey, editorSessionId: globalThis.crypto.randomUUID() };
      }
      return { tabId: tabIdRef.current!, ...sessionRef.current };
    };
    let activeSession = getSession(contextRef.current, true);
    const closeSession = (session: ReturnType<typeof getSession>) => {
      void fetch(`${baseUrl}/bridge/close`, {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ tabId: session.tabId, editorSessionId: session.editorSessionId }),
        keepalive: true,
      }).catch(() => { /* session expiry remains the fallback if the page is closing */ });
    };
    const handlePageHide = () => closeSession(activeSession);
    window.addEventListener("pagehide", handlePageHide);
    const pollOnce = async (): Promise<boolean> => {
      const currentContext = contextRef.current;
      const session = getSession(currentContext);
      activeSession = session;
      const document = currentContext.document;
      const response = await fetch(`${baseUrl}/bridge/poll`, {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          tabId: session.tabId,
          editorSessionId: session.editorSessionId,
          documentId: document.document.id,
          documentTitle: document.document.title,
          mode: currentContext.mode,
          revision: currentContext.revision,
          cycleCount: document.timeline.cycleCount,
          signalCount: document.signals.length,
          transactionCount: document.transactions.length,
          annotationCount: document.annotations.length,
          bookmarkCount: document.bookmarks.length,
        }),
        signal: controller.signal,
      });
      if (response.status === 401) throw new Error("Bridge rejected the configured token.");
      if (!response.ok) throw new Error(`Bridge poll failed (${response.status}).`);
      const request = (await response.json()) as { requestId: string | null; editorSessionId: string; tool?: string; arguments?: Record<string, unknown>; externalClientConnected?: boolean };
      if (cancelled) return false;
      setStatus(request.externalClientConnected ? "connected-external-client" : "connected");
      if (!request.requestId || !request.tool) return false;
      let result: unknown;
      let error: string | undefined;
      try {
        const currentSession = getSession(contextRef.current);
        if (request.editorSessionId !== session.editorSessionId || currentSession.editorSessionId !== request.editorSessionId) throw new Error("Target Editor session changed before this tool call could execute; choose a live session and retry.");
        result = executeTool(request.tool, request.arguments ?? {}, contextRef.current);
      } catch (thrown) { error = thrown instanceof Error ? thrown.message : "Tool execution failed."; }
      await fetch(`${baseUrl}/bridge/respond`, { method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ requestId: request.requestId, editorSessionId: request.editorSessionId, result, error }), signal: controller.signal });
      return true;
    };
    // The bridge's own /bridge/poll answers immediately (queued call or
    // null) rather than long-polling -- deliberately, to avoid a whole
    // class of concurrent-request races a held-open long-poll invites.
    // The wait between iterations lives here instead: a short interval
    // when idle, and no wait at all right after handling a real call (so
    // a burst of several tool calls doesn't each pay the idle delay).
    const IDLE_POLL_INTERVAL_MS = 400;
    const loop = async () => {
      while (!cancelled) {
        let hadRequest = false;
        try { hadRequest = await pollOnce(); } catch (error) { if (!cancelled) { if (error instanceof DOMException && error.name === "AbortError") return; setStatus(classifyAIBridgeFailure(error)); await new Promise((resolve) => setTimeout(resolve, 3000)); continue; } }
        if (!hadRequest && !cancelled) await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_INTERVAL_MS));
      }
    };
    void loop();
    return () => { cancelled = true; window.removeEventListener("pagehide", handlePageHide); controller.abort(); closeSession(activeSession); };
  }, [enabled, host, port, token]);

  return status;
}
