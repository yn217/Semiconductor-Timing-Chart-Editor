import { startTransition, type ReactNode, type RefObject } from "react";
import type { MinimalCycleApplicationPort } from "./minimal-cycle-view-application.js";
import type { MinimalCycleTimelinePort } from "./minimal-cycle-view-timeline.js";

export interface MinimalCycleViewUiSource { readonly titleBarUi: ReactNode; readonly ribbonTabsUi: ReactNode; readonly ribbonUi: ReactNode; readonly signalTreeAndCanvasUi: ReactNode; readonly bottomEditorUi: ReactNode; readonly inspectorShellUi: ReactNode; readonly dialogsUi: ReactNode; readonly statusBarUi: ReactNode; }
export function MinimalCycleViewUi({ source, application, timeline }: { readonly source: MinimalCycleViewUiSource; readonly application: MinimalCycleApplicationPort; readonly timeline: MinimalCycleTimelinePort }) { void timeline; return <main className="editor-shell" data-cycle-count={application.snapshot.document.timeline.cycleCount} data-signal-count={application.snapshot.document.signals.length} data-transaction-count={application.snapshot.document.transactions.length}>{source.titleBarUi}{source.ribbonTabsUi}{source.ribbonUi}<div className="desktop-workspace">{source.signalTreeAndCanvasUi}{source.bottomEditorUi}{source.inspectorShellUi}</div>{source.dialogsUi}{source.statusBarUi}</main>; }

export function MinimalCycleViewRibbonTabs({ ribbonTab, setRibbonTab, viewMode, setViewMode, bottomTab, setBottomTab }: any) {
  const tabs = [{ key: "File", label: "File" }, { key: "Home", label: "Home" }, { key: "Insert", label: "Insert" }, { key: "Timeline", label: "Timeline", compatibilityLabel: "Timeline" }, { key: "Annotation", label: "Annotation", compatibilityLabel: "Annotation", compatibilityOnly: true }, { key: "View", label: "View" }, { key: "Review", label: "Check", compatibilityLabel: "Review" }, { key: "AI", label: "AI" }] as const;
  return <nav className="ribbon-tabs" aria-label="Ribbon tabs">
    {tabs.map((tab) => <button type="button" key={tab.key} aria-label={"compatibilityLabel" in tab ? tab.compatibilityLabel : tab.key} className={`${ribbonTab === tab.key ? "active" : ""}${"compatibilityOnly" in tab && tab.compatibilityOnly ? " compatibility-tab" : ""}`} onClick={() => startTransition(() => setRibbonTab(tab.key))}>{tab.label}</button>)}
    <div className="view-mode"><span>View Mode:</span>{(["Cycle", "Transaction", "Split"] as const).map((mode) => <button type="button" key={mode} className={viewMode === mode ? "active" : ""} onClick={() => { setViewMode(mode); if (mode === "Cycle" && bottomTab === "Transaction") setBottomTab("Signal"); if (mode === "Transaction" && bottomTab === "Signal") setBottomTab("Transaction"); }}>{mode}</button>)}</div>
  </nav>;
}

export function refreshTreeCollapsedMetadata(host: RefObject<HTMLDivElement | null>, collapsedGroups: ReadonlySet<string>): void { const root = host.current; if (root) root.dataset.collapsedGroups = [...collapsedGroups].join(","); }
