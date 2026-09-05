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

// #395 PR2 (partial): approval policy is a real setting, not decoration --
// "Auto-apply view-only operations" only ever short-circuits the manual
// Validate/Apply *button clicks* for a proposal that has already gone
// through the exact same validatePreview/applyPreview functions everyone
// else's click goes through (see runAutoApply below). The default stays
// "Always require approval" per the issue's own explicit requirement;
// broader auto-apply modes (approved safe edit classes, full automatic
// operation) are not implemented -- only the one narrow, safe class the
// issue names explicitly (view-only) exists here.
type ApprovalPolicy = "always" | "auto-view-only";

// #395 PR2 (partial): a local, in-session Activity Log -- every
// Preview/Validate/Apply/Cancel/Conflict outcome is recorded with a
// timestamp, the provider identity, and the result, satisfying the
// issue's "must be visible and auditable" requirement for whatever this
// session's provider actually did. This is not yet the full persisted,
// cross-session log item 10 describes for an external agent (there is no
// external agent yet -- see #395's remaining PR3/PR4 scope); it is a
// real, truthful record of the one provider that exists today.
type ActivityEntry = { readonly id: number; readonly timestamp: string; readonly provider: string; readonly kind: "read-only" | "proposal"; readonly summary: string; readonly result: string };

