import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, hardwareHierarchyScopeBreadcrumbs, type HardwareHierarchyView } from "@timing-chart-v2/projection";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { EditorIcon } from "./editor-icon.js";

type HardwareHierarchyDisplayMode = "signal" | "relative" | "full" | "split";

export function HardwareHierarchyBrowser({ document, selectedSignalId, onSelect, restoreFocusRef, onClose }: { readonly document: CanonicalDocument; readonly selectedSignalId: SignalId | undefined; readonly onSelect: (id: SignalId) => void; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onClose: () => void }) {
  const [view, setView] = useState<HardwareHierarchyView>("group");
  const [displayMode, setDisplayMode] = useState<HardwareHierarchyDisplayMode>("split");
  const [scope, setScope] = useState<string>("all");
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocusLoop(dialogRef, restoreFocusRef);
  const scopes = hardwareHierarchyScopes(document);
  const entries = buildHardwareHierarchyEntries(document, view, scope === "all" ? undefined : scope);
  const breadcrumbs = hardwareHierarchyScopeBreadcrumbs(scope);
  return <div className="modal-backdrop"><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Hardware Hierarchy" className="hierarchy-browser" data-testid="hierarchy-browser">
    <header><h2>Hardware Hierarchy</h2><button type="button" aria-label="Close hierarchy" onClick={onClose}><EditorIcon name="close" /></button></header>
    <p>Derived from canonical Signal source paths. Group placement does not change hardware identity.</p>
    <div className="hierarchy-toolbar" role="toolbar" aria-label="Hierarchy view controls">
      <span>View</span><button type="button" data-testid="hierarchy-group-view" aria-pressed={view === "group"} onClick={() => setView("group")}>Group View</button><button type="button" data-testid="hierarchy-path-view" aria-pressed={view === "hierarchy"} onClick={() => setView("hierarchy")}>Hierarchy View</button>
      <label>Display mode<select aria-label="Hierarchy display mode" value={displayMode} onChange={(event) => setDisplayMode(event.target.value as HardwareHierarchyDisplayMode)}><option value="signal">Signal only</option><option value="relative">Relative Path</option><option value="full">Full Path</option><option value="split">Split columns</option></select></label>
      <label>Scope<select aria-label="Hierarchy scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All scopes</option>{scopes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <nav className="hierarchy-scope-breadcrumb" aria-label="Hierarchy scope breadcrumb" data-testid="hierarchy-scope-breadcrumb">
      {breadcrumbs.map((item, index) => <span key={item.value}>
        {index > 0 && <span aria-hidden="true"> / </span>}
        <button type="button" aria-current={item.value === scope ? "page" : undefined} disabled={item.value === scope} onClick={() => setScope(item.value)}>{item.label}</button>
      </span>)}
    </nav>
    <table data-hierarchy-display-mode={displayMode}><thead><tr>{displayMode === "signal" && <th>Signal</th>}{displayMode === "relative" && <><th>Relative Path</th><th>Signal</th></>}{displayMode === "full" && <th>Full Path</th>}{displayMode === "split" && <><th>Instance Path</th><th>Signal</th></>}<th>Role</th><th>Type</th><th>Width</th><th>Group</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.signalId} data-hierarchy-row-id={entry.signalId} data-selected={String(entry.signalId === selectedSignalId)}>{displayMode === "signal" && <td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td>}{displayMode === "relative" && <><td>{entry.relativePath}</td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td></>}{displayMode === "full" && <td title={entry.fullPath}><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.fullPath}</button></td>}{displayMode === "split" && <><td>{entry.instancePath}</td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td></>}<td>{entry.role}</td><td>{entry.type}</td><td>{entry.width}</td><td>{entry.groupName}</td></tr>)}</tbody></table>
  </section></div>;
}
