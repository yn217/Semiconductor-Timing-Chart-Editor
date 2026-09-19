import { useEffect, useState } from "react";
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

export function TransactionPhaseEditor({ transaction, commands }: { readonly transaction: Transaction | undefined; readonly commands: EditorSurfaceCommandController }) {
  const [rows, setRows] = useState<TransactionPhase[]>(() => (transaction?.phases ?? []).map((phase) => ({ ...phase })));
  const [error, setError] = useState("");
  useEffect(() => {
    setRows((transaction?.phases ?? []).map((phase) => ({ ...phase })));
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
  const shownError = error || liveError || "";
  const updateRow = (index: number, patch: Partial<TransactionPhase>) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <section className="transaction-bottom-summary transaction-bottom-phase-editor" data-testid="transaction-bottom-phases">
    <header className="transaction-bottom-phase-header">
      <strong>Phases ({rows.length})</strong><span>{transaction.name}</span>
      {changed && <span className="draft-unapplied-indicator" role="status" data-testid="transaction-bottom-phases-unapplied">Unapplied changes</span>}
      <span className="bottom-sticky-buttons">
        <button type="button" onClick={() => { setRows((transaction.phases ?? []).map((phase) => ({ ...phase }))); setError(""); }} disabled={!changed}>Revert</button>
        <button type="button" data-testid="apply-bottom-transaction-phases" onClick={apply} disabled={!changed}>Apply</button>
      </span>
    </header>
    <p className="transaction-bottom-phase-context" data-testid="transaction-bottom-phase-context">Group: {transaction.groupId ?? "Ungrouped"} · Lane: {transaction.laneId ?? "lane_0"} · Start {transaction.start} · End {transaction.end} · Duration {duration} cycles · Coverage {covered} / {duration} · Remaining {Math.max(0, duration - covered)}</p>
    <div className="transaction-bottom-phase-table"><div className="transaction-bottom-phase-row transaction-bottom-phase-head"><span>Name</span><span>Start</span><span>End</span><span>Duration</span><span /></div>{rows.map((phase, index) => <div className="transaction-bottom-phase-row" key={`${transaction.id}-${index}`} data-phase-index={index}><input aria-label={`Bottom Phase ${index + 1} name`} value={phase.name} onChange={(event) => updateRow(index, { name: event.target.value })} /><input aria-label={`Bottom Phase ${index + 1} start`} type="number" value={phase.start} onChange={(event) => updateRow(index, { start: Number(event.target.value) })} /><input aria-label={`Bottom Phase ${index + 1} end`} type="number" value={phase.end} onChange={(event) => updateRow(index, { end: Number(event.target.value) })} /><span>{phase.end - phase.start}</span><button type="button" aria-label={`Delete bottom phase ${index + 1}`} onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>
    {rows.length === 0 && <p className="inspector-note">No phases defined. Add a phase within the Transaction range.</p>}
    <button type="button" data-testid="add-bottom-transaction-phase" onClick={addPhase} disabled={Math.max(transaction.start, ...rows.map((phase) => phase.end)) >= transaction.end}>Add Phase</button>
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
