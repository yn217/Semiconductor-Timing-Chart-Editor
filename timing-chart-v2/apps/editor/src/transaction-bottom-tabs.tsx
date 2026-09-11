import type { CanonicalDocument, Transaction } from "@timing-chart-v2/schema";

export function TransactionPhaseSummary({ transaction }: { readonly transaction: Transaction | undefined }) {
  const phases = transaction?.phases ?? [];
  return <section className="transaction-bottom-summary" data-testid="transaction-bottom-phases"><header><strong>Phases ({phases.length})</strong><span>{transaction?.name ?? "Select a Transaction"}</span></header>{phases.length === 0 ? <p className="inspector-note">No phases defined. Edit phases in the Inspector.</p> : <div className="transaction-bottom-phase-table"><div className="transaction-bottom-phase-row transaction-bottom-phase-head"><span>Name</span><span>Start</span><span>End</span><span>Duration</span></div>{phases.map((phase, index) => <div className="transaction-bottom-phase-row" key={`${phase.name}-${index}`}><span>{phase.name || `Phase ${index + 1}`}</span><span>{phase.start}</span><span>{phase.end}</span><span>{phase.end - phase.start}</span></div>)}</div>}</section>;
}

export function TransactionLinkedSummary({ transaction, document }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument }) {
  const linked = new Set(transaction?.linkedSignals ?? []);
  const signals = document.signals.filter((signal) => linked.has(signal.id));
  return <section className="transaction-bottom-summary" data-testid="transaction-bottom-linked-signals"><header><strong>Linked Signals ({signals.length})</strong><span>{transaction?.name ?? "Select a Transaction"}</span></header>{signals.length === 0 ? <p className="inspector-note">No linked signals. Manage links in the Inspector.</p> : <div className="transaction-bottom-linked-list">{signals.map((signal) => <span key={signal.id}>{signal.display.name}</span>)}</div>}</section>;
}
