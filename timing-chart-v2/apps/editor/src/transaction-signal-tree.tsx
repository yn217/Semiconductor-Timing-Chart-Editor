import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";

/**
 * #429/#397 Transaction Mode Product Closure P0-2: the Left panel's
 * "Transactions | Signals" tabs -- Transaction Mode's own tree only ever
 * showed Transactions, with no way to browse/select Signals (e.g. to check
 * what a candidate Linked Signal actually is) without leaving Transaction
 * Mode entirely. This is a real, separate Signal browse/select list, not a
 * fork of the Cycle Mode Signal Tree's rendering: same underlying
 * `document.signalGroups`/`document.signals` data, and selecting a row
 * dispatches through `onSelectSignal` (`selectHierarchySignal`, the exact
 * same selection action the real Signal Tree/Inspector/Ribbon already
 * share) -- never a second selection owner. Deliberately simpler than the
 * full Cycle Mode tree (no drag/reorder/role-filter/hierarchy-path
 * disclosure): this exists to find and select a Signal, not to re-author
 * one, which stays Cycle Mode's job.
 */
export function TransactionSignalTree({ document, selectedSignalId, onSelectSignal }: { readonly document: CanonicalDocument; readonly selectedSignalId: SignalId | undefined; readonly onSelectSignal: (id: SignalId) => void }) {
  const signalById = new Map<string, (typeof document.signals)[number]>(document.signals.map((signal) => [signal.id, signal]));
  return <div className="transaction-signal-tree" data-testid="transaction-signal-tree">
    {document.signalGroups.map((group) => {
      const signals = group.rows.flatMap((rowId) => { const signal = signalById.get(rowId); return signal && signal.type !== "commentRow" ? [signal] : []; });
      if (signals.length === 0) return null;
      return <section key={group.id} className="transaction-signal-tree-group">
        <h4>{group.name}</h4>
        {signals.map((signal) => <button type="button" key={signal.id} className="transaction-signal-tree-row" data-testid={`transaction-signal-tree-row-${signal.id}`} data-selected={String(signal.id === selectedSignalId)} onClick={() => onSelectSignal(signal.id)}>
          <span className="transaction-signal-tree-role" aria-hidden="true">{signal.role?.[0]?.toUpperCase() ?? "?"}</span>
          <span>{signal.display.name}</span>
        </button>)}
      </section>;
    })}
    {document.signals.every((signal) => signal.type === "commentRow") && <p className="inspector-note">No Signals in this document.</p>}
  </div>;
}
