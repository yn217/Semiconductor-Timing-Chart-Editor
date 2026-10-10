import { useMemo, useState, type ReactNode } from "react";
import { constraintReferences, type CanonicalDocument, type ConstraintId, type DocumentProblem, type GroupId, type SignalId } from "@timing-chart-v2/schema";
import { TIMING_DIAGNOSTIC_CATEGORIES, type TimingDiagnosticCategory } from "@timing-chart-v2/core";
import { DsRibbonButton, DsRibbonSelect } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { problemRowKeys } from "./problems-panel.js";

type ReviewSeverity = "all" | "error" | "warning" | "info";
type ReviewScope = "all" | "selection" | "group";
const checkCategoryLabels: Record<TimingDiagnosticCategory, string> = {
  "unknown-value": "Unknown / X",
  protocol: "Protocol",
  stability: "Stable while stalled",
};

/**
 * A finding is in scope when its own objectId/entityId names a scoped ID, or when it is
 * a constraint finding (Handshake / Latency use the constraint ID as objectId) and any signal
 * the constraint references (request, acknowledge, stable, trigger, response, reset) is scoped.
 */
export function diagnosticMatchesIds(item: DocumentProblem, ids: ReadonlySet<string>, constraintSignals: ReadonlyMap<string, ReadonlySet<string>> = new Map()): boolean {
  if (ids.size === 0) return false;
  const directIds = [item.objectId, item.entityId].filter((value): value is string => typeof value === "string");
  // Match exact entity IDs only. Paths are not searched: they contain schema field names and indexes,
  // so a substring or segment test lets short IDs such as "req" or "data" match unrelated keys.
  if (directIds.some((id) => ids.has(id))) return true;
  return directIds.some((id) => [...(constraintSignals.get(id) ?? [])].some((signalId) => ids.has(signalId)));
}

/** Parses the latency editor's cycle bounds. Blank input is rejected rather than read as 0. */
export function parseLatencyCycleBounds(minText: string, maxText: string): { readonly ok: true; readonly minimum: number; readonly maximum: number } | { readonly ok: false; readonly message: string } {
  if (minText.trim() === "" || maxText.trim() === "") return { ok: false, message: "Enter both minimum and maximum cycles." };
  const minimum = Number(minText);
  const maximum = Number(maxText);
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum) {
    return { ok: false, message: "Cycle bounds must be integers with 0 ≤ minimum ≤ maximum." };
  }
  return { ok: true, minimum, maximum };
}

