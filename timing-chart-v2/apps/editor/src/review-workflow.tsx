import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CanonicalDocument, DocumentProblem, GroupId, SignalId } from "@timing-chart-v2/schema";
import { TIMING_DIAGNOSTIC_CATEGORIES, type TimingDiagnosticCategory } from "@timing-chart-v2/core";
import { DsRibbonButton, DsRibbonSelect } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";

type ReviewSeverity = "all" | "error" | "warning" | "info";
type ReviewScope = "all" | "selection" | "group";
const checkCategoryLabels: Record<TimingDiagnosticCategory, string> = {
  "unknown-value": "Unknown / X",
  protocol: "Handshake",
  stability: "Stable while stalled",
};

function diagnosticMatchesIds(item: DocumentProblem, ids: ReadonlySet<string>): boolean {
  if (ids.size === 0) return false;
  const directIds = [item.objectId, item.entityId].filter((value): value is string => typeof value === "string");
  return directIds.some((id) => ids.has(id)) || [...ids].some((id) => item.path.includes(id));
}

export function ReviewWorkflow({ diagnostics, document, selectedSignalId, selectedGroupId, onNavigate, onShowProblems, onRefreshChecks, onToggleCheckCategory, problemsIcon }: {
  readonly diagnostics: readonly DocumentProblem[];
  readonly document: CanonicalDocument;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly onNavigate: (path: string) => void;
  readonly onShowProblems: () => void;
  readonly onRefreshChecks: () => void;
  readonly onToggleCheckCategory?: (category: TimingDiagnosticCategory, enabled: boolean) => void;
  readonly problemsIcon?: ReactNode;
}) {
  const [severity, setSeverity] = useState<ReviewSeverity>("all");
  const [scope, setScope] = useState<ReviewScope>("all");
  const [currentIndex, setCurrentIndex] = useState(0);
  const scopedDiagnostics = useMemo(() => {
    if (scope === "all") return diagnostics;
    const ids = new Set<string>();
    if (scope === "selection") {
      if (selectedSignalId) ids.add(selectedSignalId);
      if (selectedGroupId) ids.add(selectedGroupId);
    } else if (selectedGroupId) {
      ids.add(selectedGroupId);
      const group = document.signalGroups.find((candidate) => candidate.id === selectedGroupId);
      for (const rowId of group?.rows ?? []) ids.add(rowId);
    }
    return diagnostics.filter((item) => diagnosticMatchesIds(item, ids));
  }, [diagnostics, document.signalGroups, scope, selectedGroupId, selectedSignalId]);
  const visible = scopedDiagnostics.filter((item) => severity === "all" || (item.severity ?? "error") === severity);
  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(0, visible.length - 1)));
  }, [visible.length, severity]);
  const navigate = (offset: number) => {
    if (visible.length === 0) return;
    const nextIndex = (currentIndex + offset + visible.length) % visible.length;
    setCurrentIndex(nextIndex);
    onNavigate(visible[nextIndex]!.path);
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
      <label>Severity<DsRibbonSelect ariaLabel="Review severity" dataTestId="review-severity-filter" value={severity} onChange={(event) => setSeverity(event.target.value as ReviewSeverity)}><option value="all">All</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option></DsRibbonSelect></label>
      <label>Scope<DsRibbonSelect ariaLabel="Review scope" dataTestId="review-scope-filter" value={scope} onChange={(event) => { setScope(event.target.value as ReviewScope); setCurrentIndex(0); }}><option value="all">All</option><option value="selection">Selection</option><option value="group">Current Group</option></DsRibbonSelect></label>
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
