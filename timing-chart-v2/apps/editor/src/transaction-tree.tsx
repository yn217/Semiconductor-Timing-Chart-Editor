import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { CanonicalDocument, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import { EditorIcon } from "./editor-icon.js";
import { InlineNameInput } from "./inline-name-input.js";

export function TransactionTree({ document, filter, selectedId, onSelect, onRenameGroup, onMoveToGroup }: { readonly document: CanonicalDocument; readonly filter: string; readonly selectedId?: TransactionId; readonly onSelect: (id: TransactionId) => void; readonly onRenameGroup?: (id: TransactionGroup["id"], name: string) => void; readonly onMoveToGroup?: (transactionId: TransactionId, groupId: TransactionGroup["id"] | undefined) => void }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dragOverGroup, setDragOverGroup] = useState<string>();
  const [editingGroupId, setEditingGroupId] = useState<string>();
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
    globalThis.document.addEventListener("dblclick", onDoubleClick);
    return () => { globalThis.document.removeEventListener("keydown", onKeyDown); globalThis.document.removeEventListener("dblclick", onDoubleClick); };
  }, [groups]);
  const matches = (transaction: Transaction) => {
    if (needle.length === 0) return true;
    const groupName = transaction.groupId === undefined ? "" : groupById.get(transaction.groupId)?.name ?? "";
    return transaction.name.toLocaleLowerCase().includes(needle) || groupName.toLocaleLowerCase().includes(needle);
  };
  const groupTransactions = (groupId: TransactionGroup["id"] | undefined) => document.transactions.filter((transaction) => transaction.groupId === groupId && matches(transaction)).sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  const toggle = (key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const rename = (group: TransactionGroup) => setEditingGroupId(group.id);
  const renderTransaction = (transaction: Transaction) => <button type="button" draggable={onMoveToGroup !== undefined} key={transaction.id} className="transaction-left-tree-row" data-testid={`transaction-left-tree-row-${transaction.id}`} data-transaction-tree-id={transaction.id} data-selected={String(selectedId === transaction.id)} title={transaction.name} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-timing-chart-transaction", transaction.id); }} onClick={() => onSelect(transaction.id)}><i aria-hidden="true" style={{ background: transaction.color ?? (transaction.groupId === undefined ? "#8895a7" : groupById.get(transaction.groupId)?.color ?? "#8895a7") }} />{transaction.name}</button>;
  const dropTarget = (groupId: TransactionGroup["id"] | undefined) => { const key = groupId ?? "ungrouped"; return { "data-drop-target": dragOverGroup === key ? "true" : "false", onDragOver: (event: DragEvent) => { if (!event.dataTransfer.types.includes("application/x-timing-chart-transaction")) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverGroup(key); }, onDragLeave: () => setDragOverGroup((current) => current === key ? undefined : current), onDrop: (event: DragEvent) => { event.preventDefault(); setDragOverGroup(undefined); const transactionId = event.dataTransfer.getData("application/x-timing-chart-transaction") as TransactionId; if (transactionId) onMoveToGroup?.(transactionId, groupId); } }; };
  return <div className="transaction-left-tree" data-testid="transaction-left-tree" data-transaction-tree-root="true" aria-label="Transaction tree">
    <div className="transaction-left-tree-root"><button type="button" aria-label={`${collapsed.has("__all__") ? "Expand" : "Collapse"} All Transactions`} aria-expanded={!collapsed.has("__all__")} onClick={() => toggle("__all__")}><EditorIcon name={collapsed.has("__all__") ? "right" : "down"} /></button><strong>All Transactions</strong><span>({document.transactions.length})</span></div>
    {!collapsed.has("__all__") && <div className="transaction-left-tree-groups">{groups.map((group) => { const items = groupTransactions(group.id); const isCollapsed = collapsed.has(group.id); const editing = editingGroupId === group.id; return <div className="transaction-left-tree-group" key={group.id} data-transaction-group-id={group.id}><div className="transaction-left-tree-group-header" {...dropTarget(group.id)}><button type="button" aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`} aria-expanded={!isCollapsed} onClick={() => toggle(group.id)}><EditorIcon name={isCollapsed ? "right" : "down"} /></button><span className="transaction-left-tree-swatch" style={{ background: group.color ?? "#8895a7" }} aria-hidden="true" />{editing ? <InlineNameInput target={group} value={group.name} ariaLabel={`Rename ${group.name}`} autoFocus onRename={(name) => onRenameGroup?.(group.id, name) ?? { ok: false, reason: "invalid", problems: [{ code: "RENAME_UNAVAILABLE", path: "$.name", message: "Rename unavailable" }] }} onCommitted={() => setEditingGroupId(undefined)} onCanceled={() => setEditingGroupId(undefined)} /> : <strong title={group.name}>{group.name}</strong>}<span>({items.length})</span>{onRenameGroup && !editing && <button type="button" className="transaction-left-tree-rename" aria-label={`Rename ${group.name}`} title={`Rename ${group.name}`} onClick={() => rename(group)}>✎</button>}</div>{!isCollapsed && items.map(renderTransaction)}</div>; })}{(() => { const items = groupTransactions(undefined); const isCollapsed = collapsed.has("__ungrouped__"); return <div className="transaction-left-tree-group" data-transaction-group-id="ungrouped"><div className="transaction-left-tree-group-header" {...dropTarget(undefined)}><button type="button" aria-label={`${isCollapsed ? "Expand" : "Collapse"} Ungrouped`} aria-expanded={!isCollapsed} onClick={() => toggle("__ungrouped__")}><EditorIcon name={isCollapsed ? "right" : "down"} /></button><span className="transaction-left-tree-swatch" aria-hidden="true" /><strong>Ungrouped</strong><span>({items.length})</span></div>{!isCollapsed && items.map(renderTransaction)}</div>; })()}</div>}
  </div>;
}
