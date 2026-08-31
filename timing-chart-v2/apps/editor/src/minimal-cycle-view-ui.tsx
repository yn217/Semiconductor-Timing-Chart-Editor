import { startTransition, type ReactNode, type RefObject } from "react";
import type { MinimalCycleApplicationPort } from "./minimal-cycle-view-application.js";
import type { MinimalCycleTimelinePort } from "./minimal-cycle-view-timeline.js";
import { MinimalCycleViewPanels } from "./minimal-cycle-view-panels.js";

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

export function MinimalCycleViewUi({
  source,
  application,
  timeline,
}: {
  readonly source: MinimalCycleViewUiSource;
  readonly application: MinimalCycleApplicationPort;
  readonly timeline: MinimalCycleTimelinePort;
}) {
  // Keep these reads deliberate.  They make the coarse ownership boundary
  // visible to TypeScript even before every UI block consumes the ports.
  void application;
  void timeline;

  return (
    <main
      className="editor-shell"
      data-next-owner="ui"
      data-application-owner="application"
      data-timeline-owner="timeline"
      data-next-zoom={String(timeline.state.zoom)}
      data-cycle-count={application.snapshot.document.timeline.cycleCount}
      data-signal-count={application.snapshot.document.signals.length}
      data-transaction-count={application.snapshot.document.transactions.length}
    >
      {source.titleBarUi}
      {source.ribbonTabsUi}
      {source.ribbonUi}

      <div className="next-timeline-controls" data-testid="next-timeline-controls" aria-label="Next timeline controls">
        <button type="button" data-testid="next-zoom-out" onClick={() => timeline.view.zoomBy(-0.1)}>Zoom Out</button>
        <button type="button" data-testid="next-zoom-in" onClick={() => timeline.view.zoomBy(0.1)}>Zoom In</button>
        <button type="button" data-testid="next-fit-all" onClick={() => timeline.view.fitAll()}>Fit All</button>
        <button type="button" data-testid="next-fit-selection" onClick={() => timeline.view.fitSelection()}>Fit Selection</button>
        <button type="button" data-testid="next-cycle-next" onClick={() => timeline.view.navigateToCycle(timeline.state.selectedCycle + 1)}>Next Cycle</button>
      </div>

      <MinimalCycleViewPanels
        workspace={source.signalTreeAndCanvasUi}
        bottom={source.bottomEditorUi}
        inspector={source.inspectorShellUi}
        overlays={source.dialogsUi}
        status={source.statusBarUi}
      />
    </main>
  );
}

export function MinimalCycleViewRibbonTabs({ ribbonTab, setRibbonTab, viewMode, setViewMode, bottomTab, setBottomTab }: any) {
  const tabs = [{ key: "File", label: "File" }, { key: "Home", label: "Home" }, { key: "Insert", label: "Insert" }, { key: "Timeline", label: "Timeline" }, { key: "Annotation", label: "Annotation" }, { key: "View", label: "View" }, { key: "Review", label: "Check" }, { key: "AI", label: "AI" }] as const;
  return <nav className="ribbon-tabs" aria-label="Ribbon tabs">{tabs.map((tab) => <button type="button" key={tab.key} aria-label={tab.label} className={ribbonTab === tab.key ? "active" : ""} onClick={() => startTransition(() => setRibbonTab(tab.key))}>{tab.label}</button>)}<div className="view-mode"><span>View Mode:</span>{(["Cycle", "Transaction", "Split"] as const).map((mode) => <button type="button" key={mode} className={viewMode === mode ? "active" : ""} onClick={() => { setViewMode(mode); if (mode === "Cycle" && bottomTab === "Transaction") setBottomTab("Signal"); if (mode === "Transaction" && bottomTab === "Signal") setBottomTab("Transaction"); }}>{mode}</button>)}</div></nav>;
}

export function refreshTreeCollapsedMetadata(host: RefObject<HTMLDivElement | null>, collapsedGroups: ReadonlySet<string>): void { const root = host.current; if (root) root.dataset.collapsedGroups = [...collapsedGroups].join(","); }
export function refreshTreeRovingFocus(host: RefObject<HTMLDivElement | null>, focusRowIdRef: { current: string | undefined }): void { const tree = host.current?.querySelector<HTMLElement>("[data-role='left-tree-rows']"); if (!tree) return; const items = [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].filter((item) => !item.hidden && !item.closest("[hidden]")); const preferred = items.find((item) => item.dataset.rowId === focusRowIdRef.current) ?? items.find((item) => item.getAttribute("aria-selected") === "true") ?? items[0]; for (const item of tree.querySelectorAll<HTMLElement>("[role='treeitem']")) item.tabIndex = item === preferred ? 0 : -1; tree.dataset.focusRowId = preferred?.dataset.rowId ?? ""; }
export function refreshTreeFilterPresentation(host: RefObject<HTMLDivElement | null>, treeFilter: string, treeTypeFilter: string): void { const root = host.current; if (!root) return; const query = treeFilter.trim().toLocaleLowerCase(); for (const row of root.querySelectorAll<HTMLElement>("[data-role='left-row']")) { const text = [row.dataset.name, row.dataset.fullPath, row.dataset.instancePath, row.dataset.signalRole, row.dataset.groupName].filter(Boolean).join(" ").toLocaleLowerCase(); const typeMatch = treeTypeFilter === "all" || (treeTypeFilter === "comment" ? row.dataset.kind === "comment" : treeTypeFilter === "wire" ? row.dataset.signalRole === "internal" : row.dataset.signalRole === treeTypeFilter); row.hidden = !(typeMatch && (query.length === 0 || text.includes(query))); } root.dataset.treeFilter = treeFilter; root.dataset.treeTypeFilter = treeTypeFilter; }
