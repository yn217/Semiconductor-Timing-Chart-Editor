import { startTransition, type ReactNode, type RefObject } from "react";
import type { MinimalCycleApplicationPort } from "./minimal-cycle-view-application.js";
import type { MinimalCycleTimelinePort } from "./minimal-cycle-view-timeline.js";
import { MinimalCycleViewPanels } from "./minimal-cycle-view-panels.js";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import type { HistoryState } from "@timing-chart-v2/history";

/**
 * Coarse UI owner.
 *
 * Existing extracted UI should be composed here:
 * - minimal-cycle-view-ribbon.tsx
 * - minimal-cycle-view-panels.tsx
 * - MinimalCycleViewTitleBar
 * - MinimalCycleViewRibbonTabs
 *
 * During migration, the current production JSX can be supplied as slots.  The
 * slot surface is intentionally explicit and temporary; once a block has been
 * moved here, replace its slot with the real component and delete the old JSX
 * from minimal-cycle-view.tsx.
 */
export interface MinimalCycleViewUiSource {
  readonly titleBarUi: ReactNode;
  readonly ribbonTabsUi: ReactNode;
  readonly ribbonUi: ReactNode;

  readonly signalTreeAndCanvasUi: ReactNode;
  readonly bottomEditorUi: ReactNode;
  readonly inspectorShellUi: ReactNode;
  readonly dialogsUi: ReactNode;
  readonly statusBarUi: ReactNode;
}

export function MinimalCycleViewRibbonTabs({ ribbonTab, setRibbonTab, viewMode, activeContext, setViewMode }: any) {
  const tabs = [{ key: "File", label: "File" }, { key: "Home", label: "Home" }, { key: "Insert", label: "Insert" }, { key: "Timeline", label: "Timeline" }, { key: "Annotation", label: "Annotation" }, { key: "View", label: "View" }, { key: "Review", label: "Check" }, { key: "AI", label: "AI" }] as const;
  const ribbonContext = viewMode === "Split" ? activeContext : viewMode === "Transaction" ? "Transaction" : "Signal";
  return <nav className="ribbon-tabs" aria-label="Ribbon tabs">{tabs.map((tab) => <button type="button" key={tab.key} aria-label={tab.label} className={ribbonTab === tab.key ? "active" : ""} onClick={() => startTransition(() => setRibbonTab(tab.key))}>{tab.label}</button>)}<output className="ribbon-context" data-testid="ribbon-context">Ribbon target: {ribbonContext}</output><div className="view-mode"><span>View Mode:</span>{(["Cycle", "Transaction", "Split"] as const).map((mode) => { const label = mode === "Split" ? "Combined" : mode; return <button type="button" key={mode} aria-label={label} title={mode === "Split" ? "Combined Cycle + Transaction view" : undefined} className={viewMode === mode ? "active" : ""} onClick={() => setViewMode(mode)}>{label}</button>; })}</div></nav>;
}

export function refreshTreeCollapsedMetadata(host: RefObject<HTMLDivElement | null>, collapsedGroups: ReadonlySet<string>): void { const root = host.current; if (root) root.dataset.collapsedGroups = [...collapsedGroups].join(","); }
export function refreshTreeRovingFocus(host: RefObject<HTMLDivElement | null>, focusRowIdRef: { current: string | undefined }): void { const tree = host.current?.querySelector<HTMLElement>("[data-role='left-tree-rows']"); if (!tree) return; const items = [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].filter((item) => !item.hidden && !item.closest("[hidden]")); const preferred = items.find((item) => item.dataset.rowId === focusRowIdRef.current) ?? items.find((item) => item.getAttribute("aria-selected") === "true") ?? items[0]; for (const item of tree.querySelectorAll<HTMLElement>("[role='treeitem']")) item.tabIndex = item === preferred ? 0 : -1; tree.dataset.focusRowId = preferred?.dataset.rowId ?? ""; }
export function refreshTreeFilterPresentation(host: RefObject<HTMLDivElement | null>, treeFilter: string, treeTypeFilter: string): void { const root = host.current; if (!root) return; const query = treeFilter.trim().toLocaleLowerCase(); const filterActive = query.length > 0 || treeTypeFilter !== "all"; const rows = [...root.querySelectorAll<HTMLElement>("[data-role='left-row']")]; let matchingSignalCount = 0; for (const row of rows) { const text = [row.dataset.name, row.dataset.fullPath, row.dataset.instancePath, row.dataset.signalRole, row.dataset.groupName].filter(Boolean).join(" ").toLocaleLowerCase(); const typeMatch = treeTypeFilter === "all" || (treeTypeFilter === "comment" ? row.dataset.kind === "comment" : treeTypeFilter === "wire" ? row.dataset.signalRole === "internal" : row.dataset.signalRole === treeTypeFilter); const matches = typeMatch && (query.length === 0 || text.includes(query)); row.hidden = !matches; row.dataset.treeFilterMatch = String(matches); if (matches && row.dataset.kind === "timing") matchingSignalCount += 1; } for (const header of root.querySelectorAll<HTMLElement>("[data-role='left-group-header'][data-group-id]")) { const groupId = header.dataset.groupId; header.hidden = filterActive && !rows.some((row) => row.dataset.groupId === groupId && row.dataset.treeFilterMatch === "true"); } root.dataset.treeFilter = treeFilter; root.dataset.treeTypeFilter = treeTypeFilter; root.dataset.treeFilterMatches = String(matchingSignalCount); }
