import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { RefObject } from "react";
import { getGestureHint, subscribeGestureHint } from "./runtime/active-gesture-cancellation.js";
import { cycleUnitWord } from "./transaction-tc.js";
import type { GroupId, SignalGroup, SpacerId } from "@timing-chart-v2/schema";
import { ContextMenuSurface } from "./context-menu-surface.js";
import { parseBulkSignalDefinitions, type BulkSignalDefinition } from "./bulk-signal-parser.js";
import { EditorIcon } from "./editor-icon.js";
import { signalTypeLabel } from "./runtime/signal-type-registry.js";
import { usePeerMenuSurface } from "./runtime/peer-menu-surface.js";
import type { TransactionTreeFilterMode } from "./workspace/use-workspace-ui-state.js";


export type MinimalCycleViewPanelsProps = { readonly children?: ReactNode; readonly workspace?: ReactNode; readonly tail?: ReactNode; readonly bottom?: ReactNode; readonly inspector?: ReactNode; readonly overlays?: ReactNode; readonly fileInput?: ReactNode; readonly status?: ReactNode; };
const spacerId = (value: string) => value as SpacerId;
export function MinimalCycleViewPanels({ children, workspace, tail, bottom, inspector, overlays, fileInput, status }: MinimalCycleViewPanelsProps) { if (children !== undefined) return <>{children}</>; return <><div className="desktop-workspace">{workspace}{tail}{bottom}{inspector}</div>{overlays}{fileInput}{status}</>; }

export function ContextMenuPanel({ contextMenu, hasSelectedClipboard, clipboardAvailable, hasSelectedEntity, hasSelectedSignal, hasDeletableSelection, canRenameSelection, canMoveUp, canMoveDown, canShowSelection, canHideSelection, signalPinned, togglePinnedSignals, copySelectedSignal, cutSelectedSignal, pasteSelectedEntity, duplicateSelectedEntity, moveSelection, setSelectionVisibility, renameSelection, closeContextMenu, deleteSelection, addBookmarkAtCycle, transactionGroups = [], selectedTransactionGroupId, moveSelectedTransactionToGroup }: any) {
  if (contextMenu?.target === "ruler") return <ContextMenuSurface anchor={contextMenu} target="ruler" label="Ruler context menu" onDismiss={closeContextMenu}>
    <button type="button" role="menuitem" data-testid="ruler-add-bookmark" onClick={() => { addBookmarkAtCycle(contextMenu.cycle); closeContextMenu(); }}>ブックマークを追加</button>
  </ContextMenuSurface>;
  return contextMenu ? <ContextMenuSurface anchor={contextMenu} target={contextMenu.target} label={contextMenu.target === "group" ? "Group context menu" : contextMenu.target === "annotation" ? "Annotation context menu" : contextMenu.target === "transaction" ? "Transaction context menu" : "Signal context menu"} onDismiss={closeContextMenu}>
    {contextMenu.target === "signal" && <button type="button" role="menuitemcheckbox" aria-checked={Boolean(signalPinned)} aria-label={`${signalPinned ? "Unpin" : "Pin"} selected Signals`} disabled={!hasSelectedSignal} onClick={() => { togglePinnedSignals?.(); closeContextMenu(); }}>{signalPinned ? "Unpin selected Signals" : "Pin selected Signals"}</button>}
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
  // Historical showcase documents may include a view mode in their saved
  // title. Mode is workspace presentation, so do not let that stale suffix
  // contradict the live mode label or mutate the Canonical document title.
  const displayTitle = title.replace(/\s+(?:--|—)\s+(?:Cycle|Transaction|Combined)\s+Mode$/i, "").trim() || title;
  return <header className="app-titlebar"><span className="appmark">∿</span><h1 data-testid="titlebar-document-title" aria-label={`${displayTitle}${dirty ? " (unsaved changes)" : ""}`}>{displayTitle}{dirty && <span className="document-dirty-indicator" data-testid="titlebar-unsaved-indicator" aria-label="Unsaved changes">*</span>}</h1><span className="save-state">{dirty ? "Modified" : "Saved"}</span><span className="view-title" data-testid="titlebar-view-title">{VIEW_MODE_TITLE_LABEL[viewMode]}</span></header>;
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
  // field here.
  readonly transactionMode?: { readonly filter: string; readonly onFilterChange: (value: string) => void; readonly filterMode: TransactionTreeFilterMode; readonly onFilterModeChange: (value: TransactionTreeFilterMode) => void; readonly onAdd: () => void; readonly onAddGroup: () => void; readonly onExpandAll: () => void; readonly onCollapseAll: () => void; readonly onShowAll: () => void; readonly onHideAll: () => void; readonly timeScale?: { readonly cyclesPerTc: number; readonly onChange: (cyclesPerTc: number) => void } } | undefined;
};

