import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Annotation, AnnotationGroup, AnnotationGroupId, AnnotationId, AnnotationType, BookmarkId, CanonicalDocument, ClockSignal, CommentRow, DocumentProblem, GroupId, JsonObject, SignalId, SignalRole, SpacerId, TimeGroupId, TransactionId, ValueSignal } from "@timing-chart-v2/schema";
import { FontStyleToolbar } from "./font-style-toolbar.js";
import { ArrangeGroup } from "./arrange-group.js";
import { FindReplacePanel } from "./find-replace-panel.js";
import { TransactionTimeScalePanel } from "./transaction-time-scale-panel.js";
import { annotationPropertiesBase } from "./annotation-style-command.js";
import type { HistoryState } from "@timing-chart-v2/history";
import { DsIconBox, DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { RibbonGroup } from "./ribbon-group.js";
import type { RibbonGroupSpec } from "./ribbon-schema.js";
import { composeRibbon } from "./ribbon-composition.js";
import type { ActiveContext } from "./workspace/use-workspace-ui-state.js";
import { InsertSemanticIcon } from "./insert-semantic-icon.js";
import { AnnotationToolbar } from "./annotation-toolbar.js";
import { ReviewWorkflow } from "./review-workflow.js";
import { TimelineToolbar } from "./timeline-toolbar.js";
import { createAnnotation } from "./create-annotation.js";
import { NEW_DOCUMENT_POLICY_DESCRIPTION } from "./file-document-controller.js";
import { nextEntityId } from "./entity-id.js";
import { resolveGroupInsertionIndex, resolveInsertionTarget } from "./insertion-target.js";
import type { AIViewIntent } from "./ai-proposal-provider.js";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";

type DensityMode = "compact" | "comfortable";
type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;
const spacerId = (value: string) => value as SpacerId;
function valueSignal(id: string, name: string, role: SignalRole, values: ValueSignal["values"], options: Pick<ValueSignal, "type" | "width" | "displayFormat"> = { type: "binary" }): ValueSignal {
  return { id: signalId(id), name, role, type: options.type, source: { instancePath: ["dut"], signalName: name.toLowerCase() }, display: { name }, values, ...(options.width === undefined ? {} : { width: options.width }), ...(options.displayFormat === undefined ? {} : { displayFormat: options.displayFormat }) };
}

export { Ribbon };

function Ribbon({ tab, document, revision, range, history, zoom, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, signalSplitEnabled, onToggleSignalSplit, showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground, signalTreeVisible, inspectorVisible, bottomVisible, bottomHeight, onSetBottomSize, arrowPickStatus, selectedSignalId, selectedInsertionSignalId, selectedGroupId, selectedAnnotation, selectedAnnotationIds, selectedCommentRow, problemsCount, diagnostics, onNavigateProblem, onRefreshChecks, onDiagnostic, viewMode, activeContext, density, workspacePreset, onDensityChange, onWorkspacePresetChange, onResetLayout, selectedTransactionId, clipboardStatus, clipboardAvailable, hasSelectedSignal, hasSelectedClipboard, hasSelectedEntity, hasDeletableSelection, canRenameSelection, canMoveUp, canMoveDown, canShowSelection, canHideSelection, onSignalCreated, onGroupCreated, onSpacerCreated, onTransactionCreated, onRange, onViewIntent, onCreateAnnotation, onArrowPick, onZoom, onFitSelection, onFitAll, onSetZoom, onNavigateBookmark, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onToggleSignalNames, onToggleRoles, onToggleAnnotations, onToggleTransactions, onToggleGroupBackground, onToggleSignalTree, onUndo, onRedo, onDelete, onNew, onOpen, onSave, onSaveAs, onRecent, onProperties, onExport, onToggleInspector, onToggleBottom, onShowProblems, onCopy, onCut, onPaste, onDuplicate, onRename, onClearSelection, onSelectAll, onMoveUp, onMoveDown, onVisibility, onOpenTimeline, onOpenProperties, onOpenBookmarks, onOpenAIAssistant, aiBridgeStatus, commands }: {
  readonly tab: string; readonly document: CanonicalDocument; readonly revision: number; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly zoom: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly minimapEnabled: boolean; readonly signalSplitEnabled: boolean; readonly onToggleSignalSplit: () => void; readonly showSignalNames: boolean; readonly showRoles: boolean; readonly showAnnotations: boolean; readonly showTransactions: boolean; readonly showGroupBackground: boolean; readonly signalTreeVisible: boolean; readonly inspectorVisible: boolean; readonly bottomVisible: boolean; readonly bottomHeight: number; readonly onSetBottomSize: (size: "hidden" | "compact" | "expanded") => void; readonly arrowPickStatus: "idle" | "from" | "to"; readonly selectedSignalId: SignalId | undefined; readonly selectedInsertionSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotation: Annotation | undefined; readonly selectedAnnotationIds: ReadonlySet<AnnotationId>; readonly selectedCommentRow: CommentRow | undefined; readonly problemsCount: number; readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly onNavigateProblem: (path: string) => void; readonly onRefreshChecks: () => void; readonly onDiagnostic: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void; readonly viewMode: "Cycle" | "Transaction" | "Split"; readonly activeContext: ActiveContext; readonly density: DensityMode; readonly workspacePreset: WorkspacePreset; readonly onDensityChange: (density: DensityMode) => void; readonly onWorkspacePresetChange: (preset: WorkspacePreset) => void; readonly onResetLayout: () => void; readonly selectedTransactionId: TransactionId | undefined;
  readonly clipboardStatus: string; readonly clipboardAvailable: boolean; readonly hasSelectedSignal: boolean; readonly hasSelectedClipboard: boolean; readonly hasSelectedEntity: boolean; readonly hasDeletableSelection: boolean; readonly canRenameSelection: boolean; readonly canMoveUp: boolean; readonly canMoveDown: boolean; readonly canShowSelection: boolean; readonly canHideSelection: boolean;
  // Same "select the thing that was just created" contract the Left Tree's
  // own +Add button already follows: without it, Ribbon Insert leaves
  // whatever was selected before in place, so the newly inserted row isn't
  // immediately reachable for rename/edit without an extra manual click.
  readonly onSignalCreated: (signalId: SignalId) => void; readonly onGroupCreated: (groupId: GroupId) => void; readonly onSpacerCreated: (groupId: GroupId, spacerId: SpacerId) => void; readonly onTransactionCreated: (transactionId: TransactionId) => void;
  readonly onRange: (range: { start: number; end: number }) => void; readonly onViewIntent: (intent: AIViewIntent) => void; readonly onCreateAnnotation: (annotation: Annotation) => void; readonly onArrowPick: (annotationType: "arrow" | "dependency") => void; readonly onZoom: (delta: number) => void; readonly onFitSelection: () => void; readonly onFitAll: () => void; readonly onSetZoom: (zoom: number) => void; readonly onNavigateBookmark: (cycle: number, bookmarkId?: BookmarkId) => void; readonly commands: EditorSurfaceCommandController;
  readonly onToggleGrid: () => void; readonly onToggleSnap: () => void; readonly onToggleRuler: () => void; readonly onToggleMinimap: () => void; readonly onToggleSignalNames: () => void; readonly onToggleRoles: () => void; readonly onToggleAnnotations: () => void; readonly onToggleTransactions: () => void; readonly onToggleGroupBackground: () => void; readonly onToggleSignalTree: () => void; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onNew: () => void; readonly onOpen: () => void; readonly onSave: () => void; readonly onSaveAs: () => void; readonly onRecent: () => void; readonly onProperties: () => void; readonly onExport: () => void; readonly onToggleInspector: () => void; readonly onToggleBottom: () => void; readonly onShowProblems: () => void; readonly onCopy: () => void; readonly onCut: () => void; readonly onPaste: () => void; readonly onDuplicate: () => void; readonly onRename: () => void; readonly onClearSelection: () => void; readonly onSelectAll: () => void; readonly onMoveUp: () => void; readonly onMoveDown: () => void; readonly onVisibility: (visible: boolean) => void; readonly onOpenTimeline: () => void; readonly onOpenProperties: () => void; readonly onOpenBookmarks: () => void; readonly onOpenAIAssistant: () => void; readonly aiBridgeStatus: "disabled" | "connecting" | "connected" | "error";
}) {
  const [homeOverflowOpen, setHomeOverflowOpen] = useState(false);
  const [homeOverflowPosition, setHomeOverflowPosition] = useState<{ readonly left: number; readonly top: number; readonly height: number; readonly maxHeight: number }>();
  const homeOverflowTriggerRef = useRef<HTMLButtonElement>(null);
  const homeOverflowMenuRef = useRef<HTMLDivElement>(null);
  const [compactCycleCount] = useState(2);
  const hasSelectableSignals = useMemo(() => document.signals.some((signal) => signal.type !== "commentRow"), [document]);
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
  // #400: Pulse is no longer an independently creatable Signal type -- single/
  // finite/periodic pulses are produced through the Signal Generator instead.
  // `type: "pulse"` remains fully supported for documents that already have
  // it (schema/migration/rendering/export are all unchanged); this function
  // is the *creation* path, which simply no longer offers it.
  const insertValueSignal = (type: "binary" | "bus" | "state" | "logic" | "event") => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = nextEntityId("signal", document);
    const name = type === "event" ? `${type.toUpperCase()}_${document.signals.length + 1}` : `SIGNAL_${document.signals.length + 1}`;
    const signal = type === "bus" ? valueSignal(id, name, "internal", [{ start: 0, value: "00" }], { type: "bus", width: 8, displayFormat: "hex" })
      : type === "state" ? valueSignal(id, name, "internal", [{ start: 0, value: "IDLE" }], { type: "state" })
      : type === "event" ? valueSignal(id, name, "internal", [{ start: 0, value: "NONE" }], { type: "event" })
      : valueSignal(id, name, "internal", [{ start: 0, value: 0 }], { type });
    const result = commands.createSignal(signal, target.group.id, target.index);
    if (result.ok) onSignalCreated(signalId(id));
  };
  const insertClockSignal = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = signalId(nextEntityId("signal", document));
    const name = `CLOCK_${document.signals.length + 1}`;
    const signal: ClockSignal = { id, name, type: "clock", role: "internal", source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } };
    const result = commands.createSignal(signal, target.group.id, target.index);
    if (result.ok) onSignalCreated(id);
  };
  const insertGroup = () => {
    const id = groupId(nextEntityId("group", document));
    const result = commands.createGroup({ id, name: `Group ${document.signalGroups.length + 1}`, rows: [] }, resolveGroupInsertionIndex(document, selectedInsertionSignalId, selectedGroupId));
    if (result.ok) onGroupCreated(id);
  };
  const insertCommentRow = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = signalId(nextEntityId("commentRow", document));
    const name = `Comment ${document.signals.length + 1}`;
    const commentRow: CommentRow = { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" };
    const result = commands.createCommentRow(commentRow, target.group.id, target.index);
    if (result.ok) onSignalCreated(id);
  };
  const insertSpacer = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = spacerId(nextEntityId("spacer", document));
    const result = commands.insertSpacer({ id, height: 24 }, target.group.id, target.index);
    if (result.ok) onSpacerCreated(target.group.id, id);
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
    const result = commands.createTransaction({ id, name: `Transaction ${document.transactions.length + 1}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), laneId: "lane_0" });
    if (result.ok) onTransactionCreated(id);
  };
  const duplicateTransaction = () => {
    const source = selectedTransactionId === undefined ? undefined : document.transactions.find((item) => item.id === selectedTransactionId);
    if (!source) return;
    const id = nextEntityId("transaction", document) as TransactionId;
    const result = commands.duplicateTransaction({ ...source, id, name: `${source.name} Copy` });
    if (result.ok) onTransactionCreated(id);
  };
  // #397 Transaction Mode GUI Closure Section 8: Ribbon-level parity for the
  // Group header's own "Ungroup" button -- lets the user act on the
  // selected Transaction's Group without hunting for the small header
  // control, using the same already-existing `transactionGroup.delete`
  // command (atomically ungroups every member Transaction).
  const selectedTransactionGroupId = selectedTransactionId === undefined ? undefined : document.transactions.find((item) => item.id === selectedTransactionId)?.groupId;
  const ungroupSelectedTransaction = () => {
    if (selectedTransactionGroupId !== undefined) commands.deleteTransactionGroup(selectedTransactionGroupId);
  };
  const homeOverflowMenu = homeOverflowOpen ? createPortal(<div ref={homeOverflowMenuRef} id="home-overflow-menu" className="home-overflow-menu" role="menu" aria-label="More Home Commands" style={{ left: `${homeOverflowPosition?.left ?? 0}px`, top: `${homeOverflowPosition?.top ?? 0}px`, height: homeOverflowPosition ? `${homeOverflowPosition.height}px` : "auto", maxHeight: `${homeOverflowPosition?.maxHeight ?? 120}px`, visibility: homeOverflowPosition ? "visible" : "hidden" }}>
    <strong>File</strong><button type="button" onClick={() => { onNew(); setHomeOverflowOpen(false); }}>New</button><button type="button" onClick={() => { onOpen(); setHomeOverflowOpen(false); }}>Open</button><button type="button" onClick={() => { onSave(); setHomeOverflowOpen(false); }}>Save</button><button type="button" onClick={() => { onSaveAs(); setHomeOverflowOpen(false); }}>Save As</button><button type="button" onClick={() => { onRecent(); setHomeOverflowOpen(false); }}>Recent</button>
    <strong>History</strong><button type="button" onClick={() => { onUndo(); setHomeOverflowOpen(false); }} disabled={!history.canUndo}>Undo</button><button type="button" onClick={() => { onRedo(); setHomeOverflowOpen(false); }} disabled={!history.canRedo}>Redo</button>
    <strong>Clipboard</strong><button type="button" onClick={() => { onCopy(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Copy</button><button type="button" onClick={() => { onCut(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Cut</button><button type="button" onClick={() => { onPaste(); setHomeOverflowOpen(false); }} disabled={!clipboardAvailable}>Paste</button><button type="button" onClick={() => { onDuplicate(); setHomeOverflowOpen(false); }} disabled={!hasSelectedClipboard}>Duplicate</button>
    <strong>Edit / Selection</strong><button type="button" onClick={() => { onDelete(); setHomeOverflowOpen(false); }} disabled={!hasDeletableSelection}>Delete</button><button type="button" onClick={() => { onRename(); setHomeOverflowOpen(false); }} disabled={!canRenameSelection}>Rename</button><button type="button" onClick={() => { onClearSelection(); setHomeOverflowOpen(false); }}>Clear Selection</button><button type="button" onClick={() => { onSelectAll(); setHomeOverflowOpen(false); }} disabled={!hasSelectableSignals}>Select All Signals</button>
    <strong>Visibility / Arrange</strong><button type="button" onClick={() => { onVisibility(true); setHomeOverflowOpen(false); }} disabled={!canShowSelection}>Show</button><button type="button" onClick={() => { onVisibility(false); setHomeOverflowOpen(false); }} disabled={!canHideSelection}>Hide</button><button type="button" onClick={() => { onMoveUp(); setHomeOverflowOpen(false); }} disabled={!canMoveUp}>Move Up</button><button type="button" onClick={() => { onMoveDown(); setHomeOverflowOpen(false); }} disabled={!canMoveDown}>Move Down</button>
    <strong>View</strong><button type="button" onClick={() => { onZoom(-0.25); setHomeOverflowOpen(false); }}>Zoom −</button><button type="button" onClick={() => { onZoom(0.25); setHomeOverflowOpen(false); }}>Zoom +</button><button type="button" onClick={() => { onSetZoom(0.5); setHomeOverflowOpen(false); }}>Zoom 50%</button><button type="button" onClick={() => { onSetZoom(1); setHomeOverflowOpen(false); }}>Zoom 100%</button><button type="button" onClick={() => { onSetZoom(1.5); setHomeOverflowOpen(false); }}>Zoom 150%</button><button type="button" onClick={() => { onSetZoom(2); setHomeOverflowOpen(false); }}>Zoom 200%</button><button type="button" onClick={() => { onSetZoom(4); setHomeOverflowOpen(false); }}>Zoom 400%</button><button type="button" onClick={() => { onSetZoom(8); setHomeOverflowOpen(false); }}>Zoom 800%</button><button type="button" onClick={() => { onFitSelection(); setHomeOverflowOpen(false); }}>Fit Selection</button><button type="button" onClick={() => { onFitAll(); setHomeOverflowOpen(false); }}>Fit All</button><button type="button" onClick={() => { onToggleGrid(); setHomeOverflowOpen(false); }}>Grid</button><button type="button" onClick={() => { onToggleSnap(); setHomeOverflowOpen(false); }}>Snap</button><button type="button" onClick={() => { onToggleRuler(); setHomeOverflowOpen(false); }}>Ruler</button><button type="button" onClick={() => { onToggleMinimap(); setHomeOverflowOpen(false); }}>MiniMap</button>
    <strong>Document</strong><button type="button" role="menuitem" onClick={() => { onProperties(); setHomeOverflowOpen(false); }}>Document Properties</button><button type="button" role="menuitem" onClick={() => { onShowProblems(); setHomeOverflowOpen(false); }}>Problems</button><button type="button" role="menuitem" onClick={() => { onExport(); setHomeOverflowOpen(false); }}>SVG / PNG / PDF</button><strong>Timeline</strong><button type="button" role="menuitem" onClick={() => { onOpenTimeline(); setHomeOverflowOpen(false); }}>Timeline Editor</button>
  </div>, window.document.body) : null;
  // #406: Home Ribbon's group set now depends on ActiveContext (#404/#405)
  // rather than always showing every group regardless of Cycle/Transaction
  // ViewMode. Time/Layout (Cycle-specific row/timeline-range commands) only
  // appear for the Signal context.
  //
  // Scoped decision: the issue's own "Required behavior" table lists
  // Transaction (Create/Duplicate) as a Transaction-context-only group,
  // which would hide it while in Cycle ViewMode. That conflicts with an
  // established, already-tested product workflow -- creating a Transaction
  // from the Ribbon while still in Cycle view (transaction-export.spec.ts's
  // `createTransaction` helper and every test built on it) -- so Transaction
  // stays in the common bucket here rather than being hidden per the
  // issue's literal text. Flagging this rather than silently breaking that
  // workflow or reinterpreting the issue unilaterally either way. Delete/
  // Rename for a selected Transaction already ride on the common Edit
  // group's existing hasDeletableSelection/canRenameSelection gating (both
  // already support a selected Transaction). Phase/Lane/Linked-Signals
  // editing already has a real, always-reachable entry point independent
  // of the Ribbon (the Bottom "Transaction" tab, visible in every
  // ViewMode) -- not reimplemented as separate Ribbon buttons here to
  // avoid a second, divergent entry point to the same TransactionEditor
  // state.
  const commonRibbonGroups: readonly RibbonGroupSpec[] = [
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
        // #439: "wide" -- "Duplicate" is one word that doesn't fit the
        // default Home button width without breaking mid-word.
        { kind: "button", id: "duplicate", icon: "i-duplicate", label: "Duplicate", v1Label: "複製", size: "wide", onClick: onDuplicate, disabled: !hasSelectedClipboard },
        // #439: "Select All Signals" wrapped to 3 stacked one-word lines at
        // the standard 44px Home button width (Select / All / Signals) --
        // over the issue's own 2-line limit. Shortened to the 2-word "Select
        // All" (wraps cleanly to 2 lines, matching "Fit Selection"'s shape);
        // the full meaning stays on the accessible name/tooltip.
        { kind: "button", id: "select-all", icon: "i-select-all", label: "Select All", ariaLabel: "Select All Signals", title: "Select All Signals", onClick: onSelectAll, disabled: !hasSelectableSignals },
        { kind: "custom", id: "find-replace", render: () => <FindReplacePanel key="find-replace" document={document} onRenameSignals={commands.renameSignals} /> },
        { kind: "custom", id: "clipboard-status", render: () => <small key="clipboard-status" data-testid="clipboard-status">{clipboardStatus}</small> },
      ],
    },
    {
      // #437 command ownership matrix: Zoom In/Out/100%/Fit All/Fit
      // Selection are DUPLICATED between Home and View by explicit design,
      // not oversight -- View/Panels is the conceptual "Workspace display"
      // owner (visibility/zoom/layout settings live there), Home keeps a
      // quick-access copy so zooming/fitting doesn't force a tab switch
      // mid-edit (the same "frequent command stays on Home" reasoning
      // Edit/Cut/Copy/Paste already follow). Both routes bind the exact
      // same onZoom/onSetZoom/onFitAll/onFitSelection callbacks and the
      // same `zoom` value -- one state owner, never a second Zoom/Fit
      // implementation to drift out of sync. Removing either route
      // entirely is a product decision (which tab loses a control users
      // already rely on) out of this pass's scope -- see #437.
      id: "view", majorGroup: "Zoom", caption: "Zoom", items: [
        { kind: "button", id: "zoom-out", icon: "i-zoom-out", label: "Zoom Out", v1Label: "ズーム−", onClick: () => onZoom(-0.25) },
        { kind: "button", id: "zoom-reset", icon: "i-zoom-reset", label: "100%", ariaLabel: "Reset zoom to 100%", onClick: () => onSetZoom(1) },
        { kind: "button", id: "zoom-in", icon: "i-zoom-in", label: "Zoom In", v1Label: "ズーム＋", onClick: () => onZoom(0.25) },
        { kind: "button", id: "fit-all", icon: "i-fit", label: "Fit All", v1Label: "全体表示", onClick: onFitAll },
        // #439: "wide" -- "Selection" doesn't fit the default Home button
        // width without breaking mid-word.
        { kind: "button", id: "fit-selection", icon: "i-select-fit", label: "Fit Selection", size: "wide", onClick: onFitSelection },
      ],
    },
    {
      // #437: Grid/Snap/Ruler/MiniMap are ALSO duplicated on View's own
      // Guides/Panels groups (minimal-cycle-view-ribbon.tsx's `viewGroups`
      // below) -- same reasoning as the Zoom group above, and the same
      // guarantee: `checked`/`onChange` here are the identical
      // gridEnabled/snapEnabled/rulerEnabled/minimapEnabled props and
      // onToggle* callbacks View's own toggles use, so a stale
      // checked-here-unchecked-there state can't happen by construction.
      id: "display", majorGroup: "Display", caption: "Display", items: [
        { kind: "toggle", id: "grid", label: "Grid", testId: "home-grid-toggle", checked: gridEnabled, onChange: onToggleGrid },
        { kind: "toggle", id: "minimap", label: "MiniMap", testId: "home-minimap-toggle", checked: minimapEnabled, onChange: onToggleMinimap },
        { kind: "toggle", id: "snap", label: "Snap", testId: "home-snap-toggle", checked: snapEnabled, onChange: onToggleSnap },
        { kind: "toggle", id: "ruler", label: "Ruler", testId: "home-ruler-toggle", checked: rulerEnabled, onChange: onToggleRuler },
      ],
    },
    {
      id: "transaction", majorGroup: "Transaction", caption: "Transaction", items: [
        { kind: "button", id: "transaction-create", icon: "i-plus", label: "Create", ariaLabel: "Create Transaction", onClick: addTransaction },
        // #439: "wide" -- see the Clipboard group's "Duplicate" above.
        { kind: "button", id: "transaction-duplicate", icon: "i-duplicate", label: "Duplicate", ariaLabel: "Duplicate Transaction", size: "wide", onClick: duplicateTransaction, disabled: !selectedTransactionId },
        // #397: Ungroup and Time Scale only make sense once Transaction
        // Mode is active, so keep both controls scoped to this group rather
        // than widening Home in Cycle mode (covered by ribbon-overflow tests).
        ...(viewMode === "Transaction" ? [{ kind: "button", id: "transaction-ungroup", icon: "i-ungroup", label: "Ungroup", ariaLabel: "Ungroup selected Transaction", title: "Remove the selected Transaction's Group (keeps the Transaction, ungrouped)", onClick: ungroupSelectedTransaction, disabled: selectedTransactionGroupId === undefined }] as const : []),
        ...(viewMode === "Transaction" ? [{ kind: "custom", id: "transaction-time-scale", render: () => <TransactionTimeScalePanel key="transaction-time-scale" document={document} onSetScale={commands.setTransactionTimeScale} /> }] as const : []),
      ],
    },
  ];
  const signalRibbonGroups: readonly RibbonGroupSpec[] = [
    {
      id: "timeline", majorGroup: "Time", caption: "Time", items: [
        { kind: "button", id: "row-up", icon: "i-up", label: "Up", ariaLabel: "Move selected row up", onClick: onMoveUp, disabled: !canMoveUp },
        { kind: "button", id: "row-down", icon: "i-down", label: "Down", ariaLabel: "Move selected row down", onClick: onMoveDown, disabled: !canMoveDown },
        { kind: "button", id: "cycle-insert", icon: "i-plus", label: "Cycle Insert", ariaLabel: "Insert one cycle", onClick: () => commands.insertTimeline(range.start, 1) },
        { kind: "button", id: "cycle-delete", icon: "i-delete", label: "Cycle Delete", ariaLabel: "Delete one cycle", onClick: () => commands.deleteTimeline(range.start, Math.min(document.timeline.cycleCount, range.start + 1)) },
        { kind: "button", id: "n-cycle-insert", icon: "i-plus", label: "N Cycle Insert", ariaLabel: `Insert ${compactCycleCount} cycles`, onClick: () => commands.insertTimeline(range.start, compactCycleCount) },
        { kind: "button", id: "n-cycle-delete", icon: "i-delete", label: "N Cycle Delete", ariaLabel: `Delete ${compactCycleCount} cycles`, onClick: () => commands.deleteTimeline(range.start, Math.min(document.timeline.cycleCount, range.start + compactCycleCount)) },
      ],
    },
    {
      id: "layout", majorGroup: "Layout", caption: "Layout", items: [
        { kind: "button", id: "edit-interval", icon: "i-align-interval", label: "Edit Interval", ariaLabel: "Open Timeline interval editor", title: "Open Timeline to edit the selected interval.", onClick: onOpenTimeline },
        // #439: visible label shortened to fit 2 lines at the default Home
        // button width without a mid-word break ("Create Time Group" wraps
        // to 3-4 lines) -- full meaning kept in ariaLabel/title.
        { kind: "button", id: "time-group", icon: "i-group", label: "Time Group", ariaLabel: "Create Time Group", title: "Create a Time Group for the selected timeline range.", onClick: () => commands.createTimeGroup({ id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), presentation: { collapsed: false, foldStyle: "none" } }) },
        { kind: "button", id: "normalize-spacing", icon: "i-auto-layout", label: "Auto Space", ariaLabel: "Normalize row spacing", title: "Normalize row height and signal spacing to the supported minimums.", onClick: () => commands.normalizeLayout({ ...document.layout, rowHeight: Math.max(24, document.layout.rowHeight), signalSpacing: Math.max(2, document.layout.signalSpacing) }) },
      ],
    },
  ];
  // Transaction group now lives in commonRibbonGroups (see the scoped-
  // decision comment above) -- no Transaction-only group exists yet, but
  // the bucket stays wired through composeRibbon so a real one (Phase/
  // Lane-specific commands, say) can be added later without re-threading
  // the ActiveContext plumbing again.
  const transactionRibbonGroups: readonly RibbonGroupSpec[] = [];
  const homeGroups: readonly RibbonGroupSpec[] = composeRibbon({ common: commonRibbonGroups, bySignal: signalRibbonGroups, byTransaction: transactionRibbonGroups }, { viewMode, activeContext }, ["file", "edit", "timeline", "view", "transaction", "layout", "display"]);
  // View tab visual-consistency fix: previously hand-written per-button
  // JSX with its own one-off sizing (tile-shaped toggle buttons, a fixed
  // 3-column grid, an unstyled native <select> that fell through to the
  // OS's `color-scheme: dark` default) -- none of it routed through the
  // same RibbonGroup/DsRibbonButton primitives every other tab (File/
  // Edit/Zoom/Annotation/...) already shares. Rebuilt as ordinary
  // RibbonGroupSpec groups so View gets the exact same button width/
  // icon size/caption placement as Home for free, with no second style
  // to keep in sync. Item kinds without a direct schema equivalent
  // (icon-toggle buttons, the Zoom% picker, the Workspace/Density
  // selects) use `kind: "custom"`, the same escape hatch Edit's Find &
  // Replace panel already uses -- not a new pattern.
  const viewGroups: readonly RibbonGroupSpec[] = [
    {
      id: "view-show", majorGroup: "Show", caption: "Show", items: [
        { kind: "custom", id: "show-labels", render: () => <div key="show-labels" className="view-display-subgroup" data-display-kind="labels" aria-label="Labels and structure"><span>Labels / Structure</span><DsRibbonToggle dataTestId="view-show-signal-names" checked={showSignalNames} label="Signal Names" onChange={onToggleSignalNames} /><DsRibbonToggle dataTestId="view-show-roles" checked={showRoles} label="Roles" onChange={onToggleRoles} /><DsRibbonToggle dataTestId="view-show-group-background" checked={showGroupBackground} label="Group Background" onChange={onToggleGroupBackground} /></div> },
        { kind: "custom", id: "show-overlays", render: () => <div key="show-overlays" className="view-display-subgroup" data-display-kind="overlays" aria-label="Overlays"><span>Overlays</span><DsRibbonToggle dataTestId="view-show-annotations" checked={showAnnotations} label="Annotations" onChange={onToggleAnnotations} /><DsRibbonToggle dataTestId="view-show-transactions" checked={showTransactions} label="Transactions" onChange={onToggleTransactions} /></div> },
      ],
    },
    {
      id: "view-panels", majorGroup: "Panels", caption: "Panels", items: [
        { kind: "custom", id: "panel-inspector", render: () => <DsRibbonToggleButton key="panel-inspector" ariaLabel="Inspector" checked={inspectorVisible} icon={<RibbonIcon name="i-settings" />} onClick={onToggleInspector}>Inspector</DsRibbonToggleButton> },
        { kind: "custom", id: "panel-bottom", render: () => <DsRibbonToggleButton key="panel-bottom" ariaLabel="Bottom Editor" checked={bottomVisible} icon={<RibbonIcon name="i-preview" />} onClick={onToggleBottom}><span>Bottom</span><span>Editor</span></DsRibbonToggleButton> },
        // #431 P0-1: Bottom Panel Hidden/Compact/Expanded -- Hidden stays
        // the existing "Bottom Editor" toggle above (unchanged behavior,
        // unchanged tests); these two presets cover the other half without
        // a new state owner (both call the *same* setBottomHeight the drag
        // handle already uses, just at its own documented min/max -- see
        // bottom-resizer's aria-valuemin/max). Selecting either preset
        // also shows the panel if it was hidden (one click from Hidden
        // straight to a usable size); each button reads "selected" only
        // when the panel is visible AND already exactly at that height,
        // not merely "closest to" (a manual drag in between shows neither
        // as selected, which is correct -- it's neither preset anymore).
        { kind: "custom", id: "bottom-size-compact", render: () => <DsRibbonToggleButton key="bottom-size-compact" dataTestId="view-panel-bottom-compact" ariaLabel="Bottom Compact" checked={bottomVisible && bottomHeight === 180} icon={<RibbonIcon name="i-preview" />} onClick={() => onSetBottomSize("compact")}>Compact</DsRibbonToggleButton> },
        { kind: "custom", id: "bottom-size-expanded", render: () => <DsRibbonToggleButton key="bottom-size-expanded" dataTestId="view-panel-bottom-expanded" ariaLabel="Bottom Expanded" checked={bottomVisible && bottomHeight === 420} icon={<RibbonIcon name="i-preview" />} onClick={() => onSetBottomSize("expanded")}>Expanded</DsRibbonToggleButton> },
        { kind: "custom", id: "panel-tree", render: () => <DsRibbonToggleButton key="panel-tree" dataTestId="view-panel-tree" ariaLabel="Signal Tree" checked={signalTreeVisible} icon={<RibbonIcon name="i-group" />} onClick={onToggleSignalTree}>Signal Tree</DsRibbonToggleButton> },
        { kind: "custom", id: "panel-minimap", render: () => <DsRibbonToggleButton key="panel-minimap" dataTestId="view-panel-minimap" ariaLabel="MiniMap" checked={minimapEnabled} icon={<RibbonIcon name="i-preview" />} onClick={onToggleMinimap}>MiniMap</DsRibbonToggleButton> },
        // Named "Signal Split" (not just "Split") specifically to stay
        // distinct from the unrelated Cycle/Transaction/Split ViewMode tab
        // group -- this toggles two independent-scroll viewports over the
        // *same* Cycle signal list, not a different view mode.
        ...(viewMode === "Cycle" ? [{ kind: "custom", id: "panel-signal-split", render: () => <DsRibbonToggleButton key="panel-signal-split" dataTestId="view-panel-signal-split" ariaLabel="Signal Split" title="Show two vertically independent views of the same Cycle signal list." checked={signalSplitEnabled} icon={<RibbonIcon name="i-group" />} onClick={onToggleSignalSplit}><span>Signal</span><span>Split</span></DsRibbonToggleButton> }] as const : []),
      ],
    },
    {
      id: "view-guides", majorGroup: "Guides", caption: "Guides", items: [
        { kind: "toggle", id: "grid", label: "Grid", testId: "grid-toggle", checked: gridEnabled, onChange: onToggleGrid },
        { kind: "toggle", id: "snap", label: "Snap", testId: "snap-toggle", checked: snapEnabled, onChange: onToggleSnap },
        { kind: "toggle", id: "ruler", label: "Ruler", testId: "ruler-toggle", checked: rulerEnabled, onChange: onToggleRuler },
      ],
    },
    {
      id: "view-zoom", majorGroup: "Zoom", caption: "Zoom", items: [
        { kind: "button", id: "zoom-out", icon: "i-zoom-out", label: "Zoom Out", v1Label: "ズーム−", onClick: () => onZoom(-0.25) },
        { kind: "custom", id: "zoom-preset", render: () => <span key="zoom-preset" className="view-zoom-preset"><DsRibbonSelect ariaLabel="Zoom preset" value={String(Math.round(zoom * 100))} onChange={(event) => onSetZoom(Number(event.target.value) / 100)}><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option><option value="400">400%</option><option value="800">800%</option></DsRibbonSelect><output className="visually-hidden" data-testid="zoom-status" aria-label="Current zoom">{Math.round(zoom * 100)}%</output></span> },
        { kind: "button", id: "zoom-in", icon: "i-zoom-in", label: "Zoom In", v1Label: "ズーム＋", onClick: () => onZoom(0.25) },
        { kind: "custom", id: "fit-actions", render: () => <div key="fit-actions" aria-label="Fit commands" style={{ display: "flex", gap: "5px" }}><DsRibbonButton icon={<RibbonIcon name="i-fit" />} v1Label="全体表示" onClick={onFitAll}>Fit All</DsRibbonButton><DsRibbonButton icon={<RibbonIcon name="i-select-fit" />} onClick={onFitSelection}>Fit Selection</DsRibbonButton></div> },
      ],
    },
    {
      id: "view-workspace", majorGroup: "Workspace", caption: "Workspace", items: [
        { kind: "custom", id: "workspace-preset", render: () => <label key="workspace-preset" className="view-workspace-field">Workspace<DsRibbonSelect ariaLabel="Workspace preset" value={workspacePreset} onChange={(event) => onWorkspacePresetChange(event.target.value as WorkspacePreset)}><option value="edit">Edit</option><option value="waveform">Waveform Focus</option><option value="review">Review</option><option value="transaction">Transaction</option></DsRibbonSelect></label> },
        { kind: "custom", id: "workspace-density", render: () => <label key="workspace-density" className="view-workspace-field">Density<DsRibbonSelect ariaLabel="UI density" value={density} onChange={(event) => onDensityChange(event.target.value as DensityMode)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></DsRibbonSelect></label> },
      ],
    },
    {
      id: "view-layout", majorGroup: "Layout", caption: "Layout", items: [
        { kind: "button", id: "reset-layout", icon: "i-settings", label: "Reset Layout", onClick: onResetLayout },
        // Accessible name stays the fixed "Focus Waveform" regardless of
        // toggled state (only the visible label flips to "Restore
        // Panels") -- a stable name for this one control across both
        // states, same as the pre-migration button's own hardcoded
        // ariaLabel.
        { kind: "button", id: "focus-waveform", icon: "i-preview", label: workspacePreset === "waveform" ? "Restore Panels" : "Focus Waveform", ariaLabel: "Focus Waveform", onClick: () => onWorkspacePresetChange(workspacePreset === "waveform" ? "edit" : "waveform") },
      ],
    },
  ];
  // Arrange group targets: the current multi-selection if there is one,
  // otherwise the single selected Annotation, otherwise nothing (every
  // Arrange handler stays undefined -> ArrangeGroup renders disabled).
  const arrangeTargetIds: readonly AnnotationId[] = selectedAnnotationIds.size > 0 ? [...selectedAnnotationIds] : selectedAnnotation ? [selectedAnnotation.id] : [];
  const arrangeGroup = arrangeTargetIds.length > 0 ? (document.annotationGroups ?? []).find((group) => group.annotationIds.includes(arrangeTargetIds[0]!)) : undefined;
  // #332 item D: these reasons must distinguish "nothing selected" from an
  // implemented control that is merely unavailable for the current
  // selection -- never fall back to a generic "Not yet implemented" for a
  // control that has real, wired-up behavior.
  const arrangeReasons = arrangeTargetIds.length === 0 ? { unavailableReason: "Select at least one annotation" } : {
    groupUnavailableReason: arrangeGroup ? "Selected annotations are already grouped" : arrangeTargetIds.length < 2 ? "Select at least 2 annotations" : undefined,
    ungroupUnavailableReason: arrangeGroup ? undefined : "Selected annotations are not grouped",
    alignUnavailableReason: arrangeTargetIds.length < 2 ? "Select at least 2 annotations" : undefined,
    matchSpanUnavailableReason: arrangeTargetIds.length < 2 ? "Select at least 2 annotations" : "Select at least 2 compatible range annotations",
  };
  const arrangeHandlers = arrangeTargetIds.length === 0 ? {} : {
    onBringToFront: () => commands.bringAnnotationsToFront(arrangeTargetIds),
    onSendToBack: () => commands.sendAnnotationsToBack(arrangeTargetIds),
    onRotateRight: () => commands.rotateAnnotations(arrangeTargetIds.map((annotationId) => ({ annotationId, rotation: (((document.annotations.find((item) => item.id === annotationId)?.rotation ?? 0) + 90) % 360 + 360) % 360 }))),
    onRotateLeft: () => commands.rotateAnnotations(arrangeTargetIds.map((annotationId) => ({ annotationId, rotation: (((document.annotations.find((item) => item.id === annotationId)?.rotation ?? 0) - 90) % 360 + 360) % 360 }))),
    ...(arrangeTargetIds.length >= 2 && !arrangeGroup ? { onGroup: () => commands.createAnnotationGroup({ id: nextEntityId("annotationGroup", document) as AnnotationGroupId, annotationIds: arrangeTargetIds } satisfies AnnotationGroup) } : {}),
    ...(arrangeGroup ? { onUngroup: () => commands.deleteAnnotationGroup(arrangeGroup.id) } : {}),
    // Align brings every selected Annotation's label onto the same row
    // (matches the first selected id's labelOffset.y) -- reuses the
    // existing single-annotation annotation.updateLabelOffset command,
    // just batched, rather than inventing a new command type for it.
    ...(arrangeTargetIds.length >= 2 ? { onAlign: () => {
      const targets = arrangeTargetIds.flatMap((id) => { const found = document.annotations.find((item) => item.id === id); return found ? [found] : []; });
      const reference = targets[0];
      if (targets.length < 2 || !reference) return;
      const referenceY = reference.labelOffset?.y ?? -14;
      commands.alignAnnotationLabels(targets.map((annotation) => ({ annotationId: annotation.id, x: annotation.labelOffset?.x ?? 0, y: referenceY })));
    } } : {}),
    // #378: executeBatch is atomic (one no-op command fails the WHOLE
    // batch, packages/history/src/session.ts's executeBatch) -- a mixed
    // selection (some already locked, some not) used to silently lock/
    // unlock NOTHING, since annotation.setLocked rejects a target already
    // at the requested state. Pre-filter to only the ids that actually
    // change, and disable+explain when every selected annotation is
    // already at the requested state, matching #332's disabled-reason
    // convention rather than presenting an enabled control with no effect.
    ...(arrangeTargetIds.some((id) => !(document.annotations.find((item) => item.id === id)?.locked ?? false)) ? { onLock: () => commands.setAnnotationsLocked(arrangeTargetIds.filter((id) => !(document.annotations.find((item) => item.id === id)?.locked ?? false)), true) } : { lockUnavailableReason: "Selected annotation(s) are already locked" }),
    ...(arrangeTargetIds.some((id) => document.annotations.find((item) => item.id === id)?.locked ?? false) ? { onUnlock: () => commands.setAnnotationsLocked(arrangeTargetIds.filter((id) => document.annotations.find((item) => item.id === id)?.locked ?? false), false) } : { unlockUnavailableReason: "Selected annotation(s) are already unlocked" }),
    // Same width: match every OTHER selected annotation's start-end cycle
    // span to the first selected one's. Types without start/end (arrow,
    // callout, marker, ...) are silently skipped rather than failing the
    // whole batch, since a mixed selection is common.
    ...(arrangeTargetIds.length >= 2 ? (() => {
      const targets = arrangeTargetIds.flatMap((id) => { const found = document.annotations.find((item) => item.id === id); return found ? [found] : []; });
      const reference = targets.find((item) => item.start && item.end);
      const spanCycles = reference?.start && reference.end ? reference.end.cycle - reference.start.cycle : undefined;
      const rest = spanCycles === undefined ? [] : targets.filter((item) => item.id !== reference?.id && item.start && item.end);
      return spanCycles === undefined || rest.length === 0 ? {} : { onMatchSpan: () => commands.matchAnnotationSpans(rest.map((annotation) => ({ annotationId: annotation.id, spanCycles }))) };
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
      <div className="ribbon-major-group insert-slot-group" data-major-group="Signals" aria-label="Signals commands"><DsRibbonGroup ariaLabel="Signals" className="insert-signals-group" density="compact-grid" label="Signals">
        <DsRibbonButton icon={<InsertSemanticIcon kind="signal" />} onClick={() => insertValueSignal("binary")}>Signal</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="clock" />} onClick={insertClockSignal}>Clock</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="bus" />} onClick={() => insertValueSignal("bus")}>Bus</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="state" />} onClick={() => insertValueSignal("state")}>State</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="logic" />} onClick={() => insertValueSignal("logic")}>Level</DsRibbonButton><DsRibbonButton icon={<InsertSemanticIcon kind="event" />} onClick={() => insertValueSignal("event")}>Event</DsRibbonButton>
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Structure" aria-label="Structure commands"><DsRibbonGroup ariaLabel="Structure" className="insert-structure-group" density="compact-grid" label="Structure"><DsRibbonButton icon={<RibbonIcon name="i-group" />} onClick={insertGroup}>Group</DsRibbonButton><DsRibbonButton icon={<RibbonIcon name="i-spacing" />} onClick={insertSpacer}>Spacer</DsRibbonButton></DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Annotation" aria-label="Annotation commands"><DsRibbonGroup ariaLabel="Annotation" className="insert-annotation-group" density="compact-grid" label="Annotation">
        <DsRibbonButton icon={<RibbonIcon name="i-comment" />} onClick={insertCommentRow}>Comment</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="marker" />} onClick={() => insertAnnotation("marker")}>Marker</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="range" />} onClick={() => insertAnnotation("range")}>Range</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="text" />} onClick={() => insertAnnotation("text")}>Text</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="dependency" />} onClick={() => insertAnnotation("dependency")}>Dependency</DsRibbonButton>
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="More" aria-label="More Insert commands"><DsRibbonGroup ariaLabel="More" className="insert-more-group" density="compact-grid" label="More">
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="measurement" />} onClick={() => insertAnnotation("measurement")}>Measurement</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="highlight" />} onClick={() => insertAnnotation("highlight")}>Highlight</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="bracket" />} onClick={() => insertAnnotation("bracket")}>Bracket</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="verticalLine" />} onClick={() => insertAnnotation("verticalLine")}>Vertical Line</DsRibbonButton>
      </DsRibbonGroup></div>
    </div>}
    {tab === "Timeline" && <TimelineToolbar document={document} range={range} history={history} onUndo={onUndo} onRedo={onRedo} onRange={onRange} commands={commands} onNavigateBookmark={onNavigateBookmark} onOpenBookmarks={onOpenBookmarks} />}
    {tab === "Annotation" && <>
      <div className="ribbon-group annotation-group"><AnnotationToolbar document={document} range={range} signalId={selectedSignalId} onCreate={onCreateAnnotation} arrowPickStatus={arrowPickStatus} onArmArrow={onArrowPick} /><b>Annotation</b></div>
      {/* Scope decision (#331): Ribbon Font intentionally edits only the
          selected Annotation, Comment Row, or multi-Annotation selection --
          it does NOT reach normal Signal labels (those already have their
          own dedicated styling route through the Signal Inspector's Label
          Style section). The title below states that scope explicitly
          rather than leaving an unstyled Signal selection's disabled Font
          group looking like an unexplained bug. */}
      <div className="ribbon-major-group" data-major-group="Font" aria-label="Font commands" title={selectedAnnotation || selectedCommentRow ? undefined : "Font applies to a selected Annotation or Comment Row (not Signal labels, which have their own styling in the Inspector)."}>
        <DsRibbonGroup ariaLabel="Font" className="annotation-font-group" label="Font">
          <FontStyleToolbar
            idPrefix="ribbon-annotation-font"
            disabled={!selectedAnnotation && !selectedCommentRow}
            style={selectedAnnotation?.style ?? selectedCommentRow?.display.style}
            onChange={(style: JsonObject) => {
              // Multi-selection Font editing: apply the same style change to
              // every selected Annotation as one atomic batch (the same
              // selectedAnnotationIds set Arrange already batches against),
              // each preserving its OWN other properties via
              // buildAnnotationStyleCommand's live per-annotation lookup --
              // not just the primary/first selected one.
              if (selectedAnnotationIds.size > 1) {
                commands.updateAnnotationStyles(document.annotations.filter((item) => selectedAnnotationIds.has(item.id)).map((item) => ({ annotationId: item.id, ...annotationPropertiesBase(item), style })));
              } else if (selectedAnnotation) commands.updateAnnotationStyle({ annotationId: selectedAnnotation.id, ...annotationPropertiesBase(selectedAnnotation), style });
              else if (selectedCommentRow) commands.updateCommentRowStyle(selectedCommentRow.id, selectedCommentRow, style);
            }}
          />
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Shapes" aria-label="Shape commands" title={selectedSignalId ? undefined : "Select a Signal row to insert a shape/annotation there"}>
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
      <div className="ribbon-major-group" data-major-group="Paragraph" aria-label="Paragraph commands" title={selectedAnnotation ? undefined : "Select an Annotation to change alignment"}>
        <DsRibbonGroup ariaLabel="Paragraph" className="annotation-paragraph-group" label="Paragraph">
          <DsRibbonButton ariaLabel="Align left" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-left" />} onClick={() => selectedAnnotation && commands.setAnnotationAlign(selectedAnnotation.id, "left")}>Left</DsRibbonButton>
          <DsRibbonButton ariaLabel="Align center" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-center" />} onClick={() => selectedAnnotation && commands.setAnnotationAlign(selectedAnnotation.id, "center")}>Center</DsRibbonButton>
          <DsRibbonButton ariaLabel="Align right" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-right" />} onClick={() => selectedAnnotation && commands.setAnnotationAlign(selectedAnnotation.id, "right")}>Right</DsRibbonButton>
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Arrange" aria-label="Arrange commands">
        <DsRibbonGroup ariaLabel="Arrange" className="annotation-arrange-group" label="Arrange">
          <ArrangeGroup {...arrangeHandlers} {...arrangeReasons} />
        </DsRibbonGroup>
      </div>
    </>}
    {tab === "View" && viewGroups.map((group) => <RibbonGroup key={group.id} spec={group} />)}
    {tab === "Review" && <div className="ribbon-group review-group"><ReviewWorkflow diagnostics={diagnostics} document={document} selectedSignalId={selectedSignalId} selectedGroupId={selectedGroupId} onNavigate={onNavigateProblem} onShowProblems={onShowProblems} onRefreshChecks={onRefreshChecks} /><output data-testid="review-problems-count">{problemsCount}</output><b>Review</b></div>}
    {tab === "AI" && <>
      {/* #395 PR1: the full query/preview/apply surface (AIOperationPanel)
          moved to the Bottom Panel's own "AI Assistant" tab -- same
          relocation this codebase already uses for Transaction/Bookmarks
          (see onOpenBookmarks). Ask/Edit is the one entry point; it opens
          that Bottom tab rather than duplicating the proposal/apply owner
          here. The status line is truthful about what's actually
          connected today -- there is no external Claude/Codex bridge
          implemented yet (see #395), so it never claims one. */}
      <div className="ribbon-major-group" data-major-group="Assistant" aria-label="AI Assistant commands">
        <DsRibbonGroup ariaLabel="Assistant" className="ai-assistant-group" label="Assistant">
          <DsRibbonButton ariaLabel="Ask or edit with the AI Assistant" icon={<RibbonIcon name="i-ai" />} onClick={onOpenAIAssistant} title="Open the AI Assistant in the Bottom Panel to preview, validate and apply a proposal">Ask / Edit</DsRibbonButton>
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Provider" aria-label="AI provider status">
        <DsRibbonGroup ariaLabel="Provider" className="ai-provider-group" label="Provider">
          <output className="ai-provider-status" data-testid="ai-provider-status">Local deterministic (offline) · {aiBridgeStatus === "connected" ? "external agent connected" : aiBridgeStatus === "connecting" ? "connecting to bridge…" : aiBridgeStatus === "error" ? "bridge connection failed" : "no external agent connected"}</output>
        </DsRibbonGroup>
      </div>
    </>}
  </section>;
}
