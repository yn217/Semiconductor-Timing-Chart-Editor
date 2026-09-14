import { useEffect, type ReactNode } from "react";
import type { RefObject } from "react";
import type { GroupId, SignalGroup, SpacerId } from "@timing-chart-v2/schema";
import { ContextMenuSurface } from "./context-menu-surface.js";
import { parseBulkSignalDefinitions, type BulkSignalDefinition } from "./bulk-signal-parser.js";
import { EditorIcon } from "./editor-icon.js";
import { signalTypeLabel } from "./runtime/signal-type-registry.js";
import type { TransactionTreeFilterMode } from "./workspace/use-workspace-ui-state.js";


export type MinimalCycleViewPanelsProps = { readonly children?: ReactNode; readonly workspace?: ReactNode; readonly tail?: ReactNode; readonly bottom?: ReactNode; readonly inspector?: ReactNode; readonly overlays?: ReactNode; readonly fileInput?: ReactNode; readonly status?: ReactNode; };
const spacerId = (value: string) => value as SpacerId;
export function MinimalCycleViewPanels({ children, workspace, tail, bottom, inspector, overlays, fileInput, status }: MinimalCycleViewPanelsProps) { if (children !== undefined) return <>{children}</>; return <><div className="desktop-workspace">{workspace}{tail}{bottom}{inspector}</div>{overlays}{fileInput}{status}</>; }