/** #748: the one left-pane header action chrome (primary + Add, optional extra actions, top-right More). Cycle and Transaction pass their own labels,
 * commands and menus; size, spacing, focus and accessible-name wiring are shared so the two headers cannot drift. */
type HeaderButton = { readonly label: string; readonly testId?: string; readonly expanded?: boolean; readonly popup?: "menu"; readonly onClick: (event: React.MouseEvent<HTMLButtonElement>) => void };
export function LeftPaneHeaderActions({ add, more, children }: { readonly add: HeaderButton; readonly more: HeaderButton & { readonly buttonRef?: React.RefObject<HTMLButtonElement | null> }; readonly children?: ReactNode }) {
  return <span className="left-column-actions">
    <button type="button" className="tree-add-button" aria-label={add.label} title={add.label} {...(add.testId ? { "data-testid": add.testId } : {})} {...(add.expanded === undefined ? {} : { "aria-expanded": add.expanded })} onClick={add.onClick}><EditorIcon name="plus" /></button>
    {children}
    <button ref={more.buttonRef} type="button" className="tree-more-button" aria-label={more.label} title={more.label} {...(more.testId ? { "data-testid": more.testId } : {})} {...(more.expanded === undefined ? {} : { "aria-expanded": more.expanded })} {...(more.popup ? { "aria-haspopup": more.popup } : {})} onClick={more.onClick}><EditorIcon name="more" /></button>
  </span>;
}

/** The Signal/Group tree's column header: type/text filter, the Add and
 * More popup menus, and the Role/Signal/Time-Scale column labels. Presents
 * state owned by `use-workspace-ui-state.ts` (filters) and
 * `use-dialog-menu-state.ts` (menu open flags) -- every state transition is
 * still decided by the caller via these callbacks. */
const TC_SCALE_PRESETS = [1, 2, 4, 5, 10, 20, 50] as const;

/** #750 section 3: "Custom…" accepts a positive integer only; an invalid draft stays local and never becomes the active cyclesPerTC
 * mapping (the select's own value is never set to an unvalidated number). */
