import { useState } from "react";
import type { ReactNode } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { planCommand } from "@timing-chart-v2/commands";
import { validateCanonicalDocument, type CanonicalDocument, type DocumentProblem, type GroupId, type SignalId } from "@timing-chart-v2/schema";
import { deterministicMockAIProposalProvider, type AIProposal, type AIProposalProvider, type AIViewIntent } from "./ai-proposal-provider.js";

function proposalValidationProblems(document: CanonicalDocument, proposal: AIProposal): readonly DocumentProblem[] {
  if (proposal.kind === "view-only") return proposal.commands.length === 0 && proposal.viewIntent ? [] : [{ code: "AI_VIEW_INTENT_INVALID", path: "$.ai.proposal", message: "View-only proposals cannot contain document commands." }];
  if (proposal.kind !== "semantic-command") return [{ code: "AI_PROPOSAL_KIND_UNSUPPORTED", path: "$.ai.proposal.kind", message: "This proposal kind is reserved and cannot be applied yet." }];
  let candidate = document;
  for (const command of proposal.commands) {
    const planned = planCommand(candidate, command);
    if (!planned.ok) return planned.problems;
    candidate = planned.document;
  }
  const documentProblems = validateCanonicalDocument(candidate);
  return documentProblems;
}

function formatProblems(problems: readonly DocumentProblem[]): string {
  return problems.map((problem) => `${problem.code}: ${problem.message}`).join(" ");
}

function aiDiagnostics(problems: readonly DocumentProblem[], operation: string, operationLabel: string, stage: "validate" | "commit", reason: string, commandId?: string): readonly DocumentProblem[] {
  return problems.map((problem) => ({
    ...problem,
    severity: "error" as const,
    operation,
    operationLabel,
    source: "ai" as const,
    stage,
    ...(commandId === undefined ? {} : { commandId }),
    recommendation: problem.recommendation ?? (reason === "stale" ? "Regenerate the preview from the current document before applying it." : "Review the reported field and value, then retry the AI operation."),
    detail: `ai-proposal:${operation}:${reason}${problem.detail ? `;${problem.detail}` : ""}`,
  }));
}

export function AIOperationPanel({ document, revision, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range, onCommand, onCommandBatch, onViewIntent, onDiagnostic, icon, provider = deterministicMockAIProposalProvider }: { readonly document: CanonicalDocument; readonly revision: number; readonly selectedSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotationId: string | undefined; readonly selectedTransactionId: string | undefined; readonly range: Readonly<{ start: number; end: number }> | undefined; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCommandBatch?: (commands: readonly SemanticCommand[]) => CommandResult; readonly onViewIntent?: (intent: AIViewIntent) => void; readonly onDiagnostic?: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void; readonly icon: ReactNode; readonly provider?: AIProposalProvider }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<AIProposal>();
  const [validatedRevision, setValidatedRevision] = useState<number>();
  const [status, setStatus] = useState("Ready");
  const buildPreview = () => {
    const result = provider.propose({ document, revision, query, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range });
    if (!result.ok) { onDiagnostic?.({ code: "AI_PROPOSAL_UNAVAILABLE", path: "$.ai.query", message: result.message, severity: "error", operation: "ai.proposal.preview", operationLabel: "Build AI proposal", source: "ai", stage: "validate", recommendation: "Adjust the request or select the required editor object, then preview again.", detail: "ai-proposal:preview" }); setPreview(undefined); setValidatedRevision(undefined); setStatus(result.message); return; }
    onDiagnostic?.(undefined);
    setPreview(result.proposal);
    setValidatedRevision(undefined);
    setStatus("Preview ready · no document mutation");
  };
  const validatePreview = () => {
    if (!preview) { setStatus("Create a preview first."); return; }
    if (preview.baseRevision !== revision) { onDiagnostic?.({ code: "AI_PREVIEW_STALE", path: "$.ai.preview.baseRevision", message: `Preview revision ${preview.baseRevision} is older than current revision ${revision}.`, severity: "error", operation: "ai.proposal.validate", operationLabel: "Validate AI proposal", source: "ai", stage: "validate", recommendation: "Regenerate the preview from the current document before applying it.", detail: "ai-proposal:stale" }); setPreview(undefined); setValidatedRevision(undefined); setStatus(`Conflict · preview revision ${preview.baseRevision}, current revision ${revision}`); return; }
    const problems = proposalValidationProblems(document, preview);
    if (problems.length > 0) { onDiagnostic?.(aiDiagnostics(problems, "ai.proposal.validate", "Validate AI proposal", "validate", "invalid", preview.commands[0]?.id)); setValidatedRevision(undefined); setStatus(`Validation failed · ${formatProblems(problems)}`); return; }
    setValidatedRevision(revision);
    setStatus("Validated · deterministic local checks passed");
  };
  const applyPreview = () => {
    if (!preview) { setStatus("Create a preview first."); return; }
    if (preview.baseRevision !== revision) { onDiagnostic?.({ code: "AI_PREVIEW_STALE", path: "$.ai.preview.baseRevision", message: `Preview revision ${preview.baseRevision} is older than current revision ${revision}.`, severity: "error", operation: "ai.proposal.apply", operationLabel: "Apply AI proposal", source: "ai", stage: "commit", recommendation: "Regenerate the preview from the current document before applying it.", detail: "ai-proposal:stale" }); setPreview(undefined); setValidatedRevision(undefined); setStatus(`Conflict · preview revision ${preview.baseRevision}, current revision ${revision}`); return; }
    if (validatedRevision !== revision) { setStatus("Validate the proposal before applying it."); return; }
    const problems = proposalValidationProblems(document, preview);
    if (problems.length > 0) { onDiagnostic?.(aiDiagnostics(problems, "ai.proposal.apply", "Apply AI proposal", "validate", "invalid", preview.commands[0]?.id)); setValidatedRevision(undefined); setStatus(`Validation failed · ${formatProblems(problems)}`); return; }
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
    if (!result.ok) { const problems = result.problems.length > 0 ? result.problems : [{ code: "AI_APPLY_FAILED", path: "$.ai.proposal", message: "The AI proposal was rejected without a detailed diagnostic." }]; onDiagnostic?.(aiDiagnostics(problems, "ai.proposal.apply", "Apply AI proposal", "commit", result.reason, preview.commands[0]?.id)); setValidatedRevision(undefined); const detail = formatProblems(result.problems); setStatus(`Apply failed · ${result.reason}${detail ? ` · ${detail}` : ""}`); return; }
    onDiagnostic?.(undefined);
    setPreview(undefined);
    setValidatedRevision(undefined);
    setStatus("Applied · one atomic SemanticCommand transaction");
  };
    return <section className="ai-operation-panel" data-testid="ai-operation-panel"><div className="ai-query-row">{icon}<label>Semantic query<input aria-label="AI semantic query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="rename selected signal to REQ" /></label><button type="button" onClick={buildPreview}>Preview</button></div><div className="ai-scope">Scope: selected Signal · Revision: {revision} · Canonical read-only query</div>{preview && <div className="ai-preview" data-testid="ai-preview"><strong>{preview.summary}</strong><span>Base revision {preview.baseRevision}</span><button type="button" data-testid="ai-validate" onClick={validatePreview}>Validate Proposal</button><button type="button" data-testid="ai-apply" onClick={applyPreview}>Apply Preview</button><button type="button" onClick={() => { onDiagnostic?.(undefined); setPreview(undefined); setValidatedRevision(undefined); setStatus("Preview cancelled · no document mutation"); }}>Cancel</button></div>}<output role="status" data-testid="ai-status">{status}</output></section>;
}
