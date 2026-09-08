import { useEffect, useState } from "react";
import type { HistoryState } from "@timing-chart-v2/history";
import type { CanonicalDocument, SignalId, Transaction, TransactionGroup, TransactionId, TransactionPhase } from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";
import type { TransactionEditorCommandActions } from "./application/editor-surface-command-controller.js";
import { EditorIconButton } from "./editor-icon.js";
import { TransactionLinkedSignals } from "./transaction-linked-signals.js";

export function TransactionEditor({ transaction, document, history, onSelect, commands, onUndo, onRedo, onDelete, onCancel, onToggleTransactionSignal }: { readonly transaction: Transaction | undefined; readonly document: CanonicalDocument; readonly history: HistoryState; readonly onSelect: (id: TransactionId) => void; readonly commands: TransactionEditorCommandActions; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void; readonly onToggleTransactionSignal: (transactionId: TransactionId, signalId: SignalId) => void }) {
  const [name, setName] = useState("Transaction");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.min(5, document.timeline.cycleCount));
  const [laneId, setLaneId] = useState("lane_0");
  const [editName, setEditName] = useState(transaction?.name ?? "");
  const [editStart, setEditStart] = useState(transaction?.start ?? 0);
  const [editEnd, setEditEnd] = useState(transaction?.end ?? 1);
  const [editLaneId, setEditLaneId] = useState(transaction?.laneId ?? "lane_0");
  // #426 Bottom Panel Consolidation: the Goal's own target structure for
  // this tab is "List / Timing / Phase / Linked Signals" -- Phase and
  // Linked Signal editing previously existed only in the Inspector
  // (#454), leaving the Bottom Panel's own primary/detailed editing
  // surface without them. Same command owner as Inspector throughout:
  // `phaseRows` feeds the same `transaction.update` command (via
  // `updateTransactionFromBottom`, already used for Name/Start/End/Lane
  // above) Inspector's own Apply uses, and Linked Signals reuses the
  // exact same `TransactionLinkedSignals` component + `onToggle` handler
  // Inspector passes -- never a second Phase/LinkedSignal model or a
  // second selection/command owner.
  const [phaseRows, setPhaseRows] = useState<TransactionPhase[]>(() => (transaction?.phases ?? []).map((phase) => ({ ...phase })));
  const [phaseError, setPhaseError] = useState("");
  useEffect(() => {
    setEditName(transaction?.name ?? "");
    setEditStart(transaction?.start ?? 0);
    setEditEnd(transaction?.end ?? 1);
    setEditLaneId(transaction?.laneId ?? "lane_0");
    setPhaseRows((transaction?.phases ?? []).map((phase) => ({ ...phase })));
    setPhaseError("");
  }, [transaction?.id, transaction?.name, transaction?.start, transaction?.end, transaction?.laneId, transaction?.phases]);
  // #426: Apply had no Draft/dirty gating at all (always enabled, no
  // "unapplied changes" indicator) and Cancel lived in the header while
  // Apply lived at the end of the form -- two different locations for
  // one Draft's two actions, the exact split-placement inconsistency the
  // Epic calls out. Both now live together in one sticky bottom action
  // bar, same shared classes Annotation's own bar already uses.
  const hasChanges = transaction !== undefined && (editName !== transaction.name || editStart !== transaction.start || editEnd !== transaction.end || editLaneId !== transaction.laneId || JSON.stringify(phaseRows) !== JSON.stringify(transaction.phases ?? []));
  const addPhaseRow = () => setPhaseRows((rows) => { const last = rows.at(-1); const rowStart = last ? last.end : editStart; return [...rows, { name: `Phase ${rows.length + 1}`, start: rowStart, end: Math.min(rowStart + 1, editEnd) }]; });
  const applyTransactionDraft = () => {
    if (!transaction || !hasChanges) return;
    const phases = phaseRows.map((phase) => ({ ...phase, name: phase.name.trim() }));
    if (phases.some((phase) => !phase.name || !Number.isInteger(phase.start) || !Number.isInteger(phase.end) || phase.start < editStart || phase.start >= phase.end || phase.end > editEnd)) {
      setPhaseError("Phases must be named integer-cycle half-open subranges within Start..End.");
      return;
    }
    setPhaseError("");
    commands.updateTransactionFromBottom({ transactionId: transaction.id, name: editName.trim() || "Transaction", start: editStart, end: editEnd, laneId: editLaneId, phases });
  };
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
  // #397/#429 Transaction Mode GUI Closure P0-6: the multi-row table is the
  // Bottom Panel's primary content -- the single-item editor (create-new or
  // edit-selected) now renders AFTER the toolbar+table instead of pinning
  // above them, so the table is what's visible first/dominant rather than
  // pushed below the fold by a large always-on form. Nothing here removes
  // or renames any existing field/testid -- overview/multi-select/bulk-ops
  // stays first, quick single-item edit stays available right below it.
  const toolbarAndTable = <>
    {document.transactions.length > 0 && <div className="event-toolbar" role="toolbar" aria-label="Transaction list commands" data-testid="transaction-list-toolbar">
      <button type="button" data-testid="bottom-transaction-duplicate" disabled={!transaction} onClick={duplicateSelected}>Duplicate</button>
      <label className="field-inline">Group<select aria-label="Move selected transaction to group" disabled={!transaction} value={transaction?.groupId ?? ""} onChange={(event) => moveSelectedToGroup(event.target.value ? event.target.value as TransactionGroup["id"] : undefined)}><option value="">Ungrouped</option>{document.transactionGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label className="field-inline">Color<input aria-label="Set selected transaction color" type="color" disabled={!transaction} value={transaction?.color ?? "#8895a7"} onChange={(event) => colorSelected(event.target.value)} /></label>
      <input aria-label="Search transactions" data-testid="transaction-list-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" />
    </div>}
    {/* #453: bulk operations -- only shown once at least one row is checked,
        so a single-Transaction workflow sees no new UI at all. Group/Color/
        Delete here act on every checked row (via onCommandBatch, one atomic
        History entry), completely independent of `transaction` (the row
        open for editing below) -- checking a row for a bulk action and
        opening it for editing are two different gestures. */}
    {validCheckedIds.size > 0 && <div className="event-toolbar" role="toolbar" aria-label="Bulk transaction commands" data-testid="transaction-bulk-toolbar">
      <span data-testid="transaction-bulk-count">{validCheckedIds.size} selected</span>
      <label className="field-inline">Group<select aria-label="Move selected transactions to group" defaultValue="" onChange={(event) => bulkMoveToGroup(event.target.value ? event.target.value as TransactionGroup["id"] : undefined)}><option value="">Ungrouped</option>{document.transactionGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label className="field-inline">Color<input aria-label="Set selected transactions color" type="color" defaultValue="#8895a7" onChange={(event) => bulkColor(event.target.value)} /></label>
      <button type="button" className="danger" data-testid="bulk-delete-transactions" onClick={bulkDelete}>Delete Selected</button>
      <button type="button" data-testid="bulk-clear-selection" onClick={clearChecked}>Clear Selection</button>
    </div>}
    <div className="transaction-list">{visibleTransactions.length > 0 && <>
      <label className="field-inline transaction-select-all"><input type="checkbox" aria-label="Select all visible transactions" checked={allVisibleChecked} onChange={toggleAllVisible} />Select all</label>
      {/* #397 Transaction Mode GUI Closure Section 6: column header row,
          same shared pattern as .bookmark-list-header -- fixed labels over
          the fixed 8-column grid every row below uses, so the list reads as
          one aligned table rather than a wrapping card grid. The leading
          spacer matches the row's checkbox column so the cell grid below it
          lines up exactly with each row's button (same grid-template-columns
          CSS rule, reused rather than duplicated). */}
      <div className="transaction-list-header" aria-hidden="true"><span className="transaction-list-header-spacer" /><span className="transaction-list-header-cells"><span /><span>Name</span><span>Cycles</span><span>Lane</span><span>Links</span><span>Duration</span><span>Group</span><span>Phases</span></span></div>
    </>}{visibleTransactions.map((item) => <div className="transaction-list-row" key={item.id}>
      <input type="checkbox" aria-label={`Select ${item.name}`} checked={validCheckedIds.has(item.id)} onChange={() => toggleChecked(item.id)} />
      <button type="button" data-selected={String(item.id === transaction?.id)} onClick={() => onSelect(item.id)}>
        {/* #453: every new field is appended AFTER the original 4 (name/
            start-end/lane/links), never interspersed between them -- several
            existing tests match this row's accessible name against a regex
            expecting those 4 immediately adjacent (e.g. /Transaction A 1–4
            lane_0/), and inserting a new span between any of them broke that
            match. The swatch is `aria-hidden`, so it doesn't affect the name
            at all regardless of position. #397: Group is now always rendered
            (an em dash when ungrouped) rather than only when present -- a
            fixed 8-column table needs every row to occupy the same columns,
            and a row silently skipping one grid child shifted Phases one
            column left relative to rows that do have a Group. */}
        <i className="transaction-row-swatch" aria-hidden="true" style={{ background: item.color ?? (item.groupId === undefined ? "#8895a7" : document.transactionGroups?.find((group) => group.id === item.groupId)?.color ?? "#8895a7") }} />
        <b>{item.name}</b><span>{item.start}–{item.end}</span><span>{item.laneId ?? "lane_0"}</span><span>{item.linkedSignals?.length ?? 0} links</span>
        <span>{item.end - item.start} cycles</span><span>{item.groupId === undefined ? "—" : groupNameById.get(item.groupId) ?? "Group"}</span><span>{item.phases?.length ?? 0} phases</span>
      </button>
    </div>)}
    {visibleTransactions.length === 0 && <p className="inspector-note">No Transactions match this search.</p>}</div>
  </>;
  return <section className="transaction-editor" data-testid="transaction-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><strong>{transaction ? `Editing: ${transaction.name}` : "Transaction Editor"}</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button>{transaction && <button type="button" className="danger" data-testid="delete-bottom-transaction" onClick={onDelete}>Delete Transaction</button>}</header>{!transaction && document.transactions.length === 0 && <div className="transaction-empty-state" data-testid="transaction-empty-state"><strong>No Transactions yet</strong><p>Transactions describe a named time span, optional phases, and the waveform Signals related to that operation. Use "+ Add" in the Tree above, or the Ribbon's "Create Transaction", to add one.</p></div>}{toolbarAndTable}{transaction ? <><form id="transaction-properties-form" onSubmit={(event) => { event.preventDefault(); applyTransactionDraft(); }}><label>Name<input aria-label="Transaction name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={editEnd - 1} value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={editStart + 1} max={document.timeline.cycleCount} value={editEnd} onChange={(event) => setEditEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={editLaneId} onChange={(event) => setEditLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label>
        {/* #426: Phase editing, same `.transaction-phase-*` classes/markup
            shape Inspector's own Phase table already uses (packages/schema's
            TransactionPhase, same `transaction.update` command via
            `applyTransactionDraft` above) -- distinct testid/aria-labels
            from Inspector's ("Bottom Phase N ..." vs "Phase N ...") since
            both editors can be on screen at once for the same Transaction. */}
        <div className="transaction-phase-editor" data-testid="transaction-bottom-phase-editor">
          <h4>Phases ({phaseRows.length})</h4>
          <div className="transaction-phase-table">
            {phaseRows.length > 0 && <div className="transaction-phase-row transaction-phase-row-header" aria-hidden="true"><span>Phase</span><span>Start</span><span>End</span><span /></div>}
            {phaseRows.map((phase, index) => <div className="transaction-phase-row" key={index} data-phase-index={index}>
              <input aria-label={`Bottom Phase ${index + 1} name`} value={phase.name} onChange={(event) => setPhaseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} />
              <input aria-label={`Bottom Phase ${index + 1} start`} type="number" value={phase.start} onChange={(event) => setPhaseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, start: Number(event.target.value) } : row))} />
              <input aria-label={`Bottom Phase ${index + 1} end`} type="number" value={phase.end} onChange={(event) => setPhaseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, end: Number(event.target.value) } : row))} />
              <button type="button" aria-label={`Delete bottom phase ${index + 1}`} onClick={() => setPhaseRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>×</button>
            </div>)}
            {phaseRows.length === 0 && <span className="inspector-note">No phases -- the whole Start..End span is one unnamed phase.</span>}
          </div>
          <button type="button" data-testid="add-bottom-transaction-phase" onClick={addPhaseRow}>Add Phase</button>
          {phaseError && <p className="inspector-note" data-testid="transaction-bottom-phase-error" role="alert">{phaseError}</p>}
        </div>
      </form>
      {/* #426: Linked Signals -- the exact same component + immediate-commit
          `onToggle` handler Inspector passes (never a second selection/
          command owner); intentionally outside the Draft/Apply form since
          each toggle is already its own committed semantic operation, same
          as Inspector's own placement below its Apply-gated Phases. */}
      <TransactionLinkedSignals transaction={transaction} document={document} onToggle={(signalId) => onToggleTransactionSignal(transaction.id, signalId)} renderUnlinkButton={(label, onClick) => <EditorIconButton label={label} icon="close" onClick={onClick} />} />
      <div className="bottom-sticky-actions">{hasChanges && <output className="draft-unapplied-indicator" data-testid="transaction-properties-unapplied">● Unapplied changes</output>}<span className="bottom-sticky-buttons"><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="submit" form="transaction-properties-form" data-testid="apply-transaction-properties" disabled={!hasChanges}>Apply Transaction</button></span></div></> : <form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction", document) as TransactionId; const result = commands.createTransactionFromBottom({ id, name: name.trim() || "Transaction", start, end, laneId }); if (result.ok) onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Start<input aria-label="New Transaction start" type="number" min="0" max={end - 1} value={start} onChange={(event) => setStart(Number(event.target.value))} /></label><label>End<input aria-label="New Transaction end" type="number" min={start + 1} max={document.timeline.cycleCount} value={end} onChange={(event) => setEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label><button type="submit">Create Transaction</button></form>}</section>;
}
