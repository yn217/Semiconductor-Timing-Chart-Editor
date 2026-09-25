import { useEffect, useState } from "react";
import { useRef, type ReactNode } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import { planCommand } from "@timing-chart-v2/commands";
import { validateCanonicalDocument, type CanonicalDocument, type DocumentProblem, type GroupId, type SignalId } from "@timing-chart-v2/schema";
import { buildTypedAnnotationProposal, buildTypedBookmarkProposal, buildTypedSignalGroupProposal, buildTypedSignalProposal, buildTypedTimelineProposal, buildTypedTimeGroupProposal, buildTypedTransactionGroupProposal, buildTypedTransactionProposal, deterministicMockAIProposalProvider, type AIProposal, type AIProposalProvider, type AIViewIntent } from "./ai-proposal-provider.js";
import { probeAIBridge, useAIBridgeClient, type AIBridgeStatus, type AIBridgeViewOperation, type AISelectionEntityType } from "./ai-bridge-client.js";
import { buildAIClientConfig, buildAIMcpEndpoint, type AIClientSetup } from "./ai-connection-guide.js";

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

/** Revision numbers can repeat after Open/New, so AI freshness uses the
 * runtime-owned document epoch as a second synchronous boundary. */
export function isAIPreviewFresh(input: { readonly proposalEpoch: number | undefined; readonly currentEpoch: number; readonly proposalRevision: number; readonly currentRevision: number }): boolean {
  return input.proposalEpoch !== undefined && input.proposalEpoch === input.currentEpoch && input.proposalRevision === input.currentRevision;
}

/** Render a reviewable, ordered summary of the actual semantic commands in
 * an external proposal. Stable IDs are included so same-named entities are
 * never ambiguous to a reviewer. */
