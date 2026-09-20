import { useEffect, useState, useSyncExternalStore } from "react";
import type { CanonicalDocument, Transaction, TransactionPhase } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";

function phasesEqual(left: readonly TransactionPhase[], right: readonly TransactionPhase[]): boolean {
  return left.length === right.length && left.every((phase, index) => {
    const other = right[index];
    return other !== undefined && phase.name === other.name && phase.start === other.start && phase.end === other.end;
  });
}

function phaseError(phases: readonly TransactionPhase[], start: number, end: number): string | undefined {
  if (phases.some((phase) => !phase.name.trim() || !Number.isInteger(phase.start) || !Number.isInteger(phase.end) || phase.start < start || phase.start >= phase.end || phase.end > end)) {
    return "Phases must be named integer-cycle half-open subranges within Start..End.";
  }
  return undefined;
}

const phaseDrafts = new Map<string, { readonly base: readonly TransactionPhase[]; readonly rows: readonly TransactionPhase[] }>();
const phaseDraftListeners = new Set<() => void>();
const notifyPhaseDrafts = () => { for (const listener of [...phaseDraftListeners]) listener(); };

let phaseDraftVersion = 0;
const bumpPhaseDrafts = () => { phaseDraftVersion += 1; notifyPhaseDrafts(); };
const subscribePhaseDrafts = (listener: () => void) => { phaseDraftListeners.add(listener); return () => { phaseDraftListeners.delete(listener); }; };

/** The session's unapplied Phase draft for a Transaction (shared by Bottom and Inspector), or undefined when none is pending. */
export function pendingPhaseDraft(transaction: Transaction | undefined): readonly TransactionPhase[] | undefined {
  if (!transaction) return undefined;
  const draft = phaseDrafts.get(transaction.id);
  if (!draft) return undefined;
  // A commit (or Undo/Redo) changed the committed phases: the draft's base is stale and must not be resurrected later.
  if (!phasesEqual(draft.base, transaction.phases ?? [])) { phaseDrafts.delete(transaction.id); return undefined; }
  return phasesEqual(draft.rows, transaction.phases ?? []) ? undefined : draft.rows;
}
export function usePendingPhaseDraft(transaction: Transaction | undefined): readonly TransactionPhase[] | undefined {
  useSyncExternalStore(subscribePhaseDrafts, () => phaseDraftVersion, () => 0);
  return pendingPhaseDraft(transaction);
}
const draftRowsOrCommitted = (transaction: Transaction): readonly TransactionPhase[] => pendingPhaseDraft(transaction) ?? transaction.phases ?? [];
export function canAddPhase(transaction: Transaction): boolean {
  return Math.max(transaction.start, ...draftRowsOrCommitted(transaction).map((phase) => phase.end)) < transaction.end;
}
/** Append the next one-cycle Phase to the shared draft (no commit). */
export function addPhaseToDraft(transaction: Transaction): void {
  if (!canAddPhase(transaction)) return;
  const rows = draftRowsOrCommitted(transaction).map((phase) => ({ ...phase }));
  const nextStart = Math.max(transaction.start, ...rows.map((phase) => phase.end));
  rows.push({ name: `Phase ${rows.length + 1}`, start: nextStart, end: nextStart + 1 });
  phaseDrafts.set(transaction.id, { base: transaction.phases ?? [], rows });
  bumpPhaseDrafts();
}
export function clearPhaseDraft(transactionId: string): void {
  if (phaseDrafts.delete(transactionId)) bumpPhaseDrafts();
}
/** Validated, time-ordered rows ready to commit, or an error message. */
export function commitPhaseRows(rows: readonly TransactionPhase[], start: number, end: number): { readonly rows: TransactionPhase[] } | { readonly error: string } {
  const normalized = rows.map((phase) => ({ ...phase, name: phase.name.trim() })).sort((a, b) => a.start - b.start || a.end - b.end);
  const problem = phaseError(normalized, start, end);
  return problem ? { error: problem } : { rows: normalized };
}

function initialPhaseRows(transaction: Transaction | undefined): TransactionPhase[] {
  const base = transaction?.phases ?? [];
  const draft = transaction ? phaseDrafts.get(transaction.id) : undefined;
  return (draft && phasesEqual(draft.base, base) ? draft.rows : base).map((phase) => ({ ...phase }));
}

