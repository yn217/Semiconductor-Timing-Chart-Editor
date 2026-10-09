import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { buildHardwareHierarchyRowIndex, deriveHardwareHierarchyEntries, filterHardwareHierarchyEntries, hardwareHierarchyScopes, hardwareHierarchyScopeBreadcrumbs, type HardwareHierarchyView } from "@timing-chart-v2/projection";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { EditorIcon } from "./editor-icon.js";
import { ModalBackdrop } from "./modal-backdrop.js";

type HardwareHierarchyDisplayMode = "signal" | "relative" | "full" | "split";
type HierarchyColumnAlignment = "left" | "center" | "right";
const HIERARCHY_ROW_HEIGHT = 32;
const HIERARCHY_OVERSCAN_ROWS = 10;
const MAX_VISIBLE_HIERARCHY_PATH_CHARACTERS = 52;

export function compactHierarchyPath(path: string, maxCharacters = MAX_VISIBLE_HIERARCHY_PATH_CHARACTERS): string {
  const characters = Array.from(path);
  if (characters.length <= maxCharacters || maxCharacters < 5) return path;
  const remaining = maxCharacters - 1;
  const headLength = Math.max(2, Math.floor(remaining * 0.35));
  const tailLength = remaining - headLength;
  return `${characters.slice(0, headLength).join("")}…${characters.slice(-tailLength).join("")}`;
}

