import { useCallback, useEffect, useMemo, useState } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";

/** Stable key of the synthetic "no Group" section, shared by the Tree and the center Group headers. */
export const UNGROUPED_DISCLOSURE_KEY = "__ungrouped__";
/** Tree-only "All Transactions" root; never affects the center Group headers. */
export const ALL_DISCLOSURE_KEY = "__all__";

export interface TransactionDisclosure {
  readonly collapsed: ReadonlySet<string>;
  readonly toggle: (key: string) => void;
  /** #748: Tree menu 'Expand All' / 'Collapse All' (Groups, the Ungrouped section and the All Transactions root). */
  readonly expandAll: () => void;
  readonly collapseAll: () => void;
}

/**
 * #759: the single workspace-level owner of Transaction Group disclosure (view-only presentation state). The Left Tree, the center
 * Group headers and Combined all read this set and dispatch the same toggle, keyed by stable Group id. New/Open (documentEpoch) resets
 * it deterministically; Group ids that disappear from the Canonical document are pruned; unrelated edits leave it untouched.
 */
export function useTransactionDisclosure(document: CanonicalDocument, documentEpoch: number): TransactionDisclosure {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setCollapsed(new Set()); }, [documentEpoch]);
  const groupIds = useMemo(() => new Set((document.transactionGroups ?? []).map((group) => group.id as string)), [document.transactionGroups]);
  useEffect(() => {
    setCollapsed((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of current) {
        if (key === UNGROUPED_DISCLOSURE_KEY || key === ALL_DISCLOSURE_KEY || groupIds.has(key)) next.add(key); else changed = true;
      }
      return changed ? next : current;
    });
  }, [groupIds]);
  const toggle = useCallback((key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }), []);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => setCollapsed(new Set([...groupIds, UNGROUPED_DISCLOSURE_KEY, ALL_DISCLOSURE_KEY])), [groupIds]);
  return useMemo(() => ({ collapsed, toggle, expandAll, collapseAll }), [collapsed, toggle, expandAll, collapseAll]);
}
