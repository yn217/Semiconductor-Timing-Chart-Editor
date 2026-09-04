import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Annotation, AnnotationGroup, AnnotationGroupId, AnnotationId, AnnotationType, CanonicalDocument, ClockSignal, CommentRow, GroupId, JsonObject, SignalId, SignalRole, SpacerId, TimeGroupId, TransactionId, ValueSignal } from "@timing-chart-v2/schema";
import { FontStyleToolbar } from "./font-style-toolbar.js";
import { ArrangeGroup } from "./arrange-group.js";
import { FindReplacePanel } from "./find-replace-panel.js";
import { buildAnnotationStyleCommand } from "./annotation-style-command.js";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import { DsIconBox, DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { RibbonGroup } from "./ribbon-group.js";
import type { RibbonGroupSpec } from "./ribbon-schema.js";
import { InsertSemanticIcon } from "./insert-semantic-icon.js";
import { AnnotationToolbar } from "./annotation-toolbar.js";
import { ReviewWorkflow } from "./review-workflow.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import { TimelineToolbar } from "./timeline-toolbar.js";
import { createAnnotation } from "./create-annotation.js";
import { NEW_DOCUMENT_POLICY_DESCRIPTION } from "./file-document-controller.js";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { resolveGroupInsertionIndex, resolveInsertionTarget } from "./insertion-target.js";

type DensityMode = "compact" | "comfortable";
type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;
const spacerId = (value: string) => value as SpacerId;
function valueSignal(id: string, name: string, role: SignalRole, values: ValueSignal["values"], options: Pick<ValueSignal, "type" | "width" | "displayFormat"> = { type: "binary" }): ValueSignal {
  return { id: signalId(id), name, role, type: options.type, source: { instancePath: ["dut"], signalName: name.toLowerCase() }, display: { name }, values, ...(options.width === undefined ? {} : { width: options.width }), ...(options.displayFormat === undefined ? {} : { displayFormat: options.displayFormat }) };
}

export { Ribbon };

function Ribbon({ tab, document, revision, range, history, zoom, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground, signalTreeVisible, inspectorVisible, bottomVisible, arrowPickStatus, selectedSignalId, selectedInsertionSignalId, selectedGroupId, selectedAnnotation, selectedAnnotationIds, selectedCommentRow, problemsCount, diagnostics, onNavigateProblem, onRefreshChecks, viewMode, density, workspacePreset, onDensityChange, onWorkspacePresetChange, onResetLayout, selectedTransactionId, clipboardStatus, clipboardAvailable, hasSelectedSignal, hasSelectedClipboard, hasSelectedEntity, hasDeletableSelection, canRenameSelection, canMoveUp, canMoveDown, canShowSelection, canHideSelection, onRange, onCommand, onCommandBatch, onCreateAnnotation, onArrowPick, onZoom, onFitSelection, onFitAll, onSetZoom, onNavigateBookmark, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onToggleSignalNames, onToggleRoles, onToggleAnnotations, onToggleTransactions, onToggleGroupBackground, onToggleSignalTree, onUndo, onRedo, onDelete, onNew, onOpen, onSave, onSaveAs, onRecent, onProperties, onExport, onToggleInspector, onToggleBottom, onShowProblems, onCopy, onCut, onPaste, onDuplicate, onRename, onClearSelection, onSelectAll, onMoveUp, onMoveDown, onVisibility, onOpenTimeline, onOpenProperties }: {
  readonly tab: string; readonly document: CanonicalDocument; readonly revision: number; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly zoom: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly minimapEnabled: boolean; readonly showSignalNames: boolean; readonly showRoles: boolean; readonly showAnnotations: boolean; readonly showTransactions: boolean; readonly showGroupBackground: boolean; readonly signalTreeVisible: boolean; readonly inspectorVisible: boolean; readonly bottomVisible: boolean; readonly arrowPickStatus: "idle" | "from" | "to"; readonly selectedSignalId: SignalId | undefined; readonly selectedInsertionSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotation: Annotation | undefined; readonly selectedAnnotationIds: ReadonlySet<AnnotationId>; readonly selectedCommentRow: CommentRow | undefined; readonly problemsCount: number; readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly onNavigateProblem: (path: string) => void; readonly onRefreshChecks: () => void; readonly viewMode: "Cycle" | "Transaction" | "Split"; readonly density: DensityMode; readonly workspacePreset: WorkspacePreset; readonly onDensityChange: (density: DensityMode) => void; readonly onWorkspacePresetChange: (preset: WorkspacePreset) => void; readonly onResetLayout: () => void; readonly selectedTransactionId: TransactionId | undefined;
  readonly clipboardStatus: string; readonly clipboardAvailable: boolean; readonly hasSelectedSignal: boolean; readonly hasSelectedClipboard: boolean; readonly hasSelectedEntity: boolean; readonly hasDeletableSelection: boolean; readonly canRenameSelection: boolean; readonly canMoveUp: boolean; readonly canMoveDown: boolean; readonly canShowSelection: boolean; readonly canHideSelection: boolean;
  readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onCommandBatch: (commands: readonly SemanticCommand[]) => CommandResult; readonly onCreateAnnotation: (annotation: Annotation) => void; readonly onArrowPick: () => void; readonly onZoom: (delta: number) => void; readonly onFitSelection: () => void; readonly onFitAll: () => void; readonly onSetZoom: (zoom: number) => void; readonly onNavigateBookmark: (cycle: number) => void;
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
  const insertValueSignal = (type: "binary" | "bus" | "state" | "logic" | "event" | "pulse") => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = nextEntityId("signal", document);
    const name = type === "event" || type === "pulse" ? `${type.toUpperCase()}_${document.signals.length + 1}` : `SIGNAL_${document.signals.length + 1}`;
    const signal = type === "bus" ? valueSignal(id, name, "internal", [{ start: 0, value: "00" }], { type: "bus", width: 8, displayFormat: "hex" })
      : type === "state" ? valueSignal(id, name, "internal", [{ start: 0, value: "IDLE" }], { type: "state" })
      : type === "event" ? valueSignal(id, name, "internal", [{ start: 0, value: "NONE" }], { type: "event" })
      : valueSignal(id, name, "internal", [{ start: 0, value: 0 }], { type });
    onCommand({ id: nextCommandId("insert_signal"), type: "signal.create", signal, targetGroupId: target.group.id, index: target.index });
  };
  const insertClockSignal = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = signalId(nextEntityId("signal", document));
    const name = `CLOCK_${document.signals.length + 1}`;
    const signal: ClockSignal = { id, name, type: "clock", role: "internal", source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } };
    onCommand({ id: nextCommandId("insert_clock"), type: "signal.create", signal, targetGroupId: target.group.id, index: target.index });
  };
  const insertGroup = () => {
    const id = groupId(nextEntityId("group", document));
    onCommand({ id: nextCommandId("insert_group"), type: "group.create", group: { id, name: `Group ${document.signalGroups.length + 1}`, rows: [] }, index: resolveGroupInsertionIndex(document, selectedInsertionSignalId, selectedGroupId) });
  };
  const insertCommentRow = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = signalId(nextEntityId("commentRow", document));
    const name = `Comment ${document.signals.length + 1}`;
    const commentRow: CommentRow = { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" };
    onCommand({ id: nextCommandId("insert_comment_row"), type: "commentRow.create", commentRow, targetGroupId: target.group.id, index: target.index });
  };
  const insertSpacer = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    onCommand({ id: nextCommandId("insert_spacer"), type: "spacer.create", spacer: { id: spacerId(nextEntityId("spacer", document)), height: 24 }, targetGroupId: target.group.id, index: target.index });
  };
  const insertAnnotation = (type: AnnotationType) => {
    if (!selectedSignalId) return;
    onCreateAnnotation(createAnnotation(type, selectedSignalId, range, document));
  };
  // Same "range" annotation type/anchors as the plain Range/Bracket buttons,
  // just with a bidirectional arrowhead instead of none -- a <----> span
  // indicator, no new schema field needed (Annotation.arrowhead already
  // supports "bidirectional").
  const insertRangeArrow = () => {
    if (!selectedSignalId) return;
    onCreateAnnotation(createAnnotation("arrow", selectedSignalId, range, document, undefined, "bidirectional"));
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
    <strong>Clipboard</strong><button type="button" onClick={() => { onCopy(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Copy</button><button type="button" onClick={() => { onCut(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Cut</button><button type="button" onClick={() => { onPaste(); setHomeOverflowOpen(false); }} disabled={!clipboardAvailable}>Paste</button><button type="button" onClick={() => { onDuplicate(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Duplicate</button>
    <strong>Edit / Selection</strong><button type="button" onClick={() => { onDelete(); setHomeOverflowOpen(false); }} disabled={!hasDeletableSelection}>Delete</button><button type="button" onClick={() => { onRename(); setHomeOverflowOpen(false); }} disabled={!canRenameSelection}>Rename</button><button type="button" onClick={() => { onClearSelection(); setHomeOverflowOpen(false); }}>Clear Selection</button><button type="button" onClick={() => { onSelectAll(); setHomeOverflowOpen(false); }} disabled={document.signals.every((signal) => signal.type === "commentRow")}>Select All Signals</button>
    <strong>Visibility / Arrange</strong><button type="button" onClick={() => { onVisibility(true); setHomeOverflowOpen(false); }} disabled={!canShowSelection}>Show</button><button type="button" onClick={() => { onVisibility(false); setHomeOverflowOpen(false); }} disabled={!canHideSelection}>Hide</button><button type="button" onClick={() => { onMoveUp(); setHomeOverflowOpen(false); }} disabled={!canMoveUp}>Move Up</button><button type="button" onClick={() => { onMoveDown(); setHomeOverflowOpen(false); }} disabled={!canMoveDown}>Move Down</button>
    <strong>View</strong><button type="button" onClick={() => { onZoom(-0.25); setHomeOverflowOpen(false); }}>Zoom −</button><button type="button" onClick={() => { onZoom(0.25); setHomeOverflowOpen(false); }}>Zoom +</button><button type="button" onClick={() => { onSetZoom(0.5); setHomeOverflowOpen(false); }}>Zoom 50%</button><button type="button" onClick={() => { onSetZoom(1); setHomeOverflowOpen(false); }}>Zoom 100%</button><button type="button" onClick={() => { onSetZoom(1.5); setHomeOverflowOpen(false); }}>Zoom 150%</button><button type="button" onClick={() => { onSetZoom(2); setHomeOverflowOpen(false); }}>Zoom 200%</button><button type="button" onClick={() => { onFitSelection(); setHomeOverflowOpen(false); }}>Fit Selection</button><button type="button" onClick={() => { onFitAll(); setHomeOverflowOpen(false); }}>Fit All</button><button type="button" onClick={() => { onToggleGrid(); setHomeOverflowOpen(false); }}>Grid</button><button type="button" onClick={() => { onToggleSnap(); setHomeOverflowOpen(false); }}>Snap</button><button type="button" onClick={() => { onToggleRuler(); setHomeOverflowOpen(false); }}>Ruler</button><button type="button" onClick={() => { onToggleMinimap(); setHomeOverflowOpen(false); }}>MiniMap</button>
    <strong>Document</strong><button type="button" role="menuitem" onClick={() => { onProperties(); setHomeOverflowOpen(false); }}>Document Properties</button><button type="button" role="menuitem" onClick={() => { onShowProblems(); setHomeOverflowOpen(false); }}>Problems</button><button type="button" role="menuitem" onClick={() => { onExport(); setHomeOverflowOpen(false); }}>SVG / PNG / PDF</button><strong>Timeline</strong><button type="button" role="menuitem" onClick={() => { onOpenTimeline(); setHomeOverflowOpen(false); }}>Timeline Editor</button>
  </div>, window.document.body) : null;
  const homeGroups: readonly RibbonGroupSpec[] = [
    {
      id: "file", majorGroup: "File", caption: "File", items: [
        { kind: "button", id: "new", icon: "i-new", label: "New", v1Label: "新規", onClick: onNew },
        { kind: "button", id: "open", icon: "i-open", label: "Open", v1Label: "開く", onClick: onOpen },
        { kind: "button", id: "save", icon: "i-save", label: "Save", v1Label: "保存", onClick: onSave },
        { kind: "button", id: "save-as", icon: "i-save", label: "Save As", v1Label: "名前を付けて保存", onClick: onSaveAs },
      ],
    },
    {
      id: "edit", majorGroup: "Edit", caption: "Edit", items: [
        { kind: "button", id: "undo", icon: "i-undo", label: "Undo", v1Label: "元に戻す", onClick: onUndo, disabled: !history.canUndo },
        { kind: "button", id: "redo", icon: "i-redo", label: "Redo", v1Label: "やり直し", onClick: onRedo, disabled: !history.canRedo },
        // hasSelectedClipboard (not hasSelectedSignal): the actual cut()
        // handler supports Signal/Group/Spacer/Transaction/Annotation, and
        // Context Menu's Cut already gates on hasSelectedClipboard -- this
        // button previously used the narrower hasSelectedSignal, disabling
        // Cut for a selected Annotation/Group/Transaction even though the
        // command router fully supports it (#195).
        { kind: "button", id: "cut", icon: "i-cut", label: "Cut", v1Label: "切取", onClick: onCut, disabled: !hasSelectedClipboard },
        { kind: "button", id: "copy", icon: "i-copy", label: "Copy", v1Label: "コピー", onClick: onCopy, disabled: !hasSelectedClipboard, title: "Copy is view-only" },
        { kind: "button", id: "paste", icon: "i-paste", label: "Paste", v1Label: "貼付", onClick: onPaste, disabled: !clipboardAvailable, title: clipboardStatus },
        { kind: "button", id: "delete", icon: "i-delete", label: "Delete", v1Label: "削除", onClick: onDelete, disabled: !hasDeletableSelection },
        { kind: "button", id: "duplicate", icon: "i-duplicate", label: "Duplicate", v1Label: "複製", onClick: onDuplicate, disabled: !hasSelectedClipboard },
        { kind: "button", id: "select-all", icon: "i-select-all", label: "Select All Signals", ariaLabel: "Select All Signals", onClick: onSelectAll, disabled: document.signals.every((signal) => signal.type === "commentRow") },
        { kind: "custom", id: "find-replace", render: () => <FindReplacePanel key="find-replace" document={document} onCommandBatch={onCommandBatch} /> },
        { kind: "custom", id: "clipboard-status", render: () => <small key="clipboard-status" data-testid="clipboard-status">{clipboardStatus}</small> },
      ],
    },
    {
      id: "timeline", majorGroup: "Time", caption: "Time", items: [
        { kind: "button", id: "row-up", icon: "i-up", label: "Up", ariaLabel: "Move selected row up", onClick: onMoveUp, disabled: !canMoveUp },
        { kind: "button", id: "row-down", icon: "i-down", label: "Down", ariaLabel: "Move selected row down", onClick: onMoveDown, disabled: !canMoveDown },
        { kind: "button", id: "cycle-insert", icon: "i-plus", label: "Cycle Insert", ariaLabel: "Insert one cycle", onClick: () => onCommand({ id: nextCommandId("timeline_insert_one"), type: "timeline.insert", at: range.start, count: 1 }) },
        { kind: "button", id: "cycle-delete", icon: "i-delete", label: "Cycle Delete", ariaLabel: "Delete one cycle", onClick: () => onCommand({ id: nextCommandId("timeline_delete_one"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + 1) }) },
        { kind: "button", id: "n-cycle-insert", icon: "i-plus", label: "N Cycle Insert", ariaLabel: `Insert ${compactCycleCount} cycles`, onClick: () => onCommand({ id: nextCommandId("timeline_insert_many"), type: "timeline.insert", at: range.start, count: compactCycleCount }) },
        { kind: "button", id: "n-cycle-delete", icon: "i-delete", label: "N Cycle Delete", ariaLabel: `Delete ${compactCycleCount} cycles`, onClick: () => onCommand({ id: nextCommandId("timeline_delete_many"), type: "timeline.delete", start: range.start, end: Math.min(document.timeline.cycleCount, range.start + compactCycleCount) }) },
      ],
    },
    {
      id: "transaction", majorGroup: "Transaction", caption: "Transaction", items: [
        { kind: "button", id: "transaction-create", icon: "i-plus", label: "Create", ariaLabel: "Create Transaction", onClick: addTransaction },
        { kind: "button", id: "transaction-duplicate", icon: "i-duplicate", label: "Duplicate", ariaLabel: "Duplicate Transaction", onClick: duplicateTransaction, disabled: !selectedTransactionId },
      ],
    },
    {
      id: "layout", majorGroup: "Layout", caption: "Layout", items: [
        { kind: "button", id: "align-interval", icon: "i-align-interval", label: "Align Interval", ariaLabel: "Align interval", onClick: onOpenTimeline },
        { kind: "button", id: "group", icon: "i-group", label: "Group", ariaLabel: "Group", onClick: () => onCommand({ id: nextCommandId("home_time_group"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), presentation: { collapsed: false, foldStyle: "none" } } }) },
        { kind: "button", id: "auto-layout", icon: "i-auto-layout", label: "Auto Layout", ariaLabel: "Auto Layout", onClick: () => onCommand({ id: nextCommandId("home_auto_layout"), type: "document.updateLayout", layout: { ...document.layout, rowHeight: Math.max(24, document.layout.rowHeight), signalSpacing: Math.max(2, document.layout.signalSpacing) } }) },
      ],
    },
    {
      id: "view", majorGroup: "Zoom", caption: "Zoom", items: [
        { kind: "button", id: "zoom-out", icon: "i-zoom-out", label: "Zoom Out", v1Label: "ズーム−", onClick: () => onZoom(-0.25) },
        { kind: "button", id: "zoom-reset", icon: "i-zoom-reset", label: "100%", ariaLabel: "Reset zoom to 100%", onClick: () => onSetZoom(1) },
        { kind: "button", id: "zoom-in", icon: "i-zoom-in", label: "Zoom In", v1Label: "ズーム＋", onClick: () => onZoom(0.25) },
        { kind: "button", id: "fit-all", icon: "i-fit", label: "Fit All", v1Label: "全体表示", onClick: onFitAll },
        { kind: "button", id: "fit-selection", icon: "i-select-fit", label: "Fit Selection", onClick: onFitSelection },
      ],
    },
    {
      id: "display", majorGroup: "Display", caption: "Display", items: [
        { kind: "toggle", id: "grid", label: "Grid", testId: "home-grid-toggle", checked: gridEnabled, onChange: onToggleGrid },
        { kind: "toggle", id: "minimap", label: "MiniMap", testId: "home-minimap-toggle", checked: minimapEnabled, onChange: onToggleMinimap },
        { kind: "toggle", id: "snap", label: "Snap", testId: "home-snap-toggle", checked: snapEnabled, onChange: onToggleSnap },
        { kind: "toggle", id: "ruler", label: "Ruler", testId: "home-ruler-toggle", checked: rulerEnabled, onChange: onToggleRuler },
      ],
    },
  ];
  // Arrange group targets: the current multi-selection if there is one,
  // otherwise the single selected Annotation, otherwise nothing (every
  // Arrange handler stays undefined -> ArrangeGroup renders disabled).
  const arrangeTargetIds: readonly AnnotationId[] = selectedAnnotationIds.size > 0 ? [...selectedAnnotationIds] : selectedAnnotation ? [selectedAnnotation.id] : [];
  const arrangeGroup = arrangeTargetIds.length > 0 ? (document.annotationGroups ?? []).find((group) => group.annotationIds.includes(arrangeTargetIds[0]!)) : undefined;
  const arrangeHandlers = arrangeTargetIds.length === 0 ? {} : {
    onBringToFront: () => onCommandBatch(arrangeTargetIds.map((annotationId) => ({ id: nextCommandId("annotation_bring_front"), type: "annotation.bringToFront" as const, annotationId }))),
    onSendToBack: () => onCommandBatch(arrangeTargetIds.map((annotationId) => ({ id: nextCommandId("annotation_send_back"), type: "annotation.sendToBack" as const, annotationId }))),
    onRotateRight: () => onCommandBatch(arrangeTargetIds.map((annotationId) => ({ id: nextCommandId("annotation_rotate"), type: "annotation.setRotation" as const, annotationId, rotation: (((document.annotations.find((item) => item.id === annotationId)?.rotation ?? 0) + 90) % 360 + 360) % 360 }))),
    onRotateLeft: () => onCommandBatch(arrangeTargetIds.map((annotationId) => ({ id: nextCommandId("annotation_rotate"), type: "annotation.setRotation" as const, annotationId, rotation: (((document.annotations.find((item) => item.id === annotationId)?.rotation ?? 0) - 90) % 360 + 360) % 360 }))),
    ...(arrangeTargetIds.length >= 2 && !arrangeGroup ? { onGroup: () => onCommand({ id: nextCommandId("annotation_group_create"), type: "annotationGroup.create", group: { id: nextEntityId("annotationGroup", document) as AnnotationGroupId, annotationIds: arrangeTargetIds } satisfies AnnotationGroup }) } : {}),
    ...(arrangeGroup ? { onUngroup: () => onCommand({ id: nextCommandId("annotation_group_delete"), type: "annotationGroup.delete", groupId: arrangeGroup.id }) } : {}),
    // Align brings every selected Annotation's label onto the same row
    // (matches the first selected id's labelOffset.y) -- reuses the
    // existing single-annotation annotation.updateLabelOffset command,
    // just batched, rather than inventing a new command type for it.
    ...(arrangeTargetIds.length >= 2 ? { onAlign: () => {
      const targets = arrangeTargetIds.flatMap((id) => { const found = document.annotations.find((item) => item.id === id); return found ? [found] : []; });
      const reference = targets[0];
      if (targets.length < 2 || !reference) return;
      const referenceY = reference.labelOffset?.y ?? -14;
      onCommandBatch(targets.map((annotation) => ({ id: nextCommandId("annotation_align"), type: "annotation.updateLabelOffset" as const, annotationId: annotation.id, labelOffset: { x: annotation.labelOffset?.x ?? 0, y: referenceY } })));
    } } : {}),
    onLock: () => onCommandBatch(arrangeTargetIds.map((annotationId) => ({ id: nextCommandId("annotation_lock"), type: "annotation.setLocked" as const, annotationId, locked: true }))),
    onUnlock: () => onCommandBatch(arrangeTargetIds.map((annotationId) => ({ id: nextCommandId("annotation_unlock"), type: "annotation.setLocked" as const, annotationId, locked: false }))),
    // Same width: match every OTHER selected annotation's start-end cycle
    // span to the first selected one's. Types without start/end (arrow,
    // callout, marker, ...) are silently skipped rather than failing the
    // whole batch, since a mixed selection is common.
    ...(arrangeTargetIds.length >= 2 ? (() => {
      const targets = arrangeTargetIds.flatMap((id) => { const found = document.annotations.find((item) => item.id === id); return found ? [found] : []; });
      const reference = targets.find((item) => item.start && item.end);
      const spanCycles = reference?.start && reference.end ? reference.end.cycle - reference.start.cycle : undefined;
      const rest = spanCycles === undefined ? [] : targets.filter((item) => item.id !== reference?.id && item.start && item.end);
      return spanCycles === undefined || rest.length === 0 ? {} : { onMatchSpan: () => onCommandBatch(rest.map((annotation) => ({ id: nextCommandId("annotation_match_span"), type: "annotation.matchSpan" as const, annotationId: annotation.id, spanCycles }))) };
    })() : {}),
  };
  return <section className="ribbon" aria-label={`${tab} Ribbon`} data-testid="ribbon">
    {tab === "File" && <div className="ribbon-group file-group">
      <button type="button" className="ribbon-tool" title={NEW_DOCUMENT_POLICY_DESCRIPTION} onClick={onNew}><RibbonIcon name="i-new" /><span>New</span></button>
      <button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span>Open</span></button>
      <button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span>Save</span></button>
      <button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span>Save As</span></button>
      <div className="ribbon-toggles"><button type="button" onClick={onRecent} title="Open the most recently saved document">Recent</button><button type="button" onClick={onProperties} title={`${document.document.title} · ${document.signals.length} signals`}>Properties</button><button type="button" onClick={onExport}>Export</button></div><b>File</b>
    </div>}
      {tab === "Home" && <>
      {homeGroups.map((group) => <RibbonGroup key={group.id} spec={group} />)}
      <div className="ribbon-major-group" data-major-group="Options" data-ribbon-home aria-label="Options commands">
        <DsRibbonGroup ariaLabel="Options" className="home-options-group" label="Options">
          <button ref={homeOverflowTriggerRef} type="button" className="ds-ribbon-button home-overflow-trigger" aria-expanded={homeOverflowOpen} aria-controls={homeOverflowOpen ? "home-overflow-menu" : undefined} onClick={() => setHomeOverflowOpen((value) => !value)}><DsIconBox><RibbonIcon name="i-more" /></DsIconBox><span className="ds-ribbon-label">More</span></button>
        </DsRibbonGroup>
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
    {tab === "Timeline" && <div className="ribbon-group timeline-group"><TimelineToolbar document={document} range={range} onRange={onRange} onCommand={onCommand} onCommandBatch={onCommandBatch} onNavigateBookmark={onNavigateBookmark} /><b>Timeline</b></div>}
    {tab === "Annotation" && <>
      <div className="ribbon-group annotation-group"><AnnotationToolbar document={document} range={range} signalId={selectedSignalId} onCreate={onCreateAnnotation} arrowPickStatus={arrowPickStatus} onArmArrow={onArrowPick} /><b>Annotation</b></div>
      <div className="ribbon-major-group" data-major-group="Font" aria-label="Font commands">
        <DsRibbonGroup ariaLabel="Font" className="annotation-font-group" label="Font">
          <FontStyleToolbar
            idPrefix="ribbon-annotation-font"
            disabled={!selectedAnnotation && !selectedCommentRow}
            style={selectedAnnotation?.style ?? selectedCommentRow?.display.style}
            onChange={(style: JsonObject) => {
              if (selectedAnnotation) onCommand(buildAnnotationStyleCommand(selectedAnnotation, style, nextCommandId("ribbon_annotation_font")));
              else if (selectedCommentRow) onCommand({ id: nextCommandId("ribbon_comment_row_font"), type: "commentRow.update", signalId: selectedCommentRow.id, title: selectedCommentRow.title, body: selectedCommentRow.body, displayStyle: style });
            }}
          />
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Shapes" aria-label="Shape commands">
        <DsRibbonGroup ariaLabel="Shapes" className="annotation-shapes-group" label="Shapes">
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-arrow-annotation" />} onClick={() => insertAnnotation("arrow")}>Arrow</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-range-arrow" />} onClick={insertRangeArrow}>Range</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-brace" />} onClick={() => insertAnnotation("bracket")}>Brace</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-callout" />} onClick={() => insertAnnotation("callout")}>Callout</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-rectangle" />} onClick={() => insertAnnotation("rectangle")}>Rectangle</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-ellipse" />} onClick={() => insertAnnotation("ellipse")}>Ellipse</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-connector" />} onClick={() => insertAnnotation("connector")}>Connector</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-textbox" />} onClick={() => insertAnnotation("textbox")}>Text Box</DsRibbonButton>
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Paragraph" aria-label="Paragraph commands">
        <DsRibbonGroup ariaLabel="Paragraph" className="annotation-paragraph-group" label="Paragraph">
          <DsRibbonButton ariaLabel="Align left" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-left" />} onClick={() => selectedAnnotation && onCommand({ id: nextCommandId("annotation_align"), type: "annotation.setAlign", annotationId: selectedAnnotation.id, align: "left" })}>Left</DsRibbonButton>
          <DsRibbonButton ariaLabel="Align center" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-center" />} onClick={() => selectedAnnotation && onCommand({ id: nextCommandId("annotation_align"), type: "annotation.setAlign", annotationId: selectedAnnotation.id, align: "center" })}>Center</DsRibbonButton>
          <DsRibbonButton ariaLabel="Align right" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-right" />} onClick={() => selectedAnnotation && onCommand({ id: nextCommandId("annotation_align"), type: "annotation.setAlign", annotationId: selectedAnnotation.id, align: "right" })}>Right</DsRibbonButton>
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Arrange" aria-label="Arrange commands">
        <DsRibbonGroup ariaLabel="Arrange" className="annotation-arrange-group" label="Arrange">
          <ArrangeGroup {...arrangeHandlers} />
        </DsRibbonGroup>
      </div>
    </>}
    {tab === "View" && <>
      <div className="ribbon-major-group view-slot-group" data-major-group="Show" aria-label="Show commands"><DsRibbonGroup ariaLabel="Show" className="view-show-group" label="Show"><div className="view-display-subgroup" data-display-kind="labels" aria-label="Labels and structure"><span>Labels / Structure</span><DsRibbonToggle dataTestId="view-show-signal-names" checked={showSignalNames} label="Signal Names" onChange={onToggleSignalNames} /><DsRibbonToggle dataTestId="view-show-roles" checked={showRoles} label="Roles" onChange={onToggleRoles} /><DsRibbonToggle dataTestId="view-show-group-background" checked={showGroupBackground} label="Group Background" onChange={onToggleGroupBackground} /></div><div className="view-display-subgroup" data-display-kind="overlays" aria-label="Overlays"><span>Overlays</span><DsRibbonToggle dataTestId="view-show-annotations" checked={showAnnotations} label="Annotations" onChange={onToggleAnnotations} /><DsRibbonToggle dataTestId="view-show-transactions" checked={showTransactions} label="Transactions" onChange={onToggleTransactions} /></div></DsRibbonGroup></div>
       <div className="ribbon-major-group view-slot-group" data-major-group="Panels" aria-label="Panels commands"><DsRibbonGroup ariaLabel="Panels" className="view-panels-group" label="Panels"><DsRibbonToggleButton className="view-mini-tool" ariaLabel="Inspector" checked={inspectorVisible} icon={<RibbonIcon name="i-settings" />} onClick={onToggleInspector}>Inspector</DsRibbonToggleButton><DsRibbonToggleButton className="view-mini-tool" ariaLabel="Bottom Editor" checked={bottomVisible} icon={<RibbonIcon name="i-preview" />} onClick={onToggleBottom}><span>Bottom</span><span>Editor</span></DsRibbonToggleButton><DsRibbonToggleButton dataTestId="view-panel-tree" ariaLabel="Signal Tree" checked={signalTreeVisible} icon={<RibbonIcon name="i-group" />} onClick={onToggleSignalTree}>Signal Tree</DsRibbonToggleButton><DsRibbonToggleButton dataTestId="view-panel-minimap" ariaLabel="MiniMap" checked={minimapEnabled} icon={<RibbonIcon name="i-preview" />} onClick={onToggleMinimap}>MiniMap</DsRibbonToggleButton></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group" data-major-group="Guides" aria-label="Guides commands"><DsRibbonGroup ariaLabel="Guides" className="view-guides-group" label="Guides"><DsRibbonToggle dataTestId="grid-toggle" checked={gridEnabled} label="Grid" onChange={onToggleGrid} /><DsRibbonToggle dataTestId="snap-toggle" checked={snapEnabled} label="Snap" onChange={onToggleSnap} /><DsRibbonToggle dataTestId="ruler-toggle" checked={rulerEnabled} label="Ruler" onChange={onToggleRuler} /></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group view-zoom-slot" data-major-group="Zoom" aria-label="Zoom commands"><DsRibbonGroup ariaLabel="Zoom" className="view-zoom-group" label="Zoom"><DsRibbonButton className="view-mini-tool" ariaLabel="Zoom Out" icon={<RibbonIcon name="i-zoom-out" />} onClick={() => onZoom(-0.25)}><span>Zoom</span><span>Out</span></DsRibbonButton><DsRibbonSelect ariaLabel="Zoom preset" value={String(Math.round(zoom * 100))} onChange={(event) => onSetZoom(Number(event.target.value) / 100)}><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option></DsRibbonSelect><output className="view-zoom-status visually-hidden" data-testid="zoom-status" aria-label="Current zoom">{Math.round(zoom * 100)}%</output><DsRibbonButton className="view-mini-tool" ariaLabel="Zoom In" icon={<RibbonIcon name="i-zoom-in" />} onClick={() => onZoom(0.25)}><span>Zoom</span><span>In</span></DsRibbonButton><div className="view-zoom-fit-actions" aria-label="Fit commands"><DsRibbonButton className="view-mini-tool" ariaLabel="Fit All" icon={<RibbonIcon name="i-fit" />} onClick={onFitAll}><span>Fit</span><span>All</span></DsRibbonButton><DsRibbonButton className="view-mini-tool" ariaLabel="Fit Selection" icon={<RibbonIcon name="i-fit" />} onClick={onFitSelection}><span>Fit</span><span>Selection</span></DsRibbonButton></div></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group" data-major-group="Workspace" aria-label="Workspace commands"><DsRibbonGroup ariaLabel="Workspace" className="view-workspace-group" label="Workspace"><div className="view-workspace-settings" aria-label="Workspace settings"><label>Workspace<DsRibbonSelect ariaLabel="Workspace preset" value={workspacePreset} onChange={(event) => onWorkspacePresetChange(event.target.value as WorkspacePreset)}><option value="edit">Edit</option><option value="waveform">Waveform Focus</option><option value="review">Review</option><option value="transaction">Transaction</option></DsRibbonSelect></label><label>Density<DsRibbonSelect ariaLabel="UI density" value={density} onChange={(event) => onDensityChange(event.target.value as DensityMode)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></DsRibbonSelect></label></div></DsRibbonGroup></div>
      <div className="ribbon-major-group view-slot-group" data-major-group="Layout" aria-label="Layout commands"><DsRibbonGroup ariaLabel="Layout" className="view-layout-group" label="Layout"><DsRibbonButton className="view-mini-tool" ariaLabel="Reset Layout" icon={<RibbonIcon name="i-settings" />} onClick={onResetLayout}><span>Reset</span><span>Layout</span></DsRibbonButton><DsRibbonButton className="view-mini-tool" ariaLabel="Focus Waveform" icon={<RibbonIcon name="i-preview" />} onClick={() => onWorkspacePresetChange(workspacePreset === "waveform" ? "edit" : "waveform")}><span>{workspacePreset === "waveform" ? "Restore" : "Focus"}</span><span>{workspacePreset === "waveform" ? "Panels" : "Waveform"}</span></DsRibbonButton></DsRibbonGroup></div>
    </>}
    {tab === "Review" && <div className="ribbon-group review-group"><ReviewWorkflow diagnostics={diagnostics} document={document} selectedSignalId={selectedSignalId} selectedGroupId={selectedGroupId} onNavigate={onNavigateProblem} onShowProblems={onShowProblems} onRefreshChecks={onRefreshChecks} /><output data-testid="review-problems-count">{problemsCount}</output><b>Review</b></div>}
    {tab === "AI" && <div className="ribbon-group ai-group"><AIOperationPanel document={document} revision={revision} selectedSignalId={selectedSignalId} onCommand={onCommand} onCommandBatch={onCommandBatch} icon={<RibbonIcon name="i-ai" />} /><b>AI</b></div>}
  </section>;
}