export function TransactionPhaseEditor({ transaction, commands, compact = false }: { readonly transaction: Transaction | undefined; readonly commands: EditorSurfaceCommandController; readonly compact?: boolean }) {
  const [rows, setRowsRaw] = useState<TransactionPhase[]>(() => initialPhaseRows(transaction));
  const [error, setError] = useState("");
  const setRows = (update: (current: TransactionPhase[]) => TransactionPhase[]) => setRowsRaw((current) => {
    const next = update(current);
    if (transaction) {
      const base = transaction.phases ?? [];
      if (phasesEqual(next, base)) phaseDrafts.delete(transaction.id); else phaseDrafts.set(transaction.id, { base, rows: next.map((phase) => ({ ...phase })) });
      queueMicrotask(bumpPhaseDrafts);
    }
    return next;
  });
  // Inspector and Bottom both mount this editor; keep one shared draft per Transaction.
  useEffect(() => {
    const sync = () => setRowsRaw((current) => {
      const next = initialPhaseRows(transaction);
      return phasesEqual(current, next) ? current : next;
    });
    phaseDraftListeners.add(sync);
    return () => { phaseDraftListeners.delete(sync); };
  }, [transaction?.id, transaction?.phases]);
  useEffect(() => {
    setRowsRaw(initialPhaseRows(transaction));
    setError("");
  }, [transaction?.id, transaction?.start, transaction?.end, transaction?.phases]);
  if (!transaction) return <section className="transaction-bottom-summary" data-testid="transaction-bottom-phases"><p className="inspector-note">Select a Transaction to edit phases.</p></section>;
  const changed = !phasesEqual(rows, transaction.phases ?? []);
  const addPhase = () => {
    const nextStart = Math.max(transaction.start, ...rows.map((phase) => phase.end));
    if (nextStart >= transaction.end) return;
    setRows((current) => [...current, { name: `Phase ${current.length + 1}`, start: nextStart, end: nextStart + 1 }]);
  };
  const apply = () => {
    if (!changed) return;
    const normalized = rows.map((phase) => ({ ...phase, name: phase.name.trim() })).sort((a, b) => a.start - b.start || a.end - b.end);
    const problem = phaseError(normalized, transaction.start, transaction.end);
    if (problem) { setError(problem); return; }
    setError("");
    commands.updateTransactionFromBottom({ transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.groupId === undefined ? { clearGroupId: true } : { groupId: transaction.groupId }), ...(transaction.color === undefined ? { clearColor: true } : { color: transaction.color }), ...(transaction.description === undefined ? { clearDescription: true } : { description: transaction.description }), phases: normalized });
  };
  const covered = rows.reduce((sum, phase) => sum + Math.max(0, phase.end - phase.start), 0);
  const duration = transaction.end - transaction.start;
  const liveError = changed ? phaseError(rows.map((phase) => ({ ...phase, name: phase.name.trim() })), transaction.start, transaction.end) : undefined;
  const ordered = [...rows].sort((a, b) => a.start - b.start || a.end - b.end);
  const overlaps = ordered.some((phase, index) => index > 0 && phase.start < ordered[index - 1]!.end);
  const outside = rows.some((phase) => phase.start < transaction.start || phase.end > transaction.end);
  const coverageProblem = rows.length === 0 ? "No phases defined" : outside ? "Phase exceeds the Transaction range" : overlaps ? "Phases overlap" : covered < duration ? `Uncovered time: ${duration - covered} cycles` : undefined;
  const shownError = error || liveError || "";
  const updateRow = (index: number, patch: Partial<TransactionPhase>) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <section className={`transaction-bottom-summary transaction-bottom-phase-editor${compact ? " is-compact" : ""}`} data-testid={compact ? "inspector-phase-editor" : "transaction-bottom-phases"}>
    <header className="transaction-bottom-phase-header">
      <strong>Phases ({rows.length})</strong><span>{transaction.name}</span>
      {changed && <span className="draft-unapplied-indicator" role="status" data-testid="transaction-bottom-phases-unapplied">Unapplied changes</span>}
      {!compact && <span className="bottom-sticky-buttons">
        <button type="button" onClick={() => { setRows(() => (transaction.phases ?? []).map((phase) => ({ ...phase }))); setError(""); }} disabled={!changed}>Revert</button>
        <button type="button" data-testid={compact ? "apply-transaction-phases" : "apply-bottom-transaction-phases"} onClick={apply} disabled={!changed}>Apply</button>
      </span>}
    </header>
    {!compact && <p className="transaction-bottom-phase-context" data-testid="transaction-bottom-phase-context">Group: {transaction.groupId ?? "Ungrouped"} · Lane: {transaction.laneId ?? "lane_0"} · Start {transaction.start} · End {transaction.end} · Duration {duration} cycles · Coverage {covered} / {duration} · Remaining {Math.max(0, duration - covered)}</p>}
    {!compact && <div className="transaction-bottom-phase-timeline" data-testid="transaction-bottom-phase-timeline" role="img" aria-label={`Phase timeline ${transaction.start} to ${transaction.end}`}>
      {[...rows].map((phase, index) => ({ phase, index })).sort((a, b) => a.phase.start - b.phase.start).map(({ phase, index }) => {
        const left = Math.max(0, Math.min(100, 100 * (phase.start - transaction.start) / Math.max(1, duration)));
        const width = Math.max(0.5, Math.min(100 - left, 100 * (phase.end - phase.start) / Math.max(1, duration)));
        return <span key={index} className="transaction-bottom-phase-segment" data-phase-index={index} title={`${phase.name}: ${phase.start}–${phase.end}`} style={{ left: `${left}%`, width: `${width}%` }}>{phase.name}</span>;
      })}
    </div>}
    <p className={`transaction-bottom-phase-coverage${coverageProblem ? " is-warning" : ""}`} data-testid="transaction-bottom-phase-coverage">{coverageProblem ?? "✓ Full Transaction range is covered"}</p>
    <div className="transaction-bottom-phase-table"><div className="transaction-bottom-phase-row transaction-bottom-phase-head"><span>Name</span><span>Start</span><span>End</span><span>Duration</span><span /></div>{rows.map((phase, index) => <div className="transaction-bottom-phase-row" key={`${transaction.id}-${index}`} data-phase-index={index}><input aria-label={`${compact ? "" : "Bottom "}Phase ${index + 1} name`} value={phase.name} onChange={(event) => updateRow(index, { name: event.target.value })} /><input aria-label={`${compact ? "" : "Bottom "}Phase ${index + 1} start`} type="number" value={phase.start} onChange={(event) => updateRow(index, { start: Number(event.target.value) })} /><input aria-label={`${compact ? "" : "Bottom "}Phase ${index + 1} end`} type="number" value={phase.end} onChange={(event) => updateRow(index, { end: Number(event.target.value) })} /><span>{phase.end - phase.start}</span><button type="button" aria-label={compact ? `Delete phase ${index + 1}` : `Delete bottom phase ${index + 1}`} onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>
    {rows.length === 0 && <p className="inspector-note">No phases defined. Add a phase within the Transaction range.</p>}
    <button type="button" data-testid={compact ? "add-transaction-phase" : "add-bottom-transaction-phase"} onClick={addPhase} disabled={Math.max(transaction.start, ...rows.map((phase) => phase.end)) >= transaction.end}>Add Phase</button>
    {compact && rows.length > 0 && Math.max(transaction.start, ...rows.map((phase) => phase.end)) >= transaction.end && <p className="inspector-note" role="note">No unused cycles remain. Extend the Transaction or shorten a Phase to add another.</p>}
    {shownError && <p className="inspector-note" role="alert" data-testid="transaction-bottom-phase-error">{shownError}</p>}
  </section>;
}

export function TransactionPhaseSummary({ transaction, commands }: { readonly transaction: Transaction | undefined; readonly commands: EditorSurfaceCommandController }) {
  return <TransactionPhaseEditor transaction={transaction} commands={commands} />;
}

export function TransactionLinkedSummary({ transaction, document }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument }) {
  const linked = new Set(transaction?.linkedSignals ?? []);
  const signals = document.signals.filter((signal) => linked.has(signal.id));
  return <section className="transaction-bottom-summary" data-testid="transaction-bottom-linked-signals"><header><strong>Linked Signals ({signals.length})</strong><span>{transaction?.name ?? "Select a Transaction"}</span></header>{signals.length === 0 ? <p className="inspector-note">No linked signals. Manage links in the Inspector.</p> : <div className="transaction-bottom-linked-list">{signals.map((signal) => <span key={signal.id}>{signal.display.name}</span>)}</div>}</section>;
}
