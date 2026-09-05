import { useEffect, useRef, useState } from "react";
import type { CanonicalDocument, GroupId, SignalId } from "@timing-chart-v2/schema";
import type { AIViewIntent } from "./ai-proposal-provider.js";

// #395 PR3: the browser-side half of the local Agent Bridge
// (scripts/ai-bridge-server.mjs). This only ever executes the exact
// three named tools below against props already flowing through
// AIOperationPanel -- there is no generic "run this JSON-RPC method"
// escape hatch, no Canonical JSON patch path, and no filesystem/network
// access beyond polling the one configured localhost bridge URL. It is
// off by default and only starts polling once the caller passes
// `enabled: true` (the Settings "Enable external agents" toggle).
export type AIBridgeStatus = "disabled" | "connecting" | "connected" | "error";

export type AIBridgeContext = {
  readonly document: CanonicalDocument;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly selectedAnnotationId: string | undefined;
  readonly selectedTransactionId: string | undefined;
  readonly onViewIntent: ((intent: AIViewIntent) => void) | undefined;
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

function executeTool(tool: string, context: AIBridgeContext): unknown {
  if (tool === "get_document_summary") return documentSummary(context.document);
  if (tool === "get_selection") return { selectedSignalId: context.selectedSignalId, selectedGroupId: context.selectedGroupId, selectedAnnotationId: context.selectedAnnotationId, selectedTransactionId: context.selectedTransactionId };
  if (tool === "fit_all") {
    if (!context.onViewIntent) throw new Error("fit_all is not available in the current surface.");
    context.onViewIntent("fit-all");
    return { applied: true, canonicalDelta: 0, historyDelta: 0, dirtyDelta: 0 };
  }
  throw new Error(`Unknown tool '${tool}'.`);
}

export function useAIBridgeClient(enabled: boolean, host: string, port: number, token: string, context: AIBridgeContext): AIBridgeStatus {
  const [status, setStatus] = useState<AIBridgeStatus>("disabled");
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (!enabled) { setStatus("disabled"); return undefined; }
    if (!token) { setStatus("error"); return undefined; }
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
    const pollOnce = async (): Promise<boolean> => {
      const response = await fetch(`${baseUrl}/bridge/poll`, { headers: authHeaders, signal: controller.signal });
      if (response.status === 401) throw new Error("Bridge rejected the configured token.");
      if (!response.ok) throw new Error(`Bridge poll failed (${response.status}).`);
      const request = (await response.json()) as { requestId: string | null; tool?: string };
      if (cancelled) return false;
      setStatus("connected");
      if (!request.requestId || !request.tool) return false;
      let result: unknown;
      let error: string | undefined;
      try { result = executeTool(request.tool, contextRef.current); } catch (thrown) { error = thrown instanceof Error ? thrown.message : "Tool execution failed."; }
      await fetch(`${baseUrl}/bridge/respond`, { method: "POST", headers: { ...authHeaders, "content-type": "application/json" }, body: JSON.stringify({ requestId: request.requestId, result, error }), signal: controller.signal });
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
        try { hadRequest = await pollOnce(); } catch (error) { if (!cancelled) { if (error instanceof DOMException && error.name === "AbortError") return; setStatus("error"); await new Promise((resolve) => setTimeout(resolve, 3000)); continue; } }
        if (!hadRequest && !cancelled) await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_INTERVAL_MS));
      }
    };
    void loop();
    return () => { cancelled = true; controller.abort(); };
  }, [enabled, host, port, token]);

  return status;
}
