import { useMemo, useState } from "react";
import type { CanonicalDocument, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import { EditorIcon } from "./editor-icon.js";

export function TransactionTree({ document, filter, selectedId, onSelect }: { readonly document: CanonicalDocument; readonly filter: string; readonly selectedId?: TransactionId; readonly onSelect: (id: TransactionId) => void }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const groups = useMemo(() => [...(document.transactionGroups ?? [])].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)), [document.transactionGroups]);
  const needle = filter.trim().toLocaleLowerCase();
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const matches = (transaction: Transaction) => {
    if (needle.length === 0) return true;
    const groupName = transaction.groupId === undefined ? "" : groupById.get(transaction.groupId)?.name ?? "";
    return transaction.name.toLocaleLowerCase().includes(needle) || groupName.toLocaleLowerCase().includes(needle);
  };
  const groupTransactions = (groupId: TransactionGroup["id"] | undefined) => document.transactions.filter((transaction) => transaction.groupId === groupId && matches(transaction)).sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  const toggle = (key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const renderTransaction = (transaction: Transaction) => <button type="button" key={transaction.id} className="transaction-left-tree-row" data-testid={`transaction-left-tree-row-${transaction.id}`} data-transaction-tree-id={transaction.id} data-selected={String(selectedId === transaction.id)} title={transaction.name} onClick={() => onSelect(transaction.id)}><i aria-hidden="true" style={{ background: transaction.color ?? (transaction.groupId === undefined ? "#8895a7" : groupById.get(transaction.groupId)?.color ?? "#8895a7") }} />{transaction.name}</button>;
  return <div className="transaction-left-tree" data-testid="transaction-left-tree" data-transaction-tree-root="true" aria-label="Transaction tree">
    <div className="transaction-left-tree-root"><button type="button" aria-label={`${collapsed.has("__all__") ? "Expand" : "Collapse"} All Transactions`} aria-expanded={!collapsed.has("__all__")} onClick={() => toggle("__all__")}><EditorIcon name={collapsed.has("__all__") ? "right" : "down"} /></button><strong>All Transactions</strong><span>({document.transactions.length})</span></div>
    {!collapsed.has("__all__") && <div className="transaction-left-tree-groups">{groups.map((group) => { const items = groupTransactions(group.id); const isCollapsed = collapsed.has(group.id); return <div className="transaction-left-tree-group" key={group.id} data-transaction-group-id={group.id}><div className="transaction-left-tree-group-header"><button type="button" aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`} aria-expanded={!isCollapsed} onClick={() => toggle(group.id)}><EditorIcon name={isCollapsed ? "right" : "down"} /></button><span className="transaction-left-tree-swatch" style={{ background: group.color ?? "#8895a7" }} aria-hidden="true" /><strong title={group.name}>{group.name}</strong><span>({items.length})</span></div>{!isCollapsed && items.map(renderTransaction)}</div>; })}{(() => { const items = groupTransactions(undefined); const isCollapsed = collapsed.has("__ungrouped__"); return items.length > 0 ? <div className="transaction-left-tree-group" data-transaction-group-id="ungrouped"><div className="transaction-left-tree-group-header"><button type="button" aria-label={`${isCollapsed ? "Expand" : "Collapse"} Ungrouped`} aria-expanded={!isCollapsed} onClick={() => toggle("__ungrouped__")}><EditorIcon name={isCollapsed ? "right" : "down"} /></button><span className="transaction-left-tree-swatch" aria-hidden="true" /><strong>Ungrouped</strong><span>({items.length})</span></div>{!isCollapsed && items.map(renderTransaction)}</div> : null; })()}</div>}
  </div>;
}
