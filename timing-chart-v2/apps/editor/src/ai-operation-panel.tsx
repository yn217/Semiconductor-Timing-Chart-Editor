import { useState } from "react";
import type { ReactNode } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { planCommand } from "@timing-chart-v2/commands";
import { validateCanonicalDocument, type CanonicalDocument, type GroupId, type SignalId } from "@timing-chart-v2/schema";
import { deterministicMockAIProposalProvider, type AIProposal, type AIProposalProvider, type AIViewIntent } from "./ai-proposal-provider.js";

function validationMessage(document: CanonicalDocument, proposal: AIProposal): string | undefined {
  if (proposal.kind === "view-only") return proposal.commands.length === 0 && proposal.viewIntent ? undefined : "View-only proposals cannot contain document commands.";
  if (proposal.kind !== "semantic-command") return "This proposal kind is reserved and cannot be applied yet.";
  let candidate = document;
  for (const command of proposal.commands) {
    const planned = planCommand(candidate, command);
    if (!planned.ok) return planned.problems.map((problem) => `${problem.code}: ${problem.message}`).join(" ");
    candidate = planned.document;
  }
  const documentProblems = validateCanonicalDocument(candidate);
  return documentProblems.length === 0 ? undefined : documentProblems.map((problem) => `${problem.code}: ${problem.message}`).join(" ");
}

export function AIOperationPanel({ document, revision, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range, onCommand, onCommandBatch, onViewIntent, icon, provider = deterministicMockAIProposalProvider }: { readonly document: CanonicalDocument; readonly revision: number; readonly selectedSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotationId: string | undefined; readonly selectedTransactionId: string | undefined; readonly range: Readonly<{ start: number; end: number }> | undefined; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCommandBatch?: (commands: readonly SemanticCommand[]) => CommandResult; readonly onViewIntent?: (intent: AIViewIntent) => void; readonly icon: ReactNode; readonly provider?: AIProposalProvider }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<AIProposal>();
  const [validatedRevision, setValidatedRevision] = useState<number>();
  const [status, setStatus] = useState("Ready");
  const buildPreview = () => {
    const result = provider.propose({ document, revision, query, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range });
    if (!result.ok) { setPreview(undefined); setValidatedRevision(undefined); setStatus(result.message); return; }
    setPreview(result.proposal);
    setValidatedRevision(undefined);
    setStatus("Preview ready · no document mutation");
  };
  const validatePreview = () => {
    if (!preview) { setStatus("Create a preview first."); return; }
    if (preview.baseRevision !== revision) { setPreview(undefined); setValidatedRevision(undefined); setStatus(`Conflict · preview revision ${preview.baseRevision}, current revision ${revision}`); return; }
    const message = validationMessage(document, preview);
    if (message) { setValidatedRevision(undefined); setStatus(`Validation failed · ${message}`); return; }
    setValidatedRevision(revision);
    setStatus("Validated · deterministic local checks passed");
  };
  const applyPreview = () => {
    if (!preview) { setStatus("Create a preview first."); return; }
    if (preview.baseRevision !== revision) { setPreview(undefined); setStatus(`Conflict · preview revision ${preview.baseRevision}, current revision ${revision}`); return; }
    if (validatedRevision !== revision) { setStatus("Validate the proposal before applying it."); return; }
    const message = validationMessage(document, preview);
    if (message) { setValidatedRevision(undefined); setStatus(`Validation failed · ${message}`); return; }
    if (preview.kind === "view-only") {
      if (!preview.viewIntent || !onViewIntent) { setStatus("This view-only intent is not available in the current surface."); return; }
      onViewIntent(preview.viewIntent);
      setPreview(undefined);
      setValidatedRevision(undefined);
      setStatus("Applied · view-only intent");
      return;
    }
    const result = preview.commands.length === 1
      ? onCommand(preview.commands[0]!)
      : onCommandBatch?.(preview.commands) ?? { ok: false as const, reason: "invalid" as const, problems: [] };
    if (!result.ok) { setStatus(`Apply failed: ${result.reason}`); return; }
    setPreview(undefined);
    setValidatedRevision(undefined);
    setStatus("Applied · one atomic SemanticCommand transaction");
  };
  return <section className="ai-operation-panel" data-testid="ai-operation-panel"><div className="ai-query-row">{icon}<label>Semantic query<input aria-label="AI semantic query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="rename selected signal to REQ" /></label><button type="button" onClick={buildPreview}>Preview</button></div><div className="ai-scope">Scope: selected Signal · Revision: {revision} · Canonical read-only query</div>{preview && <div className="ai-preview" data-testid="ai-preview"><strong>{preview.summary}</strong><span>Base revision {preview.baseRevision}</span><button type="button" data-testid="ai-validate" onClick={validatePreview}>Validate Proposal</button><button type="button" data-testid="ai-apply" onClick={applyPreview}>Apply Preview</button><button type="button" onClick={() => { setPreview(undefined); setValidatedRevision(undefined); setStatus("Preview cancelled · no document mutation"); }}>Cancel</button></div>}<output role="status" data-testid="ai-status">{status}</output></section>;
}