export function HardwareHierarchyBrowser({ document, selectedSignalId, onSelect, restoreFocusRef, onClose }: { readonly document: CanonicalDocument; readonly selectedSignalId: SignalId | undefined; readonly onSelect: (id: SignalId) => void; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onClose: () => void }) {
  const [view, setView] = useState<HardwareHierarchyView>("group");
  const [displayMode, setDisplayMode] = useState<HardwareHierarchyDisplayMode>("split");
  const [instancePathAlignment, setInstancePathAlignment] = useState<HierarchyColumnAlignment>("left");
  const [instancePathColumnWidth, setInstancePathColumnWidth] = useState(220);
  const [scope, setScope] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [copySelection, setCopySelection] = useState<ReadonlySet<SignalId>>(new Set());
  const [copyStatus, setCopyStatus] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const rowIndexBuildCount = useRef(0);
  const entryBuildCount = useRef(0);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(0);
  useDialogFocusLoop(dialogRef, restoreFocusRef);
  useLayoutEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    const updateHeight = () => setTableViewportHeight(viewport.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const rowIndex = useMemo(() => {
    rowIndexBuildCount.current += 1;
    return buildHardwareHierarchyRowIndex(document.signalGroups);
  }, [document.signalGroups]);
  const scopes = useMemo(() => hardwareHierarchyScopes(document), [document.signals]);
  const derivation = useMemo(() => {
    entryBuildCount.current += 1;
    return deriveHardwareHierarchyEntries(document, view, scope === "all" ? undefined : scope, rowIndex);
  }, [document.signals, document.signalGroups, view, scope, rowIndex]);
  const entries = derivation.entries;
  const filterResult = useMemo(() => {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const visibleEntries = filterHardwareHierarchyEntries(entries, query);
    const endedAt = globalThis.performance?.now?.() ?? Date.now();
    return { visibleEntries, durationMs: Math.max(0, endedAt - startedAt) };
  }, [entries, query]);
  const visibleEntries = filterResult.visibleEntries;
  useLayoutEffect(() => {
    const eligibleIds = new Set(visibleEntries.map((entry) => entry.signalId));
    const next = new Set([...copySelection].filter((id) => eligibleIds.has(id)));
    if (next.size === copySelection.size) return;
    setCopySelection(next);
    const count = next.size;
    setCopyStatus(`Selection updated: ${count} selected ${count === 1 ? "path is" : "paths are"} available in current results.`);
  }, [copySelection, visibleEntries]);
  const firstVisibleIndex = Math.max(0, Math.floor(tableScrollTop / HIERARCHY_ROW_HEIGHT) - HIERARCHY_OVERSCAN_ROWS);
  const lastVisibleIndex = Math.min(visibleEntries.length, Math.ceil((tableScrollTop + (tableViewportHeight || 360)) / HIERARCHY_ROW_HEIGHT) + HIERARCHY_OVERSCAN_ROWS);
  const mountedEntries = visibleEntries.slice(firstVisibleIndex, lastVisibleIndex);
  const columnCount = 1 + (displayMode === "signal" || displayMode === "full" ? 1 : 2) + 4 + (displayMode === "full" ? 0 : 1);
  const resetTableScroll = () => {
    if (tableViewportRef.current) tableViewportRef.current.scrollTop = 0;
    setTableScrollTop(0);
  };
  const breadcrumbs = hardwareHierarchyScopeBreadcrumbs(scope);
  const toggleCopySelection = (id: SignalId) => setCopySelection((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const copyPaths = async (paths: readonly string[]) => {
    if (paths.length === 0) return;
    if (!navigator.clipboard) { setCopyStatus("Clipboard unavailable"); return; }
    try {
      await navigator.clipboard.writeText(paths.join("\n"));
      setCopyStatus(paths.length === 1 ? "Copied 1 full path" : `Copied ${paths.length} full paths`);
    } catch {
      setCopyStatus("Copy failed: clipboard access denied");
    }
  };
  return <ModalBackdrop onDismiss={onClose}><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Hardware Hierarchy" className="hierarchy-browser" data-testid="hierarchy-browser"
    data-hierarchy-index-builds={rowIndexBuildCount.current}
    data-hierarchy-row-index-duration-ms={rowIndex.metrics.buildDurationMs}
    data-hierarchy-rows-visited={rowIndex.metrics.rowsVisited}
    data-hierarchy-index-entries={rowIndex.metrics.indexEntries}
    data-hierarchy-entry-builds={entryBuildCount.current}
    data-hierarchy-entry-build-duration-ms={derivation.metrics.buildDurationMs}
    data-hierarchy-signals-visited={derivation.metrics.signalsVisited}
    data-hierarchy-entries-created={derivation.metrics.entriesCreated}
    data-hierarchy-search-filter-duration-ms={filterResult.durationMs}>
    <header><h2>Hardware Hierarchy</h2><button type="button" aria-label="Close hierarchy" onClick={onClose}><EditorIcon name="close" /></button></header>
    <p>Derived from canonical Signal source paths. Group placement does not change hardware identity.</p>
    <div className="hierarchy-toolbar" role="toolbar" aria-label="Hierarchy view controls">
      <span>View</span><button type="button" data-testid="hierarchy-group-view" aria-pressed={view === "group"} onClick={() => { resetTableScroll(); setView("group"); }}>Group View</button><button type="button" data-testid="hierarchy-path-view" aria-pressed={view === "hierarchy"} onClick={() => { resetTableScroll(); setView("hierarchy"); }}>Hierarchy View</button>
      <label>Display mode<select aria-label="Hierarchy display mode" value={displayMode} onChange={(event) => setDisplayMode(event.target.value as HardwareHierarchyDisplayMode)}><option value="signal">Signal only</option><option value="relative">Relative Path</option><option value="full">Full Path</option><option value="split">Split columns</option></select></label>
      {displayMode === "split" && <><label>Instance Path width<input aria-label="Instance Path width" type="number" min="80" max="600" step="10" value={instancePathColumnWidth} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) setInstancePathColumnWidth(Math.max(80, Math.min(600, next))); }} /></label><label>Instance Path alignment<select aria-label="Instance Path alignment" value={instancePathAlignment} onChange={(event) => setInstancePathAlignment(event.target.value as HierarchyColumnAlignment)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></>}
      <label>Scope<select aria-label="Hierarchy scope" value={scope} onChange={(event) => { resetTableScroll(); setScope(event.target.value); }}><option value="all">All scopes</option>{scopes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Search paths<input type="search" aria-label="Search hierarchy paths" data-testid="hierarchy-path-search" value={query} onChange={(event) => { resetTableScroll(); setQuery(event.target.value); }} placeholder="Path, signal, display name, group…" /></label>
      <button type="button" data-testid="copy-selected-hierarchy-paths" disabled={copySelection.size === 0} onClick={() => { const selected = visibleEntries.filter((entry) => copySelection.has(entry.signalId)); void copyPaths(selected.map((entry) => entry.fullPath)); }}>Copy Selected Paths ({copySelection.size})</button>
      <output aria-live="polite" data-testid="hierarchy-copy-status">{copyStatus}</output>
    </div>
    <nav className="hierarchy-scope-breadcrumb" aria-label="Hierarchy scope breadcrumb" data-testid="hierarchy-scope-breadcrumb">
      {breadcrumbs.map((item, index) => <span key={item.value}>
        {index > 0 && <span aria-hidden="true"> / </span>}
        <button type="button" aria-current={item.value === scope ? "page" : undefined} disabled={item.value === scope} onClick={() => setScope(item.value)}>{item.label}</button>
      </span>)}
    </nav>
    <div ref={tableViewportRef} className="hierarchy-table-viewport" role="region" aria-label="Hierarchy entries" tabIndex={0} onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)} data-hierarchy-total-rows={visibleEntries.length} data-hierarchy-mounted-rows={mountedEntries.length}>
      <table data-hierarchy-display-mode={displayMode} data-instance-path-alignment={instancePathAlignment} style={{ "--hierarchy-instance-path-width": `${instancePathColumnWidth}px` } as CSSProperties}><thead><tr><th>Copy</th>{displayMode === "signal" && <th>Signal</th>}{displayMode === "relative" && <><th>Relative Path</th><th>Signal</th></>}{displayMode === "full" && <th>Full Path</th>}{displayMode === "split" && <><th className="hierarchy-instance-path">Instance Path</th><th>Signal</th></>}<th>Role</th><th>Type</th><th>Width</th><th>Group</th>{displayMode !== "full" && <th>Full Path</th>}</tr></thead><tbody>
        {firstVisibleIndex > 0 && <tr aria-hidden="true" className="hierarchy-virtual-spacer"><td colSpan={columnCount} style={{ height: firstVisibleIndex * HIERARCHY_ROW_HEIGHT }} /> </tr>}
        {mountedEntries.map((entry) => <tr key={entry.signalId} data-hierarchy-row-id={entry.signalId} data-selected={String(entry.signalId === selectedSignalId)}><td><div className="hierarchy-copy-actions"><input type="checkbox" aria-label={`Select path ${entry.fullPath} for copying`} checked={copySelection.has(entry.signalId)} onChange={() => toggleCopySelection(entry.signalId)} /><button type="button" aria-label={`Copy full path ${entry.fullPath}`} onClick={() => { void copyPaths([entry.fullPath]); }}>Copy</button></div></td>{displayMode === "signal" && <td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td>}{displayMode === "relative" && <><td title={entry.relativePath}><span className="hierarchy-path-text">{compactHierarchyPath(entry.relativePath)}</span></td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td></>}{displayMode === "full" && <td title={entry.fullPath}><button type="button" className="hierarchy-path-text" onClick={() => onSelect(entry.signalId)}>{compactHierarchyPath(entry.fullPath)}</button></td>}{displayMode === "split" && <><td className="hierarchy-instance-path" title={entry.instancePath}><span className="hierarchy-path-text">{compactHierarchyPath(entry.instancePath)}</span></td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td></>}<td>{entry.role}</td><td>{entry.type}</td><td>{entry.width}</td><td>{entry.groupName}</td>{displayMode !== "full" && <td title={entry.fullPath}><span className="hierarchy-path-text">{compactHierarchyPath(entry.fullPath)}</span></td>}</tr>)}
        {lastVisibleIndex < visibleEntries.length && <tr aria-hidden="true" className="hierarchy-virtual-spacer"><td colSpan={columnCount} style={{ height: (visibleEntries.length - lastVisibleIndex) * HIERARCHY_ROW_HEIGHT }} /> </tr>}
      </tbody></table>
    </div>
  </section></ModalBackdrop>;
}
