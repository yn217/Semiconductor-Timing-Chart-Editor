import { useEffect, useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import type { CanonicalDocument, SignalId, Transaction, TransactionId } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";

// #393 item B: a deliberate, single-command example -- one transaction.create
// carrying phases/laneId/linkedSignals inline is already one atomic History
// entry (transaction.create accepts a full Transaction, including phases and
// linkedSignals, and validates linkedSignals against the current document's
// real Signals), so this needs no batch and Undo removes the whole example
// cleanly in one step. Falls back to whichever of the first two non-comment
// Signals actually exist in this document rather than hardcoding names, so
// it still produces a valid, link-populated example on documents that don't
// happen to have REQUEST/READY signals.
function buildTransactionExampleCommand(document: CanonicalDocument): SemanticCommand {
  const cycleCount = document.timeline.cycleCount;
  const start = Math.min(2, Math.max(0, cycleCount - 1));
  const end = Math.min(12, cycleCount);
  const phaseBoundaries: readonly [string, number, number][] = [["Request", 2, 5], ["Processing", 5, 9], ["Response", 9, 12]];
  const phases = phaseBoundaries
    .map(([name, phaseStart, phaseEnd]) => ({ name, start: Math.min(phaseStart, end - 1), end: Math.min(phaseEnd, end) }))
    .filter((phase) => phase.start >= start && phase.start < phase.end);
  const requestLike = document.signals.find((signal) => signal.display.name.toLocaleUpperCase() === "REQUEST") ?? document.signals.find((signal) => signal.type !== "commentRow");
  const readyLike = document.signals.find((signal) => signal.display.name.toLocaleUpperCase() === "READY") ?? document.signals.find((signal) => signal.type !== "commentRow" && signal.id !== requestLike?.id);
  const linkedSignals = [requestLike?.id, readyLike?.id].filter((id): id is SignalId => id !== undefined);
  return {
    id: nextCommandId("transaction_load_example"),
    type: "transaction.create",
    transaction: {
      id: nextEntityId("transaction", document) as TransactionId,
      name: "Read Request",
      laneId: "Bus Transactions",
      start,
      end,
      ...(phases.length > 0 ? { phases } : {}),
      ...(linkedSignals.length > 0 ? { linkedSignals } : {}),
    },
  };
}

export function TransactionEditor({ transaction, document, history, onSelect, onCommand, onUndo, onRedo, onDelete, onCancel }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument; readonly history: HistoryState; readonly onSelect: (id: TransactionId) => void; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState("Transaction");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.min(5, document.timeline.cycleCount));
  const [laneId, setLaneId] = useState("lane_0");
  const [editName, setEditName] = useState(transaction?.name ?? "");
  const [editStart, setEditStart] = useState(transaction?.start ?? 0);
  const [editEnd, setEditEnd] = useState(transaction?.end ?? 1);
  const [editLaneId, setEditLaneId] = useState(transaction?.laneId ?? "lane_0");
  useEffect(() => {
    setEditName(transaction?.name ?? "");
    setEditStart(transaction?.start ?? 0);
    setEditEnd(transaction?.end ?? 1);
    setEditLaneId(transaction?.laneId ?? "lane_0");
  }, [transaction?.id, transaction?.name, transaction?.start, transaction?.end, transaction?.laneId]);
  return <section className="transaction-editor" data-testid="transaction-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><strong>{transaction ? `Editing: ${transaction.name}` : "Transaction Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button>{transaction && <><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="button" className="danger" data-testid="delete-bottom-transaction" onClick={onDelete}>Delete Transaction</button></>}</header>{!transaction && document.transactions.length === 0 && <div className="transaction-empty-state" data-testid="transaction-empty-state"><strong>No Transactions yet</strong><p>Transactions describe a named time span, optional phases, and the waveform Signals related to that operation.</p><button type="button" data-testid="load-transaction-example" onClick={() => { const command = buildTransactionExampleCommand(document); const result = onCommand(command); if (result.ok && command.type === "transaction.create") onSelect(command.transaction.id); }}>Load Example</button></div>}{transaction ? <form onSubmit={(event) => { event.preventDefault(); onCommand({ id: nextCommandId("bottom_transaction_update"), type: "transaction.update", transactionId: transaction.id, name: editName.trim() || "Transaction", start: editStart, end: editEnd, laneId: editLaneId, ...(transaction.phases === undefined ? {} : { phases: transaction.phases }) }); }}><label>Name<input aria-label="Transaction name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={editEnd - 1} value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={editStart + 1} max={document.timeline.cycleCount} value={editEnd} onChange={(event) => setEditEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={editLaneId} onChange={(event) => setEditLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label><button type="submit" data-testid="apply-transaction-properties">Apply Transaction</button></form> : <form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction", document) as TransactionId; const result = onCommand({ id: nextCommandId("transaction_create"), type: "transaction.create", transaction: { id, name: name.trim() || "Transaction", start, end, laneId } }); if (result.ok) onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Start<input aria-label="New Transaction start" type="number" min="0" max={end - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End<input aria-label="New Transaction end" type="number" min={start + 1} max={document.timeline.cycleCount} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label><button type="submit">Create Transaction</button></form>}<div className="transaction-list">{document.transactions.map((item) => <button type="button" key={item.id} data-selected={String(item.id === transaction?.id)} onClick={() => onSelect(item.id)}><b>{item.name}</b><span>{item.start}–{item.end}</span><span>{item.laneId ?? "lane_0"}</span><span>{item.linkedSignals?.length ?? 0} links</span></button>)}</div></section>;
}
