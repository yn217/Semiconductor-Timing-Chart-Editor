import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { buildHardwareHierarchyEntries, filterHardwareHierarchyEntries, hardwareHierarchyScopes, hardwareHierarchyScopeBreadcrumbs, type HardwareHierarchyView } from "@timing-chart-v2/projection";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { EditorIcon } from "./editor-icon.js";

type HardwareHierarchyDisplayMode = "signal" | "relative" | "full" | "split";

export function HardwareHierarchyBrowser({ document, selectedSignalId, onSelect, restoreFocusRef, onClose }: { readonly document: CanonicalDocument; readonly selectedSignalId: SignalId | undefined; readonly onSelect: (id: SignalId) => void; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onClose: () => void }) {
  const [view, setView] = useState<HardwareHierarchyView>("group");
  const [displayMode, setDisplayMode] = useState<HardwareHierarchyDisplayMode>("split");
  const [scope, setScope] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [copySelection, setCopySelection] = useState<ReadonlySet<SignalId>>(new Set());
  const [copyStatus, setCopyStatus] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocusLoop(dialogRef, restoreFocusRef);
  const scopes = hardwareHierarchyScopes(document);
  const entries = buildHardwareHierarchyEntries(document, view, scope === "all" ? undefined : scope);
  const visibleEntries = filterHardwareHierarchyEntries(entries, query);
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
  return <div className="modal-backdrop"><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Hardware Hierarchy" className="hierarchy-browser" data-testid="hierarchy-browser">
    <header><h2>Hardware Hierarchy</h2><button type="button" aria-label="Close hierarchy" onClick={onClose}><EditorIcon name="close" /></button></header>
    <p>Derived from canonical Signal source paths. Group placement does not change hardware identity.</p>
    <div className="hierarchy-toolbar" role="toolbar" aria-label="Hierarchy view controls">
      <span>View</span><button type="button" data-testid="hierarchy-group-view" aria-pressed={view === "group"} onClick={() => setView("group")}>Group View</button><button type="button" data-testid="hierarchy-path-view" aria-pressed={view === "hierarchy"} onClick={() => setView("hierarchy")}>Hierarchy View</button>
      <label>Display mode<select aria-label="Hierarchy display mode" value={displayMode} onChange={(event) => setDisplayMode(event.target.value as HardwareHierarchyDisplayMode)}><option value="signal">Signal only</option><option value="relative">Relative Path</option><option value="full">Full Path</option><option value="split">Split columns</option></select></label>
      <label>Scope<select aria-label="Hierarchy scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All scopes</option>{scopes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Search paths<input type="search" aria-label="Search hierarchy paths" data-testid="hierarchy-path-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Path, signal, display name, group…" /></label>
      <button type="button" data-testid="copy-selected-hierarchy-paths" disabled={copySelection.size === 0} onClick={() => { const selected = entries.filter((entry) => copySelection.has(entry.signalId)); void copyPaths(selected.map((entry) => entry.fullPath)); }}>Copy Selected Paths ({copySelection.size})</button>
      <output aria-live="polite" data-testid="hierarchy-copy-status">{copyStatus}</output>
    </div>
    <nav className="hierarchy-scope-breadcrumb" aria-label="Hierarchy scope breadcrumb" data-testid="hierarchy-scope-breadcrumb">
      {breadcrumbs.map((item, index) => <span key={item.value}>
        {index > 0 && <span aria-hidden="true"> / </span>}
        <button type="button" aria-current={item.value === scope ? "page" : undefined} disabled={item.value === scope} onClick={() => setScope(item.value)}>{item.label}</button>
      </span>)}
    </nav>
    <table data-hierarchy-display-mode={displayMode}><thead><tr><th>Copy</th>{displayMode === "signal" && <th>Signal</th>}{displayMode === "relative" && <><th>Relative Path</th><th>Signal</th></>}{displayMode === "full" && <th>Full Path</th>}{displayMode === "split" && <><th>Instance Path</th><th>Signal</th></>}<th>Role</th><th>Type</th><th>Width</th><th>Group</th>{displayMode !== "full" && <th>Full Path</th>}</tr></thead><tbody>{visibleEntries.map((entry) => <tr key={entry.signalId} data-hierarchy-row-id={entry.signalId} data-selected={String(entry.signalId === selectedSignalId)}><td><div className="hierarchy-copy-actions"><input type="checkbox" aria-label={`Select path ${entry.fullPath} for copying`} checked={copySelection.has(entry.signalId)} onChange={() => toggleCopySelection(entry.signalId)} /><button type="button" aria-label={`Copy full path ${entry.fullPath}`} onClick={() => { void copyPaths([entry.fullPath]); }}>Copy</button></div></td>{displayMode === "signal" && <td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td>}{displayMode === "relative" && <><td>{entry.relativePath}</td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td></>}{displayMode === "full" && <td title={entry.fullPath}><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.fullPath}</button></td>}{displayMode === "split" && <><td>{entry.instancePath}</td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td></>}<td>{entry.role}</td><td>{entry.type}</td><td>{entry.width}</td><td>{entry.groupName}</td>{displayMode !== "full" && <td title={entry.fullPath}>{entry.fullPath}</td>}</tr>)}</tbody></table>
  </section></div>;
}
