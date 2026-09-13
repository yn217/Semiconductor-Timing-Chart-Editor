import { useEffect, useState } from "react";
import { useRef, type ReactNode } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { planCommand } from "@timing-chart-v2/commands";
import { validateCanonicalDocument, type CanonicalDocument, type DocumentProblem, type GroupId, type SignalId } from "@timing-chart-v2/schema";
import { deterministicMockAIProposalProvider, type AIProposal, type AIProposalProvider, type AIViewIntent } from "./ai-proposal-provider.js";
import { useAIBridgeClient, type AIBridgeStatus } from "./ai-bridge-client.js";

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
type ActivityEntry = { readonly id: number; readonly timestamp: string; readonly provider: string; readonly actor: "user" | "external-agent"; readonly kind: "read-only" | "proposal"; readonly summary: string; readonly result: string };

// #395 PR5 (part 3): "Context / Scope" -- the acceptance list's own item 2
// ("Scope can be switched Selection / Current View / Document") names a
// real, switchable control, not a static label. Every existing command
// that edits an *existing* Signal/Group/Annotation/Transaction here
// already targets exactly the current selection (there is no "rename the
// signal named X" form for those four entity kinds -- only Bookmarks/Time
// Groups resolve an edit target by name, and neither has a selection
// concept in AIProposalRequest at all, so they stay outside this gate in
// every scope, same as today). That makes Selection/Current View scope
// gating both safe (no existing selected-entity query can ever fail it)
// and truthful (it actually narrows what CAN be edited, not just what the
// status line claims). Document is the default -- it is the literal
// pre-#395-PR5 behavior (no gating at all), so choosing a default other
// than the narrowest option here is not a silent widening of anything.
type AIScope = "selection" | "current-view" | "document";
const scopeLabel = (scope: AIScope): string => scope === "selection" ? "Selection" : scope === "current-view" ? "Current View" : "Document";

function scopeViolationMessage(scope: AIScope, document: CanonicalDocument, command: SemanticCommand, selectedSignalId: SignalId | undefined, selectedGroupId: GroupId | undefined, selectedAnnotationId: string | undefined, selectedTransactionId: string | undefined): string | undefined {
  if (scope === "document") return undefined;
  const record = command as unknown as Record<string, unknown>;
  // A Group is "selected" either directly (selectedGroupId) or by having a
  // selected Signal inside it -- exactly the same fallback
  // ai-proposal-provider.ts's own selectedGroup() helper uses to resolve
  // "selected group" queries. Checking only the direct id would falsely
  // flag every "rename selected group" query issued while a Signal (not
  // the group row itself) is selected as a scope violation, even though
  // that query already only ever targets the real, definitionally-
  // selected group.
  const inferredGroupId = selectedGroupId ?? document.signalGroups.find((group) => selectedSignalId !== undefined && group.rows.includes(selectedSignalId))?.id;
  const checks: readonly { readonly field: string; readonly label: string; readonly selectedId: string | undefined; readonly visible: (id: string) => boolean }[] = [
    { field: "signalId", label: "Signal", selectedId: selectedSignalId, visible: (id) => document.signals.find((signal) => signal.id === id)?.display.visible !== false },
    { field: "groupId", label: "Group", selectedId: inferredGroupId, visible: () => true },
    { field: "annotationId", label: "Annotation", selectedId: selectedAnnotationId, visible: (id) => document.annotations.find((annotation) => annotation.id === id)?.visible !== false },
    { field: "transactionId", label: "Transaction", selectedId: selectedTransactionId, visible: () => true },
  ];
  for (const check of checks) {
    const id = record[check.field];
    if (typeof id !== "string") continue;
    if (scope === "selection" && id !== check.selectedId) return `${check.label} '${id}' is outside the Selection scope -- switch Scope to Document to edit an entity other than the current selection.`;
    if (scope === "current-view" && !check.visible(id)) return `${check.label} '${id}' is hidden and outside the Current View scope -- switch Scope to Document to edit a hidden entity.`;
  }
  return undefined;
}

