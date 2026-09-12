import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { CanonicalDocument, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import { EditorIcon } from "./editor-icon.js";
import { InlineNameInput } from "./inline-name-input.js";

export function TransactionTree({ document, documentEpoch, filter, filterMode = "all", selectedId, selectedIds, onSelect, onRenameGroup, onMoveToGroup, onContextMenu, onCreateTransaction, onFocusTransaction, onDelete }: { readonly document: CanonicalDocument; readonly documentEpoch: number; readonly filter: string; readonly filterMode?: "all" | "grouped" | "ungrouped" | "phases" | "linked" | "visible" | "hidden" | "no-phases"; readonly selectedId?: TransactionId; readonly selectedIds?: ReadonlySet<TransactionId>; readonly onSelect: (id: TransactionId, additive?: boolean) => void; readonly onRenameGroup?: (id: TransactionGroup["id"], name: string) => void; readonly onMoveToGroup?: (transactionId: TransactionId, groupId: TransactionGroup["id"] | undefined) => void; readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>, transactionId: TransactionId) => void; readonly onCreateTransaction?: () => void; readonly onFocusTransaction?: (transactionId: TransactionId) => void; readonly onDelete?: () => void }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dragOverGroup, setDragOverGroup] = useState<string>();
  const [editingGroupId, setEditingGroupId] = useState<string>();
  const [openGroupMenuId, setOpenGroupMenuId] = useState<string>();
  const isTransactionSelected = (id: TransactionId) => selectedId === id || selectedIds?.has(id) === true;
  useEffect(() => { setCollapsed(new Set()); setDragOverGroup(undefined); setEditingGroupId(undefined); setOpenGroupMenuId(undefined); }, [documentEpoch]);
  const groups = useMemo(() => [...(document.transactionGroups ?? [])].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)), [document.transactionGroups]);
  const needle = filter.trim().toLocaleLowerCase();
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const header = event.target instanceof Element ? event.target.closest<HTMLElement>(".transaction-left-tree-group-header") : null;
      const groupId = header?.closest<HTMLElement>("[data-transaction-group-id]")?.dataset.transactionGroupId;
      if (!groupId || groupId === "ungrouped") return;
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) return;
      event.preventDefault();
      setEditingGroupId(group.id);
    };
    globalThis.document.addEventListener("keydown", onKeyDown);
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const header = target?.closest<HTMLElement>(".transaction-left-tree-group-header");
      const groupId = header?.closest<HTMLElement>("[data-transaction-group-id]")?.dataset.transactionGroupId;
      const group = groupId === undefined || groupId === "ungrouped" ? undefined : groups.find((candidate) => candidate.id === groupId);
      if (group) setEditingGroupId(group.id);
    };
    const onArrow = (event: KeyboardEvent) => {
      if (event.key === "Delete") {
        const current = event.target instanceof Element ? event.target.closest<HTMLElement>(".transaction-left-tree-row") : null;
        if (current && onDelete) { event.preventDefault(); const id = current.dataset.transactionTreeId as TransactionId | undefined; if (id) { onSelect(id); queueMicrotask(onDelete); } }
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const current = event.target instanceof Element ? event.target.closest<HTMLElement>(".transaction-left-tree-row") : null;
      if (!current) return;
      const rows = [...globalThis.document.querySelectorAll<HTMLElement>(".transaction-left-tree-row")];
      const next = rows[rows.indexOf(current) + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      next.focus();
      const id = next.dataset.transactionTreeId as TransactionId | undefined;
      if (id) onSelect(id);
    };
    globalThis.document.addEventListener("dblclick", onDoubleClick);
    globalThis.document.addEventListener("keydown", onArrow);
    return () => { globalThis.document.removeEventListener("keydown", onKeyDown); globalThis.document.removeEventListener("dblclick", onDoubleClick); globalThis.document.removeEventListener("keydown", onArrow); };
  }, [groups, onDelete, onSelect]);
  const matches = (transaction: Transaction) => {
    if (filterMode === "grouped" && transaction.groupId === undefined) return false;
    if (filterMode === "ungrouped" && transaction.groupId !== undefined) return false;
    if (filterMode === "phases" && (transaction.phases?.length ?? 0) === 0) return false;
    if (filterMode === "linked" && (transaction.linkedSignals?.length ?? 0) === 0) return false;
    if (filterMode === "visible" && transaction.visible === false) return false;
    if (filterMode === "hidden" && transaction.visible !== false) return false;
    if (filterMode === "no-phases" && (transaction.phases?.length ?? 0) > 0) return false;
    if (needle.length === 0) return true;
    const groupName = transaction.groupId === undefined ? "" : groupById.get(transaction.groupId)?.name ?? "";
    return transaction.name.toLocaleLowerCase().includes(needle) || groupName.toLocaleLowerCase().includes(needle);
  };
  const groupTransactions = (groupId: TransactionGroup["id"] | undefined) => document.transactions.filter((transaction) => transaction.groupId === groupId && matches(transaction)).sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  const toggle = (key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const rename = (group: TransactionGroup) => setEditingGroupId(group.id);
  const renderTransaction = (transaction: Transaction) => <button type="button" draggable={onMoveToGroup !== undefined} key={transaction.id} className="transaction-left-tree-row" data-testid={`transaction-left-tree-row-${transaction.id}`} data-transaction-tree-id={transaction.id} data-selected={String(isTransactionSelected(transaction.id))} title={transaction.name} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-timing-chart-transaction", transaction.id); }} onClick={(event) => onSelect(transaction.id, event.ctrlKey || event.metaKey)} onDoubleClick={() => { onSelect(transaction.id); onFocusTransaction?.(transaction.id); }} onContextMenu={(event) => { event.preventDefault(); onSelect(transaction.id); onContextMenu?.(event, transaction.id); }}><i aria-hidden="true" style={{ background: transaction.color ?? (transaction.groupId === undefined ? "#8895a7" : groupById.get(transaction.groupId)?.color ?? "#8895a7") }} />{transaction.name}</button>;
  const dropTarget = (groupId: TransactionGroup["id"] | undefined) => { const key = groupId ?? "ungrouped"; return { "data-drop-target": dragOverGroup === key ? "true" : "false", onDragOver: (event: DragEvent) => { if (!event.dataTransfer.types.includes("application/x-timing-chart-transaction")) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverGroup(key); }, onDragLeave: () => setDragOverGroup((current) => current === key ? undefined : current), onDrop: (event: DragEvent) => { event.preventDefault(); setDragOverGroup(undefined); const transactionId = event.dataTransfer.getData("application/x-timing-chart-transaction") as TransactionId; if (transactionId) onMoveToGroup?.(transactionId, groupId); } }; };
  return <div className="transaction-left-tree" data-testid="transaction-left-tree" data-transaction-tree-root="true" aria-label="Transaction tree">
    <div className="transaction-left-tree-root"><button type="button" aria-label={`${collapsed.has("__all__") ? "Expand" : "Collapse"} All Transactions`} aria-expanded={!collapsed.has("__all__")} onClick={() => toggle("__all__")}><EditorIcon name={collapsed.has("__all__") ? "right" : "down"} /></button><strong>All Transactions</strong><span>({document.transactions.length})</span></div>
    {!collapsed.has("__all__") && <div className="transaction-left-tree-groups">{groups.map((group) => { const items = groupTransactions(group.id); const isCollapsed = collapsed.has(group.id); const editing = editingGroupId === group.id; return <div className="transaction-left-tree-group" key={group.id} data-transaction-group-id={group.id}><div className="transaction-left-tree-group-header" {...dropTarget(group.id)}><button type="button" aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`} aria-expanded={!isCollapsed} onClick={() => toggle(group.id)}><EditorIcon name={isCollapsed ? "right" : "down"} /></button><span className="transaction-left-tree-swatch" style={{ background: group.color ?? "#8895a7" }} aria-hidden="true" />{editing ? <InlineNameInput target={group} value={group.name} ariaLabel={`Rename ${group.name}`} autoFocus onRename={(name) => onRenameGroup?.(group.id, name) ?? { ok: false, reason: "invalid", problems: [{ code: "RENAME_UNAVAILABLE", path: "$.name", message: "Rename unavailable" }] }} onCommitted={() => setEditingGroupId(undefined)} onCanceled={() => setEditingGroupId(undefined)} /> : <strong title={group.name}>{group.name}</strong>}<span>({items.length})</span>{onRenameGroup && !editing && <button type="button" className="transaction-left-tree-rename" aria-label={`Rename ${group.name}`} title={`Rename ${group.name}`} onClick={() => rename(group)}>✎</button>}<button type="button" className="transaction-left-tree-more" aria-label={`${group.name} actions`} title={`${group.name} actions`} onClick={() => setOpenGroupMenuId((current) => current === group.id ? undefined : group.id)}>⋮</button>{openGroupMenuId === group.id && <div className="transaction-left-tree-group-menu" role="menu" aria-label={`${group.name} actions`}><button type="button" role="menuitem" onClick={() => { setOpenGroupMenuId(undefined); rename(group); }}>Rename Group</button><button type="button" role="menuitem" onClick={() => { setOpenGroupMenuId(undefined); onCreateTransaction?.(); }}>New Transaction</button></div>}</div>{!isCollapsed && items.map(renderTransaction)}</div>; })}{(() => { const items = groupTransactions(undefined); const isCollapsed = collapsed.has("__ungrouped__"); return <div className="transaction-left-tree-group" data-transaction-group-id="ungrouped"><div className="transaction-left-tree-group-header" {...dropTarget(undefined)}><button type="button" aria-label={`${isCollapsed ? "Expand" : "Collapse"} Ungrouped`} aria-expanded={!isCollapsed} onClick={() => toggle("__ungrouped__")}><EditorIcon name={isCollapsed ? "right" : "down"} /></button><span className="transaction-left-tree-swatch" aria-hidden="true" /><strong>Ungrouped</strong><span>({items.length})</span></div>{!isCollapsed && items.map(renderTransaction)}</div>; })()}</div>}
  </div>;
}
