import { useState } from "react";
import type { ReactNode } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";

export function AIOperationPanel({ document, revision, selectedSignalId, onCommand, icon }: { readonly document: CanonicalDocument; readonly revision: number; readonly selectedSignalId: SignalId | undefined; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly icon: ReactNode }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{ readonly baseRevision: number; readonly command: SemanticCommand; readonly summary: string }>();
  const [status, setStatus] = useState("Ready");
  const selected = document.signals.find((signal) => signal.id === selectedSignalId && signal.type !== "commentRow");
  const buildPreview = () => {
    const text = query.trim();
    if (!selected) { setPreview(undefined); setStatus("Select a timing Signal first."); return; }
    const rename = /^rename(?: selected)?(?: signal)? to (.+)$/i.exec(text);
    const command: SemanticCommand | undefined = rename
      ? { id: nextCommandId("ai_rename"), type: "signal.rename", signalId: selected.id, name: rename[1]!.trim() }
      : /^(hide|show)(?: selected)?(?: signal)?$/i.test(text)
        ? { id: nextCommandId("ai_visibility"), type: "signal.setVisibility", signalId: selected.id, visible: text.toLowerCase().startsWith("show") }
        : undefined;
    if (!command) { setPreview(undefined); setStatus("Supported intents: rename selected signal to <name>, hide selected signal, show selected signal."); return; }
    setPreview({ baseRevision: revision, command, summary: command.type === "signal.rename" ? `Rename ${selected.display.name} to ${(command as Extract<SemanticCommand, { type: "signal.rename" }>).name}` : `${(command as Extract<SemanticCommand, { type: "signal.setVisibility" }>).visible ? "Show" : "Hide"} ${selected.display.name}` });
    setStatus("Preview ready · no document mutation");
  };
  const applyPreview = () => {
    if (!preview) { setStatus("Create a preview first."); return; }
    if (preview.baseRevision !== revision) { setPreview(undefined); setStatus(`Conflict · preview revision ${preview.baseRevision}, current revision ${revision}`); return; }
    const result = onCommand(preview.command);
    if (!result.ok) { setStatus(`Apply failed: ${result.reason}`); return; }
    setPreview(undefined);
    setStatus("Applied · one SemanticCommand");
  };
  return <section className="ai-operation-panel" data-testid="ai-operation-panel"><div className="ai-query-row">{icon}<label>Semantic query<input aria-label="AI semantic query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="rename selected signal to REQ" /></label><button type="button" onClick={buildPreview}>Preview</button></div><div className="ai-scope">Scope: selected Signal · Revision: {revision} · Canonical read-only query</div>{preview && <div className="ai-preview" data-testid="ai-preview"><strong>{preview.summary}</strong><span>Base revision {preview.baseRevision}</span><button type="button" onClick={applyPreview}>Apply Preview</button><button type="button" onClick={() => { setPreview(undefined); setStatus("Preview cancelled · no document mutation"); }}>Cancel</button></div>}<output role="status" data-testid="ai-status">{status}</output></section>;
}