export function ContextMenuPanel({ contextMenu, hasSelectedClipboard, clipboardAvailable, hasSelectedEntity, hasSelectedSignal, hasDeletableSelection, canRenameSelection, canMoveUp, canMoveDown, canShowSelection, canHideSelection, copySelectedSignal, cutSelectedSignal, pasteSelectedEntity, duplicateSelectedEntity, moveSelection, setSelectionVisibility, renameSelection, closeContextMenu, deleteSelection, addBookmarkAtCycle, transactionGroups = [], selectedTransactionGroupId, moveSelectedTransactionToGroup }: any) {
  if (contextMenu?.target === "ruler") return <ContextMenuSurface anchor={contextMenu} target="ruler" label="Ruler context menu">
    <button type="button" role="menuitem" data-testid="ruler-add-bookmark" onClick={() => { addBookmarkAtCycle(contextMenu.cycle); closeContextMenu(); }}>ブックマークを追加</button>
  </ContextMenuSurface>;
  return contextMenu ? <ContextMenuSurface anchor={contextMenu} target={contextMenu.target} label={contextMenu.target === "group" ? "Group context menu" : contextMenu.target === "annotation" ? "Annotation context menu" : contextMenu.target === "transaction" ? "Transaction context menu" : "Signal context menu"}>
    <button type="button" role="menuitem" onClick={() => { copySelectedSignal(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Copy</button>
    <button type="button" role="menuitem" onClick={() => { cutSelectedSignal(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Cut</button>
    <button type="button" role="menuitem" onClick={() => { pasteSelectedEntity(); closeContextMenu(); }} disabled={!clipboardAvailable}>Paste</button>
    <button type="button" role="menuitem" onClick={() => { duplicateSelectedEntity(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Duplicate</button>
    <button type="button" role="menuitem" onClick={() => { moveSelection(-1); closeContextMenu(); }} disabled={!canMoveUp}>Move Up</button>
    <button type="button" role="menuitem" onClick={() => { moveSelection(1); closeContextMenu(); }} disabled={!canMoveDown}>Move Down</button>
    <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(true); closeContextMenu(); }} disabled={!canShowSelection}>Show</button>
    <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(false); closeContextMenu(); }} disabled={!canHideSelection}>Hide</button>
    <button type="button" role="menuitem" onClick={() => { renameSelection(); closeContextMenu(); }} disabled={!canRenameSelection}>Rename</button>
    {contextMenu.target === "transaction" && moveSelectedTransactionToGroup && <div role="group" aria-label="Move to Group"><strong>Move to Group</strong><button type="button" role="menuitem" aria-checked={selectedTransactionGroupId === undefined} onClick={() => { moveSelectedTransactionToGroup(undefined); closeContextMenu(); }}>Ungrouped</button>{transactionGroups.map((group: { id: string; name: string }) => <button type="button" role="menuitem" key={group.id} aria-checked={selectedTransactionGroupId === group.id} onClick={() => { moveSelectedTransactionToGroup(group.id); closeContextMenu(); }}>{selectedTransactionGroupId === group.id ? "✓ " : ""}{group.name}</button>)}</div>}
    <button type="button" role="menuitem" onClick={() => { deleteSelection(); closeContextMenu(); }} disabled={!hasDeletableSelection}>Delete</button>
  </ContextMenuSurface> : null;
}

const VIEW_MODE_TITLE_LABEL: Record<"Cycle" | "Transaction" | "Split", string> = { Cycle: "Cycle View", Transaction: "Transaction View", Split: "Combined View" };

export function MinimalCycleViewTitleBar({ title, dirty, viewMode }: { readonly title: string; readonly dirty: boolean; readonly viewMode: "Cycle" | "Transaction" | "Split" }) {
  return <header className="app-titlebar"><span className="appmark">∿</span><h1>{title}</h1><span className="save-state">{dirty ? "Modified" : "Saved"}</span><span className="view-title" data-testid="titlebar-view-title">{VIEW_MODE_TITLE_LABEL[viewMode]}</span></header>;
}

export type RenameDialogProps = {
  readonly dialogRef: RefObject<HTMLFormElement | null>;
  readonly draft: string;
  readonly onDraftChange: (value: string) => void;
  readonly error: string;
  readonly onApply: () => void;
  readonly onClose: () => void;
};

export function RenameDialog({ dialogRef, draft, onDraftChange, error, onApply, onClose }: RenameDialogProps) {
  return <div className="modal-backdrop" data-testid="rename-dialog-backdrop"><form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title" className="document-properties rename-dialog" data-testid="rename-dialog" onSubmit={(event) => { event.preventDefault(); onApply(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <header><h2 id="rename-dialog-title">Rename</h2><button type="button" aria-label="Close rename dialog" onClick={onClose}><EditorIcon name="close" /></button></header>
    <label>New name<input autoFocus data-dialog-initial-focus aria-label="New name" value={draft} onChange={(event) => onDraftChange(event.target.value)} /></label>
    {error && <p role="alert" className="dialog-error">{error}</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" data-testid="apply-rename">Apply</button></footer>
  </form></div>;
}

export type BulkRegistrationPreviewState = { readonly sourceText: string; readonly definitions: readonly BulkSignalDefinition[]; readonly errors: readonly string[] };

export type BulkRegistrationDialogProps = {
  readonly dialogRef: RefObject<HTMLElement | null>;
  readonly groups: readonly SignalGroup[];
  readonly text: string;
  readonly onTextChange: (value: string) => void;
  readonly groupId: GroupId | undefined;
  readonly onGroupIdChange: (id: GroupId) => void;
  readonly status: string;
  readonly preview: BulkRegistrationPreviewState | undefined;
  readonly onPreview: () => void;
  readonly onApply: () => void;
  readonly onClose: () => void;
};

export type SignalTreeAddEntityKind = "signal" | "clock" | "bus" | "state" | "logic" | "event" | "pulse" | "group" | "spacer" | "commentRow";

export type SignalTreeColumnHeaderProps = {
  readonly treeTypeFilter: string;
  readonly onTreeTypeFilterChange: (value: string) => void;
  readonly treeFilter: string;
  readonly onTreeFilterChange: (value: string) => void;
  readonly onClearTreeFilter: () => void;
  readonly addMenuOpen: boolean;
  readonly onToggleAddMenu: (origin: HTMLElement) => void;
  readonly moreMenuOpen: boolean;
  readonly onToggleMoreMenu: (origin: HTMLElement) => void;
  readonly onAddEntity: (kind: SignalTreeAddEntityKind) => void;
  readonly onCloseAddMenu: () => void;
  readonly onOpenBulkRegistration: () => void;
  readonly onCollapseAllGroups: () => void;
  readonly onExpandAllGroups: () => void;
  readonly onOpenHierarchy: () => void;
  readonly onCloseMoreMenu: () => void;
  readonly timeScaleLabel: string;
  // #451: when set, this header presents as Transaction Mode's own Tree
  // header (title/+Add/search) instead of the Signal one -- one shared
  // component so both stay visually identical (row density, Add-button
  // placement, filter-input styling) without a second header primitive.
  // #429/#397 P0-2: `tab`/`onTabChange` add the "Transactions | Signals"
  // tab pair -- pure presentation of `transactionTreeTab` state, decided by
  // the caller (`use-workspace-ui-state.ts`), same pattern as every other
  // field here.
  readonly transactionMode?: { readonly filter: string; readonly onFilterChange: (value: string) => void; readonly filterMode: TransactionTreeFilterMode; readonly onFilterModeChange: (value: TransactionTreeFilterMode) => void; readonly onAdd: () => void; readonly onAddGroup: () => void; readonly tab: "transactions" | "signals"; readonly onTabChange: (tab: "transactions" | "signals") => void } | undefined;
};

/** The Signal/Group tree's column header: type/text filter, the Add and
 * More popup menus, and the Role/Signal/Time-Scale column labels. Presents
 * state owned by `use-workspace-ui-state.ts` (filters) and
 * `use-dialog-menu-state.ts` (menu open flags) -- every state transition is
 * still decided by the caller via these callbacks. */
export function SignalTreeColumnHeader({ treeTypeFilter, onTreeTypeFilterChange, treeFilter, onTreeFilterChange, onClearTreeFilter, addMenuOpen, onToggleAddMenu, moreMenuOpen, onToggleMoreMenu, onAddEntity, onCloseAddMenu, onOpenBulkRegistration, onCollapseAllGroups, onExpandAllGroups, onOpenHierarchy, onCloseMoreMenu, timeScaleLabel, transactionMode }: SignalTreeColumnHeaderProps) {
  useEffect(() => {
    if (!addMenuOpen && !moreMenuOpen) return;
    const frame = requestAnimationFrame(() => {
      const menu = document.querySelector<HTMLElement>(
        addMenuOpen ? "[role='menu'][aria-label='Add signal or group']" : "[role='menu'][aria-label='More tree actions']",
      );
      menu?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [addMenuOpen, moreMenuOpen]);
  if (transactionMode) {
    const onTransactions = transactionMode.tab === "transactions";
    return <div className="column-headings" data-testid="transaction-tree-header">
    <span className="left-column-heading">
      <span className="transaction-tree-tabs" role="tablist" aria-label="Transaction tree">
        <button type="button" role="tab" aria-selected={onTransactions} data-testid="transaction-tree-tab-transactions" className={onTransactions ? "active" : ""} onClick={() => transactionMode.onTabChange("transactions")}>Transactions</button>
        <button type="button" role="tab" aria-selected={!onTransactions} data-testid="transaction-tree-tab-signals" className={onTransactions ? "" : "active"} onClick={() => transactionMode.onTabChange("signals")}>Signals</button>
      </span>
      {onTransactions && <label className="tree-filter-controls">
        <span className="visually-hidden">Transaction tree filter</span>
        <input data-testid="transaction-tree-search" aria-label="Transaction tree filter" value={transactionMode.filter} onChange={(event) => transactionMode.onFilterChange(event.target.value)} placeholder="Search transactions..." />
        {transactionMode.filter && <button type="button" aria-label="Clear transaction tree filter" onMouseDown={(event) => event.preventDefault()} onClick={() => transactionMode.onFilterChange("")}><EditorIcon name="close" /></button>}
      </label>}
      {onTransactions && <select aria-label="Transaction filter mode" value={transactionMode.filterMode} onChange={(event) => transactionMode.onFilterModeChange(event.target.value as typeof transactionMode.filterMode)}><option value="all">All</option><option value="grouped">Grouped</option><option value="ungrouped">Ungrouped</option><option value="phases">Has Phases</option><option value="no-phases">No Phases</option><option value="linked">Has Linked Signals</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select>}
      {onTransactions && <span className="left-column-actions">
        <button type="button" className="tree-add-button" aria-label="Add Transaction" data-testid="add-transaction-tree" onClick={transactionMode.onAdd}><EditorIcon name="plus" /></button>
        <button type="button" className="tree-more-button" aria-label="Add Transaction Group" title="Add Transaction Group" data-testid="add-transaction-group-tree" onClick={transactionMode.onAddGroup}><EditorIcon name="plus" /></button>
      </span>}
    </span>
    {onTransactions
      ? <><span className="role-column-heading" aria-label="Group">Group</span><span className="signal-column-heading" aria-label="Transaction">Transaction</span></>
      : <span className="signal-column-heading" aria-label="Signal">Signal</span>}
    <span className="frozen-pane-heading-gutter" aria-hidden="true" />
    <span>{timeScaleLabel}</span>
  </div>;
  }
  return <div className="column-headings">
    <span className="left-column-heading">
      <strong>Signals / Groups</strong>
      <label className="tree-filter-controls">
        <span className="visually-hidden">Signal tree type filter</span>
        <select data-testid="signal-tree-type-filter" aria-label="Signal tree type filter" value={treeTypeFilter} onChange={(event) => onTreeTypeFilterChange(event.target.value)}><option value="all">All</option><option value="input">Input</option><option value="output">Output</option><option value="wire">Wire</option><option value="comment">Comment</option></select>
        <span className="visually-hidden">Signal tree filter</span>
        <input data-testid="signal-tree-search-top" aria-label="Signal tree filter" value={treeFilter} onChange={(event) => onTreeFilterChange(event.target.value)} placeholder="Filter signals..." />
        {treeFilter && <button type="button" aria-label="Clear signal tree filter" onMouseDown={(event) => event.preventDefault()} onClick={onClearTreeFilter}><EditorIcon name="close" /></button>}
      </label>
      <span className="left-column-actions">
        <button type="button" className="tree-add-button" aria-label="Add signal or group" aria-expanded={addMenuOpen} onClick={(event) => onToggleAddMenu(event.currentTarget)}><EditorIcon name="plus" /></button>
        <button type="button" className="tree-more-button" aria-label="More tree actions" aria-expanded={moreMenuOpen} onClick={(event) => onToggleMoreMenu(event.currentTarget)}><EditorIcon name="more" /></button>
      </span>
      {addMenuOpen && <div className="tree-add-menu" role="menu" aria-label="Add signal or group">
        {/* #474: labels come from the same signal-type-registry.ts table
            Inspector's own Type dropdown reads -- previously each hardcoded
            its own copy of "binary"→"Signal"/"bus"→"Bus"/etc; they happened
            to agree, but nothing enforced it. */}
        <button type="button" role="menuitem" onClick={() => { onAddEntity("signal"); onCloseAddMenu(); }}>{signalTypeLabel("binary")}</button>
        <button type="button" role="menuitem" onClick={() => { onAddEntity("clock"); onCloseAddMenu(); }}>Clock</button>
        <button type="button" role="menuitem" onClick={() => { onAddEntity("bus"); onCloseAddMenu(); }}>{signalTypeLabel("bus")}</button>
        <button type="button" role="menuitem" onClick={() => { onAddEntity("state"); onCloseAddMenu(); }}>{signalTypeLabel("state")}</button>
        <button type="button" role="menuitem" onClick={() => { onAddEntity("logic"); onCloseAddMenu(); }}>{signalTypeLabel("logic")}</button>
        <button type="button" role="menuitem" onClick={() => { onAddEntity("event"); onCloseAddMenu(); }}>{signalTypeLabel("event")}</button>
        <button type="button" role="menuitem" onClick={() => { onAddEntity("spacer"); onCloseAddMenu(); }}>Spacer</button>
        <button type="button" role="menuitem" data-testid="create-group" onClick={() => { onAddEntity("group"); onCloseAddMenu(); }}>Group</button>
        <button type="button" role="menuitem" data-testid="bulk-register-open" onClick={() => { onOpenBulkRegistration(); onCloseAddMenu(); }}>Bulk Signal Registration</button>
        <button type="button" role="menuitem" onClick={() => { onAddEntity("commentRow"); onCloseAddMenu(); }}>Comment Row</button>
      </div>}
      {moreMenuOpen && <div className="tree-header-menu" role="menu" aria-label="More tree actions">
        <button type="button" role="menuitem" onClick={() => { onCollapseAllGroups(); onCloseMoreMenu(); }}>Collapse All Groups</button>
        <button type="button" role="menuitem" onClick={() => { onExpandAllGroups(); onCloseMoreMenu(); }}>Expand All Groups</button>
        <button type="button" role="menuitem" onClick={() => { onClearTreeFilter(); onCloseMoreMenu(); }}>Clear Filter</button>
        <button type="button" role="menuitem" data-testid="hierarchy-open" onClick={() => { onOpenHierarchy(); onCloseMoreMenu(); }}>Hierarchy</button>
      </div>}
    </span>
    <span className="role-column-heading" aria-label="Role">Role</span>
    <span className="signal-column-heading" aria-label="Signal / Annotation">Signal / Annotation</span>
    <span className="frozen-pane-heading-gutter" aria-hidden="true" />
    <span>{timeScaleLabel}</span>
  </div>;
}

export type BottomEditorPanelProps<Tab extends string> = {
  readonly tabs: readonly Tab[];
  readonly activeTab: Tab;
  readonly onSelectTab: (tab: Tab) => void;
  readonly onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, tab: Tab) => void;
  readonly followSelection: boolean;
  readonly onFollowSelectionChange: (value: boolean) => void;
  readonly pinned: boolean;
  readonly onTogglePinned: () => void;
  readonly summary?: ReactNode;
  readonly content: ReactNode;
};

/** The Bottom Editor section: its tab strip (Signal/Annotation/Transaction/
 * Problems/JSON), the Follow-Selection checkbox and Bottom-Pin toggle, and
 * the single active-tab content pane. Which editor renders for the active
 * tab is decided by the caller (it depends on the current selection across
 * several owners) and passed in as `content`. */
export function BottomEditorPanel<Tab extends string>({ tabs, activeTab, onSelectTab, onTabKeyDown, followSelection, onFollowSelectionChange, pinned, onTogglePinned, summary, content }: BottomEditorPanelProps<Tab>) {
  return <section className="bottom-editor" data-testid="bottom-editor">
    <nav className="bottom-tabs" data-testid="bottom-tabs" role="tablist" aria-label="Bottom context panels">
      {tabs.map((tab) => {
        const active = activeTab === tab;
        const tabId = `bottom-tab-${tab.toLowerCase()}`;
        return <button type="button" role="tab" key={tab} id={tabId} data-bottom-tab={tab} tabIndex={active ? 0 : -1} aria-label={tab} aria-selected={active} aria-controls="bottom-context-content" className={active ? "active" : ""} onClick={() => onSelectTab(tab)} onKeyDown={(event) => onTabKeyDown(event, tab)}>{tab}</button>;
      })}
      <span />
      {/* #440: a Selection change can silently leave the Bottom Editor
          showing a DIFFERENT entity than what's now selected (Pin holds
          the active tab's own target on purpose) -- this status text
          makes that state explicit instead of leaving "Pin"/"Unpin" as
          the only clue, so a Transaction-selected-while-Bottom-still-
          shows-Bookmark moment reads as intentional, not stale. */}
      <output className="bottom-follow-status" data-testid="bottom-follow-status">{pinned ? `Pinned: ${activeTab}` : "Following Selection"}</output>
      <label><input data-testid="follow-selection" type="checkbox" checked={followSelection} onChange={(event) => onFollowSelectionChange(event.target.checked)} /> Follow Selection</label>
      <button type="button" data-testid="bottom-pin" aria-label={pinned ? "Unpin" : "Pin"} aria-pressed={pinned} onClick={onTogglePinned}><span className="bottom-pin-label" data-v1-label={pinned ? "Unpin" : "Pin"}>{pinned ? "Unpin" : "Pin"}</span></button>
    </nav>
    <div className="bottom-content" id="bottom-context-content" role="tabpanel" aria-labelledby={`bottom-tab-${activeTab.toLowerCase()}`}>{content}</div>
    {summary}
  </section>;
}

export type EditorStatusBarProps = {
  readonly toolStatus: string;
  readonly selectionStatus: string;
  readonly signalCount: number;
  readonly annotationCount: number;
  readonly rangeStatus: string;
  readonly selectedCycle: number;
  readonly zoom: number;
  readonly snapEnabled: boolean;
  readonly viewMode: string;
  readonly statusContext: string;
  readonly hideRevisionDetail: boolean;
  readonly revision: number;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly timeAxisStatus: string;
  readonly dirty: boolean;
  readonly problemsCount: number;
  readonly waveDromHasError: boolean;
  // #431/#459: Cursor A/B (source-time workspace state, never Canonical --
  // see use-workspace-ui-state.ts) had a fully-built state API with zero
  // GUI anywhere. `undefined` when neither cursor is set, so the status
  // bar shows nothing extra for the common case. Pre-formatted by the
  // caller, same "pure display, no logic of its own" contract as every
  // other field here.
  readonly cursorStatus: string | undefined;
  // #407: which of Split's two existing regions (Signal surface vs
  // `.transaction-lanes`) is active -- "常に判別可能" (always
  // distinguishable) per the issue's own acceptance criteria means a
  // textual indicator, not the CSS border alone. `undefined` outside
  // Split mode.
  readonly activePaneStatus: string | undefined;
};

/** The editor's bottom status bar. Purely a display of values already
 * computed by their owners (Application/History, Selection, Timeline
 * Geometry/Navigation, Workspace UI State) -- no state or logic of its own. */
export function EditorStatusBar({ toolStatus, selectionStatus, signalCount, annotationCount, rangeStatus, selectedCycle, zoom, snapEnabled, viewMode, statusContext, hideRevisionDetail, revision, undoDepth, redoDepth, timeAxisStatus, dirty, problemsCount, waveDromHasError, cursorStatus, activePaneStatus }: EditorStatusBarProps) {
  return <footer className="status-bar" aria-label="Editor status">
    <span data-testid="tool-status">{toolStatus}</span>
    {cursorStatus && <span data-testid="cursor-status">{cursorStatus}</span>}
    {activePaneStatus && <span data-testid="active-pane-status">{activePaneStatus}</span>}
    <span>Selected: <strong data-testid="selection-status">{selectionStatus}</strong></span>
    <span data-testid="signal-count-status">Signals: {signalCount}</span><span data-testid="annotation-count-status">Annotations: {annotationCount}</span><span data-testid="range-status">{rangeStatus}</span><span data-testid="cycle-status">Cycle {selectedCycle}</span><span data-testid="zoom-status-bar">Zoom: {Math.round(zoom * 100)}%</span><span data-testid="snap-status">Snap: {snapEnabled ? "On" : "Off"}</span><span data-testid="view-mode-status">Mode: {viewMode}</span>
    <span className="status-context" data-testid="status-context">{statusContext}</span>
    <span className={hideRevisionDetail ? "status-detail-hidden" : undefined} data-testid="revision-status">Canonical revision {revision}</span>
    <span className={hideRevisionDetail ? "status-detail-hidden" : undefined} data-testid="history-status">History {undoDepth} / Redo {redoDepth}</span>
    <span data-testid="time-axis-status">{timeAxisStatus}</span><span data-testid="dirty-status">{dirty ? "Modified" : "Clean"}</span><span data-testid="problems-status">Problems: {problemsCount}</span><span data-testid="wavedrom-status">WaveDrom: {waveDromHasError ? "Error" : "Ready"}</span>
  </footer>;
}

export function BulkRegistrationDialog({ dialogRef, groups, text, onTextChange, groupId, onGroupIdChange, status, preview, onPreview, onApply, onClose }: BulkRegistrationDialogProps) {
  return <div className="modal-backdrop"><section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Bulk Signal Registration" className="document-properties bulk-registration">
    <header><h2>Bulk Signal Registration</h2><button type="button" aria-label="Close bulk registration" onClick={onClose}><EditorIcon name="close" /></button></header>
    <p>One signal per line: <code>instance.path.signal [binary|bus|state|clock]</code></p>
    <textarea data-dialog-initial-focus aria-label="Bulk signal definitions" value={text} onChange={(event) => onTextChange(event.target.value)} rows={8} />
    <label>Target Group<select aria-label="Bulk registration target group" value={groupId ?? ""} onChange={(event) => onGroupIdChange(event.target.value as GroupId)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    {preview && <div className={`bulk-preview ${preview.errors.length === 0 ? "valid" : "invalid"}`} data-testid="bulk-register-preview"><strong>{preview.errors.length === 0 ? `Ready to register ${preview.definitions.length} signal${preview.definitions.length === 1 ? "" : "s"}` : "Preview errors"}</strong>{preview.errors.length > 0 ? <ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <ul>{preview.definitions.map((definition) => <li key={definition.path}>{definition.path} · {definition.kind}{definition.width === undefined ? "" : ` · width ${definition.width}`}</li>)}</ul>}</div>}
    <footer><output>{status}</output><button type="button" data-testid="bulk-register-preview-button" onClick={onPreview}>Preview</button><button type="button" data-testid="bulk-register-apply" onClick={onApply} disabled={!preview || preview.sourceText !== text || preview.errors.length > 0 || preview.definitions.length === 0}>Register Signals</button></footer>
  </section></div>;
}
