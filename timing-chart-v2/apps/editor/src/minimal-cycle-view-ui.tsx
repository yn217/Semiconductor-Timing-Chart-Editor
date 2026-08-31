import { startTransition } from "react";

export function MinimalCycleViewRibbonTabs({ ribbonTab, setRibbonTab, viewMode, setViewMode, bottomTab, setBottomTab }: any) {
  const tabs = [{ key: "File", label: "File" }, { key: "Home", label: "Home" }, { key: "Insert", label: "Insert" }, { key: "Timeline", label: "Timeline", compatibilityLabel: "Timeline" }, { key: "Annotation", label: "Annotation", compatibilityLabel: "Annotation", compatibilityOnly: true }, { key: "View", label: "View" }, { key: "Review", label: "Check", compatibilityLabel: "Review" }, { key: "AI", label: "AI" }] as const;
  return <nav className="ribbon-tabs" aria-label="Ribbon tabs">
    {tabs.map((tab) => <button type="button" key={tab.key} aria-label={"compatibilityLabel" in tab ? tab.compatibilityLabel : tab.key} className={`${ribbonTab === tab.key ? "active" : ""}${"compatibilityOnly" in tab && tab.compatibilityOnly ? " compatibility-tab" : ""}`} onClick={() => startTransition(() => setRibbonTab(tab.key))}>{tab.label}</button>)}
    <div className="view-mode"><span>View Mode:</span>{(["Cycle", "Transaction", "Split"] as const).map((mode) => <button type="button" key={mode} className={viewMode === mode ? "active" : ""} onClick={() => { setViewMode(mode); if (mode === "Cycle" && bottomTab === "Transaction") setBottomTab("Signal"); if (mode === "Transaction" && bottomTab === "Signal") setBottomTab("Transaction"); }}>{mode}</button>)}</div>
  </nav>;
}
