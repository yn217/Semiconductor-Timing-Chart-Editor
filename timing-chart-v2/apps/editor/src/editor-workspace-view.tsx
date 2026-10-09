import { useEffect, useRef, type KeyboardEventHandler, type PointerEventHandler, type ReactNode, type RefObject } from "react";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH, type ViewMode } from "./workspace/use-workspace-ui-state.js";
import { CursorOverlayOwner } from "./runtime/cursor-overlay-owner.js";
import { mountTimelineHorizontalScrollbar } from "./runtime/timeline-horizontal-scrollbar-owner.js";
import { mountCombinedTransactionPaneScroll } from "./runtime/combined-transaction-pane-scroll.js";

/**
 * #625: the horizontal scroll track belongs to the Timeline only. The viewport's native horizontal scrollbar is hidden and this
 * track -- positioned from the time-domain origin (ruler left edge) to the viewport's right edge -- drives the same scrollLeft, so
 * the scrollbar never extends beneath Signals / Groups, Role or Signal / Annotation.
 */
function TimelineHorizontalScrollbar({ viewport, viewMode, leftPaneWidth }: { readonly viewport: RefObject<HTMLDivElement | null>; readonly viewMode: string; readonly leftPaneWidth: number }) {
  const track = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = viewport.current;
    const bar = track.current;
    const filler = inner.current;
    if (!view || !bar || !filler) return undefined;
    return mountTimelineHorizontalScrollbar(view, bar, filler);
  }, [viewport, viewMode, leftPaneWidth]);
  return <div className="timeline-hscroll" ref={track} data-testid="timeline-hscroll" role="scrollbar" aria-orientation="horizontal" aria-label="Timeline horizontal scroll" hidden><div ref={inner} style={{ height: 1 }} /></div>;
}

export interface EditorWorkspaceViewModel {
  readonly view: { readonly documentEpoch: number; readonly viewMode: string; readonly signalSplitEnabled: boolean; readonly signalSplitRatio: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly zoom?: number; readonly cursorPresentationRevision?: number; readonly cursor: { readonly a?: number; readonly b?: number; readonly deltaCycles?: number } };
  readonly layout: { readonly leftPaneWidth: number; readonly frozenPaneMinWidth: number; readonly frozenPaneWidth: number; readonly bottomVisible: boolean; readonly bottomHeight: number; readonly bottomMaxHeight: number; readonly inspectorVisible: boolean; readonly inspectorWidth: number };
  readonly refs: { readonly viewport: RefObject<HTMLDivElement | null>; readonly gridLayer: RefObject<HTMLDivElement | null>; readonly ruler: RefObject<HTMLDivElement | null>; readonly host: RefObject<HTMLDivElement | null>; readonly viewportLower: RefObject<HTMLDivElement | null>; readonly rulerLower: RefObject<HTMLDivElement | null>; readonly hostLower: RefObject<HTMLDivElement | null>; readonly gridLayerLower: RefObject<HTMLDivElement | null> };
  readonly content: { readonly header: ReactNode; readonly signalHeader?: ReactNode; readonly transactionTree: ReactNode; readonly viewportContent: ReactNode; readonly viewportLegend: ReactNode; readonly leftRail?: ReactNode; readonly bottom: ReactNode; readonly inspector: ReactNode };
  readonly interactions: {
    readonly onInspectorKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onInspectorPointerDown: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerMove: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onLeftPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onLeftPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onFrozenPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onFrozenPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onBottomReset: () => void; readonly onInspectorReset: () => void;
    readonly onBottomKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onBottomPointerDown: PointerEventHandler<HTMLDivElement>; readonly onBottomPointerMove: PointerEventHandler<HTMLDivElement>; readonly onBottomPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onSignalSplitKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onSignalSplitPointerDown: PointerEventHandler<HTMLDivElement>; readonly onSignalSplitPointerMove: PointerEventHandler<HTMLDivElement>; readonly onSignalSplitPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onViewportKeyDown?: KeyboardEventHandler<HTMLDivElement>;
    readonly onSetCursorAtCycle?: (which: "a" | "b", cycle: number) => void;
    readonly resolveCursorCycleAtClientX?: (clientX: number, viewport: HTMLDivElement, rulerContent?: HTMLDivElement) => number | undefined;
    readonly resolveCursorViewportXForCycle?: (cycle: number, viewport: HTMLDivElement, rulerContent: HTMLDivElement) => number | undefined;
  };
}

export interface EditorWorkspaceViewProps {
  readonly viewModel: EditorWorkspaceViewModel;
}

