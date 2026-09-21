import { cyclesPerTc, cyclesToTc, tcFieldLabel, tcToCycles } from "./transaction-tc.js";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { HistoryState } from "@timing-chart-v2/history";
import type { CanonicalDocument, SignalId, Transaction, TransactionGroup, TransactionId, TransactionPhase } from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";
import type { TransactionEditorCommandActions } from "./application/editor-surface-command-controller.js";
import { EditorIconButton } from "./editor-icon.js";
import { TransactionLinkedSignals } from "./transaction-linked-signals.js";
import { DraftStatus } from "./draft-status.js";

export function TransactionEditor({ transaction, selectedTransactionIds, document, history, onSelect, onSelectTransactions, commands, onUndo, onRedo, onDelete, onCancel, onToggleTransactionSignal }: { readonly transaction: Transaction | undefined; readonly selectedTransactionIds?: ReadonlySet<TransactionId>; readonly document: CanonicalDocument; readonly history: HistoryState; readonly onSelect: (id: TransactionId, additive?: boolean) => void; readonly onSelectTransactions: (ids: ReadonlySet<TransactionId>, primary?: TransactionId) => void; readonly commands: TransactionEditorCommandActions; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onCancel: () => void; readonly onToggleTransactionSignal: (transactionId: TransactionId, signalId: SignalId) => void }) {
  const [name, setName] = useState("Transaction");
  const perTc = cyclesPerTc(document);
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(Math.min(5, document.timeline.cycleCount));
  const [laneId, setLaneId] = useState("");
  const [editName, setEditName] = useState(transaction?.name ?? "");
  const [editStart, setEditStart] = useState(transaction?.start ?? 0);
  const [editEnd, setEditEnd] = useState(transaction?.end ?? 1);
  const [editLaneId, setEditLaneId] = useState(transaction?.laneId ?? "");
  const [editGroupId, setEditGroupId] = useState<TransactionGroup["id"] | undefined>(transaction?.groupId);
  const [editColor, setEditColor] = useState(transaction?.color ?? "");
  const [editDescription, setEditDescription] = useState(transaction?.description ?? "");
  useEffect(() => {
    if (transaction !== undefined) return;
    setName("Transaction"); setStart(1); setEnd(Math.min(5, document.timeline.cycleCount)); setLaneId("");
  }, [transaction?.id, document.timeline.cycleCount]);
  type RowDraft = { readonly name: string; readonly start: number; readonly end: number; readonly laneId: string; readonly groupId: TransactionGroup["id"] | undefined; readonly color: string; readonly description: string };
  const baseOf = (item: Transaction | undefined): RowDraft => ({ name: item?.name ?? "", start: item?.start ?? 0, end: item?.end ?? 1, laneId: item?.laneId ?? "", groupId: item?.groupId, color: item?.color ?? "", description: item?.description ?? "" });
  const draftStoreRef = useRef(new Map<TransactionId, { readonly base: RowDraft; readonly draft: RowDraft }>());
  const liveRef = useRef<{ id: TransactionId | undefined; base: RowDraft; draft: RowDraft }>({ id: transaction?.id, base: baseOf(transaction), draft: baseOf(transaction) });
  liveRef.current = { id: liveRef.current.id, base: liveRef.current.base, draft: { name: editName, start: editStart, end: editEnd, laneId: editLaneId, groupId: editGroupId, color: editColor, description: editDescription } };
  useEffect(() => {
    const previous = liveRef.current;
    const nextBase = baseOf(transaction);
    let next = nextBase;
    if (previous.id !== transaction?.id) {
      if (previous.id !== undefined && JSON.stringify(previous.draft) !== JSON.stringify(previous.base)) draftStoreRef.current.set(previous.id, { base: previous.base, draft: previous.draft });
      const stored = transaction ? draftStoreRef.current.get(transaction.id) : undefined;
      if (stored && JSON.stringify(stored.base) === JSON.stringify(nextBase)) next = stored.draft;
      else if (transaction) draftStoreRef.current.delete(transaction.id);
    } else if (transaction) draftStoreRef.current.delete(transaction.id);
    liveRef.current = { id: transaction?.id, base: nextBase, draft: next };
    setEditName(next.name);
    setEditStart(next.start);
    setEditEnd(next.end);
    setEditLaneId(next.laneId);
    setEditGroupId(next.groupId);
    setEditColor(next.color);
    setEditDescription(next.description);
  }, [transaction?.id, transaction?.name, transaction?.start, transaction?.end, transaction?.laneId, transaction?.groupId, transaction?.color, transaction?.description]);
  // #426: Apply had no Draft/dirty gating at all (always enabled, no
  // "unapplied changes" indicator) and Cancel lived in the header while
  // Apply lived at the end of the form -- two different locations for
  // one Draft's two actions, the exact split-placement inconsistency the
  // Epic calls out. Both now live together in one sticky bottom action
  // bar, same shared classes Annotation's own bar already uses.
  const hasChanges = transaction !== undefined && (editName !== transaction.name || editStart !== transaction.start || editEnd !== transaction.end || (editLaneId.trim() || undefined) !== transaction.laneId || editGroupId !== transaction.groupId || (editColor.trim() || undefined) !== transaction.color || editDescription !== (transaction.description ?? ""));
  const createHasChanges = transaction === undefined && (name !== "Transaction" || start !== 1 || end !== Math.min(5, document.timeline.cycleCount) || laneId !== "");
  const applyTransactionDraft = () => {
    if (!transaction || !hasChanges) return;
    // #461: `transaction.update` reconstructs the entity and only preserves
    // groupId/color/description when the command itself carries them --
    // this Apply used to send just name/start/end/laneId/phases, so editing
    // e.g. Start-only here silently wiped a previously set Group/Color/
    // Description (set via the Inspector's own Apply, which already carries
    // all three). Every field this editor doesn't expose its own control
    // for must still round-trip the currently committed value, exactly like
    // colorSelected below already does for groupId/phases.
    const applyResult = commands.updateTransactionFromBottom({ transactionId: transaction.id, name: editName.trim() || "Transaction", start: editStart, end: editEnd, laneId: editLaneId, ...(editGroupId === undefined ? { clearGroupId: true } : { groupId: editGroupId }), ...(editColor.trim() === "" ? { clearColor: true } : { color: editColor.trim() }), ...(editDescription.trim() === "" ? { clearDescription: true } : { description: editDescription }) });
    setApplyError(applyResult.ok ? "" : applyResult.problems[0]?.message ?? "The Transaction change was rejected.");
  };
  const resetTransactionDraft = () => {
    if (!transaction) return;
    setApplyError("");
    setEditName(transaction.name);
    setEditStart(transaction.start);
    setEditEnd(transaction.end);
    setEditLaneId(transaction.laneId ?? "");
    setEditGroupId(transaction.groupId);
    setEditColor(transaction.color ?? "");
    setEditDescription(transaction.description ?? "");
  };
  // #453: Group/Color had zero GUI entry point at all before this (schema/
  // commands already supported both via #430/#450) -- added here, scoped to
  // whichever Transaction is currently selected, reusing the exact same
  // selection this editor already has rather than introducing a second,
  // list-owned multi-select. `search` is a pure client-side filter over the
  // existing list render; it never touches Canonical.
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"document" | "start" | "end" | "name">("document");
  const [sortDescending, setSortDescending] = useState(false);
  const [applyError, setApplyError] = useState("");
  useEffect(() => setApplyError(""), [transaction?.id]);
  const [expandedPhaseTransactionIds, setExpandedPhaseTransactionIds] = useState<ReadonlySet<TransactionId>>(new Set());
  const groupNameById = new Map(document.transactionGroups?.map((group) => [group.id, group.name]) ?? []);
  const needle = search.trim().toLocaleLowerCase();
  const filteredTransactions = needle.length === 0 ? document.transactions : document.transactions.filter((item) => item.name.toLocaleLowerCase().includes(needle) || (item.groupId !== undefined && (groupNameById.get(item.groupId) ?? "").toLocaleLowerCase().includes(needle)));
  const visibleTransactions = sortKey === "document" ? filteredTransactions : [...filteredTransactions].sort((left, right) => {
    const order = sortKey === "start" ? left.start - right.start || left.end - right.end : sortKey === "end" ? left.end - right.end || left.start - right.start : left.name.localeCompare(right.name);
    return sortDescending ? -order : order;
  });
  type TransactionListEntry = Readonly<{ kind: "transaction"; item: Transaction } | { kind: "phase"; transaction: Transaction; phase: TransactionPhase; index: number }>;
  const listEntries: readonly TransactionListEntry[] = visibleTransactions.flatMap((item) => [
    { kind: "transaction" as const, item },
    ...(expandedPhaseTransactionIds.has(item.id) ? (item.phases ?? []).map((phase, index) => ({ kind: "phase" as const, transaction: item, phase, index })) : []),
  ]);
  const transactionRowHeight = 30;
  const shouldVirtualizeTransactions = listEntries.length > 200;
  const transactionListViewportRef = useRef<HTMLDivElement>(null);
  const [transactionListScrollTop, setTransactionListScrollTop] = useState(0);
  const transactionViewportHeight = 360;
  const transactionOverscan = 12;
  const transactionFirstVisibleIndex = shouldVirtualizeTransactions ? Math.max(0, Math.floor(transactionListScrollTop / transactionRowHeight) - transactionOverscan) : 0;
  const transactionLastVisibleIndex = shouldVirtualizeTransactions ? Math.min(listEntries.length, Math.ceil((transactionListScrollTop + transactionViewportHeight) / transactionRowHeight) + transactionOverscan) : listEntries.length;
  const renderedEntries = listEntries.slice(transactionFirstVisibleIndex, transactionLastVisibleIndex);
  const selectedIds = selectedTransactionIds ?? new Set<TransactionId>();
  const selectionAnchorRef = useRef<TransactionId | undefined>(transaction?.id);
  const selectVisibleRow = (id: TransactionId, event: MouseEvent<HTMLButtonElement>) => {
    const anchor = selectionAnchorRef.current;
    const clickedIndex = visibleTransactions.findIndex((item) => item.id === id);
    const anchorIndex = anchor === undefined ? -1 : visibleTransactions.findIndex((item) => item.id === anchor);
    if (event.shiftKey && anchorIndex >= 0 && clickedIndex >= 0) {
      const [from, to] = anchorIndex <= clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
      const range = new Set(visibleTransactions.slice(from, to + 1).map((item) => item.id));
      const next = event.ctrlKey || event.metaKey ? new Set([...selectedIds, ...range]) : range;
      onSelectTransactions(next, id);
    } else if (event.ctrlKey || event.metaKey) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) next.add(id);
      onSelectTransactions(next, id);
    } else {
      onSelect(id);
    }
    selectionAnchorRef.current = id;
  };
  useEffect(() => {
    setTransactionListScrollTop(0);
    if (transactionListViewportRef.current) transactionListViewportRef.current.scrollTop = 0;
  // A canonical Transaction edit replaces document.transactions, but it does
  // not mean the user requested a new list position. Reset only when the
  // filter changes; structural edits retain the user's scroll context.
  }, [search]);
  useEffect(() => {
    if (!shouldVirtualizeTransactions || transaction === undefined) return;
    const selectedIndex = listEntries.findIndex((entry) => entry.kind === "transaction" && entry.item.id === transaction.id);
    if (selectedIndex < 0) return;
    const nextScrollTop = Math.max(0, selectedIndex * transactionRowHeight - transactionOverscan * transactionRowHeight);
    setTransactionListScrollTop(nextScrollTop);
    if (transactionListViewportRef.current) transactionListViewportRef.current.scrollTop = nextScrollTop;
  // Selection is the explicit reveal request. Do not depend on the filtered
  // array identity: canonical edits recreate that array and used to snap the
  // user's manual scroll back to the selected row on every edit.
  }, [shouldVirtualizeTransactions, transaction?.id, transactionOverscan, transactionRowHeight]);
  const duplicateSelected = () => {
    if (selectedIds.size > 1) {
      const sources = document.transactions.filter((item) => selectedIds.has(item.id));
      const items = sources.map((item) => ({ transactionId: item.id, newTransactionId: nextEntityId("transaction", document) as TransactionId, name: `${item.name} Copy` }));
      const batch = commands.bulkDuplicateTransactions(items);
      const last = items[items.length - 1];
      if (batch.ok && last) onSelect(last.newTransactionId);
      return;
    }
    if (!transaction || selectedIds.size !== 1) return;
    const newTransactionId = nextEntityId("transaction", document) as TransactionId;
    const result = commands.duplicateTransactionById(transaction.id, newTransactionId, `${transaction.name} Copy`);
    if (result.ok) onSelect(newTransactionId);
  };
  const addTransactionGroup = () => {
    const id = nextEntityId("transactionGroup", document) as TransactionGroup["id"];
    const order = document.transactionGroups?.length ?? 0;
    commands.createTransactionGroup({ id, name: `Group ${order + 1}`, order });
  };
  const moveSelectedToGroup = (groupId: TransactionGroup["id"] | undefined) => {
    if (selectedIds.size > 1) bulkMoveToGroup(groupId);
    else if (transaction) commands.moveTransactionToGroup(transaction.id, groupId);
  };
  const colorSelected = (color: string) => {
    if (!transaction) return;
    // #461: same round-trip requirement as applyTransactionDraft above --
    // this already preserved groupId/laneId/phases but not description.
    commands.updateTransactionFromBottom({ transactionId: transaction.id, name: transaction.name, start: transaction.start, end: transaction.end, ...(transaction.laneId === undefined ? {} : { laneId: transaction.laneId }), ...(transaction.phases === undefined ? {} : { phases: transaction.phases }), ...(transaction.groupId === undefined ? {} : { groupId: transaction.groupId }), ...(transaction.description === undefined ? {} : { description: transaction.description }), color });
  };
  const bulkMoveToGroup = (groupId: TransactionGroup["id"] | undefined) => {
    const selected = document.transactions.filter((item) => selectedIds.has(item.id));
    if (selected.length === 0) return;
    commands.bulkMoveTransactionsToGroup(selected.map((item) => ({ transactionId: item.id, ...(groupId === undefined ? {} : { groupId }) })));
  };
  const bulkColor = (color: string) => {
    const selected = document.transactions.filter((item) => selectedIds.has(item.id));
    if (selected.length === 0) return;
    // #461: same round-trip requirement as applyTransactionDraft/
    // colorSelected above -- description was still missing here.
    commands.bulkUpdateTransactions(selected.map((item) => ({ transactionId: item.id, name: item.name, start: item.start, end: item.end, ...(item.laneId === undefined ? {} : { laneId: item.laneId }), ...(item.phases === undefined ? {} : { phases: item.phases }), ...(item.groupId === undefined ? {} : { groupId: item.groupId }), ...(item.description === undefined ? {} : { description: item.description }), color })));
  };
  const bulkDelete = () => {
    const ids = document.transactions.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
    if (ids.length === 0) return;
    commands.bulkDeleteTransactions(ids);
  };
  // #397/#429 Transaction Mode GUI Closure P0-6: the multi-row table is the
  // Bottom Panel's primary content -- the single-item editor (create-new or
  // edit-selected) now renders AFTER the toolbar+table instead of pinning
  // above them, so the table is what's visible first/dominant rather than
  // pushed below the fold by a large always-on form. Nothing here removes
  // or renames any existing field/testid -- overview/multi-select/bulk-ops
  // stays first, quick single-item edit stays available right below it.
  const toolbarAndTable = <>
    {createHasChanges && <div className="bottom-sticky-actions"><DraftStatus testId="transaction-create-unapplied" /><button type="button" data-testid="cancel-bottom-transaction-create" onClick={onCancel}>Cancel</button></div>}
    {document.transactions.length > 0 && <div className="event-toolbar" role="toolbar" aria-label="Transaction list commands" data-testid="transaction-list-toolbar">
      {/* Transaction Mode GUI realignment: the reference toolbar reads
          "Add / Duplicate / Delete / Group / Ungroup / Color / Search" as
          one row -- this list already had Duplicate/Group/Color/Search
          (Delete lived only in the header and per-row/bulk actions).
          "Add" reuses the exact same commands.createTransactionFromBottom
          + default draft values the empty-state create form below already
          uses -- no new command, no second creation path. */}
      <button type="button" data-testid="bottom-transaction-add" onClick={() => { const id = nextEntityId("transaction", document) as TransactionId; const result = commands.createTransactionFromBottom({ id, name: `Transaction ${document.transactions.length + 1}`, start, end, ...(laneId.trim() ? { laneId: laneId.trim() } : {}) }); if (result.ok) onSelect(id); }}>Add</button>
      <button type="button" data-testid="bottom-transaction-duplicate" disabled={selectedIds.size === 0} title={selectedIds.size === 0 ? "Select a Transaction first" : selectedIds.size === 1 ? "Duplicate selected Transaction" : "Duplicate all selected Transactions"} onClick={duplicateSelected}>Duplicate</button>
      <button type="button" className="danger" data-testid="bottom-transaction-delete" disabled={selectedIds.size === 0} title={selectedIds.size === 0 ? "Select a Transaction first" : "Delete selected Transaction(s)"} onClick={() => selectedIds.size > 1 ? bulkDelete() : onDelete()}>Delete</button>
      <button type="button" data-testid="bottom-transaction-add-group" onClick={addTransactionGroup}>Add Group</button>
      <label className="field-inline transaction-group-control"><span aria-hidden="true">Group ▾</span><select aria-label="Move selected transaction to group" title={selectedIds.size === 0 ? "Select a Transaction first" : "Move selected Transaction(s) to a Group"} disabled={selectedIds.size === 0} value={selectedIds.size === 1 ? transaction?.groupId ?? "" : ""} onChange={(event) => moveSelectedToGroup(event.target.value ? event.target.value as TransactionGroup["id"] : undefined)}><option value="">Ungrouped</option>{document.transactionGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <button type="button" data-testid="bottom-transaction-ungroup" disabled={!document.transactions.some((item) => selectedIds.has(item.id) && item.groupId !== undefined)} title={selectedIds.size === 0 ? "Select a Transaction first" : document.transactions.some((item) => selectedIds.has(item.id) && item.groupId !== undefined) ? "Remove selected Transaction(s) from their Group" : "The selected Transaction(s) are already ungrouped"} onClick={() => moveSelectedToGroup(undefined)}>Ungroup</button>
      <label className="field-inline transaction-color-control"><span aria-hidden="true">Color ▾</span><input aria-label="Set selected transaction color" title={selectedIds.size === 0 ? "Select a Transaction first" : "Set color of selected Transaction"} type="color" disabled={selectedIds.size === 0} value={transaction?.color ?? "#8895a7"} onChange={(event) => selectedIds.size > 1 ? bulkColor(event.target.value) : colorSelected(event.target.value)} /></label>
      {selectedIds.size > 1 && <span className="transaction-selection-count" data-testid="transaction-selection-count">{selectedIds.size} selected</span>}
      {/* Delete already lives in the header as "Delete Transaction"
          (data-testid="delete-bottom-transaction") -- not duplicated here,
          since the reference's toolbar Delete and this header button are
          the exact same one-Transaction-delete action, and two buttons for
          one action is the "action競合/hard-coded重複" this session has
          been removing elsewhere (#416), not adding. */}
      <label className="field-inline transaction-sort-control"><span>Sort</span><select aria-label="Sort transactions" data-testid="transaction-sort-key" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}><option value="document">Document order</option><option value="start">Start</option><option value="end">End</option><option value="name">Name</option></select><button type="button" data-testid="transaction-sort-direction" aria-label={sortDescending ? "Sort descending" : "Sort ascending"} aria-pressed={sortDescending} disabled={sortKey === "document"} onClick={() => setSortDescending((value) => !value)}>{sortDescending ? "↓" : "↑"}</button></label>
      <input aria-label="Search transactions" data-testid="transaction-list-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions…" />
    </div>}
    <div ref={transactionListViewportRef} className="transaction-list" onDoubleClick={(event) => { if (transaction && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) event.currentTarget.querySelector<HTMLInputElement>("input[aria-label='Bottom Transaction name']")?.focus(); }} onKeyDown={(event) => { if (event.key === "F2" && transaction && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) { event.preventDefault(); event.currentTarget.querySelector<HTMLInputElement>("input[aria-label='Bottom Transaction name']")?.focus(); return; } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) && visibleTransactions.length > 0) { event.preventDefault(); onSelectTransactions(new Set(visibleTransactions.map((item) => item.id)), visibleTransactions[0]!.id); } }} onScroll={shouldVirtualizeTransactions ? (event) => setTransactionListScrollTop(event.currentTarget.scrollTop) : undefined} style={shouldVirtualizeTransactions ? { maxHeight: transactionViewportHeight, overflowY: "auto" } : undefined}>{visibleTransactions.length > 0 && <>
      {/* #397 Transaction Mode GUI Closure Section 6: column header row,
          same shared pattern as .bookmark-list-header -- fixed labels over
          the fixed 8-column grid every row below uses, so the list reads as
          one aligned table rather than a wrapping card grid. The leading
          spacer matches the row's checkbox column so the cell grid below it
          lines up exactly with each row's button (same grid-template-columns
          CSS rule, reused rather than duplicated). */}
      <div className="transaction-list-header" data-transaction-table-header="true"><span className="transaction-list-header-spacer" aria-hidden="true" /><span className="transaction-list-header-cells"><span title="Name">Name</span><span title="Group">Group</span><span title="Lane">Lane</span><span title={perTc === 1 ? "Start Cycle" : "Start (TC)"}>{perTc === 1 ? "Start Cycle" : "Start (TC)"}</span><span title={perTc === 1 ? "End Cycle" : "End (TC)"}>{perTc === 1 ? "End Cycle" : "End (TC)"}</span><span title={perTc === 1 ? "Duration (cycles)" : "Duration (TC)"}>{perTc === 1 ? "Duration (cycles)" : "Duration (TC)"}</span><span title="# Phases"># Phases</span><span title="Linked Signals">Linked Signals</span><span title="Color">Color</span><span title="Description">Description</span></span></div>
    </>}{shouldVirtualizeTransactions && <div aria-hidden="true" style={{ height: transactionFirstVisibleIndex * transactionRowHeight }} />}{renderedEntries.map((entry) => entry.kind === "phase" ? <div className="transaction-table-phase-row" data-transaction-phase-row-id={`${entry.transaction.id}::phase-${entry.index}`} data-transaction-id={entry.transaction.id} data-phase-index={entry.index} key={`${entry.transaction.id}::phase-${entry.index}`}><span className="transaction-phase-indent" aria-hidden="true" /><div className="transaction-phase-cells"><span>{entry.phase.name}</span><span>{entry.transaction.groupId === undefined ? "Ungrouped" : groupNameById.get(entry.transaction.groupId) ?? "Group"}</span><span>{entry.transaction.laneId ?? "lane_0"}</span><span>{cyclesToTc(entry.phase.start, perTc)}</span><span>{cyclesToTc(entry.phase.end, perTc)}</span><span>{cyclesToTc(entry.phase.end - entry.phase.start, perTc)}</span><span className="transaction-phase-kind">Phase</span><span /><span /><span /></div></div> : <div className={`transaction-list-row${entry.item.id === transaction?.id ? " transaction-list-row-editing" : ""}`} data-transaction-row-id={entry.item.id} key={entry.item.id}>
      {entry.item.phases && entry.item.phases.length > 0 ? <button type="button" className="transaction-disclosure-slot" aria-label={`${expandedPhaseTransactionIds.has(entry.item.id) ? "Collapse" : "Expand"} phases for ${entry.item.name}`} title={`${expandedPhaseTransactionIds.has(entry.item.id) ? "Collapse" : "Expand"} phases for ${entry.item.name}`} aria-expanded={expandedPhaseTransactionIds.has(entry.item.id)} onClick={() => setExpandedPhaseTransactionIds((current) => { const next = new Set(current); if (next.has(entry.item.id)) next.delete(entry.item.id); else next.add(entry.item.id); return next; })}>{expandedPhaseTransactionIds.has(entry.item.id) ? "▾" : "▸"}</button> : <span className="transaction-disclosure-slot" aria-hidden="true" />}
      {entry.item.id === transaction?.id ? <div className="transaction-list-row-editor" data-selected="true" role="group" aria-label={`Edit ${entry.item.name}`}>
        <input aria-label="Bottom Transaction name" data-draft-dirty={String(editName !== entry.item.name)} value={editName} onChange={(event) => setEditName(event.target.value)} />
        <select aria-label="Bottom Transaction group" value={editGroupId ?? ""} onChange={(event) => setEditGroupId(event.target.value ? event.target.value as TransactionGroup["id"] : undefined)}><option value="">Ungrouped</option>{document.transactionGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <input aria-label="Bottom Transaction lane" data-draft-dirty={String(editLaneId !== (entry.item.laneId ?? ""))} value={editLaneId} onChange={(event) => setEditLaneId(event.target.value)} />
        <input aria-label="Bottom Transaction start" title={tcFieldLabel("Start", perTc)} data-draft-dirty={String(editStart !== entry.item.start)} type="number" min="0" max={cyclesToTc(editEnd - 1, perTc)} step={perTc === 1 ? 1 : 1 / perTc} value={cyclesToTc(editStart, perTc)} onChange={(event) => setEditStart(tcToCycles(Number(event.target.value), perTc))} />
        <input aria-label="Bottom Transaction end" title={tcFieldLabel("End", perTc)} data-draft-dirty={String(editEnd !== entry.item.end)} type="number" min={cyclesToTc(editStart + 1, perTc)} max={cyclesToTc(document.timeline.cycleCount, perTc)} step={perTc === 1 ? 1 : 1 / perTc} value={cyclesToTc(editEnd, perTc)} onChange={(event) => setEditEnd(tcToCycles(Number(event.target.value), perTc))} />
        <span>{cyclesToTc(Math.max(0, editEnd - editStart), perTc)}</span><span>{entry.item.phases?.length ?? 0}</span><span>{entry.item.linkedSignals?.length ?? 0}</span>
        <input aria-label="Bottom Transaction color" type="color" value={editColor || "#8895a7"} onChange={(event) => setEditColor(event.target.value)} />
        <input aria-label="Bottom Transaction description" data-draft-dirty={String(editDescription !== (entry.item.description ?? ""))} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
      </div> : <button type="button" data-selected={String(selectedIds.has(entry.item.id))} aria-selected={selectedIds.has(entry.item.id)} onClick={(event) => selectVisibleRow(entry.item.id, event)}>
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
        <b>{entry.item.name}</b><span>{entry.item.groupId === undefined ? "Ungrouped" : groupNameById.get(entry.item.groupId) ?? "Group"}</span><span>{entry.item.laneId ?? "lane_0"}</span><span>{cyclesToTc(entry.item.start, perTc)}</span><span>{cyclesToTc(entry.item.end, perTc)}</span><span>{cyclesToTc(entry.item.end - entry.item.start, perTc)}</span><span>{entry.item.phases?.length ?? 0}</span><span>{entry.item.linkedSignals?.length ?? 0}</span><span className="transaction-row-color-value" title={entry.item.color ?? "#8895a7"}><i className="transaction-row-color-swatch" aria-hidden="true" style={{ background: entry.item.color ?? (entry.item.groupId === undefined ? "#8895a7" : document.transactionGroups?.find((group) => group.id === entry.item.groupId)?.color ?? "#8895a7") }} /></span>
        {/* Transaction Mode GUI realignment: Description is a real,
            already-persisted field (Transaction.description, #454) with no
            column in this table at all -- appended after the original
            columns per this row's own established convention (see the
            comment above), never interspersed, so no existing test's
            accessible-name-order assertion breaks. */}
        <span title={entry.item.description}>{entry.item.description ?? "—"}</span>
      </button>}
    </div>)}{shouldVirtualizeTransactions && <div aria-hidden="true" style={{ height: (listEntries.length - transactionLastVisibleIndex) * transactionRowHeight }} />}
  {visibleTransactions.length === 0 && document.transactions.length > 0 && search.trim() !== "" && <p className="inspector-note">No Transactions match this search.</p>}</div>
  </>;
  // Transaction details belong to the Inspector. The Bottom panel remains
  // table-first after a row is selected; only the zero-Transaction state uses
  // the compact create form below.
  if (transaction) return <section className="transaction-editor" data-testid="transaction-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); if (hasChanges) resetTransactionDraft(); else onCancel(); } }}>{toolbarAndTable}{applyError && hasChanges && <p className="inspector-note editor-problem" role="alert" data-testid="transaction-apply-error">{applyError}</p>}<div className="bottom-sticky-actions" data-testid="transaction-inline-draft-actions">{hasChanges && <DraftStatus testId="transaction-properties-unapplied" />}<span className="bottom-sticky-buttons"><button type="button" data-testid="revert-transaction-properties" onClick={resetTransactionDraft} disabled={!hasChanges}>Revert</button><button type="button" data-testid="apply-transaction-properties" onClick={applyTransactionDraft} disabled={!hasChanges}>Apply</button></span></div></section>;
  return <section className="transaction-editor" data-testid="transaction-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><strong>Transaction Editor</strong><button type="button" onClick={onUndo} disabled={!history.canUndo}>Undo</button><button type="button" onClick={onRedo} disabled={!history.canRedo}>Redo</button></header>{/* #534: the zero-Transaction state is the create form below (part of toolbarAndTable), shown directly -- no separate "No Transactions yet" onboarding block. */}{toolbarAndTable}{transaction ? <><form id="transaction-properties-form" onSubmit={(event) => { event.preventDefault(); applyTransactionDraft(); }}><label>Name<input aria-label="Transaction name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={editEnd - 1} value={editStart} onChange={(event) => setEditStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={editStart + 1} max={document.timeline.cycleCount} value={editEnd} onChange={(event) => setEditEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={editLaneId} onChange={(event) => setEditLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label>
      </form>
      {/* #426: Linked Signals -- the exact same component + immediate-commit
          `onToggle` handler Inspector passes (never a second selection/
          command owner); intentionally outside the Draft/Apply form since
          each toggle is already its own committed semantic operation, same
          as Inspector's own placement below its Apply-gated Phases. */}
      <TransactionLinkedSignals transaction={transaction} document={document} onToggle={(signalId) => onToggleTransactionSignal((transaction as Transaction).id, signalId)} renderUnlinkButton={(label, onClick) => <EditorIconButton label={label} icon="close" onClick={onClick} />} />
      <div className="bottom-sticky-actions">{hasChanges && <DraftStatus testId="transaction-properties-unapplied" />}<span className="bottom-sticky-buttons"><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="submit" form="transaction-properties-form" data-testid="apply-transaction-properties" disabled={!hasChanges}>Apply Transaction</button></span></div></> : <form onSubmit={(event) => { event.preventDefault(); const id = nextEntityId("transaction", document) as TransactionId; const result = commands.createTransactionFromBottom({ id, name: name.trim() || "Transaction", start, end, ...(laneId.trim() ? { laneId: laneId.trim() } : {}) }); if (result.ok) onSelect(id); }}><label>Name<input aria-label="New Transaction name" value={name} onChange={(event) => setName(event.target.value)} /></label><label>{tcFieldLabel("Start", perTc)}<input aria-label="New Transaction start" type="number" min="0" max={cyclesToTc(end - 1, perTc)} step={perTc === 1 ? 1 : 1 / perTc} value={cyclesToTc(start, perTc)} onChange={(event) => setStart(tcToCycles(Number(event.target.value), perTc))} /></label><label>{tcFieldLabel("End", perTc)}<input aria-label="New Transaction end" type="number" min={cyclesToTc(start + 1, perTc)} max={cyclesToTc(document.timeline.cycleCount, perTc)} step={perTc === 1 ? 1 : 1 / perTc} value={cyclesToTc(end, perTc)} onChange={(event) => setEnd(tcToCycles(Number(event.target.value), perTc))} /></label><label>Lane<input aria-label="New Transaction lane" value={laneId} onChange={(event) => setLaneId(event.target.value)} /><span className="inspector-note">A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track.</span></label><button type="submit">Create Transaction</button></form>}</section>;
}
