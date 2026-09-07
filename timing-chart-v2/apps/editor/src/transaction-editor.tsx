import { useEffect, useState } from "react";
import type { HistoryState } from "@timing-chart-v2/history";
import type { CanonicalDocument, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";
import type { TransactionEditorCommandActions } from "./application/editor-surface-command-controller.js";

export function TransactionEditor({ transaction, document, history, onSelect, commands, onUndo, onRedo, onDelete, onCancel }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument; readonly history: HistoryState; readonly onSelect: (id: TransactionId) => void; readonly commands: TransactionEditorCommandActions; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void }) {
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
    const result = commands.duplicateTransactionById(transaction.id, newTransactionId, `${transaction.name} Copy`);
    if (result.ok) onSelect(newTransactionId);
  };
  const moveSelectedToGroup = (groupId: TransactionGroup["id"] | undefined) => {
    if (!transaction) return;
    commands.moveTransactionToGroup(transaction.id, groupId);
  };
  const colorSelected = (color: string) => {
    if (!transaction) return;
    commands.updateTransactionFromBottom({ transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.phases === undefined ? {} : { phases: transaction.phases }), ...(transaction.groupId === undefined ? {} : { groupId: transaction.groupId }), color });
  };
  // #453 (bulk operations): a distinct "checked for bulk action" set,
  // independent of `transaction` (the single row currently open for
  // editing) -- checking rows and editing a row are two different
  // gestures, same as any spreadsheet/table checkbox-select pattern.
  // Re-derived against the live document every render so a Transaction
  // deleted elsewhere can't leave a stale, dangling checked ID behind.
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<TransactionId>>(new Set());
  const validCheckedIds = new Set([...checkedIds].filter((id) => document.transactions.some((item) => item.id === id)));
  const checkedTransactions = document.transactions.filter((item) => validCheckedIds.has(item.id));
  const toggleChecked = (id: TransactionId) => setCheckedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearChecked = () => setCheckedIds(new Set());
  const allVisibleChecked = visibleTransactions.length > 0 && visibleTransactions.every((item) => validCheckedIds.has(item.id));
  const toggleAllVisible = () => setCheckedIds((current) => {
    if (allVisibleChecked) return new Set([...current].filter((id) => !visibleTransactions.some((item) => item.id === id)));
    return new Set([...current, ...visibleTransactions.map((item) => item.id)]);
  });
  // Bulk Group/Color/Delete: one command per checked Transaction, all
  // dispatched through the shared executeBatch path -- 1 logical action,
  // 1 History entry, same atomic-batch contract the Ribbon's Annotation
  // Arrange commands already use. No second bulk-mutation command type.
  const bulkMoveToGroup = (groupId: TransactionGroup["id"] | undefined) => {
    if (checkedTransactions.length === 0) return;
    commands.bulkMoveTransactionsToGroup(checkedTransactions.map((item) => ({ transactionId: item.id, ...(groupId === undefined ? {} : { groupId }) })));
  };
  const bulkColor = (color: string) => {
    if (checkedTransactions.length === 0) return;
    commands.bulkUpdateTransactions(checkedTransactions.map((item) => ({ transactionId: item.id, name: item.name, start: item.start, end: item.end, ...(item.laneId === undefined ? {} : { laneId: item.laneId }), ...(item.phases === undefined ? {} : { phases: item.phases }), ...(item.groupId === undefined ? {} : { groupId: item.groupId }), color })));
  };
  const bulkDelete = () => {
    if (checkedTransactions.length === 0) return;
    const result = commands.bulkDeleteTransactions(checkedTransactions.map((item) => item.id));
    if (result.ok) clearChecked();
  };
  return <section className="transaction-editor" data-testid="transaction-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><strong>{transaction ? `Editing: ${transaction.name}` : "Transaction Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button>{transaction && <button type="button" className="danger" data-testid="delete-bottom-transaction" onClick={onDelete}>Delete Transaction</button>}</header>{!transaction && document.transactions.length === 0 && <div className="transaction-empty-state" data-testid="transaction-empty-state"><strong>No Transactions yet</strong><p>Transactions describe a named time span, optional phases, and the waveform Signals related to that operation. Use "+ Add" in the Tree above, or the Ribbon's "Create Transaction", to add one.</p></div>}{transaction ? <><form id="transaction-properties-form" onSubmit={(event) => { event.preventDefault(); if (!hasChanges) return; commands.updateTransactionFromBottom({ transactionId: transaction.id, name: editName.trim() || "Transaction", start: editStart, end: editEnd, laneId: editLaneId, ...(transaction.phases === undefined ? {} : { phases: transaction.phases }) }); }}><label>Name<input aria-label="Transaction name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={editEnd - 1} value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={editStart + 1} max={document.timeline.cycleCount} value={editEnd} onChange={(event) => setEditEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={editLaneId} onChange={(event) => setEditLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label></form><div className="bottom-sticky-actions">{hasChanges && <output className="draft-unapplied-indicator" data-testid="transaction-properties-unapplied">● Unapplied changes</output>}<span className="bottom-sticky-buttons"><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="submit" form="transaction-properties-form" data-testid="apply-transaction-properties" disabled={!hasChanges}>Apply Transaction</button></span></div></> : <form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction", document) as TransactionId; const result = commands.createTransactionFromBottom({ id, name: name.trim() || "Transaction", start, end, laneId }); if (result.ok) onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Start<input aria-label="New Transaction start" type="number" min="0" max={end - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End<input aria-label="New Transaction end" type="number" min={start + 1} max={document.timeline.cycleCount} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label><button type="submit">Create Transaction</button></form>}{document.transactions.length > 0 && <div className="event-toolbar" role="toolbar" aria-label="Transaction list commands" data-testid="transaction-list-toolbar">
    <button type="button" data-testid="bottom-transaction-duplicate" disabled={!transaction} onClick={duplicateSelected}>Duplicate</button>
    <label className="field-inline">Group<select aria-label="Move selected transaction to group" disabled={!transaction} value={transaction?.groupId ?? ""} onChange={(event) => moveSelectedToGroup(event.target.value ? event.target.value as TransactionGroup["id"] : undefined)}><option value="">Ungrouped</option>{document.transactionGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    <label className="field-inline">Color<input aria-label="Set selected transaction color" type="color" disabled={!transaction} value={transaction?.color ?? "#8895a7"} onChange={(event) => colorSelected(event.target.value)} /></label>
    <input aria-label="Search transactions" data-testid="transaction-list-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" />
  </div>}
  {/* #453: bulk operations -- only shown once at least one row is checked,
      so a single-Transaction workflow sees no new UI at all. Group/Color/
      Delete here act on every checked row (via onCommandBatch, one atomic
      History entry), completely independent of `transaction` (the row open
      for editing above) -- checking a row for a bulk action and opening it
      for editing are two different gestures. */}
  {validCheckedIds.size > 0 && <div className="event-toolbar" role="toolbar" aria-label="Bulk transaction commands" data-testid="transaction-bulk-toolbar">
    <span data-testid="transaction-bulk-count">{validCheckedIds.size} selected</span>
    <label className="field-inline">Group<select aria-label="Move selected transactions to group" defaultValue="" onChange={(event) => bulkMoveToGroup(event.target.value ? event.target.value as TransactionGroup["id"] : undefined)}><option value="">Ungrouped</option>{document.transactionGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    <label className="field-inline">Color<input aria-label="Set selected transactions color" type="color" defaultValue="#8895a7" onChange={(event) => bulkColor(event.target.value)} /></label>
    <button type="button" className="danger" data-testid="bulk-delete-transactions" onClick={bulkDelete}>Delete Selected</button>
    <button type="button" data-testid="bulk-clear-selection" onClick={clearChecked}>Clear Selection</button>
  </div>}
  <div className="transaction-list">{visibleTransactions.length > 0 && <label className="field-inline transaction-select-all"><input type="checkbox" aria-label="Select all visible transactions" checked={allVisibleChecked} onChange={toggleAllVisible} />Select all</label>}{visibleTransactions.map((item) => <div className="transaction-list-row" key={item.id}>
    <input type="checkbox" aria-label={`Select ${item.name}`} checked={validCheckedIds.has(item.id)} onChange={() => toggleChecked(item.id)} />
    <button type="button" data-selected={String(item.id === transaction?.id)} onClick={() => onSelect(item.id)}>
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
    </button>
  </div>)}
  {visibleTransactions.length === 0 && <p className="inspector-note">No Transactions match this search.</p>}</div></section>;
}
