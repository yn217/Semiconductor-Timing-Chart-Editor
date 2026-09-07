import { useEffect, useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import type { CanonicalDocument, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";

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
  // #426: Apply had no Draft/dirty gating at all (always enabled, no
  // "unapplied changes" indicator) and Cancel lived in the header while
  // Apply lived at the end of the form -- two different locations for
  // one Draft's two actions, the exact split-placement inconsistency the
  // Epic calls out. Both now live together in one sticky bottom action
  // bar, same shared classes Annotation's own bar already uses.
  const hasChanges = transaction !== undefined && (editName !== transaction.name || editStart !== transaction.start || editEnd !== transaction.end || editLaneId !== transaction.laneId);
  // #453: Group/Color had zero GUI entry point at all before this (schema/
  // commands already supported both via #430/#450) -- added here, scoped to
  // whichever Transaction is currently selected, reusing the exact same
  // selection this editor already has rather than introducing a second,
  // list-owned multi-select. `search` is a pure client-side filter over the
  // existing list render; it never touches Canonical.
  const [search, setSearch] = useState("");
  const groupNameById = new Map(document.transactionGroups?.map((group) => [group.id, group.name]) ?? []);
  const needle = search.trim().toLocaleLowerCase();
  const visibleTransactions = needle.length === 0 ? document.transactions : document.transactions.filter((item) => item.name.toLocaleLowerCase().includes(needle) || (item.groupId !== undefined && (groupNameById.get(item.groupId) ?? "").toLocaleLowerCase().includes(needle)));
  const duplicateSelected = () => {
    if (!transaction) return;
    const newTransactionId = nextEntityId("transaction", document) as TransactionId;
    const result = onCommand({ id: nextCommandId("bottom_transaction_duplicate"), type: "transaction.duplicate", transactionId: transaction.id, newTransactionId, name: `${transaction.name} Copy` });
    if (result.ok) onSelect(newTransactionId);
  };
  const moveSelectedToGroup = (groupId: TransactionGroup["id"] | undefined) => {
    if (!transaction) return;
    onCommand({ id: nextCommandId("bottom_transaction_group"), type: "transaction.moveToGroup", transactionId: transaction.id, ...(groupId === undefined ? {} : { groupId }) });
  };
  const colorSelected = (color: string) => {
    if (!transaction) return;
    onCommand({ id: nextCommandId("bottom_transaction_color"), type: "transaction.update", transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.phases === undefined ? {} : { phases: transaction.phases }), ...(transaction.groupId === undefined ? {} : { groupId: transaction.groupId }), color });
  };
  return <section className="transaction-editor" data-testid="transaction-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><strong>{transaction ? `Editing: ${transaction.name}` : "Transaction Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button>{transaction && <button type="button" className="danger" data-testid="delete-bottom-transaction" onClick={onDelete}>Delete Transaction</button>}</header>{!transaction && document.transactions.length === 0 && <div className="transaction-empty-state" data-testid="transaction-empty-state"><strong>No Transactions yet</strong><p>Transactions describe a named time span, optional phases, and the waveform Signals related to that operation. Use "+ Add" in the Tree above, or the Ribbon's "Create Transaction", to add one.</p></div>}{transaction ? <><form id="transaction-properties-form" onSubmit={(event) => { event.preventDefault(); if (!hasChanges) return; onCommand({ id: nextCommandId("bottom_transaction_update"), type: "transaction.update", transactionId: transaction.id, name: editName.trim() || "Transaction", start: editStart, end: editEnd, laneId: editLaneId, ...(transaction.phases === undefined ? {} : { phases: transaction.phases }) }); }}><label>Name<input aria-label="Transaction name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={editEnd - 1} value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={editStart + 1} max={document.timeline.cycleCount} value={editEnd} onChange={(event) => setEditEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={editLaneId} onChange={(event) => setEditLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label></form><div className="bottom-sticky-actions">{hasChanges && <output className="draft-unapplied-indicator" data-testid="transaction-properties-unapplied">● Unapplied changes</output>}<span className="bottom-sticky-buttons"><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="submit" form="transaction-properties-form" data-testid="apply-transaction-properties" disabled={!hasChanges}>Apply Transaction</button></span></div></> : <form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction", document) as TransactionId; const result = onCommand({ id: nextCommandId("transaction_create"), type: "transaction.create", transaction: { id, name: name.trim() || "Transaction", start, end, laneId } }); if (result.ok) onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Start<input aria-label="New Transaction start" type="number" min="0" max={end - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End<input aria-label="New Transaction end" type="number" min={start + 1} max={document.timeline.cycleCount} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label><button type="submit">Create Transaction</button></form>}{document.transactions.length > 0 && <div className="event-toolbar" role="toolbar" aria-label="Transaction list commands" data-testid="transaction-list-toolbar">
    <button type="button" data-testid="bottom-transaction-duplicate" disabled={!transaction} onClick={duplicateSelected}>Duplicate</button>
    <label className="field-inline">Group<select aria-label="Move selected transaction to group" disabled={!transaction} value={transaction?.groupId ?? ""} onChange={(event) => moveSelectedToGroup(event.target.value ? event.target.value as TransactionGroup["id"] : undefined)}><option value="">Ungrouped</option>{document.transactionGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    <label className="field-inline">Color<input aria-label="Set selected transaction color" type="color" disabled={!transaction} value={transaction?.color ?? "#8895a7"} onChange={(event) => colorSelected(event.target.value)} /></label>
    <input aria-label="Search transactions" data-testid="transaction-list-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" />
  </div>}
  <div className="transaction-list">{visibleTransactions.map((item) => <button type="button" key={item.id} data-selected={String(item.id === transaction?.id)} onClick={() => onSelect(item.id)}>
    {/* #453: every new field is appended AFTER the original 4 (name/
        start-end/lane/links), never interspersed between them -- several
        existing tests match this row's accessible name against a regex
        expecting those 4 immediately adjacent (e.g. /Transaction A 1–4
        lane_0/), and inserting a new span between any of them broke that
        match. The swatch is `aria-hidden`, so it doesn't affect the name
        at all regardless of position. */}
    <i className="transaction-row-swatch" aria-hidden="true" style={{ background: item.color ?? (item.groupId === undefined ? "#8895a7" : document.transactionGroups?.find((group) => group.id === item.groupId)?.color ?? "#8895a7") }} />
    <b>{item.name}</b><span>{item.start}–{item.end}</span><span>{item.laneId ?? "lane_0"}</span><span>{item.linkedSignals?.length ?? 0} links</span>
    <span>{item.end - item.start} cycles</span>{item.groupId !== undefined && <span>{groupNameById.get(item.groupId) ?? "Group"}</span>}<span>{item.phases?.length ?? 0} phases</span>
  </button>)}
  {visibleTransactions.length === 0 && <p className="inspector-note">No Transactions match this search.</p>}</div></section>;
}