export function describeAIProposalCommands(document: CanonicalDocument, commands: readonly SemanticCommand[]): readonly Readonly<{ title: string; detail: string }>[] {
  const proposedTransactionNames = new Map<string, string>();
  const transactionName = (id: string) => proposedTransactionNames.get(id) ?? document.transactions.find((item) => item.id === id)?.name ?? id;
  const signalName = (id: string) => document.signals.find((item) => item.id === id)?.display.name ?? id;
  return commands.map((command) => {
    switch (command.type) {
      case "transaction.create": {
        proposedTransactionNames.set(command.transaction.id, command.transaction.name);
        return { title: `Create Transaction ${command.transaction.name}`, detail: `${command.transaction.start}–${command.transaction.end} source cycles · ID ${command.transaction.id}` };
      }
      case "transaction.phaseAdd":
        return { title: `Add Phase ${command.phase.name} to ${transactionName(command.transactionId)}`, detail: `${command.phase.start}–${command.phase.end} source cycles · Transaction ID ${command.transactionId}` };
      case "transaction.phaseUpdate":
        return { title: `Update Phase ${command.phase.name} in ${transactionName(command.transactionId)}`, detail: `${command.phase.start}–${command.phase.end} source cycles · Transaction ID ${command.transactionId}` };
      case "transaction.phaseDelete": {
        const phase = document.transactions.find((item) => item.id === command.transactionId)?.phases?.[command.phaseIndex];
        return { title: `Delete Phase ${phase?.name ?? `#${command.phaseIndex + 1}`} from ${transactionName(command.transactionId)}`, detail: `Transaction ID ${command.transactionId}` };
      }
      case "transaction.linkSignal":
      case "transaction.unlinkSignal":
        return { title: `${command.type === "transaction.linkSignal" ? "Link" : "Unlink"} Signal ${signalName(command.signalId)} ${command.type === "transaction.linkSignal" ? "to" : "from"} ${transactionName(command.transactionId)}`, detail: `Signal ID ${command.signalId} · Transaction ID ${command.transactionId}` };
      case "transaction.update":
        return { title: `Update Transaction ${transactionName(command.transactionId)}`, detail: `${command.start}–${command.end} source cycles · Transaction ID ${command.transactionId}` };
      case "transaction.move":
        return { title: `Move Transaction ${transactionName(command.transactionId)}`, detail: `Start at source cycle ${command.start} · Transaction ID ${command.transactionId}` };
      case "transaction.resize":
        return { title: `Resize Transaction ${transactionName(command.transactionId)} ${command.edge}`, detail: `Boundary ${command.value} source cycles · Transaction ID ${command.transactionId}` };
      case "transaction.delete":
        return { title: `Delete Transaction ${transactionName(command.transactionId)}`, detail: `Transaction ID ${command.transactionId}` };
      case "signal.rename":
        return { title: `Rename Signal ${signalName(command.signalId)} to ${command.name}`, detail: `Signal ID ${command.signalId}` };
      case "signal.move":
        return { title: `Move Signal ${signalName(command.signalId)}`, detail: `Signal ID ${command.signalId} · Group ID ${command.targetGroupId} · position ${command.index + 1}` };
      case "group.create":
        return { title: `Create Signal Group ${command.group.name}`, detail: `Group ID ${command.group.id}` };
      case "group.rename":
        return { title: `Rename Signal Group to ${command.name}`, detail: `Group ID ${command.groupId}` };
      case "group.move":
        return { title: `Move Signal Group to position ${command.index + 1}`, detail: `Group ID ${command.groupId}` };
      case "group.delete":
        return { title: "Delete Signal Group", detail: `Group ID ${command.groupId}` };
      case "timeline.insert":
        return { title: `Insert ${command.count} cycles`, detail: `At source cycle ${command.at}` };
      case "timeline.delete":
        return { title: "Delete source-cycle range", detail: `${command.start}–${command.end}` };
      case "timeline.moveRange":
        return { title: "Move source-cycle range", detail: `${command.start}–${command.end} to ${command.to}` };
      case "timeline.duplicateRange":
        return { title: "Duplicate source-cycle range", detail: `${command.start}–${command.end} at ${command.at}` };
      default:
        return { title: command.type.replaceAll(".", " "), detail: `Command ID ${command.id}` };
    }
  });
}

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

export function AIOperationPanel({ document, documentEpoch, revision, mode, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, range, onCommand, onCommandBatch, onViewIntent, onViewOperation, onSetSelection, onDiagnostic, icon, provider = deterministicMockAIProposalProvider, bridgeHost, bridgePort, bridgeEnabled, onBridgeEnabledChange, bridgeToken, onBridgeTokenChange, onBridgeStatusChange, getZoom }: { readonly document: CanonicalDocument; readonly documentEpoch: number; readonly revision: number; readonly mode: "Cycle" | "Transaction" | "Combined"; readonly selectedSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotationId: string | undefined; readonly selectedTransactionId: string | undefined; readonly range: Readonly<{ start: number; end: number }> | undefined; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCommandBatch?: (commands: readonly SemanticCommand[]) => CommandResult; readonly onViewIntent?: (intent: AIViewIntent) => void; readonly onViewOperation?: (operation: AIBridgeViewOperation, args: Readonly<Record<string, unknown>>) => void; readonly onSetSelection?: (target: Readonly<{ entityType: AISelectionEntityType; entityId: string }>) => void; readonly onDiagnostic?: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void; readonly icon: ReactNode; readonly provider?: AIProposalProvider; readonly bridgeHost: string; readonly bridgePort: number; readonly bridgeEnabled: boolean; readonly onBridgeEnabledChange: (enabled: boolean) => void; readonly bridgeToken: string; readonly onBridgeTokenChange: (token: string) => void; readonly onBridgeStatusChange?: (status: AIBridgeStatus) => void; readonly getZoom?: () => number }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<AIProposal>();
  const [validatedRevision, setValidatedRevision] = useState<number>();
  const [previewDocumentEpoch, setPreviewDocumentEpoch] = useState<number>();
  const [validatedDocumentEpoch, setValidatedDocumentEpoch] = useState<number>();
  const [status, setStatus] = useState("Ready");
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy>("always");
  const [scope, setScope] = useState<AIScope>("document");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionGuideOpen, setConnectionGuideOpen] = useState(false);
  const [setupClient, setSetupClient] = useState<AIClientSetup>("codex");
  const [copyStatus, setCopyStatus] = useState("");
  const [localBridgeFound, setLocalBridgeFound] = useState<boolean>();
  const [activityLog, setActivityLog] = useState<readonly ActivityEntry[]>([]);
  const previousDocumentEpochRef = useRef(documentEpoch);
  // Activity entries outlive the retention window: the retained array is a
  // view, not an identity allocator.  Keeping the sequence outside the
  // trimmed state prevents the first 50-entry boundary from reusing a live
  // React/audit ID.
  const nextActivityId = useRef(0);
  const providerName = provider === deterministicMockAIProposalProvider ? "Local deterministic (offline)" : "Custom provider";
  const mcpEndpoint = buildAIMcpEndpoint(bridgeHost, bridgePort);
  const setupConfig = buildAIClientConfig(setupClient, mcpEndpoint);
  useEffect(() => {
    if (!connectionGuideOpen) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const found = await probeAIBridge(bridgeHost, bridgePort);
      if (cancelled) return;
      setLocalBridgeFound(found);
      if (!found) timer = setTimeout(() => void check(), 1200);
    };
    void check();
    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); };
  }, [connectionGuideOpen, bridgeHost, bridgePort]);
  const copySetupText = async (text: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied`);
    } catch {
      setCopyStatus("Copy unavailable · select and copy the text manually");
    }
  };
  useEffect(() => {
    if (previousDocumentEpochRef.current === documentEpoch) return;
    previousDocumentEpochRef.current = documentEpoch;
    // Open/New replacement is a document boundary even when the incoming
    // session starts at the same revision. Keep user policy and audit history,
    // but never carry a proposal or its validation across that boundary.
    setPreview(undefined);
    setValidatedRevision(undefined);
    setPreviewDocumentEpoch(undefined);
    setValidatedDocumentEpoch(undefined);
    setStatus("Ready · document replaced");
  }, [documentEpoch]);
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
    setPreviewDocumentEpoch(documentEpoch);
    setValidatedDocumentEpoch(undefined);
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
  const validatePreview = (current = preview, proposalEpoch = previewDocumentEpoch) => {
    if (!current) { setStatus("Create a preview first."); return false; }
    if (!isAIPreviewFresh({ proposalEpoch, currentEpoch: documentEpoch, proposalRevision: current.baseRevision, currentRevision: revision })) { onDiagnostic?.({ code: "AI_PREVIEW_STALE", path: "$.ai.preview.baseRevision", message: "Preview is out of date. Regenerate it.", severity: "error", operation: "ai.proposal.validate", operationLabel: "Validate AI proposal", source: "ai", stage: "validate", recommendation: "Regenerate the preview from the current document before applying it.", detail: "ai-proposal:stale" }); setPreview(undefined); setValidatedRevision(undefined); setPreviewDocumentEpoch(undefined); setValidatedDocumentEpoch(undefined); setStatus("Preview is out of date. Regenerate it."); logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, "Preview is out of date. Regenerate it."); return false; }
    const problems = proposalValidationProblems(document, current);
    if (problems.length > 0) { onDiagnostic?.(aiDiagnostics(problems, "ai.proposal.validate", "Validate AI proposal", "validate", "invalid", current.commands[0]?.id)); setValidatedRevision(undefined); setStatus(`Validation failed · ${formatProblems(problems)}`); logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, `Validation failed · ${formatProblems(problems)}`); return false; }
    setValidatedRevision(revision);
    setValidatedDocumentEpoch(documentEpoch);
    setStatus("Validated · deterministic local checks passed");
    logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, "Validated · deterministic local checks passed");
    return true;
  };
  const applyPreview = (current = preview, validated = validatedRevision, proposalEpoch = previewDocumentEpoch, validatedEpoch = validatedDocumentEpoch) => {
    if (!current) { setStatus("Create a preview first."); return; }
    if (!isAIPreviewFresh({ proposalEpoch, currentEpoch: documentEpoch, proposalRevision: current.baseRevision, currentRevision: revision })) { onDiagnostic?.({ code: "AI_PREVIEW_STALE", path: "$.ai.preview.baseRevision", message: "Preview is out of date. Regenerate it.", severity: "error", operation: "ai.proposal.apply", operationLabel: "Apply AI proposal", source: "ai", stage: "commit", recommendation: "Regenerate the preview from the current document before applying it.", detail: "ai-proposal:stale" }); setPreview(undefined); setValidatedRevision(undefined); setPreviewDocumentEpoch(undefined); setValidatedDocumentEpoch(undefined); setStatus("Preview is out of date. Regenerate it."); logActivity(current.kind === "view-only" ? "read-only" : "proposal", current.summary, "Preview is out of date. Regenerate it."); return; }
    if (validated !== revision || validatedEpoch !== documentEpoch) { setStatus("Validate the proposal before applying it."); return; }
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
    setPreviewDocumentEpoch(undefined);
    setValidatedDocumentEpoch(undefined);
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
    if (!validatePreview(justBuilt, documentEpoch)) return;
    applyPreview(justBuilt, revision, documentEpoch, documentEpoch);
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
  const onProposeTypedEdit = (tool: string, args: Readonly<Record<string, unknown>>): { readonly error: string } | { readonly summary: string; readonly baseRevision: number; readonly kind: string; readonly requiresApproval: true; readonly message: string } => {
    let result = tool === "propose_insert_cycles" || tool === "propose_delete_cycles" || tool === "propose_move_range" || tool === "propose_duplicate_range"
      ? buildTypedTimelineProposal(document, revision, tool, args)
      : tool === "propose_create_signal_group" || tool === "propose_rename_signal_group" || tool === "propose_move_signal_group" || tool === "propose_delete_signal_group"
        ? buildTypedSignalGroupProposal(document, revision, tool, args)
      : tool === "propose_create_transaction_group" || tool === "propose_rename_transaction_group" || tool === "propose_delete_transaction_group"
        ? buildTypedTransactionGroupProposal(document, revision, tool, args)
      : tool === "propose_create_time_group" || tool === "propose_update_time_group" || tool === "propose_delete_time_group"
        ? buildTypedTimeGroupProposal(document, revision, tool, args)
      : tool === "propose_create_transaction" || tool === "propose_update_transaction" || tool === "propose_move_transaction" || tool === "propose_resize_transaction" || tool === "propose_delete_transaction" || tool === "propose_add_phase" || tool === "propose_update_phase" || tool === "propose_delete_phase" || tool === "propose_link_signal" || tool === "propose_unlink_signal"
          ? buildTypedTransactionProposal(document, revision, tool, args)
      : tool === "propose_create_bookmark" || tool === "propose_move_bookmark" || tool === "propose_update_bookmark" || tool === "propose_delete_bookmark"
            ? buildTypedBookmarkProposal(document, revision, tool, args)
            : tool === "propose_create_annotation" || tool === "propose_update_annotation" || tool === "propose_delete_annotation"
              ? buildTypedAnnotationProposal(document, revision, tool, args)
            : buildTypedSignalProposal(document, revision, tool, args);
    if (result.ok) {
      const violation = result.proposal.commands.map((proposedCommand) => scopeViolationMessage(scope, document, proposedCommand, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId)).find((message) => message !== undefined);
      if (violation) result = { ok: false, message: violation };
    }
    if (!result.ok) return { error: result.message };
    onDiagnostic?.(undefined);
    setPreview(result.proposal);
    setValidatedRevision(undefined);
    setPreviewDocumentEpoch(documentEpoch);
    setValidatedDocumentEpoch(undefined);
    setStatus("Proposal ready for review (submitted by external agent) · no document mutation yet");
    logActivity("proposal", result.proposal.summary, `Preview ready · base revision ${result.proposal.baseRevision}`, "external-agent");
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
  const onGetViewContext = () => ({ mode, range, zoom: getZoom?.(), selection: { selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId } });
  const bridgeStatus = useAIBridgeClient(bridgeEnabled, bridgeHost, bridgePort, bridgeToken, { document, documentEpoch, revision, mode, selectedSignalId, selectedGroupId, selectedAnnotationId, selectedTransactionId, onViewIntent, onViewOperation, onSetSelection, onProposeEdit, onProposeTypedEdit, onGetViewportSnapshot, onGetViewContext });
  useEffect(() => { onBridgeStatusChange?.(bridgeStatus); }, [bridgeStatus, onBridgeStatusChange]);

  return <section className="ai-operation-panel" data-testid="ai-operation-panel">
    <div className="ai-query-row">{icon}<label>Semantic query<input aria-label="AI semantic query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="rename selected signal to REQ" /></label><button type="button" onClick={() => buildPreview()}>Preview</button><button type="button" data-testid="ai-connect-external" onClick={() => { setSettingsOpen(true); setConnectionGuideOpen(true); }}>Connect External AI</button><button type="button" data-testid="ai-settings-toggle" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}>Settings</button></div>
    <div className="ai-scope">Scope: <label>{" "}<select aria-label="AI context scope" data-testid="ai-scope-select" value={scope} onChange={(event) => setScope(event.target.value as AIScope)}><option value="selection">Selection</option><option value="current-view">Current View</option><option value="document">Document</option></select></label> · Revision: {revision} · Canonical read-only query · Allowed to edit: {scopeLabel(scope)}</div>
    {settingsOpen && <div className="ai-settings" data-testid="ai-settings">
      <h4>AI Settings</h4>
      <fieldset>
        <legend>Approval Policy</legend>
        <label className="checkline"><input type="radio" name="ai-approval-policy" aria-label="Always require approval" checked={approvalPolicy === "always"} onChange={() => setApprovalPolicy("always")} />Always require approval</label>
        <label className="checkline"><input type="radio" name="ai-approval-policy" aria-label="Auto-apply view-only operations" checked={approvalPolicy === "auto-view-only"} onChange={() => setApprovalPolicy("auto-view-only")} />Auto-apply view-only operations</label>
      </fieldset>
      <div className="ai-settings-section"><h4>Agent Connection</h4>
        <span className="inspector-note">MCP over local HTTP · endpoint <code>{mcpEndpoint}</code>. The editor does not start background processes; start the bridge from a terminal.</span>
        <button type="button" data-testid="ai-connection-guide-toggle" aria-expanded={connectionGuideOpen} onClick={() => setConnectionGuideOpen((open) => !open)}>{connectionGuideOpen ? "Hide setup guide" : "How to connect"}</button>
        {connectionGuideOpen && <div className="ai-connection-guide" data-testid="ai-connection-guide">
          <ol>
            <li><strong>1. Start the local bridge</strong><span>From the project folder, run this command in a terminal. It prints two different secrets: the MCP client token and the Editor transport token. Keep both private and use each only for its named purpose.</span><pre>npm run ai-bridge</pre><button type="button" onClick={() => void copySetupText("npm run ai-bridge", "Bridge command")}>Copy command</button><button type="button" data-testid="ai-check-bridge" onClick={() => void probeAIBridge(bridgeHost, bridgePort).then(setLocalBridgeFound)}>Check Bridge</button><output data-testid="ai-bridge-probe" role="status">{localBridgeFound === true ? `Bridge found at ${bridgeHost}:${bridgePort}` : localBridgeFound === false ? `Cannot reach Local Agent Bridge at ${bridgeHost}:${bridgePort}. Run: npm run ai-bridge` : "Checking localhost for the bridge…"}</output></li>
            <li><strong>2. Configure your MCP client</strong><span>Choose a client and add this configuration. Use the MCP client token only; the separate Editor transport token must not be shared with MCP clients.</span><label>Client<select aria-label="MCP client setup" value={setupClient} onChange={(event) => setSetupClient(event.target.value as AIClientSetup)}><option value="codex">Codex</option><option value="claude-code">Claude Code</option><option value="generic">Other MCP client</option></select></label><pre data-testid="ai-client-config">{setupConfig}</pre><button type="button" onClick={() => void copySetupText(setupConfig, "MCP config")}>Copy config</button><span className="inspector-note">Set <code>TIMING_CHART_MCP_TOKEN</code> to the bridge's MCP client token in the MCP client's launch environment. In Windows PowerShell, use <code>$env:TIMING_CHART_MCP_TOKEN = "&lt;MCP client token&gt;"</code>, then start the client from that same terminal. Add the TOML to <code>~/.codex/config.toml</code> for Codex, or the JSON entry to <code>.mcp.json</code> for Claude Code. Other clients may require their own auth-header syntax.</span></li>
            <li><strong>3. Connect the Editor tab</strong><span>Paste the Editor transport token below, then enable external agents. Never paste the MCP client token here. “Bridge running” confirms only local reachability; it does not mean an MCP client is connected.</span></li>
            <li><strong>4. Verify the real MCP client</strong><span>From the configured Codex, Claude Code, or other MCP client, call <code>list_editor_sessions</code>, then <code>get_document_summary</code> with the returned <code>editorSessionId</code>. This proves the client—not just this browser tab—can read the open document. The status changes to “External AI client connected” only after a real client request.</span></li>
            <li><strong>5. Try a first request</strong><span>Copy a read-only request first. For an edit, ask the client to create a proposal and leave it for review; document changes still require Validate and Apply here.</span><pre data-testid="ai-first-read-prompt">Use the Timing Chart MCP tools: call list_editor_sessions, choose the session for the document open in this tab, then call get_document_summary with its editorSessionId. Report the signalCount and transactionCount. Do not edit the document.</pre><button type="button" onClick={() => void copySetupText("Use the Timing Chart MCP tools: call list_editor_sessions, choose the session for the document open in this tab, then call get_document_summary with its editorSessionId. Report the signalCount and transactionCount. Do not edit the document.", "Read-only first request")}>Copy read-only request</button><pre data-testid="ai-first-edit-prompt">Use get_selection to identify the selected Signal by stable signalId. Create a rename proposal to REQ with propose_rename_signal. Do not Validate or Apply it; leave the proposal for my review.</pre><button type="button" onClick={() => void copySetupText("Use get_selection to identify the selected Signal by stable signalId. Create a rename proposal to REQ with propose_rename_signal. Do not Validate or Apply it; leave the proposal for my review.", "First edit request")}>Copy edit request</button></li>
          </ol>
          {copyStatus && <output role="status" data-testid="ai-setup-copy-status">{copyStatus}</output>}
        </div>}
        <label className="checkline"><input type="checkbox" aria-label="Enable external agents" checked={bridgeEnabled} onChange={(event) => onBridgeEnabledChange(event.target.checked)} />Enable external agents</label>
        <label>Editor transport token<input aria-label="Editor transport token" type="password" autoComplete="off" value={bridgeToken} onChange={(event) => onBridgeTokenChange(event.target.value)} placeholder="paste the Editor transport token printed by npm run ai-bridge" /></label>
        {/* #778 Phase 1: "Bridge running" and "a real external AI client is attached" are different facts and
            must never be worded the same way -- a truthful status is required so a user can tell a merely-
            started local process from an actual Claude Code/Codex/MCP-client connection. */}
        <output data-testid="ai-bridge-status" role="status" data-bridge-status={bridgeStatus}>Status: {bridgeStatus === "connected-external-client" ? "External AI client connected" : bridgeStatus === "connected" ? "Bridge running · no external AI client connected yet" : bridgeStatus === "connecting" ? "Connecting…" : bridgeStatus === "token-required" ? "Bridge found · enter the connection token" : bridgeStatus === "invalid-token" ? "Bridge rejected the token · copy the token printed when it started" : bridgeStatus === "unavailable" ? `Cannot reach Local Agent Bridge at ${bridgeHost}:${bridgePort} · run npm run ai-bridge` : bridgeStatus === "error" ? "Connection failed · verify localhost settings" : "Disconnected"}</output>
      </div>
      <div className="ai-settings-section"><h4>Provider</h4><span className="inspector-note">{providerName}</span></div>
    </div>}
    {preview && <div className="ai-preview" data-testid="ai-preview"><strong>{preview.summary}</strong><span>Base revision {preview.baseRevision}</span>{preview.commands.length > 0 && <ol className="ai-preview-commands" data-testid="ai-preview-commands">{describeAIProposalCommands(document, preview.commands).map((item, index) => <li key={`${preview.commands[index]!.id}:${index}`}><span>{item.title}</span><small>{item.detail}</small></li>)}</ol>}<button type="button" data-testid="ai-validate" onClick={() => validatePreview()}>Validate Proposal</button><button type="button" data-testid="ai-apply" onClick={() => applyPreview()}>Apply Preview</button><button type="button" onClick={cancelPreview}>Cancel</button></div>}
    <output role="status" data-testid="ai-status">{status}</output>
    <details className="ai-activity-log" data-testid="ai-activity-log">
      <summary>AI Activity ({activityLog.length})</summary>
      {activityLog.length === 0 && <span className="inspector-note">No AI activity yet this session.</span>}
      <ol>{activityLog.map((entry) => <li key={entry.id} data-testid="ai-activity-entry" data-actor={entry.actor}><time dateTime={entry.timestamp}>{entry.timestamp}</time><span className="ai-activity-provider">{entry.provider}</span><span className="ai-activity-actor">{entry.actor === "external-agent" ? "External agent" : "You"}</span><span className="ai-activity-kind">{entry.kind === "read-only" ? "Read-only" : "Proposal"}</span><span className="ai-activity-summary">{entry.summary}</span><span className="ai-activity-result">{entry.result}</span></li>)}</ol>
    </details>
  </section>;
}