export function AIOperationPanel({ document, revision, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range, onCommand, onCommandBatch, onViewIntent, onDiagnostic, icon, provider = deterministicMockAIProposalProvider }: { readonly document: CanonicalDocument; readonly revision: number; readonly selectedSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotationId: string | undefined; readonly selectedTransactionId: string | undefined; readonly range: Readonly<{ start: number; end: number }> | undefined; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCommandBatch?: (commands: readonly SemanticCommand[]) => CommandResult; readonly onViewIntent?: (intent: AIViewIntent) => void; readonly onDiagnostic?: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void; readonly icon: ReactNode; readonly provider?: AIProposalProvider }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<AIProposal>();
  const [validatedRevision, setValidatedRevision] = useState<number>();
  const [status, setStatus] = useState("Ready");
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy>("always");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityLog, setActivityLog] = useState<readonly ActivityEntry[]>([]);
  const providerName = provider === deterministicMockAIProposalProvider ? "Local deterministic (offline)" : "Custom provider";
  const logActivity = (kind: ActivityEntry["kind"], summary: string, result: string) => {
    setActivityLog((log) => [{ id: log.length, timestamp: new Date().toISOString(), provider: providerName, kind, summary, result }, ...log].slice(0, 50));
  };
  const buildPreview = () => {
    const result = provider.propose({ document, revision, query, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range });
    if (!result.ok) { onDiagnostic?.({ code: "AI_PROPOSAL_UNAVAILABLE", path: "$.ai.query", message: result.message, severity: "error", operation: "ai.proposal.preview", operationLabel: "Build AI proposal", source: "ai", stage: "validate", recommendation: "Adjust the request or select the required editor object, then preview again.", detail: "ai-proposal:preview" }); setPreview(undefined); setValidatedRevision(undefined); setStatus(result.message); logActivity("read-only", query, `Preview unavailable · ${result.message}`); return; }
    onDiagnostic?.(undefined);
    setPreview(result.proposal);
    setValidatedRevision(undefined);
    setStatus("Preview ready · no document mutation");
    logActivity(result.proposal.kind === "view-only" ? "read-only" : "proposal", result.proposal.summary, `Preview ready · base revision ${result.proposal.baseRevision}`);
    if (approvalPolicy === "auto-view-only" && result.proposal.kind === "view-only") runAutoApply(result.proposal);
  };
  const validatePreview = (current = preview) => {
    if (!current) { setStatus("Create a preview first."); return false; }
    if (current.baseRevision !== revision) { onDiagnostic?.({ code: "AI_PREVIEW_STALE", path: "$.ai.preview.baseRevision", message: `Preview revision ${current.baseRevision} is older than current revision ${revision}.`, severity: "error", operation: "ai.proposal.validate", operationLabel: "Validate AI proposal", source: "ai", stage: "validate", recommendation: "Regenerate the preview from the current document before applying it.", detail: "ai-proposal:stale" }); setPreview(undefined); setValidatedRevision(undefined); setStatus(`Conflict · preview revision ${current.baseRevision}, current revision ${revision}`); logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, `Conflict · preview revision ${current.baseRevision}, current revision ${revision}`); return false; }
    const problems = proposalValidationProblems(document, current);
    if (problems.length > 0) { onDiagnostic?.(aiDiagnostics(problems, "ai.proposal.validate", "Validate AI proposal", "validate", "invalid", current.commands[0]?.id)); setValidatedRevision(undefined); setStatus(`Validation failed · ${formatProblems(problems)}`); logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, `Validation failed · ${formatProblems(problems)}`); return false; }
    setValidatedRevision(revision);
    setStatus("Validated · deterministic local checks passed");
    logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, "Validated · deterministic local checks passed");
    return true;
  };
  const applyPreview = (current = preview, validated = validatedRevision) => {
    if (!current) { setStatus("Create a preview first."); return; }
    if (current.baseRevision !== revision) { onDiagnostic?.({ code: "AI_PREVIEW_STALE", path: "$.ai.preview.baseRevision", message: `Preview revision ${current.baseRevision} is older than current revision ${revision}.`, severity: "error", operation: "ai.proposal.apply", operationLabel: "Apply AI proposal", source: "ai", stage: "commit", recommendation: "Regenerate the preview from the current document before applying it.", detail: "ai-proposal:stale" }); setPreview(undefined); setValidatedRevision(undefined); setStatus(`Conflict · preview revision ${current.baseRevision}, current revision ${revision}`); logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, `Conflict · preview revision ${current.baseRevision}, current revision ${revision}`); return; }
    if (validated !== revision) { setStatus("Validate the proposal before applying it."); return; }
    const problems = proposalValidationProblems(document, current);
    if (problems.length > 0) { onDiagnostic?.(aiDiagnostics(problems, "ai.proposal.apply", "Apply AI proposal", "validate", "invalid", current.commands[0]?.id)); setValidatedRevision(undefined); setStatus(`Validation failed · ${formatProblems(problems)}`); logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, `Validation failed · ${formatProblems(problems)}`); return; }
    if (current.kind === "view-only") {
      if (!current.viewIntent || !onViewIntent) { setStatus("This view-only intent is not available in the current surface."); return; }
      onViewIntent(current.viewIntent);
      setPreview(undefined);
      setValidatedRevision(undefined);
      setStatus("Applied · view-only intent");
      logActivity("read-only", current.summary, "Applied · view-only intent");
      return;
    }
    const result = current.commands.length === 1
      ? onCommand(current.commands[0]!)
      : onCommandBatch?.(current.commands) ?? { ok: false as const, reason: "invalid" as const, problems: [] };
    if (!result.ok) { const problems = result.problems.length > 0 ? result.problems : [{ code: "AI_APPLY_FAILED", path: "$.ai.proposal", message: "The AI proposal was rejected without a detailed diagnostic." }]; onDiagnostic?.(aiDiagnostics(problems, "ai.proposal.apply", "Apply AI proposal", "commit", result.reason, current.commands[0]?.id)); setValidatedRevision(undefined); const detail = formatProblems(result.problems); setStatus(`Apply failed · ${result.reason}${detail ? ` · ${detail}` : ""}`); logActivity("proposal", current.summary, `Apply failed · ${result.reason}${detail ? ` · ${detail}` : ""}`); return; }
    onDiagnostic?.(undefined);
    setPreview(undefined);
    setValidatedRevision(undefined);
    setStatus("Applied · one atomic SemanticCommand transaction");
    logActivity("proposal", current.summary, "Applied · one atomic SemanticCommand transaction");
  };
  // Auto-apply still runs validatePreview then applyPreview -- the exact
  // same functions a manual click runs -- just back to back, and only for
  // a proposal this same call just confirmed is view-only. Passing the
  // freshly-built proposal explicitly (rather than reading `preview`
  // state) avoids relying on a state update that may not have committed
  // yet within this same event handler.
  const runAutoApply = (justBuilt: AIProposal) => {
    if (!validatePreview(justBuilt)) return;
    applyPreview(justBuilt, revision);
  };
  const cancelPreview = () => { onDiagnostic?.(undefined); if (preview) logActivity(preview.kind === "view-only" ? "read-only" : "proposal", preview.summary, "Cancelled · no document mutation"); setPreview(undefined); setValidatedRevision(undefined); setStatus("Preview cancelled · no document mutation"); };
  return <section className="ai-operation-panel" data-testid="ai-operation-panel">
    <div className="ai-query-row">{icon}<label>Semantic query<input aria-label="AI semantic query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="rename selected signal to REQ" /></label><button type="button" onClick={buildPreview}>Preview</button><button type="button" data-testid="ai-settings-toggle" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}>Settings</button></div>
    <div className="ai-scope">Scope: selected Signal · Revision: {revision} · Canonical read-only query</div>
    {settingsOpen && <div className="ai-settings" data-testid="ai-settings">
      <h4>AI Settings</h4>
      <fieldset>
        <legend>Approval Policy</legend>
        <label className="checkline"><input type="radio" name="ai-approval-policy" aria-label="Always require approval" checked={approvalPolicy === "always"} onChange={() => setApprovalPolicy("always")} />Always require approval</label>
        <label className="checkline"><input type="radio" name="ai-approval-policy" aria-label="Auto-apply view-only operations" checked={approvalPolicy === "auto-view-only"} onChange={() => setApprovalPolicy("auto-view-only")} />Auto-apply view-only operations</label>
      </fieldset>
      <div className="ai-settings-section"><h4>Agent Connection</h4><span className="inspector-note">External agents (Claude Code, Codex, other MCP clients) are not implemented yet -- there is no bridge to enable or connect.</span></div>
      <div className="ai-settings-section"><h4>Provider</h4><span className="inspector-note">{providerName}</span></div>
    </div>}
    {preview && <div className="ai-preview" data-testid="ai-preview"><strong>{preview.summary}</strong><span>Base revision {preview.baseRevision}</span><button type="button" data-testid="ai-validate" onClick={() => validatePreview()}>Validate Proposal</button><button type="button" data-testid="ai-apply" onClick={() => applyPreview()}>Apply Preview</button><button type="button" onClick={cancelPreview}>Cancel</button></div>}
    <output role="status" data-testid="ai-status">{status}</output>
    <details className="ai-activity-log" data-testid="ai-activity-log">
      <summary>AI Activity ({activityLog.length})</summary>
      {activityLog.length === 0 && <span className="inspector-note">No AI activity yet this session.</span>}
      <ol>{activityLog.map((entry) => <li key={entry.id} data-testid="ai-activity-entry"><time dateTime={entry.timestamp}>{entry.timestamp}</time><span className="ai-activity-provider">{entry.provider}</span><span className="ai-activity-kind">{entry.kind === "read-only" ? "Read-only" : "Proposal"}</span><span className="ai-activity-summary">{entry.summary}</span><span className="ai-activity-result">{entry.result}</span></li>)}</ol>
    </details>
  </section>;
}