function TcScaleSelect({ cyclesPerTc, onChange }: { readonly cyclesPerTc: number; readonly onChange: (value: number) => void }) {
  const isPreset = (TC_SCALE_PRESETS as readonly number[]).includes(cyclesPerTc);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [customDraft, setCustomDraft] = useState(String(cyclesPerTc));
  useEffect(() => { if (isPreset) { setCustomMode(false); setCustomDraft(String(cyclesPerTc)); } }, [cyclesPerTc, isPreset]);
  const customValue = Number(customDraft);
  const customValid = customDraft.trim().length > 0 && Number.isInteger(customValue) && customValue >= 1;
  const options = [...new Set([...TC_SCALE_PRESETS, ...(isPreset ? [] : [cyclesPerTc])])].sort((a, b) => a - b);
  if (!customMode) {
    return <select data-testid="transaction-tc-scale" aria-label="Cycles per TC" value={cyclesPerTc} onChange={(event) => { if (event.target.value === "__custom__") { setCustomMode(true); setCustomDraft(String(cyclesPerTc)); return; } onChange(Number(event.target.value)); }}>
      {options.map((value) => <option key={value} value={value}>{value}</option>)}
      <option value="__custom__">Custom…</option>
    </select>;
  }
  return <span className="transaction-tc-scale-custom">
    <input aria-label="Custom cycles per TC" type="number" min="1" step="1" data-testid="transaction-tc-scale-custom-input" aria-invalid={customValid ? undefined : true} value={customDraft} onChange={(event) => setCustomDraft(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter" && customValid) onChange(customValue); if (event.key === "Escape") { setCustomMode(false); setCustomDraft(String(cyclesPerTc)); } }} />
    <button type="button" data-testid="apply-transaction-tc-scale-custom" disabled={!customValid || customValue === cyclesPerTc} onClick={() => { onChange(customValue); setCustomMode(false); }}>Apply</button>
    {!customValid && <span role="alert" className="editor-problem">Enter a whole number, 1 or greater.</span>}
  </span>;
}

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
  const [transactionMoreOpen, setTransactionMoreOpen] = useState(false);
  const transactionMoreButton = useRef<HTMLButtonElement>(null);
  usePeerMenuSurface(addMenuOpen, onCloseAddMenu);
  usePeerMenuSurface(moreMenuOpen, onCloseMoreMenu);
  usePeerMenuSurface(transactionMoreOpen, () => setTransactionMoreOpen(false));
  useEffect(() => {
    if (!transactionMoreOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      // #748: Escape hands focus back to the invoker.
      if (event instanceof KeyboardEvent) transactionMoreButton.current?.focus();
      if (event instanceof MouseEvent && (event.target as Element | null)?.closest("[data-testid='transaction-tree-more-menu'], [data-testid='transaction-tree-more']")) return;
      setTransactionMoreOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [transactionMoreOpen]);
  if (transactionMode) {
    return <div className="column-headings" data-testid="transaction-tree-header">
    <span className="left-column-heading">
      <span className="transaction-tree-title" data-testid="transaction-tree-title">Transactions</span>
      {<label className="tree-filter-controls">
        <span className="visually-hidden">Search transactions</span>
        <input data-testid="transaction-tree-search" aria-label="Search transactions" title="Searches the Transaction Tree (left). The Bottom table has its own search." value={transactionMode.filter} onChange={(event) => transactionMode.onFilterChange(event.target.value)} placeholder="Search transactions…" />
        {transactionMode.filter && <button type="button" aria-label="Clear transaction tree filter" onMouseDown={(event) => event.preventDefault()} onClick={() => transactionMode.onFilterChange("")}><EditorIcon name="close" /></button>}
      </label>}
      {<select aria-label="Filter transactions" title="Filters the Transaction Tree (left) by kind" data-filter-active={String(transactionMode.filterMode !== "all")} value={transactionMode.filterMode} onChange={(event) => transactionMode.onFilterModeChange(event.target.value as typeof transactionMode.filterMode)}><option value="all">All</option><option value="grouped">Grouped</option><option value="ungrouped">Ungrouped</option><option value="phases">Has Phases</option><option value="no-phases">No Phases</option><option value="linked">Has Linked Signals</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select>}
      <LeftPaneHeaderActions
        add={{ label: "Add transaction", testId: "add-transaction-tree", onClick: transactionMode.onAdd }}
        more={{ label: "Transaction tree actions", testId: "transaction-tree-more", expanded: transactionMoreOpen, popup: "menu", buttonRef: transactionMoreButton, onClick: () => setTransactionMoreOpen((open) => !open) }}
      >
        <button type="button" className="tree-add-group-button" aria-label="New Transaction Group" title="New Transaction Group" data-testid="add-transaction-group-tree-visible" onClick={transactionMode.onAddGroup}>+ Group</button>
      </LeftPaneHeaderActions>
      {transactionMoreOpen && <div className="tree-header-menu" role="menu" aria-label="Transaction tree actions" data-testid="transaction-tree-more-menu">
        <button type="button" role="menuitem" data-testid="transaction-tree-expand-all" onClick={() => { transactionMode.onExpandAll(); setTransactionMoreOpen(false); }}>Expand All</button>
        <button type="button" role="menuitem" data-testid="transaction-tree-collapse-all" onClick={() => { transactionMode.onCollapseAll(); setTransactionMoreOpen(false); }}>Collapse All</button>
        <hr role="separator" />
        <button type="button" role="menuitem" data-testid="transaction-tree-show-all" onClick={() => { transactionMode.onShowAll(); setTransactionMoreOpen(false); }}>Show All</button>
        <button type="button" role="menuitem" data-testid="transaction-tree-hide-all" onClick={() => { transactionMode.onHideAll(); setTransactionMoreOpen(false); }}>Hide All</button>
        <hr role="separator" />
        <button type="button" role="menuitem" data-testid="add-transaction-group-tree" onClick={() => { transactionMode.onAddGroup(); setTransactionMoreOpen(false); }}>Add Group…</button>
        <hr role="separator" />
        <button type="button" role="menuitem" disabled={transactionMode.filter === ""} onClick={() => { transactionMode.onFilterChange(""); setTransactionMoreOpen(false); }}>Clear Filter</button>
      </div>}
    </span>
    <span className="role-column-heading" aria-label="Group">Group</span><span className="signal-column-heading" aria-label="Transaction">Transaction</span>
    <span className="frozen-pane-heading-gutter" aria-hidden="true" />
    <span className="transaction-time-scale-readout">Time Scale: Transaction Cycle (TC)    Reference: System Clock (1 TC = {transactionMode.timeScale ? <TcScaleSelect cyclesPerTc={transactionMode.timeScale.cyclesPerTc} onChange={(value) => transactionMode.timeScale?.onChange(value)} /> : timeScaleLabel} {cycleUnitWord(transactionMode.timeScale?.cyclesPerTc ?? 1)})</span>
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
      <LeftPaneHeaderActions
        add={{ label: "Add signal or group", expanded: addMenuOpen, onClick: (event) => onToggleAddMenu(event.currentTarget) }}
        more={{ label: "More tree actions", expanded: moreMenuOpen, onClick: (event) => onToggleMoreMenu(event.currentTarget) }}
      />
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
        <button type="button" role="menuitem" data-testid="hierarchy-open" onClick={() => { onOpenHierarchy(); onCloseMoreMenu(); }}>Signal Full Path List / Hierarchy…</button>
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
  readonly contentClassName?: string;
};

/** The Bottom Editor section: its tab strip (Signal/Annotation/Transaction/
 * Problems/JSON), the Follow-Selection checkbox and Bottom-Pin toggle, and
 * the single active-tab content pane. Which editor renders for the active
 * tab is decided by the caller (it depends on the current selection across
 * several owners) and passed in as `content`. */
export function BottomEditorPanel<Tab extends string>({ tabs, activeTab, onSelectTab, onTabKeyDown, followSelection, onFollowSelectionChange, pinned, onTogglePinned, summary, content, contentClassName }: BottomEditorPanelProps<Tab>) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLSpanElement>(null);
  usePeerMenuSurface(settingsOpen, () => setSettingsOpen(false));
  useEffect(() => {
    if (!settingsOpen) return;
    const close = (event: PointerEvent) => { if (!(event.target instanceof Node) || !settingsRef.current?.contains(event.target)) setSettingsOpen(false); };
    // #747: Escape closes the popover from anywhere (focus normally stays on the gear) and hands focus back to it.
    const escape = (event: KeyboardEvent) => { if (event.key !== "Escape") return; setSettingsOpen(false); settingsRef.current?.querySelector<HTMLElement>(".bottom-settings-button")?.focus(); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", escape); };
  }, [settingsOpen]);
  return <section className="bottom-editor" data-testid="bottom-editor">
    <nav className="bottom-tabs" data-testid="bottom-tabs" role="tablist" aria-label="Bottom context panels">
      {tabs.map((tab) => {
        const active = activeTab === tab;
        const tabId = `bottom-tab-${tab.toLowerCase()}`;
        return <button type="button" role="tab" key={tab} id={tabId} data-bottom-tab={tab} tabIndex={active ? 0 : -1} aria-label={tab} aria-selected={active} aria-controls="bottom-context-content" className={active ? "active" : ""} onClick={() => onSelectTab(tab)} onKeyDown={(event) => onTabKeyDown(event, tab)}>{tab}</button>;
      })}
      <span />
      <span className="bottom-settings-anchor" ref={settingsRef}>
        <button type="button" className="bottom-settings-button" data-testid="bottom-settings" aria-label="Bottom Panel settings" aria-haspopup="true" aria-expanded={settingsOpen} title="Bottom panel behavior: Follow Selection, Pin" onClick={() => setSettingsOpen((open) => !open)}>{"⚙"}</button>
        <div className="bottom-settings-popover" data-testid="bottom-settings-popover" role="dialog" aria-label="Bottom Panel Settings" hidden={!settingsOpen} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setSettingsOpen(false); settingsRef.current?.querySelector<HTMLElement>(".bottom-settings-button")?.focus(); } }}>
          <strong>Bottom Panel Settings</strong>
          <p>Choose how the Bottom Panel reacts when the editor selection changes.</p>
          <label className="bottom-setting-option">
            <input data-testid="follow-selection" type="checkbox" checked={followSelection} onChange={(event) => onFollowSelectionChange(event.target.checked)} />
            <span><strong>Follow selection</strong><small>Automatically update the Bottom Panel target when you select another item. Turn off to keep its current target.</small></span>
          </label>
          <div className="bottom-setting-option">
            <button type="button" data-testid="bottom-pin" aria-label={pinned ? "Unpin current content" : "Pin current content"} aria-pressed={pinned} onClick={onTogglePinned}>{pinned ? "Unpin current content" : "Pin current content"}</button>
            <small>Keep the content currently shown fixed while you inspect or select other items.</small>
          </div>
        </div>
      </span>
    </nav>
    <div className={`bottom-content${contentClassName ? ` ${contentClassName}` : ""}`} id="bottom-context-content" role="tabpanel" aria-labelledby={`bottom-tab-${activeTab.toLowerCase()}`}>{content}</div>
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
  readonly problemsPending: boolean;
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
export function EditorStatusBar({ toolStatus, selectionStatus, signalCount, annotationCount, rangeStatus, selectedCycle, zoom, snapEnabled, viewMode, statusContext, hideRevisionDetail, revision, undoDepth, redoDepth, timeAxisStatus, dirty, problemsCount, problemsPending, waveDromHasError, cursorStatus, activePaneStatus }: EditorStatusBarProps) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const gestureHint = useSyncExternalStore(subscribeGestureHint, getGestureHint);
  const diagnosticClass = hideRevisionDetail ? "status-detail-hidden" : diagnosticsOpen ? undefined : "visually-hidden";
  return <footer className="status-bar" aria-label="Editor status">
    <span data-testid="tool-status">{gestureHint ?? toolStatus}</span>
    <button type="button" className="status-diagnostics-toggle" data-testid="status-diagnostics-toggle" aria-pressed={diagnosticsOpen} title="Show developer diagnostics (Canonical revision, History counters, renderer state)" onClick={() => setDiagnosticsOpen((open) => !open)}>Diagnostics</button>
    {cursorStatus && <span data-testid="cursor-status">{cursorStatus}</span>}
    {activePaneStatus && <span data-testid="active-pane-status">{activePaneStatus}</span>}
    <span>Selected: <strong data-testid="selection-status">{selectionStatus}</strong></span>
    <span data-testid="signal-count-status">Signals: {signalCount}</span><span data-testid="annotation-count-status">Annotations: {annotationCount}</span><span data-testid="range-status">{rangeStatus}</span><span data-testid="cycle-status">{viewMode === "Cycle" ? "Cycle" : "Source cycle"} {selectedCycle}</span><span data-testid="zoom-status-bar">Zoom: {Math.round(zoom * 100)}%</span><span data-testid="snap-status">Snap: {snapEnabled ? "On" : "Off"}</span><span data-testid="view-mode-status">Mode: {viewMode === "Split" ? "Combined" : viewMode}</span>
    <span className="status-context" data-testid="status-context">{statusContext}</span>
    <span className={diagnosticClass} data-testid="revision-status">Canonical revision {revision}</span>
    <span className={diagnosticClass} data-testid="history-status">History {undoDepth} / Redo {redoDepth}</span>
    <span data-testid="time-axis-status">{timeAxisStatus}</span><span data-testid="dirty-status">{dirty ? "Modified" : "Clean"}</span><span data-testid="problems-status">{problemsPending ? "Problems: Checking…" : `Problems: ${problemsCount}`}</span><span className={waveDromHasError ? undefined : diagnosticClass} data-testid="wavedrom-status">WaveDrom: {waveDromHasError ? "Error" : "Ready"}</span>
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