/** Owns the stable cycle/transaction workspace DOM; runtime owners only supply refs and callbacks. */
type SplitDividerHandlers = Readonly<{ signalSplitRatio: number; onKeyDown: KeyboardEventHandler<HTMLElement>; onPointerDown: PointerEventHandler<HTMLElement>; onPointerMove: PointerEventHandler<HTMLElement>; onPointerUp: PointerEventHandler<HTMLElement> }>;

/** Combined-only (internal ViewMode "Split") panes: the Transaction pane and the pane divider (#615). */
function CombinedModePanes({ transactionContent, signalHeader, signalSplitRatio, onKeyDown: onSignalSplitKeyDown, onPointerDown: onSignalSplitPointerDown, onPointerMove: onSignalSplitPointerMove, onPointerUp: onSignalSplitPointerUp }: SplitDividerHandlers & Readonly<{ transactionContent: ReactNode; signalHeader?: ReactNode }>) {
  const pane = useRef<HTMLDivElement>(null);
  // The Signal pane's nested Timeline viewport is the single horizontal owner; the Transaction pane (its own clipped region) mirrors it.
  useEffect(() => (pane.current ? mountCombinedTransactionPaneScroll(pane.current) : undefined), []);
  return <>
    <div className="split-transaction-pane" ref={pane} data-pane="transaction" tabIndex={0} aria-label="Transaction pane">
      <div className="combined-pane-heading combined-pane-heading-transaction" data-testid="combined-transaction-heading" role="heading" aria-level={2}>Transactions</div>
      {transactionContent}
    </div>
    <div className="combined-split-divider" data-testid="combined-split-divider" role="separator" aria-label="Resize Transaction and Cycle panes" aria-orientation="horizontal" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(signalSplitRatio * 100)} tabIndex={0} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} onPointerCancel={onSignalSplitPointerUp} />
    {signalHeader && <div className="combined-signal-header">{signalHeader}</div>}
  </>;
}

/** Cycle-only Signal Split lower viewport and its divider (#615). */
function CycleSignalSplitPane({ signalSplitRatio, gridEnabled, rulerEnabled, viewportLower, gridLayerLower, rulerLower, hostLower, onViewportKeyDown, onKeyDown: onSignalSplitKeyDown, onPointerDown: onSignalSplitPointerDown, onPointerMove: onSignalSplitPointerMove, onPointerUp: onSignalSplitPointerUp }: SplitDividerHandlers & Readonly<{ gridEnabled: boolean; rulerEnabled: boolean; viewportLower: RefObject<HTMLDivElement | null>; gridLayerLower: RefObject<HTMLDivElement | null>; rulerLower: RefObject<HTMLDivElement | null>; hostLower: RefObject<HTMLDivElement | null>; onViewportKeyDown: KeyboardEventHandler<HTMLDivElement> | undefined }>) {
  return <>
    <div className="signal-split-divider" data-testid="signal-split-divider" role="separator" aria-label="Signal Split divider" aria-orientation="horizontal" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(signalSplitRatio * 100)} tabIndex={0} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} onPointerCancel={onSignalSplitPointerUp} />
    <div className="cycle-viewport signal-split-lower" ref={viewportLower} data-testid="cycle-viewport-lower" data-pane="lower" data-time-viewport-owner="cycle-inner" tabIndex={0} aria-label="Lower pane timing canvas navigation" onKeyDown={onViewportKeyDown}>
      <div className="geometry-grid" ref={gridLayerLower} data-testid="geometry-grid-lower" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
      <div className="cycle-ruler" data-testid="cycle-ruler-lower" aria-label="Lower pane cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={rulerLower} /></div>
      <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band-lower" aria-hidden="true" hidden />
      <div className="surface-host" ref={hostLower} data-testid="cycle-surface-lower" />
    </div>
  </>;
}

/** Owns Cycle-only frozen/left splitters and the Cycle panel header. The time canvas remains the shared source-time primitive. */
function CycleWorkspace({ viewModel }: EditorWorkspaceViewProps) {
  const { leftPaneWidth, frozenPaneMinWidth, frozenPaneWidth } = viewModel.layout;
  const { header } = viewModel.content;
  const interactions = viewModel.interactions;
  return <>
    <LeftPaneResizer width={leftPaneWidth} interactions={interactions} />
    <FrozenPaneResizer width={frozenPaneWidth} minWidth={frozenPaneMinWidth} interactions={interactions} />
    {header}
  </>;
}