export function ReviewWorkflow({ diagnostics, document, selectedSignalId, selectedGroupId, onNavigate, onShowProblems, onRefreshChecks, onToggleCheckCategory, onCreateLatencyConstraint, onDeleteConstraint, problemsIcon }: {
  readonly diagnostics: readonly DocumentProblem[];
  readonly document: CanonicalDocument;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly onNavigate: (path: string, problem?: DocumentProblem) => void;
  readonly onShowProblems: () => void;
  readonly onRefreshChecks: () => void;
  readonly onToggleCheckCategory?: (category: TimingDiagnosticCategory, enabled: boolean) => void;
  readonly onCreateLatencyConstraint?: (input: Readonly<{ triggerSignalId: SignalId; triggerEdge: "rising" | "falling"; responseSignalId: SignalId; responseEdge: "rising" | "falling"; minCycles: number; maxCycles: number }>) => boolean;
  readonly onDeleteConstraint?: (constraintId: ConstraintId) => boolean;
  readonly problemsIcon?: ReactNode;
}) {
  const [severity, setSeverity] = useState<ReviewSeverity>("all");
  const [scope, setScope] = useState<ReviewScope>("all");
  // Previous/Next are anchored to the diagnostic's stable row key rather than a numeric index, so
  // the position follows the finding when the list is re-derived; the anchor clears on filter changes.
  const [anchorKey, setAnchorKey] = useState<string | undefined>(undefined);
  const [triggerSignalId, setTriggerSignalId] = useState<SignalId | "">("");
  const [responseSignalId, setResponseSignalId] = useState<SignalId | "">("");
  const [triggerEdge, setTriggerEdge] = useState<"rising" | "falling">("rising");
  const [responseEdge, setResponseEdge] = useState<"rising" | "falling">("rising");
  const [minCycles, setMinCycles] = useState("1");
  const [maxCycles, setMaxCycles] = useState("3");
  const [constraintStatus, setConstraintStatus] = useState("");
  const edgeSignals = useMemo(() => document.signals.filter((signal) => signal.type === "binary" || signal.type === "logic" || signal.type === "bus" || signal.type === "pulse"), [document.signals]);
  const triggerId = edgeSignals.some((signal) => signal.id === triggerSignalId) ? triggerSignalId : edgeSignals[0]?.id ?? "";
  const responseId = edgeSignals.some((signal) => signal.id === responseSignalId) ? responseSignalId : edgeSignals[1]?.id ?? edgeSignals[0]?.id ?? "";
  const keyedDiagnostics = useMemo(() => {
    const keys = problemRowKeys(diagnostics);
    return diagnostics.map((item, index) => ({ item, key: keys[index]! }));
  }, [diagnostics]);
  const constraintSignals = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const reference of constraintReferences(document.constraints)) {
      const signals = map.get(reference.ownerId) ?? new Set<string>();
      signals.add(reference.targetId);
      map.set(reference.ownerId, signals);
    }
    return map;
  }, [document.constraints]);
  const scopedKeyed = useMemo(() => {
    if (scope === "all") return keyedDiagnostics;
    const ids = new Set<string>();
    if (scope === "selection") {
      if (selectedSignalId) ids.add(selectedSignalId);
      if (selectedGroupId) ids.add(selectedGroupId);
    } else if (selectedGroupId) {
      ids.add(selectedGroupId);
      const group = document.signalGroups.find((candidate) => candidate.id === selectedGroupId);
      for (const rowId of group?.rows ?? []) ids.add(rowId);
    }
    return keyedDiagnostics.filter(({ item }) => diagnosticMatchesIds(item, ids, constraintSignals));
  }, [constraintSignals, document.signalGroups, keyedDiagnostics, scope, selectedGroupId, selectedSignalId]);
  const scopedDiagnostics = useMemo(() => scopedKeyed.map(({ item }) => item), [scopedKeyed]);
  const visibleKeyed = useMemo(() => scopedKeyed.filter(({ item }) => severity === "all" || (item.severity ?? "error") === severity), [scopedKeyed, severity]);
  const visible = useMemo(() => visibleKeyed.map(({ item }) => item), [visibleKeyed]);
  const anchorIndex = anchorKey === undefined ? -1 : visibleKeyed.findIndex(({ key }) => key === anchorKey);
  const currentIndex = anchorIndex >= 0 ? anchorIndex : 0;
  const navigate = (offset: number) => {
    if (visibleKeyed.length === 0) return;
    const next = visibleKeyed[(currentIndex + offset + visibleKeyed.length) % visibleKeyed.length]!;
    setAnchorKey(next.key);
    onNavigate(next.item.path, next.item);
  };
  const errorCount = scopedDiagnostics.filter((item) => (item.severity ?? "error") === "error").length;
  const warningCount = scopedDiagnostics.filter((item) => item.severity === "warning").length;
  const infoCount = scopedDiagnostics.filter((item) => item.severity === "info").length;
  // #394: Filter / Navigation / Summary / Selection-Status / Action used to
  // be one flat run of inline-level elements (label/select/button/output)
  // with no layout of their own, relying only on incidental whitespace --
  // exactly the "everything competes in one band" complaint. Each role gets
  // its own group below (same shared gap+separator convention already used
  // for the Timeline Ribbon's own group boundaries); no testid, text, or
  // command wiring changes.
  // Ribbon visual grammar unification (same gap #527 closed for the
  // Annotation tab): this was the Review/Check Ribbon tab's own bare
  // <button>/<select> markup -- converted onto DsRibbonButton/DsRibbonSelect
  // so icon size, control height and hover/focus/disabled treatment match
  // every other Ribbon tab. Every aria-label/testid/value/callback is
  // unchanged.
  return <div className="review-workflow" data-testid="review-workflow">
    <div className="review-filter-group" aria-label="Filter">
      <label>Severity<DsRibbonSelect ariaLabel="Review severity" dataTestId="review-severity-filter" value={severity} onChange={(event) => { setSeverity(event.target.value as ReviewSeverity); setAnchorKey(undefined); }}><option value="all">All</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option></DsRibbonSelect></label>
      <label>Scope<DsRibbonSelect ariaLabel="Review scope" dataTestId="review-scope-filter" value={scope} onChange={(event) => { setScope(event.target.value as ReviewScope); setAnchorKey(undefined); }}><option value="all">All</option><option value="selection">Selection</option><option value="group">Current Group</option></DsRibbonSelect></label>
    </div>
    {onToggleCheckCategory && <fieldset className="review-rules-group" aria-label="Timing checks" data-testid="review-check-rules">
      <legend>Checks</legend>
      {TIMING_DIAGNOSTIC_CATEGORIES.map((category) => {
        const label = checkCategoryLabels[category];
        const enabled = document.checkSettings.enabledCategories === undefined || document.checkSettings.enabledCategories.includes(category);
        return <label key={category} title={`Enable or disable ${label} timing checks`}>
          <input type="checkbox" data-testid={`review-check-${category}`} aria-label={`Enable ${label} check`} checked={enabled} onChange={(event) => onToggleCheckCategory(category, event.currentTarget.checked)} />
          {label}
        </label>;
      })}
    </fieldset>}
    {onCreateLatencyConstraint && <details className="review-constraint-editor" data-testid="review-constraint-editor">
      <summary>Latency constraints ({document.constraints.length})</summary>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!triggerId || !responseId) { setConstraintStatus("Choose Signals for the trigger and response."); return; }
        const bounds = parseLatencyCycleBounds(minCycles, maxCycles);
        if (!bounds.ok) { setConstraintStatus(bounds.message); return; }
        const created = onCreateLatencyConstraint({ triggerSignalId: triggerId, triggerEdge, responseSignalId: responseId, responseEdge, minCycles: bounds.minimum, maxCycles: bounds.maximum });
        setConstraintStatus(created ? "Latency constraint added." : "Constraint was rejected; review the Problems panel.");
      }}>
        <label>Trigger Signal<select aria-label="Constraint trigger signal" value={triggerId} onChange={(event) => setTriggerSignalId(event.target.value as SignalId)} required>{edgeSignals.map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label>
        <label>Trigger edge<select aria-label="Constraint trigger edge" value={triggerEdge} onChange={(event) => setTriggerEdge(event.target.value as typeof triggerEdge)}><option value="rising">Rising</option><option value="falling">Falling</option></select></label>
        <label>Response Signal<select aria-label="Constraint response signal" value={responseId} onChange={(event) => setResponseSignalId(event.target.value as SignalId)} required>{edgeSignals.map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name}</option>)}</select></label>
        <label>Response edge<select aria-label="Constraint response edge" value={responseEdge} onChange={(event) => setResponseEdge(event.target.value as typeof responseEdge)}><option value="rising">Rising</option><option value="falling">Falling</option></select></label>
        <label>Minimum cycles<input aria-label="Constraint minimum cycles" type="number" min="0" step="1" value={minCycles} onChange={(event) => setMinCycles(event.target.value)} required /></label>
        <label>Maximum cycles<input aria-label="Constraint maximum cycles" type="number" min="0" step="1" value={maxCycles} onChange={(event) => setMaxCycles(event.target.value)} required /></label>
        <button type="submit" disabled={edgeSignals.length === 0}>Add latency constraint</button>
      </form>
      {document.constraints.length > 0 && <ul aria-label="Timing constraints">{document.constraints.map((constraint) => <li key={constraint.id} data-constraint-id={constraint.id}><code>{constraint.type}</code> <span>{constraint.id}</span>{onDeleteConstraint && <button type="button" aria-label={`Delete constraint ${constraint.id}`} onClick={() => setConstraintStatus(onDeleteConstraint(constraint.id) ? "Constraint deleted." : "Constraint could not be deleted.")}>Delete</button>}</li>)}</ul>}
      {constraintStatus && <output role="status" data-testid="constraint-status">{constraintStatus}</output>}
    </details>}
    <div className="review-nav-group" aria-label="Navigation">
      <DsRibbonButton ariaLabel="Previous" dataTestId="review-previous" icon={<RibbonIcon name="i-chevron-left" />} onClick={() => navigate(-1)} disabled={visible.length === 0}>Previous</DsRibbonButton>
      <DsRibbonButton ariaLabel="Next" dataTestId="review-next" icon={<RibbonIcon name="i-chevron-right" />} onClick={() => navigate(1)} disabled={visible.length === 0}>Next</DsRibbonButton>
    </div>
    <div className="review-summary-group" aria-label="Summary">
      <output data-testid="review-summary">{visible.length} of {scopedDiagnostics.length} · Errors {errorCount} · Warnings {warningCount} · Info {infoCount}</output>
    </div>
    <div className="review-status-group" aria-label="Selection status">
      <output data-testid="review-current-target">{visible[currentIndex]?.path ?? "No diagnostic selected"}</output>
    </div>
    <div className="review-action-group" aria-label="Actions">
      <DsRibbonButton ariaLabel="Refresh Checks" dataTestId="review-refresh-checks" icon={<RibbonIcon name="i-rotate-right" />} onClick={onRefreshChecks}>Refresh Checks</DsRibbonButton>
      <DsRibbonButton ariaLabel="Problems" dataTestId="review-open-problems" icon={problemsIcon ?? <RibbonIcon name="i-filter" />} onClick={onShowProblems}>Problems</DsRibbonButton>
    </div>
  </div>;
}
