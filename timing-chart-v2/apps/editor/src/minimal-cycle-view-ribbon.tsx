import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Annotation, AnnotationType, CanonicalDocument, ClockSignal, CommentRow, GroupId, SignalId, SignalRole, SpacerId, TimeGroupId, TransactionId, ValueSignal } from "@timing-chart-v2/schema";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import { DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { InsertSemanticIcon } from "./insert-semantic-icon.js";
import { AnnotationToolbar } from "./annotation-toolbar.js";
import { ReviewWorkflow } from "./review-workflow.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import { TimelineToolbar } from "./timeline-toolbar.js";
import { createAnnotation } from "./create-annotation.js";
import { NEW_DOCUMENT_POLICY_DESCRIPTION } from "./file-document-controller.js";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";

type DensityMode = "compact" | "comfortable";
type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;
const spacerId = (value: string) => value as SpacerId;
function valueSignal(id: string, name: string, role: SignalRole, values: ValueSignal["values"], options: Pick<ValueSignal, "type" | "width" | "displayFormat"> = { type: "binary" }): ValueSignal {
  return { id: signalId(id), name, role, type: options.type, source: { instancePath: ["dut"], signalName: name.toLowerCase() }, display: { name }, values, ...(options.width === undefined ? {} : { width: options.width }), ...(options.displayFormat === undefined ? {} : { displayFormat: options.displayFormat }) };
}

export { Ribbon };

function Ribbon({ tab, document, revision, range, history, zoom, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground, signalTreeVisible, inspectorVisible, bottomVisible, arrowPickStatus, selectedSignalId, selectedGroupId, problemsCount, diagnostics, onNavigateProblem, onRefreshChecks, viewMode, density, workspacePreset, onDensityChange, onWorkspacePresetChange, selectedTransactionId, clipboardStatus, clipboardAvailable, hasSelectedSignal, hasSelectedClipboard, hasSelectedEntity, hasDeletableSelection, onRange, onCommand, onCreateAnnotation, onArrowPick, onZoom, onFitSelection, onFitAll, onSetZoom, onNavigateBookmark, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onToggleSignalNames, onToggleRoles, onToggleAnnotations, onToggleTransactions, onToggleGroupBackground, onToggleSignalTree, onUndo, onRedo, onDelete, onNew, onOpen, onSave, onSaveAs, onRecent, onProperties, onExport, onToggleInspector, onToggleBottom, onShowProblems, onCopy, onCut, onPaste, onDuplicate, onRename, onClearSelection, onSelectAll, onMoveUp, onMoveDown, onVisibility, onOpenTimeline, onOpenProperties }: {
  readonly tab: string; readonly document: CanonicalDocument; readonly revision: number; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly zoom: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly minimapEnabled: boolean; readonly showSignalNames: boolean; readonly showRoles: boolean; readonly showAnnotations: boolean; readonly showTransactions: boolean; readonly showGroupBackground: boolean; readonly signalTreeVisible: boolean; readonly inspectorVisible: boolean; readonly bottomVisible: boolean; readonly arrowPickStatus: "idle" | "from" | "to"; readonly selectedSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly problemsCount: number; readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly onNavigateProblem: (path: string) => void; readonly onRefreshChecks: () => void; readonly viewMode: "Cycle" | "Transaction" | "Split"; readonly density: DensityMode; readonly workspacePreset: WorkspacePreset; readonly onDensityChange: (density: DensityMode) => void; readonly onWorkspacePresetChange: (preset: WorkspacePreset) => void; readonly selectedTransactionId: TransactionId | undefined;
  readonly clipboardStatus: string; readonly clipboardAvailable: boolean; readonly hasSelectedSignal: boolean; readonly hasSelectedClipboard: boolean; readonly hasSelectedEntity: boolean; readonly hasDeletableSelection: boolean;
  readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCreateAnnotation: (annotation: Annotation) => void; readonly onArrowPick: () => void; readonly onZoom: (delta: number) => void; readonly onFitSelection: () => void; readonly onFitAll: () => void; readonly onSetZoom: (zoom: number) => void; readonly onNavigateBookmark: (cycle: number) => void;
  readonly onToggleGrid: () => void; readonly onToggleSnap: () => void; readonly onToggleRuler: () => void; readonly onToggleMinimap: () => void; readonly onToggleSignalNames: () => void; readonly onToggleRoles: () => void; readonly onToggleAnnotations: () => void; readonly onToggleTransactions: () => void; readonly onToggleGroupBackground: () => void; readonly onToggleSignalTree: () => void; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onNew: () => void; readonly onOpen: () => void; readonly onSave: () => void; readonly onSaveAs: () => void; readonly onRecent: () => void; readonly onProperties: () => void; readonly onExport: () => void; readonly onToggleInspector: () => void; readonly onToggleBottom: () => void; readonly onShowProblems: () => void; readonly onCopy: () => void; readonly onCut: () => void; readonly onPaste: () => void; readonly onDuplicate: () => void; readonly onRename: () => void; readonly onClearSelection: () => void; readonly onSelectAll: () => void; readonly onMoveUp: () => void; readonly onMoveDown: () => void; readonly onVisibility: (visible: boolean) => void; readonly onOpenTimeline: () => void; readonly onOpenProperties: () => void;
}) {
  const [homeOverflowOpen, setHomeOverflowOpen] = useState(false);
  const [homeOverflowPosition, setHomeOverflowPosition] = useState<{ readonly left: number; readonly top: number; readonly height: number; readonly maxHeight: number }>();
  const homeOverflowTriggerRef = useRef<HTMLButtonElement>(null);
  const homeOverflowMenuRef = useRef<HTMLDivElement>(null);
  const [compactCycleCount] = useState(2);
  useLayoutEffect(() => {
    if (!homeOverflowOpen) {
      setHomeOverflowPosition(undefined);
      return;
    }
    const updatePosition = () => {
      const trigger = homeOverflowTriggerRef.current;
      const menu = homeOverflowMenuRef.current;
      if (!trigger || !menu) return;
      const margin = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const maxHeight = Math.max(120, window.innerHeight - margin * 2);
      const menuHeight = Math.min(menu.scrollHeight, maxHeight);
      const menuWidth = Math.min(menuRect.width, Math.max(220, window.innerWidth - margin * 2));
      const left = Math.max(margin, Math.min(triggerRect.right - menuWidth, window.innerWidth - margin - menuWidth));
      const belowTop = triggerRect.bottom + margin;
      const aboveTop = triggerRect.top - margin - menuHeight;
      const top = belowTop + menuHeight <= window.innerHeight - margin
        ? belowTop
        : Math.max(margin, aboveTop);
      setHomeOverflowPosition({ left, top, height: menuHeight, maxHeight });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [homeOverflowOpen]);
  useEffect(() => {
    if (!homeOverflowOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (homeOverflowMenuRef.current?.contains(target) || homeOverflowTriggerRef.current?.contains(target)) return;
      setHomeOverflowOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setHomeOverflowOpen(false);
      requestAnimationFrame(() => homeOverflowTriggerRef.current?.focus());
    };
    window.document.addEventListener("pointerdown", onPointerDown, true);
    window.document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.document.removeEventListener("pointerdown", onPointerDown, true);
      window.document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [homeOverflowOpen]);
  useEffect(() => {
    if (!homeOverflowOpen) return;
    const frame = requestAnimationFrame(() => homeOverflowMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [homeOverflowOpen]);
  useLayoutEffect(() => {
    if (tab !== "Home") return;
    const root = window.document.querySelector<HTMLElement>("[data-testid='ribbon']");
    if (!root) return;
    const labels: Record<string, string> = { New: "新規", Open: "開く", Save: "保存", "Save As": "名前を付けて保存", Undo: "元に戻す", Redo: "やり直し", Copy: "コピー", Cut: "切取", Paste: "貼付", Duplicate: "複製", Delete: "削除", Rename: "名前変更", Clear: "クリア", "Select All": "すべて選択", Show: "表示", Hide: "非表示", "Move Up": "上へ", "Move Down": "下へ", "Zoom −": "ズーム－", "Zoom +": "ズーム＋", "Fit Selection": "選択に合わせる" };
    for (const button of root.querySelectorAll<HTMLButtonElement>(".ribbon-tool")) {
      const span = button.querySelector("span");
      const label = span?.textContent?.trim();
      const v1Label = label === undefined ? undefined : labels[label];
      if (label && v1Label) {
        button.setAttribute("aria-label", label);
        span?.setAttribute("data-v1-label", v1Label);
      }
    }
  });
  const insertValueSignal = (type: "binary" | "bus" | "state" | "logic" | "event" | "pulse") => {
    const targetGroup = document.signalGroups.find((group) => group.id === selectedGroupId) ?? document.signalGroups.at(-1);
    if (!targetGroup) return;
    const id = nextEntityId("signal", document);
    const name = type === "event" || type === "pulse" ? `${type.toUpperCase()}_${document.signals.length + 1}` : `SIGNAL_${document.signals.length + 1}`;
    const signal = type === "bus" ? valueSignal(id, name, "internal", [{ start: 0, value: "00" }], { type: "bus", width: 8, displayFormat: "hex" })
      : type === "state" ? valueSignal(id, name, "internal", [{ start: 0, value: "IDLE" }], { type: "state" })
      : type === "event" ? valueSignal(id, name, "internal", [{ start: 0, value: "NONE" }], { type: "event" })
      : valueSignal(id, name, "internal", [{ start: 0, value: 0 }], { type });
    onCommand({ id: nextCommandId("insert_signal"), type: "signal.create", signal, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertClockSignal = () => {
    const targetGroup = document.signalGroups.at(-1);
    if (!targetGroup) return;
    const id = signalId(nextEntityId("signal", document));
    const name = `CLOCK_${document.signals.length + 1}`;
    const signal: ClockSignal = { id, name, type: "clock", role: "internal", source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } };
    onCommand({ id: nextCommandId("insert_clock"), type: "signal.create", signal, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertGroup = () => {
    const id = groupId(nextEntityId("group", document));
    onCommand({ id: nextCommandId("insert_group"), type: "group.create", group: { id, name: `Group ${document.signalGroups.length + 1}`, rows: [] }, index: document.signalGroups.length });
  };
  const insertCommentRow = () => {
    const targetGroup = document.signalGroups.at(-1);
    if (!targetGroup) return;
    const id = signalId(nextEntityId("commentRow", document));
    const name = `Comment ${document.signals.length + 1}`;
    const commentRow: CommentRow = { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" };
    onCommand({ id: nextCommandId("insert_comment_row"), type: "commentRow.create", commentRow, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertSpacer = () => {
    const targetGroup = document.signalGroups.find((group) => group.id === selectedGroupId) ?? document.signalGroups.at(-1);
    if (!targetGroup) return;
    onCommand({ id: nextCommandId("insert_spacer"), type: "spacer.create", spacer: { id: spacerId(nextEntityId("spacer", document)), height: 24 }, targetGroupId: targetGroup.id, index: targetGroup.rows.length });
  };
  const insertAnnotation = (type: AnnotationType) => {
    if (!selectedSignalId) return;
    onCreateAnnotation(createAnnotation(type, selectedSignalId, range, document));
  };
  const addTransaction = () => {
    const id = nextEntityId("transaction", document) as TransactionId;
    onCommand({ id: nextCommandId("home_transaction_create"), type: "transaction.create", transaction: { id, name: `Transaction ${document.transactions.length + 1}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), laneId: "lane_0" } });
  };
  const duplicateTransaction = () => {
    const source = selectedTransactionId === undefined ? undefined : document.transactions.find((item) => item.id === selectedTransactionId);
    if (!source) return;
    onCommand({ id: nextCommandId("home_transaction_duplicate"), type: "transaction.create", transaction: { ...source, id: nextEntityId("transaction", document) as TransactionId, name: `${source.name} Copy` } });
  };
  const homeOverflowMenu = homeOverflowOpen ? createPortal(<div ref={homeOverflowMenuRef} id="home-overflow-menu" className="home-overflow-menu" role="menu" aria-label="More Home Commands" style={{ left: `${homeOverflowPosition?.left ?? 0}px`, top: `${homeOverflowPosition?.top ?? 0}px`, height: homeOverflowPosition ? `${homeOverflowPosition.height}px` : "auto", maxHeight: `${homeOverflowPosition?.maxHeight ?? 120}px`, visibility: homeOverflowPosition ? "visible" : "hidden" }}>
    <strong>File</strong><button type="button" onClick={() => { onNew(); setHomeOverflowOpen(false); }}>New</button><button type="button" onClick={() => { onOpen(); setHomeOverflowOpen(false); }}>Open</button><button type="button" onClick={() => { onSave(); setHomeOverflowOpen(false); }}>Save</button><button type="button" onClick={() => { onSaveAs(); setHomeOverflowOpen(false); }}>Save As</button><button type="button" onClick={() => { onRecent(); setHomeOverflowOpen(false); }}>Recent</button>
    <strong>History</strong><button type="button" onClick={() => { onUndo(); setHomeOverflowOpen(false); }} disabled={!history.canUndo}>Undo</button><button type="button" onClick={() => { onRedo(); setHomeOverflowOpen(false); }} disabled={!history.canRedo}>Redo</button>
    <strong>Clipboard</strong><button type="button" onClick={() => { onCopy(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Copy</button><button type="button" onClick={() => { onCut(); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Cut</button><button type="button" onClick={() => { onPaste(); setHomeOverflowOpen(false); }} disabled={!clipboardAvailable}>Paste</button><button type="button" onClick={() => { onDuplicate(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Duplicate</button>
    <strong>Edit / Selection</strong><button type="button" onClick={() => { onDelete(); setHomeOverflowOpen(false); }} disabled={!hasDeletableSelection}>Delete</button><button type="button" onClick={() => { onRename(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Rename</button><button type="button" onClick={() => { onClearSelection(); setHomeOverflowOpen(false); }}>Clear Selection</button><button type="button" onClick={() => { onSelectAll(); setHomeOverflowOpen(false); }} disabled={document.signals.every((signal) => signal.type === "commentRow")}>Select All</button>
    <strong>Visibility / Arrange</strong><button type="button" onClick={() => { onVisibility(true); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Show</button><button type="button" onClick={() => { onVisibility(false); setHomeOverflowOpen(false); }} disabled={!hasSelectedSignal}>Hide</button><button type="button" onClick={() => { onMoveUp(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Move Up</button><button type="button" onClick={() => { onMoveDown(); setHomeOverflowOpen(false); }} disabled={!hasSelectedEntity}>Move Down</button>
    <strong>View</strong><button type="button" onClick={() => { onZoom(-0.25); setHomeOverflowOpen(false); }}>Zoom −</button><button type="button" onClick={() => { onZoom(0.25); setHomeOverflowOpen(false); }}>Zoom +</button><button type="button" onClick={() => { onSetZoom(0.5); setHomeOverflowOpen(false); }}>Zoom 50%</button><button type="button" onClick={() => { onSetZoom(1); setHomeOverflowOpen(false); }}>Zoom 100%</button><button type="button" onClick={() => { onSetZoom(1.5); setHomeOverflowOpen(false); }}>Zoom 150%</button><button type="button" onClick={() => { onSetZoom(2); setHomeOverflowOpen(false); }}>Zoom 200%</button><button type="button" onClick={() => { onFitSelection(); setHomeOverflowOpen(false); }}>Fit Selection</button><button type="button" onClick={() => { onFitAll(); setHomeOverflowOpen(false); }}>Fit All</button><button type="button" onClick={() => { onToggleGrid(); setHomeOverflowOpen(false); }}>Grid</button><button type="button" onClick={() => { onToggleSnap(); setHomeOverflowOpen(false); }}>Snap</button><button type="button" onClick={() => { onToggleRuler(); setHomeOverflowOpen(false); }}>Ruler</button><button type="button" onClick={() => { onToggleMinimap(); setHomeOverflowOpen(false); }}>MiniMap</button>
    <strong>Document</strong><button type="button" role="menuitem" onClick={() => { onProperties(); setHomeOverflowOpen(false); }}>Document Properties</button><button type="button" role="menuitem" onClick={() => { onShowProblems(); setHomeOverflowOpen(false); }}>Problems</button><button type="button" role="menuitem" onClick={() => { onExport(); setHomeOverflowOpen(false); }}>SVG / PNG / PDF</button><strong>Timeline</strong><button type="button" role="menuitem" onClick={() => { onOpenTimeline(); setHomeOverflowOpen(false); }}>Timeline Editor</button>
  </div>, window.document.body) : null;
  return <section className="ribbon" aria-label={`${tab} Ribbon`} data-testid="ribbon">
    {tab === "File" && <div className="ribbon-group file-group">
      <button type="button" className="ribbon-tool" title={NEW_DOCUMENT_POLICY_DESCRIPTION} onClick={onNew}><RibbonIcon name="i-new" /><span>New</span></button>
      <button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span>Open</span></button>
      <button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span>Save</span></button>
      <button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span>Save As</span></button>
      <div className="ribbon-toggles"><button type="button" onClick={onRecent} title="Open the most recently saved document">Recent</button><button type="button" onClick={onProperties} title={`${document.document.title} · ${document.signals.length} signals`}>Properties</button><button type="button" onClick={onExport}>Export</button></div><b>File</b>
    </div>}
      {tab === "Home" && <>
      <div className="ribbon-major-group" data-major-group="File" aria-label="File commands">
       <div className="ribbon-group home-file-group" aria-label="File"><button type="button" className="ribbon-tool" onClick={onNew}><RibbonIcon name="i-new" /><span data-v1-label="新規">New</span></button><button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span data-v1-label="開く">Open</span></button><button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span data-v1-label="保存">Save</span></button><button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span data-v1-label="名前を付けて保存">Save As</span></button><b>File</b></div>
      </div>
       <div className="ribbon-major-group" data-major-group="Edit" aria-label="Edit commands">
       <div className="ribbon-group home-edit-group" aria-label="Edit"><button type="button" className="ribbon-tool" onClick={onUndo} disabled={!history.canUndo}><RibbonIcon name="i-undo" /><span data-v1-label="元に戻す">Undo</span></button><button type="button" className="ribbon-tool" onClick={onRedo} disabled={!history.canRedo}><RibbonIcon name="i-redo" /><span data-v1-label="やり直し">Redo</span></button><button type="button" className="ribbon-tool" onClick={onCut} disabled={!hasSelectedClipboard}><RibbonIcon name="i-cut" /><span data-v1-label="切取">Cut</span></button><button type="button" className="ribbon-tool" onClick={onCopy} disabled={!hasSelectedClipboard} title="Copy is view-only"><RibbonIcon name="i-copy" /><span data-v1-label="コピー">Copy</span></button><button type="button" className="ribbon-tool" onClick={onPaste} disabled={!clipboardAvailable} title={clipboardStatus}><RibbonIcon name="i-paste" /><span data-v1-label="貼付">Paste</span></button><button type="button" className="ribbon-tool" onClick={onDelete} disabled={!hasDeletableSelection}><RibbonIcon name="i-delete" /><span data-v1-label="削除">Delete</span></button><button type="button" className="ribbon-tool" onClick={onDuplicate} disabled={!hasSelectedClipboard}><RibbonIcon name="i-duplicate" /><span data-v1-label="複製">Duplicate</span></button><small data-testid="clipboard-status">{clipboardStatus}</small><b>Edit</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Time" aria-label="Time commands">
       <div className="ribbon-group home-timeline-group" aria-label="Timeline"><button type="button" className="ribbon-tool" aria-label="Move selected row up" onClick={onMoveUp} disabled={!hasSelectedEntity}><RibbonIcon name="i-up" /><span>Up</span></button><button type="button" className="ribbon-tool" aria-label="Move selected row down" onClick={onMoveDown} disabled={!hasSelectedEntity}><RibbonIcon name="i-down" /><span>Down</span></button><button type="button" className="ribbon-tool" aria-label="Insert one cycle" onClick={() => onCommand({ id: nextCommandId("timeline_insert_one"), type: "timeline.insert", at: range.start, count: 1 })}><RibbonIcon name="i-plus" /><span>Cycle<br />Insert</span></button><button type="button" className="ribbon-tool" aria-label="Delete one cycle" onClick={() => onCommand({ id: nextCommandId("timeline_delete_one"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + 1) })}><RibbonIcon name="i-delete" /><span>Cycle<br />Delete</span></button><button type="button" className="ribbon-tool" aria-label={`Insert ${compactCycleCount} cycles`} onClick={() => onCommand({ id: nextCommandId("timeline_insert_many"), type: "timeline.insert", at: range.start, count: compactCycleCount })}><RibbonIcon name="i-plus" /><span>N Cycle<br />Insert</span></button><button type="button" className="ribbon-tool" aria-label={`Delete ${compactCycleCount} cycles`} onClick={() => onCommand({ id: nextCommandId("timeline_delete_many"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + compactCycleCount) })}><RibbonIcon name="i-delete" /><span>N Cycle<br />Delete</span></button><b>Time</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Transaction" aria-label="Transaction commands">
        <div className="ribbon-group transaction-home-group" aria-label="Transaction"><button type="button" className="ribbon-tool" aria-label="Transaction" onClick={addTransaction}><RibbonIcon name="i-plus" /><span>Transaction<br />Create</span></button><button type="button" className="ribbon-tool" aria-label="Duplicate" onClick={duplicateTransaction} disabled={!selectedTransactionId}><RibbonIcon name="i-duplicate" /><span>Transaction<br />Duplicate</span></button><b>Transaction</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Layout" aria-label="Layout commands">
         <div className="ribbon-group v8-compact-time-group home-layout-group" aria-label="Layout"><button type="button" className="ribbon-tool" aria-label="Align interval" onClick={onOpenTimeline}><RibbonIcon name="i-align-interval" /><span>Align<br />Interval</span></button><button type="button" className="ribbon-tool" aria-label="Group" onClick={() => onCommand({ id: nextCommandId("home_time_group"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), presentation: { collapsed: false, foldStyle: "none" } } })}><RibbonIcon name="i-group" /><span>Group</span></button><button type="button" className="ribbon-tool" aria-label="Auto Layout" onClick={() => onCommand({ id: nextCommandId("home_auto_layout"), type: "document.updateLayout", layout: { ...document.layout, rowHeight: Math.max(24, document.layout.rowHeight), signalSpacing: Math.max(2, document.layout.signalSpacing) } })}><RibbonIcon name="i-auto-layout" /><span>Auto<br />Layout</span></button><b>Layout</b></div>
       </div>
      <div className="ribbon-major-group" data-major-group="Zoom" aria-label="Zoom commands">
       <div className="ribbon-group home-view-group" aria-label="Zoom"><div className="home-zoom-controls"><button type="button" className="ribbon-tool" onClick={() => onZoom(-0.25)}><RibbonIcon name="i-zoom-out" /><span data-v1-label="ズーム−">Zoom<br />Out</span></button><output data-testid="home-zoom-status">{Math.round(zoom * 100)}%</output><button type="button" className="ribbon-tool" onClick={() => onZoom(0.25)}><RibbonIcon name="i-zoom-in" /><span data-v1-label="ズーム＋">Zoom<br />In</span></button><button type="button" className="ribbon-tool" onClick={onFitAll}><RibbonIcon name="i-fit" /><span data-v1-label="全体表示">Fit<br />All</span></button></div><b>Zoom</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Display" aria-label="Display commands">
        <div className="ribbon-group home-display-group" aria-label="Display"><div className="home-display-toggles"><label className="home-toggle"><input data-testid="home-grid-toggle" type="checkbox" checked={gridEnabled} onChange={onToggleGrid} /> Grid</label><label className="home-toggle"><input data-testid="home-minimap-toggle" type="checkbox" checked={minimapEnabled} onChange={onToggleMinimap} /> MiniMap</label><label className="home-toggle"><input data-testid="home-snap-toggle" type="checkbox" checked={snapEnabled} onChange={onToggleSnap} /> Snap</label><label className="home-toggle"><input data-testid="home-ruler-toggle" type="checkbox" checked={rulerEnabled} onChange={onToggleRuler} /> Ruler</label></div><b>Display</b></div>
       </div>
       <div className="ribbon-major-group" data-major-group="Options" aria-label="Options commands">
        <div className="ribbon-group home-overflow-group" aria-label="More Home Commands">
        <button ref={homeOverflowTriggerRef} type="button" className="ribbon-tool home-overflow-trigger" aria-expanded={homeOverflowOpen} aria-controls={homeOverflowOpen ? "home-overflow-menu" : undefined} onClick={() => setHomeOverflowOpen((value) => !value)}><RibbonIcon name="i-more" /><span>More</span></button>
         <b>Options</b>
        </div>
       </div>
    </>}
    {homeOverflowMenu}
    {tab === "Insert" && <div className="insert-ribbon insert-group" data-testid="insert-ribbon">
      <div className="ribbon-major-group insert-slot-group" data-major-group="Signals" aria-label="Signals commands"><DsRibbonGroup ariaLabel="Signals" className="insert-signals-group" label="Signals">
        <DsRibbonButton icon={<InsertSemanticIcon kind="signal" />} onClick={() => insertValueSignal("binary")}>Signal</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="clock" />} onClick={insertClockSignal}>Clock</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="bus" />} onClick={() => insertValueSignal("bus")}>Bus</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="state" />} onClick={() => insertValueSignal("state")}>State</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="event" />} onClick={() => insertValueSignal("event")}>Event</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="pulse" />} onClick={() => insertValueSignal("pulse")}>Pulse</DsRibbonButton>
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Structure" aria-label="Structure commands"><DsRibbonGroup ariaLabel="Structure" className="insert-structure-group" label="Structure"><DsRibbonButton icon={<RibbonIcon name="i-group" />} onClick={insertGroup}>Group</DsRibbonButton><DsRibbonButton icon={<RibbonIcon name="i-spacing" />} onClick={insertSpacer}>Spacer</DsRibbonButton></DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Annotation" aria-label="Annotation commands"><DsRibbonGroup ariaLabel="Annotation" className="insert-annotation-group" label="Annotation">
        <DsRibbonButton icon={<RibbonIcon name="i-comment" />} onClick={insertCommentRow}>Comment</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="marker" />} onClick={() => insertAnnotation("marker")}>Marker</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="range" />} onClick={() => insertAnnotation("range")}>Range</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="text" />} onClick={() => insertAnnotation("text")}>Text</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="dependency" />} onClick={() => insertAnnotation("dependency")}>Dependency</DsRibbonButton>
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="More" aria-label="More Insert commands"><DsRibbonGroup ariaLabel="More" className="insert-more-group" label="More">
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="measurement" />} onClick={() => insertAnnotation("measurement")}>Measurement</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="highlight" />} onClick={() => insertAnnotation("highlight")}>Highlight</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="bracket" />} onClick={() => insertAnnotation("bracket")}>Bracket</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="verticalLine" />} onClick={() => insertAnnotation("verticalLine")}>Vertical Line</DsRibbonButton>
      </DsRibbonGroup></div>
    </div>}
    {tab === "Timeline" && <div className="ribbon-group timeline-group"><TimelineToolbar document={document} range={range} onRange={onRange} onCommand={onCommand} onNavigateBookmark={onNavigateBookmark} /><b>Timeline</b></div>}
    {tab === "Annotation" && <div className="ribbon-group annotation-group"><AnnotationToolbar document={document} range={range} signalId={selectedSignalId} onCreate={onCreateAnnotation} arrowPickStatus={arrowPickStatus} onArmArrow={onArrowPick} /><b>Annotation</b></div>}
    {tab === "View" && <>
      <div className="ribbon-major-group view-slot-group" data-major-group="Show" aria-label="Show commands"><DsRibbonGroup ariaLabel="Show" className="view-show-group" label="Show"><div className="view-display-subgroup" data-display-kind="labels" aria-label="Labels and structure"><span>Labels / Structure</span><DsRibbonToggle dataTestId="view-show-signal-names" checked={showSignalNames} label="Signal Names" onChange={onToggleSignalNames} /><DsRibbonToggle dataTestId="view-show-roles" checked={showRoles} label="Roles" onChange={onToggleRoles} /><DsRibbonToggle dataTestId="view-show-group-background" checked={showGroupBackground} label="Group Background" onChange={onToggleGroupBackground} /></div><div className="view-display-subgroup" data-display-kind="overlays" aria-label="Overlays"><span>Overlays</span><DsRibbonToggle dataTestId="view-show-annotations" checked={showAnnotations} label="Annotations" onChange={onToggleAnnotations} /><DsRibbonToggle dataTestId="view-show-transactions" checked={showTransactions} label="Transactions" onChange={onToggleTransactions} /></div></DsRibbonGroup></div>
       <div className="ribbon-major-group view-slot-group" data-major-group="Panels" aria-label="Panels commands"><DsRibbonGroup ariaLabel="Panels" className="view-panels-group" label="Panels"><DsRibbonToggleButton className="view-mini-tool" ariaLabel="Inspector" checked={inspectorVisible} icon={<RibbonIcon name="i-settings" />} onClick={onToggleInspector}>Inspector</DsRibbonToggleButton><DsRibbonToggleButton className="view-mini-tool" ariaLabel="Bottom Editor" checked={bottomVisible} icon={<RibbonIcon name="i-preview" />} onClick={onToggleBottom}><span>Bottom</span><span>Editor</span></DsRibbonToggleButton><DsRibbonToggleButton dataTestId="view-panel-tree" ariaLabel="Signal Tree" checked={signalTreeVisible} icon={<RibbonIcon name="i-group" />} onClick={onToggleSignalTree}>Signal Tree</DsRibbonToggleButton><DsRibbonToggleButton dataTestId="view-panel-minimap" ariaLabel="MiniMap" checked={minimapEnabled} icon={<RibbonIcon name="i-preview" />} onClick={onToggleMinimap}>MiniMap</DsRibbonToggleButton></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group" data-major-group="Guides" aria-label="Guides commands"><DsRibbonGroup ariaLabel="Guides" className="view-guides-group" label="Guides"><DsRibbonToggle dataTestId="grid-toggle" checked={gridEnabled} label="Grid" onChange={onToggleGrid} /><DsRibbonToggle dataTestId="snap-toggle" checked={snapEnabled} label="Snap" onChange={onToggleSnap} /><DsRibbonToggle dataTestId="ruler-toggle" checked={rulerEnabled} label="Ruler" onChange={onToggleRuler} /></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group view-zoom-slot" data-major-group="Zoom" aria-label="Zoom commands"><DsRibbonGroup ariaLabel="Zoom" className="view-zoom-group" label="Zoom"><DsRibbonButton className="view-mini-tool" ariaLabel="Zoom Out" icon={<RibbonIcon name="i-zoom-out" />} onClick={() => onZoom(-0.25)}><span>Zoom</span><span>Out</span></DsRibbonButton><DsRibbonSelect ariaLabel="Zoom preset" value={String(Math.round(zoom * 100))} onChange={(event) => onSetZoom(Number(event.target.value) / 100)}><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></DsRibbonSelect><output className="view-zoom-status visually-hidden" data-testid="zoom-status" aria-label="Current zoom">{Math.round(zoom * 100)}%</output><DsRibbonButton className="view-mini-tool" ariaLabel="Zoom In" icon={<RibbonIcon name="i-zoom-in" />} onClick={() => onZoom(0.25)}><span>Zoom</span><span>In</span></DsRibbonButton><div className="view-zoom-fit-actions" aria-label="Fit commands"><DsRibbonButton className="view-mini-tool" ariaLabel="Fit All" icon={<RibbonIcon name="i-fit" />} onClick={onFitAll}><span>Fit</span><span>All</span></DsRibbonButton><DsRibbonButton className="view-mini-tool" ariaLabel="Fit Selection" icon={<RibbonIcon name="i-fit" />} onClick={onFitSelection}><span>Fit</span><span>Selection</span></DsRibbonButton></div></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group" data-major-group="Workspace" aria-label="Workspace commands"><DsRibbonGroup ariaLabel="Workspace" className="view-workspace-group" label="Workspace"><div className="view-workspace-settings" aria-label="Workspace settings"><label>Workspace<DsRibbonSelect ariaLabel="Workspace preset" value={workspacePreset} onChange={(event) => onWorkspacePresetChange(event.target.value as WorkspacePreset)}><option value="edit">Edit</option><option value="waveform">Waveform Focus</option><option value="review">Review</option><option value="transaction">Transaction</option></DsRibbonSelect></label><label>Density<DsRibbonSelect ariaLabel="UI density" value={density} onChange={(event) => onDensityChange(event.target.value as DensityMode)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></DsRibbonSelect></label></div><div className="view-workspace-actions" aria-label="Workspace layout actions"><DsRibbonButton className="view-mini-tool" ariaLabel="Reset Layout" icon={<RibbonIcon name="i-settings" />} onClick={() => onWorkspacePresetChange("edit")}><span>Reset</span><span>Layout</span></DsRibbonButton><DsRibbonButton className="view-mini-tool" ariaLabel="Focus Waveform" icon={<RibbonIcon name="i-preview" />} onClick={() => onWorkspacePresetChange("waveform")}><span>Focus</span><span>Waveform</span></DsRibbonButton></div></DsRibbonGroup></div>
    </>}
    {tab === "Review" && <div className="ribbon-group review-group"><ReviewWorkflow diagnostics={diagnostics} document={document} selectedSignalId={selectedSignalId} selectedGroupId={selectedGroupId} onNavigate={onNavigateProblem} onShowProblems={onShowProblems} onRefreshChecks={onRefreshChecks} /><output data-testid="review-problems-count">{problemsCount}</output><b>Review</b></div>}
    {tab === "AI" && <div className="ribbon-group ai-group"><AIOperationPanel document={document} revision={revision} selectedSignalId={selectedSignalId} onCommand={onCommand} icon={<RibbonIcon name="i-ai" />} /><b>AI</b></div>}
  </section>;
}
