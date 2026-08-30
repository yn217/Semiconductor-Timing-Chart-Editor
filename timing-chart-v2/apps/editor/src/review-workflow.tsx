import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CanonicalDocument, DocumentProblem, GroupId, SignalId } from "@timing-chart-v2/schema";

type ReviewSeverity = "all" | "error" | "warning" | "info";
type ReviewScope = "all" | "selection" | "group";
const iconSprite = new URL("../../../../timing-chart-v1/gui-mockup/icons.svg", import.meta.url).href;

function diagnosticMatchesIds(item: DocumentProblem, ids: ReadonlySet<string>): boolean {
  if (ids.size === 0) return false;
  const directIds = [item.objectId, item.entityId].filter((value): value is string => typeof value === "string");
  return directIds.some((id) => ids.has(id)) || [...ids].some((id) => item.path.includes(id));
}

export function ReviewWorkflow({ diagnostics, document, selectedSignalId, selectedGroupId, onNavigate, onShowProblems, onRefreshChecks, problemsIcon }: {
  readonly diagnostics: readonly DocumentProblem[];
  readonly document: CanonicalDocument;
  readonly selectedSignalId: SignalId | undefined;
  readonly selectedGroupId: GroupId | undefined;
  readonly onNavigate: (path: string) => void;
  readonly onShowProblems: () => void;
  readonly onRefreshChecks: () => void;
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
  return <div className="review-workflow" data-testid="review-workflow">
    <label>Severity<select aria-label="Review severity" data-testid="review-severity-filter" value={severity} onChange={(event) => setSeverity(event.target.value as ReviewSeverity)}><option value="all">All</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option></select></label>
    <label>Scope<select aria-label="Review scope" data-testid="review-scope-filter" value={scope} onChange={(event) => { setScope(event.target.value as ReviewScope); setCurrentIndex(0); }}><option value="all">All</option><option value="selection">Selection</option><option value="group">Current Group</option></select></label>
    <button type="button" data-testid="review-previous" onClick={() => navigate(-1)} disabled={visible.length === 0}>Previous</button>
    <button type="button" data-testid="review-next" onClick={() => navigate(1)} disabled={visible.length === 0}>Next</button>
    <output data-testid="review-summary">{visible.length} of {scopedDiagnostics.length} · Errors {errorCount} · Warnings {warningCount} · Info {infoCount}</output>
    <output data-testid="review-current-target">{visible[currentIndex]?.path ?? "No diagnostic selected"}</output>
    <button type="button" data-testid="review-refresh-checks" onClick={onRefreshChecks}>Refresh Checks</button>
    <button type="button" className="ribbon-tool" data-testid="review-open-problems" onClick={onShowProblems}>{problemsIcon ?? <svg aria-hidden="true"><use href={`${iconSprite}#i-filter`} /></svg>}<span>Problems</span></button>
  </div>;
}
