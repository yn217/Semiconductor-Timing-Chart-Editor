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
    const normalized = rows.map((phase) => ({ ...phase, name: phase.name.trim() }));
    const problem = phaseError(normalized, transaction.start, transaction.end);
    if (problem) { setError(problem); return; }
    setError("");
    commands.updateTransactionFromBottom({ transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.groupId === undefined ? { clearGroupId: true } : { groupId: transaction.groupId }), ...(transaction.color === undefined ? { clearColor: true } : { color: transaction.color }), ...(transaction.description === undefined ? { clearDescription: true } : { description: transaction.description }), phases: normalized });
  };
  return <section className="transaction-bottom-summary transaction-bottom-phase-editor" data-testid="transaction-bottom-phases"><header><strong>Phases ({rows.length})</strong><span>{transaction.name}</span></header><div className="transaction-bottom-phase-table"><div className="transaction-bottom-phase-row transaction-bottom-phase-head"><span>Name</span><span>Start</span><span>End</span><span>Duration</span><span /><span /><span /></div>{rows.map((phase, index) => <div className="transaction-bottom-phase-row" key={`${transaction.id}-${index}`} data-phase-index={index}><input aria-label={`Bottom Phase ${index + 1} name`} value={phase.name} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /><input aria-label={`Bottom Phase ${index + 1} start`} type="number" value={phase.start} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, start: Number(event.target.value) } : item))} /><input aria-label={`Bottom Phase ${index + 1} end`} type="number" value={phase.end} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, end: Number(event.target.value) } : item))} /><span>{phase.end - phase.start}</span><button type="button" aria-label={`Move bottom phase ${index + 1} up`} disabled={index === 0} onClick={() => setRows((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })}>↑</button><button type="button" aria-label={`Move bottom phase ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => setRows((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; return next; })}>↓</button><button type="button" aria-label={`Delete bottom phase ${index + 1}`} onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>{rows.length === 0 && <p className="inspector-note">No phases defined. Add a phase within the Transaction range.</p>}<button type="button" data-testid="add-bottom-transaction-phase" onClick={addPhase} disabled={Math.max(transaction.start, ...rows.map((phase) => phase.end)) >= transaction.end}>Add Phase</button>{error && <p className="inspector-note" role="alert" data-testid="transaction-bottom-phase-error">{error}</p>}<div className="bottom-sticky-actions"><button type="button" onClick={() => { setRows((transaction.phases ?? []).map((phase) => ({ ...phase }))); setError(""); }} disabled={!changed}>Revert</button><button type="button" data-testid="apply-bottom-transaction-phases" onClick={apply} disabled={!changed}>Apply</button></div></section>;
}

export function TransactionPhaseSummary({ transaction, commands }: { readonly transaction: Transaction | undefined; readonly commands: EditorSurfaceCommandController }) {
  return <TransactionPhaseEditor transaction={transaction} commands={commands} />;
}

export function TransactionLinkedSummary({ transaction, document }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument }) {
  const linked = new Set(transaction?.linkedSignals ?? []);
  const signals = document.signals.filter((signal) => linked.has(signal.id));
  return <section className="transaction-bottom-summary" data-testid="transaction-bottom-linked-signals"><header><strong>Linked Signals ({signals.length})</strong><span>{transaction?.name ?? "Select a Transaction"}</span></header>{signals.length === 0 ? <p className="inspector-note">No linked signals. Manage links in the Inspector.</p> : <div className="transaction-bottom-linked-list">{signals.map((signal) => <span key={signal.id}>{signal.display.name}</span>)}</div>}</section>;
}
