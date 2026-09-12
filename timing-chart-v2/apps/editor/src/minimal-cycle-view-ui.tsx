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
      data-next-revision={String(application.snapshot.revision)}
      data-next-selected-cycle={String(timeline.state.selectedCycle)}
      data-next-selected-signal={application.selection.signalId ?? ""}
      data-cycle-count={application.snapshot.document.timeline.cycleCount}
      data-signal-count={application.snapshot.document.signals.length}
      data-transaction-count={application.snapshot.document.transactions.length}
    >
      {source.titleBarUi}
      {source.ribbonTabsUi}
      <MinimalCycleViewNextRibbon application={application} timeline={timeline} />

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
  return <nav className="ribbon-tabs" aria-label="Ribbon tabs">{tabs.map((tab) => <button type="button" key={tab.key} aria-label={tab.label} className={ribbonTab === tab.key ? "active" : ""} onClick={() => startTransition(() => setRibbonTab(tab.key))}>{tab.label}</button>)}<div className="view-mode"><span>View Mode:</span>{(["Cycle", "Transaction", "Split"] as const).map((mode) => { const label = mode === "Split" ? "Combined" : mode; return <button type="button" key={mode} aria-label={label} title={mode === "Split" ? "Combined Cycle + Transaction view" : undefined} className={viewMode === mode ? "active" : ""} onPointerDown={() => window.dispatchEvent(new Event("timing-chart-view-mode-changing"))} onClick={() => { setViewMode(mode); if (mode === "Cycle" && bottomTab === "Transaction") setBottomTab("Signal"); if (mode === "Transaction" && bottomTab === "Signal") setBottomTab("Transaction"); }}>{label}</button>; })}</div></nav>;
}

export function MinimalCycleViewSignalTreeCanvas({ document, selectedSignalId, onSelect, surfaceHostRef, rulerRef, gridLayerRef }: { readonly document: Readonly<CanonicalDocument>; readonly selectedSignalId?: SignalId | undefined; readonly onSelect: (id: SignalId) => void; readonly surfaceHostRef: RefObject<HTMLDivElement | null>; readonly rulerRef: RefObject<HTMLDivElement | null>; readonly gridLayerRef: RefObject<HTMLDivElement | null> }) {
  return <section className="cycle-panel" data-testid="next-signal-tree-canvas" aria-label="Next signal tree and canvas">
    <div className="next-signal-tree" data-role="timing-tree" role="tree" aria-label="Signals">
      {document.signals.map((signal) => <button type="button" role="treeitem" key={signal.id} data-row-id={signal.id} aria-selected={signal.id === selectedSignalId} onClick={() => onSelect(signal.id)}>{signal.display.name}</button>)}
    </div>
    <div className="cycle-viewport" data-testid="next-cycle-viewport" aria-label="Next timing canvas"><div className="geometry-grid" ref={gridLayerRef} data-testid="next-geometry-grid" aria-hidden="true" /><div className="cycle-ruler" data-testid="next-cycle-ruler" aria-label="Cycle ruler"><div ref={rulerRef} /></div><div className="range-selection-band" data-testid="next-range-band" aria-hidden="true" /><div className="surface-host" ref={surfaceHostRef} data-testid="next-surface-host" /></div>
  </section>;
}

export function MinimalCycleViewBottomEditor({ tab, onTabChange, followSelection, onFollowSelectionChange, pinned, onPinnedChange }: { readonly tab: string; readonly onTabChange: (tab: string) => void; readonly followSelection: boolean; readonly onFollowSelectionChange: (value: boolean) => void; readonly pinned: boolean; readonly onPinnedChange: (value: boolean) => void }) {
  const tabs = ["Signal", "Annotation", "Transaction", "Problems", "JSON"];
  return <section className="bottom-editor" data-testid="next-bottom-editor">
    <nav className="bottom-tabs" role="tablist" aria-label="Next bottom context panels">{tabs.map((item) => <button type="button" role="tab" key={item} aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => onTabChange(item)}>{item}</button>)}<span /><label><input data-testid="next-follow-selection" type="checkbox" checked={followSelection} onChange={(event) => onFollowSelectionChange(event.target.checked)} /> Follow Selection</label><button type="button" data-testid="next-bottom-pin" aria-pressed={pinned} onClick={() => onPinnedChange(!pinned)}>{pinned ? "Unpin" : "Pin"}</button></nav>
    <div className="bottom-content" role="tabpanel" data-testid="next-bottom-content"><strong>{tab}</strong> context</div>
  </section>;
}