/** Owns Transaction-specific header placement; its tree/lane are supplied by the Transaction presentation owner. */
function TransactionWorkspace({ viewModel }: EditorWorkspaceViewProps) {
  const { header } = viewModel.content;
  return <>
    <div className="workspace-header">{header}</div>
  </>;
}

/** Owns Combined-only header and left splitter; the pane composer below uses one shared outer horizontal viewport. */
function CombinedWorkspace({ viewModel }: EditorWorkspaceViewProps) {
  const { content } = viewModel;
  const { header } = content;
  return <div className="workspace-header">{header}</div>;
}

function CombinedWorkspaceChrome({ viewModel }: EditorWorkspaceViewProps) {
  return <LeftPaneResizer width={viewModel.layout.leftPaneWidth} interactions={viewModel.interactions} className="combined-left-pane-resizer" />;
}

function CombinedWorkspacePanes({ viewModel }: EditorWorkspaceViewProps) {
  const { view, content, interactions } = viewModel;
  return <CombinedModePanes transactionContent={content.viewportContent} signalHeader={content.signalHeader} signalSplitRatio={view.signalSplitRatio} onKeyDown={interactions.onSignalSplitKeyDown} onPointerDown={interactions.onSignalSplitPointerDown} onPointerMove={interactions.onSignalSplitPointerMove} onPointerUp={interactions.onSignalSplitPointerUp} />;
}

function CycleWorkspaceRail({ content }: Readonly<{ content: ReactNode }>) {
  return <div className="left-workspace-rail mode-cycle" data-testid="left-workspace-rail" data-workspace-owner="CycleWorkspace">{content}</div>;
}

function TransactionWorkspaceRail({ content }: Readonly<{ content: ReactNode }>) {
  return <div className="left-workspace-rail mode-transaction" data-testid="left-workspace-rail" data-workspace-owner="TransactionWorkspace">{content}</div>;
}

function CombinedWorkspaceRail({ content }: Readonly<{ content: ReactNode }>) {
  return <div className="left-workspace-rail mode-split" data-testid="left-workspace-rail" data-workspace-owner="CombinedWorkspace">{content}</div>;
}

function CycleWorkspaceAuxiliary({ viewModel }: EditorWorkspaceViewProps) {
  const { view, refs, interactions } = viewModel;
  if (!view.signalSplitEnabled) return null;
  return <CycleSignalSplitPane signalSplitRatio={view.signalSplitRatio} gridEnabled={view.gridEnabled} rulerEnabled={view.rulerEnabled} viewportLower={refs.viewportLower} gridLayerLower={refs.gridLayerLower} rulerLower={refs.rulerLower} hostLower={refs.hostLower} onViewportKeyDown={interactions.onViewportKeyDown} onKeyDown={interactions.onSignalSplitKeyDown} onPointerDown={interactions.onSignalSplitPointerDown} onPointerMove={interactions.onSignalSplitPointerMove} onPointerUp={interactions.onSignalSplitPointerUp} />;
}

/**
 * A mode owner selects every mode-specific workspace attachment in one place.
 * The timeline frame itself stays a shared, stable primitive: its renderer refs
 * are imperative runtime owners and must not be duplicated by each mode.
 */
type WorkspaceOwnerPlan = Readonly<{
  mode: ViewMode;
  name: "CycleWorkspace" | "TransactionWorkspace" | "CombinedWorkspace";
  /** Explicit presentation authority; semantic time remains the shared source-cycle contract. */
  timeViewportOwner: "cycle-inner" | "transaction-viewport" | "combined-inner";
  contentWidthOwner: "cycle-geometry" | "transaction-lanes" | "combined-source-time";
  headerAbove: ReactNode;
  panelChrome: ReactNode;
  rail: ReactNode;
  upperPane: ReactNode;
  timelineBody: ReactNode;
  auxiliary: ReactNode;
}>;

