import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, type HardwareHierarchyView } from "@timing-chart-v2/projection";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { EditorIcon } from "./editor-icon.js";

export function HardwareHierarchyBrowser({ document, selectedSignalId, onSelect, restoreFocusRef, onClose }: { readonly document: CanonicalDocument; readonly selectedSignalId: SignalId | undefined; readonly onSelect: (id: SignalId) => void; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onClose: () => void }) {
  const [view, setView] = useState<HardwareHierarchyView>("group");
  const [scope, setScope] = useState<string>("all");
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocusLoop(dialogRef, restoreFocusRef);
  const scopes = hardwareHierarchyScopes(document);
  const entries = buildHardwareHierarchyEntries(document, view, scope === "all" ? undefined : scope);
  return <div className="modal-backdrop"><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Hardware Hierarchy" className="hierarchy-browser" data-testid="hierarchy-browser">
    <header><h2>Hardware Hierarchy</h2><button type="button" aria-label="Close hierarchy" onClick={onClose}><EditorIcon name="close" /></button></header>
    <p>Derived from canonical Signal source paths. Group placement does not change hardware identity.</p>
    <div className="hierarchy-toolbar" role="toolbar" aria-label="Hierarchy view controls">
      <span>View</span><button type="button" data-testid="hierarchy-group-view" aria-pressed={view === "group"} onClick={() => setView("group")}>Group View</button><button type="button" data-testid="hierarchy-path-view" aria-pressed={view === "hierarchy"} onClick={() => setView("hierarchy")}>Hierarchy View</button>
      <label>Scope<select aria-label="Hierarchy scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All scopes</option>{scopes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <table><thead><tr><th>Scope</th><th>Instance Path</th><th>Relative Path</th><th>Signal</th><th>Full Path</th><th>Role</th><th>Type</th><th>Width</th><th>Group</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.signalId} data-hierarchy-row-id={entry.signalId} data-selected={String(entry.signalId === selectedSignalId)}><td>{entry.scope}</td><td>{entry.instancePath}</td><td>{entry.relativePath}</td><td><button type="button" onClick={() => onSelect(entry.signalId)}>{entry.signalName}</button></td><td>{entry.fullPath}</td><td>{entry.role}</td><td>{entry.type}</td><td>{entry.width}</td><td>{entry.groupName}</td></tr>)}</tbody></table>
  </section></div>;
}