export function AIOperationPanel({ document, revision, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range, onCommand, onCommandBatch, onViewIntent, onDiagnostic, icon, provider = deterministicMockAIProposalProvider, bridgeHost, bridgePort, bridgeEnabled, onBridgeEnabledChange, bridgeToken, onBridgeTokenChange, onBridgeStatusChange, getZoom }: { readonly document: CanonicalDocument; readonly revision: number; readonly selectedSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotationId: string | undefined; readonly selectedTransactionId: string | undefined; readonly range: Readonly<{ start: number; end: number }> | undefined; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCommandBatch?: (commands: readonly SemanticCommand[]) => CommandResult; readonly onViewIntent?: (intent: AIViewIntent) => void; readonly onDiagnostic?: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void; readonly icon: ReactNode; readonly provider?: AIProposalProvider; readonly bridgeHost: string; readonly bridgePort: number; readonly bridgeEnabled: boolean; readonly onBridgeEnabledChange: (enabled: boolean) => void; readonly bridgeToken: string; readonly onBridgeTokenChange: (token: string) => void; readonly onBridgeStatusChange?: (status: AIBridgeStatus) => void; readonly getZoom?: () => number }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<AIProposal>();
  const [validatedRevision, setValidatedRevision] = useState<number>();
  const [status, setStatus] = useState("Ready");
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy>("always");
  const [scope, setScope] = useState<AIScope>("document");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityLog, setActivityLog] = useState<readonly ActivityEntry[]>([]);
  // Activity entries outlive the retention window: the retained array is a
  // view, not an identity allocator.  Keeping the sequence outside the
  // trimmed state prevents the first 50-entry boundary from reusing a live
  // React/audit ID.
  const nextActivityId = useRef(0);
  const providerName = provider === deterministicMockAIProposalProvider ? "Local deterministic (offline)" : "Custom provider";
  const logActivity = (kind: ActivityEntry["kind"], summary: string, result: string, actor: ActivityEntry["actor"] = "user") => {
    const id = nextActivityId.current++;
    setActivityLog((log) => [{ id, timestamp: new Date().toISOString(), provider: providerName, actor, kind, summary, result }, ...log].slice(0, 50));
  };
  const buildPreview = (queryOverride?: string, actor: ActivityEntry["actor"] = "user") => {
    const effectiveQuery = queryOverride ?? query;
    let result = provider.propose({ document, revision, query: effectiveQuery, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range });
    if (result.ok) {
      const violation = result.proposal.commands.map((proposedCommand) => scopeViolationMessage(scope, document, proposedCommand, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId)).find((message) => message !== undefined);
      if (violation) result = { ok: false, message: violation };
    }
    if (!result.ok) { onDiagnostic?.({ code: "AI_PROPOSAL_UNAVAILABLE", path: "$.ai.query", message: result.message, severity: "error", operation: "ai.proposal.preview", operationLabel: "Build AI proposal", source: "ai", stage: "validate", recommendation: "Adjust the request or select the required editor object, then preview again.", detail: "ai-proposal:preview" }); setPreview(undefined); setValidatedRevision(undefined); setStatus(result.message); logActivity("read-only", effectiveQuery, `Preview unavailable · ${result.message}`, actor); return result; }
    onDiagnostic?.(undefined);
    if (queryOverride !== undefined) setQuery(queryOverride);
    setPreview(result.proposal);
    setValidatedRevision(undefined);
    // #395 PR4: a proposal submitted by an external agent still always
    // lands here -- in Preview, requiring the same manual Validate/Apply
    // the local UI's own Preview button requires. There is no bridge-side
    // "apply" tool (see ai-bridge-client.ts's PROPOSAL_TOOLS): approval
    // policy (above) only ever covers auto-applying a *view-only*
    // proposal the user's own Preview click just built, never an
    // external agent's document-changing proposal.
    setStatus(actor === "external-agent" ? "Proposal ready for review (submitted by external agent) · no document mutation yet" : "Preview ready · no document mutation");
    logActivity(result.proposal.kind === "view-only" ? "read-only" : "proposal", result.proposal.summary, actor === "external-agent" ? "Proposal ready for review (external agent) · no document mutation yet" : `Preview ready · base revision ${result.proposal.baseRevision}`, actor);
    if (actor === "user" && approvalPolicy === "auto-view-only" && result.proposal.kind === "view-only") runAutoApply(result.proposal);
    return result;
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

  // #395 PR4: propose_edit is the one MCP tool that reaches into document-
  // changing territory -- and it still only ever *builds a preview*,
  // through buildPreview above, exactly as if the user had typed the same
  // query and clicked Preview. It never validates or applies on its own;
  // there is no bridge-side apply path for a document-changing proposal at
  // all (see the comment on buildPreview above and ai-bridge-client.ts's
  // PROPOSAL_TOOLS), so an external agent can request a change but a
  // human must still explicitly Validate + Apply it here.
  const onProposeEdit = (proposalQuery: string): { readonly error: string } | { readonly summary: string; readonly baseRevision: number; readonly kind: string; readonly requiresApproval: true; readonly message: string } => {
    const result = buildPreview(proposalQuery, "external-agent");
    if (!result.ok) return { error: result.message };
    return { summary: result.proposal.summary, baseRevision: result.proposal.baseRevision, kind: result.proposal.kind, requiresApproval: true, message: "Proposal ready for review -- open the AI Assistant panel to Validate and Apply it." };
  };
  // #395 PR5: get_viewport_snapshot() is read-only, exactly like
  // get_document_summary/get_selection -- it never mutates anything. It
  // returns the structured "Element Map" the issue asks for (stable
  // SignalIds, name/role/type/group/pane/visibility, current selection,
  // zoom, and cycle count) so an external agent can reason about layout
  // and target edits at real semantic/stable IDs. It deliberately does
  // NOT include a rasterized viewport image: the issue's own constraint
  // ("any resulting edit must target semantic/stable IDs and existing
  // command fields, not raw pixel coordinates") means the structured map
  // is what actually matters for a safe edit, and a full pixel capture
  // would add a real dependency + a much larger, harder-to-audit payload
  // over the token-gated bridge for no corresponding gain in this pass.
  const onGetViewportSnapshot = () => {
    const groupOfRow = new Map<string, string>();
    for (const group of document.signalGroups) for (const rowId of group.rows) groupOfRow.set(rowId, group.id);
    const elementMap = document.signals.map((signal) => ({
      id: signal.id,
      kind: "signal" as const,
      name: signal.display.name || signal.name,
      role: signal.role,
      type: signal.type,
      groupId: groupOfRow.get(signal.id),
      visible: signal.display.visible !== false,
    }));
    return {
      zoom: getZoom?.() ?? 1,
      cycleCount: document.timeline.cycleCount,
      selection: { selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId },
      elementMap,
    };
  };
  const bridgeStatus = useAIBridgeClient(bridgeEnabled, bridgeHost, bridgePort, bridgeToken, { document, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, onViewIntent, onProposeEdit, onGetViewportSnapshot });
  useEffect(() => { onBridgeStatusChange?.(bridgeStatus); }, [bridgeStatus, onBridgeStatusChange]);

  return <section className="ai-operation-panel" data-testid="ai-operation-panel">
    <div className="ai-query-row">{icon}<label>Semantic query<input aria-label="AI semantic query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="rename selected signal to REQ" /></label><button type="button" onClick={() => buildPreview()}>Preview</button><button type="button" data-testid="ai-settings-toggle" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}>Settings</button></div>
    <div className="ai-scope">Scope: <label>{" "}<select aria-label="AI context scope" data-testid="ai-scope-select" value={scope} onChange={(event) => setScope(event.target.value as AIScope)}><option value="selection">Selection</option><option value="current-view">Current View</option><option value="document">Document</option></select></label> · Revision: {revision} · Canonical read-only query · Allowed to edit: {scopeLabel(scope)}</div>
    {settingsOpen && <div className="ai-settings" data-testid="ai-settings">
      <h4>AI Settings</h4>
      <fieldset>
        <legend>Approval Policy</legend>
        <label className="checkline"><input type="radio" name="ai-approval-policy" aria-label="Always require approval" checked={approvalPolicy === "always"} onChange={() => setApprovalPolicy("always")} />Always require approval</label>
        <label className="checkline"><input type="radio" name="ai-approval-policy" aria-label="Auto-apply view-only operations" checked={approvalPolicy === "auto-view-only"} onChange={() => setApprovalPolicy("auto-view-only")} />Auto-apply view-only operations</label>
      </fieldset>
      <div className="ai-settings-section"><h4>Agent Connection</h4>
        <span className="inspector-note">Protocol: MCP (Streamable HTTP, simplified) · Bridge: {bridgeHost}:{bridgePort} · Start it with <code>npm run ai-bridge</code>.</span>
        <label className="checkline"><input type="checkbox" aria-label="Enable external agents" checked={bridgeEnabled} onChange={(event) => onBridgeEnabledChange(event.target.checked)} />Enable external agents</label>
        <label>Local connection token<input aria-label="Bridge connection token" value={bridgeToken} onChange={(event) => onBridgeTokenChange(event.target.value)} placeholder="paste the token printed by npm run ai-bridge" /></label>
        <output data-testid="ai-bridge-status" role="status">Status: {bridgeStatus === "connected" ? "Connected" : bridgeStatus === "connecting" ? "Connecting…" : bridgeStatus === "error" ? "Disconnected · check the token and that the bridge is running" : "Disconnected"}</output>
      </div>
      <div className="ai-settings-section"><h4>Provider</h4><span className="inspector-note">{providerName}</span></div>
    </div>}
    {preview && <div className="ai-preview" data-testid="ai-preview"><strong>{preview.summary}</strong><span>Base revision {preview.baseRevision}</span><button type="button" data-testid="ai-validate" onClick={() => validatePreview()}>Validate Proposal</button><button type="button" data-testid="ai-apply" onClick={() => applyPreview()}>Apply Preview</button><button type="button" onClick={cancelPreview}>Cancel</button></div>}
    <output role="status" data-testid="ai-status">{status}</output>
    <details className="ai-activity-log" data-testid="ai-activity-log">
      <summary>AI Activity ({activityLog.length})</summary>
      {activityLog.length === 0 && <span className="inspector-note">No AI activity yet this session.</span>}
      <ol>{activityLog.map((entry) => <li key={entry.id} data-testid="ai-activity-entry" data-actor={entry.actor}><time dateTime={entry.timestamp}>{entry.timestamp}</time><span className="ai-activity-provider">{entry.provider}</span><span className="ai-activity-actor">{entry.actor === "external-agent" ? "External agent" : "You"}</span><span className="ai-activity-kind">{entry.kind === "read-only" ? "Read-only" : "Proposal"}</span><span className="ai-activity-summary">{entry.summary}</span><span className="ai-activity-result">{entry.result}</span></li>)}</ol>
    </details>
  </section>;
}