export function MinimalCycleViewNextStatusBar({ document, revision, history }: { readonly document: Readonly<CanonicalDocument>; readonly revision: number; readonly history: HistoryState }) {
  return <footer className="status-bar" data-testid="next-status" aria-label="Next editor status"><span>Signals: {document.signals.length}</span><span>Transactions: {document.transactions.length}</span><span>Revision: {revision}</span><span data-testid="next-dirty-status">{history.dirty ? "Modified" : "Clean"}</span></footer>;
}

export function MinimalCycleViewNextRibbon({ application, timeline }: { readonly application: MinimalCycleApplicationPort; readonly timeline: MinimalCycleTimelinePort }) {
  return <div className="ribbon" data-testid="next-ribbon"><div className="next-ribbon-group" aria-label="Edit"><button type="button" onClick={application.command.undo} disabled={!application.history.canUndo}>Undo</button><button type="button" onClick={application.command.redo} disabled={!application.history.canRedo}>Redo</button><button type="button" onClick={application.clipboard.delete}>Delete</button></div><div className="next-ribbon-group" aria-label="Timeline"><button type="button" onClick={() => timeline.view.zoomBy(-0.1)}>Zoom Out</button><button type="button" onClick={() => timeline.view.zoomBy(0.1)}>Zoom In</button><button type="button" onClick={timeline.view.fitAll}>Fit All</button></div></div>;
}

export function refreshTreeCollapsedMetadata(host: RefObject<HTMLDivElement | null>, collapsedGroups: ReadonlySet<string>): void { const root = host.current; if (root) root.dataset.collapsedGroups = [...collapsedGroups].join(","); }
export function refreshTreeRovingFocus(host: RefObject<HTMLDivElement | null>, focusRowIdRef: { current: string | undefined }): void { const tree = host.current?.querySelector<HTMLElement>("[data-role='left-tree-rows']"); if (!tree) return; const items = [...tree.querySelectorAll<HTMLElement>("[role='treeitem']")].filter((item) => !item.hidden && !item.closest("[hidden]")); const preferred = items.find((item) => item.dataset.rowId === focusRowIdRef.current) ?? items.find((item) => item.getAttribute("aria-selected") === "true") ?? items[0]; for (const item of tree.querySelectorAll<HTMLElement>("[role='treeitem']")) item.tabIndex = item === preferred ? 0 : -1; tree.dataset.focusRowId = preferred?.dataset.rowId ?? ""; }
export function refreshTreeFilterPresentation(host: RefObject<HTMLDivElement | null>, treeFilter: string, treeTypeFilter: string): void { const root = host.current; if (!root) return; const query = treeFilter.trim().toLocaleLowerCase(); const filterActive = query.length > 0 || treeTypeFilter !== "all"; const rows = [...root.querySelectorAll<HTMLElement>("[data-role='left-row']")]; let matchingSignalCount = 0; for (const row of rows) { const text = [row.dataset.name, row.dataset.fullPath, row.dataset.instancePath, row.dataset.signalRole, row.dataset.groupName].filter(Boolean).join(" ").toLocaleLowerCase(); const typeMatch = treeTypeFilter === "all" || (treeTypeFilter === "comment" ? row.dataset.kind === "comment" : treeTypeFilter === "wire" ? row.dataset.signalRole === "internal" : row.dataset.signalRole === treeTypeFilter); const matches = typeMatch && (query.length === 0 || text.includes(query)); row.hidden = !matches; row.dataset.treeFilterMatch = String(matches); if (matches && row.dataset.kind === "timing") matchingSignalCount += 1; } for (const header of root.querySelectorAll<HTMLElement>("[data-role='left-group-header'][data-group-id]")) { const groupId = header.dataset.groupId; header.hidden = filterActive && !rows.some((row) => row.dataset.groupId === groupId && row.dataset.treeFilterMatch === "true"); } root.dataset.treeFilter = treeFilter; root.dataset.treeTypeFilter = treeTypeFilter; root.dataset.treeFilterMatches = String(matchingSignalCount); }