function createWorkspaceOwnerPlan(viewModel: EditorWorkspaceViewModel): WorkspaceOwnerPlan {
  const mode = viewModel.view.viewMode as ViewMode;
  switch (mode) {
    case "Cycle":
      return {
        mode,
        name: "CycleWorkspace",
        timeViewportOwner: "cycle-inner",
        contentWidthOwner: "cycle-geometry",
        headerAbove: null,
        panelChrome: <CycleWorkspace viewModel={viewModel} />,
        rail: <CycleWorkspaceRail content={viewModel.content.leftRail} />,
        upperPane: null,
        timelineBody: viewModel.content.viewportLegend,
        auxiliary: <CycleWorkspaceAuxiliary viewModel={viewModel} />,
      };
    case "Transaction":
      return {
        mode,
        name: "TransactionWorkspace",
        timeViewportOwner: "transaction-viewport",
        contentWidthOwner: "transaction-lanes",
        headerAbove: <TransactionWorkspace viewModel={viewModel} />,
        panelChrome: null,
        rail: <TransactionWorkspaceRail content={viewModel.content.transactionTree} />,
        upperPane: null,
        timelineBody: viewModel.content.viewportContent,
        auxiliary: null,
      };
    case "Split":
      return {
        mode,
        name: "CombinedWorkspace",
        timeViewportOwner: "combined-inner",
        contentWidthOwner: "combined-source-time",
        headerAbove: <CombinedWorkspace viewModel={viewModel} />,
        panelChrome: <CombinedWorkspaceChrome viewModel={viewModel} />,
        rail: <CombinedWorkspaceRail content={viewModel.content.transactionTree} />,
        upperPane: <CombinedWorkspacePanes viewModel={viewModel} />,
        timelineBody: viewModel.content.viewportLegend,
        auxiliary: null,
      };
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unsupported workspace mode: ${String(exhaustive)}`);
    }
  }
}

function TimelinePaneContents({ gridLayer, ruler, host, gridEnabled, rulerEnabled, snapEnabled, body, combined = false }: Readonly<{ gridLayer: RefObject<HTMLDivElement | null>; ruler: RefObject<HTMLDivElement | null>; host: RefObject<HTMLDivElement | null>; gridEnabled: boolean; rulerEnabled: boolean; snapEnabled: boolean; body: ReactNode; combined?: boolean }>) {
  return <>
  {combined && <div className="combined-pane-heading combined-pane-heading-waveforms" data-testid="combined-waveforms-heading" role="heading" aria-level={2}>Waveforms</div>}
  <div className={`split-signal-content${combined ? "" : " non-split-signal-content"}`}>
    <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
    <div className="cycle-ruler" data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={ruler} /></div>
    <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band" aria-hidden="true" hidden />
    {body}
    <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
  </div></>;
}

function LeftPaneResizer({ width, interactions, className }: Readonly<{ width: number; interactions: EditorWorkspaceViewModel["interactions"]; className?: string }>) {
  return <div className={`left-pane-resize-handle${className ? ` ${className}` : ""}`} data-testid="left-pane-resizer" role="separator" aria-label="Resize Signal Group pane" aria-orientation="vertical" aria-valuemin={LEFT_PANE_MIN_WIDTH} aria-valuemax={LEFT_PANE_MAX_WIDTH} aria-valuenow={width} tabIndex={0} onKeyDown={interactions.onLeftPaneKeyDown} onPointerDown={interactions.onLeftPanePointerDown} onPointerMove={interactions.onLeftPanePointerMove} onPointerUp={interactions.onLeftPanePointerUp} onPointerCancel={interactions.onLeftPanePointerUp} />;
}

function FrozenPaneResizer({ width, minWidth, interactions }: Readonly<{ width: number; minWidth: number; interactions: EditorWorkspaceViewModel["interactions"] }>) {
  return <div className="frozen-pane-resize-handle" data-testid="frozen-pane-resizer" role="separator" aria-label="Resize Signal label and timing pane" aria-orientation="vertical" aria-valuemin={minWidth} aria-valuemax={360} aria-valuenow={width} tabIndex={0} onKeyDown={interactions.onFrozenPaneKeyDown} onPointerDown={interactions.onFrozenPanePointerDown} onPointerMove={interactions.onFrozenPanePointerMove} onPointerUp={interactions.onFrozenPanePointerUp} onPointerCancel={interactions.onFrozenPanePointerUp} />;
}

export function EditorWorkspaceView({
  viewModel,
}: EditorWorkspaceViewProps) {
  const { documentEpoch, viewMode, zoom, cursorPresentationRevision, cursor, signalSplitEnabled } = viewModel.view;
  const workspace = createWorkspaceOwnerPlan(viewModel);
  const { bottomVisible, bottomHeight, bottomMaxHeight, inspectorVisible, inspectorWidth } = viewModel.layout;
  const { viewport, gridLayer, ruler, host, viewportLower, gridLayerLower, rulerLower, hostLower } = viewModel.refs;
  const { bottom, inspector } = viewModel.content;
  const { onBottomReset, onInspectorReset, onBottomKeyDown, onBottomPointerDown, onBottomPointerMove, onBottomPointerUp, onInspectorKeyDown, onInspectorPointerDown, onInspectorPointerMove, onInspectorPointerUp, onSetCursorAtCycle, resolveCursorCycleAtClientX, resolveCursorViewportXForCycle } = viewModel.interactions;
  const cursorOverlayOwnerRef = useRef<CursorOverlayOwner | null>(null);
  if (cursorOverlayOwnerRef.current === null) cursorOverlayOwnerRef.current = new CursorOverlayOwner();
  const cursorOverlayOwner = cursorOverlayOwnerRef.current;
  const cursorInputRef = useRef({ cursorA: cursor.a, cursorB: cursor.b, onSetCursorAtCycle, resolveCursorCycleAtClientX, resolveCursorViewportXForCycle });
  cursorInputRef.current = { cursorA: cursor.a, cursorB: cursor.b, onSetCursorAtCycle, resolveCursorCycleAtClientX, resolveCursorViewportXForCycle };
  useEffect(() => {
    return cursorOverlayOwner.connect({
      viewport: viewport.current,
      ruler: ruler.current,
      viewportLower: viewportLower.current,
      rulerLower: rulerLower.current,
      getPresentation: () => cursorInputRef.current,
    });
    // The ref objects are stable, but the Signal Split Lower pane mounts/unmounts with `signalSplitEnabled` and the mode owner can swap the
    // viewport element: re-attach the owner to the panes that currently exist.
  }, [cursorOverlayOwner, ruler, rulerLower, viewport, viewportLower, signalSplitEnabled, viewMode]);
  useEffect(() => { cursorOverlayOwner.refresh(); }, [cursorOverlayOwner, cursor.a, cursor.b, cursorPresentationRevision, zoom, resolveCursorViewportXForCycle]);
  // Workspace/document replacement ends gestures captured by the old owner.
  useEffect(() => () => cursorOverlayOwner.cancelActiveDrags(), [cursorOverlayOwner, viewMode, documentEpoch]);
  return <div className="desktop-workspace" data-workspace-owner={workspace.name}>
    {workspace.headerAbove}
    <section className={`cycle-panel mode-${workspace.mode.toLowerCase()}`} aria-label={`${workspace.mode === "Split" ? "Combined" : workspace.mode} View`} data-view-mode={workspace.mode} data-workspace-owner={workspace.name} data-signal-split={String(viewModel.view.signalSplitEnabled && workspace.mode === "Cycle")}>
      {workspace.panelChrome}
      <div className={`cycle-viewport${viewMode === "Split" ? " split-signal-pane" : ""}`} ref={viewport} data-testid="cycle-viewport" data-pane={viewMode === "Split" ? "signal" : undefined} data-time-viewport-owner={workspace.timeViewportOwner} data-content-width-owner={workspace.contentWidthOwner} tabIndex={0} aria-label="Timing canvas navigation" onKeyDown={viewModel.interactions.onViewportKeyDown}>
        {workspace.upperPane}
        <TimelinePaneContents gridLayer={gridLayer} ruler={ruler} host={host} gridEnabled={viewModel.view.gridEnabled} rulerEnabled={viewModel.view.rulerEnabled} snapEnabled={viewModel.view.snapEnabled} body={workspace.timelineBody} combined={workspace.mode === "Split"} />
      </div>
      {(workspace.timeViewportOwner === "cycle-inner" || workspace.timeViewportOwner === "combined-inner") && <TimelineHorizontalScrollbar viewport={viewport} viewMode={viewMode} leftPaneWidth={viewModel.layout.leftPaneWidth} />}
      {workspace.auxiliary}
    </section>
    {workspace.rail}
    {bottomVisible && <div className="bottom-resize-track" data-testid="bottom-resizer" role="separator" aria-label="Resize bottom editor" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={bottomMaxHeight} aria-valuenow={bottomHeight} tabIndex={0} title="Drag to resize; double-click to reset" onDoubleClick={onBottomReset} onKeyDown={onBottomKeyDown} onPointerDown={onBottomPointerDown} onPointerMove={onBottomPointerMove} onPointerUp={onBottomPointerUp} onPointerCancel={onBottomPointerUp} />}
    {bottomVisible && bottom}
    <aside hidden={!inspectorVisible} className="inspector-shell" data-testid="inspector-shell"><div className="inspector-resize-handle" data-testid="inspector-resizer" role="separator" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={inspectorWidth} tabIndex={0} title="Drag to resize; double-click to reset" onDoubleClick={onInspectorReset} onKeyDown={onInspectorKeyDown} onPointerDown={onInspectorPointerDown} onPointerMove={onInspectorPointerMove} onPointerUp={onInspectorPointerUp} onPointerCancel={onInspectorPointerUp} />{inspector}</aside>
  </div>;
}
