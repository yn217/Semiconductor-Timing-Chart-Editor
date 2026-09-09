import type { KeyboardEventHandler, PointerEventHandler, ReactNode, RefObject } from "react";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH } from "./workspace/use-workspace-ui-state.js";

export interface EditorWorkspaceViewModel {
  readonly view: { readonly viewMode: string; readonly signalSplitEnabled: boolean; readonly signalSplitRatio: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly cursor: { readonly a?: number; readonly b?: number; readonly deltaCycles?: number } };
  readonly layout: { readonly leftPaneWidth: number; readonly frozenPaneMinWidth: number; readonly frozenPaneWidth: number; readonly bottomVisible: boolean; readonly bottomHeight: number; readonly inspectorVisible: boolean; readonly inspectorWidth: number };
  readonly refs: { readonly viewport: RefObject<HTMLDivElement | null>; readonly gridLayer: RefObject<HTMLDivElement | null>; readonly ruler: RefObject<HTMLDivElement | null>; readonly host: RefObject<HTMLDivElement | null>; readonly viewportLower: RefObject<HTMLDivElement | null>; readonly rulerLower: RefObject<HTMLDivElement | null>; readonly hostLower: RefObject<HTMLDivElement | null>; readonly gridLayerLower: RefObject<HTMLDivElement | null> };
  readonly content: { readonly header: ReactNode; readonly viewportContent: ReactNode; readonly viewportLegend: ReactNode; readonly bottom: ReactNode; readonly inspector: ReactNode };
  readonly interactions: {
    readonly onInspectorKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onInspectorPointerDown: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerMove: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onLeftPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onLeftPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onFrozenPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onFrozenPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onBottomKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onBottomPointerDown: PointerEventHandler<HTMLDivElement>; readonly onBottomPointerMove: PointerEventHandler<HTMLDivElement>; readonly onBottomPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onSignalSplitKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onSignalSplitPointerDown: PointerEventHandler<HTMLDivElement>; readonly onSignalSplitPointerMove: PointerEventHandler<HTMLDivElement>; readonly onSignalSplitPointerUp: PointerEventHandler<HTMLDivElement>;
  };
}

export interface EditorWorkspaceViewProps {
  readonly viewModel: EditorWorkspaceViewModel;
}

/** Owns the stable cycle/transaction workspace DOM; runtime owners only supply refs and callbacks. */
export function EditorWorkspaceView({
  viewModel,
}: EditorWorkspaceViewProps) {
  const { viewMode, signalSplitEnabled, signalSplitRatio, gridEnabled, snapEnabled, rulerEnabled } = viewModel.view;
  const { leftPaneWidth, frozenPaneMinWidth, frozenPaneWidth, bottomVisible, bottomHeight, inspectorVisible, inspectorWidth } = viewModel.layout;
  const { viewport, gridLayer, ruler, host, viewportLower, rulerLower, hostLower, gridLayerLower } = viewModel.refs;
  const { header, viewportContent, viewportLegend, bottom, inspector } = viewModel.content;
  const { onInspectorKeyDown, onInspectorPointerDown, onInspectorPointerMove, onInspectorPointerUp, onLeftPaneKeyDown, onLeftPanePointerDown, onLeftPanePointerMove, onLeftPanePointerUp, onFrozenPaneKeyDown, onFrozenPanePointerDown, onFrozenPanePointerMove, onFrozenPanePointerUp, onBottomKeyDown, onBottomPointerDown, onBottomPointerMove, onBottomPointerUp, onSignalSplitKeyDown, onSignalSplitPointerDown, onSignalSplitPointerMove, onSignalSplitPointerUp } = viewModel.interactions;
  return <div className="desktop-workspace">
    <section className={`cycle-panel mode-${viewMode.toLowerCase()}`} aria-label={`${viewMode} View`} data-view-mode={viewMode} data-signal-split={String(signalSplitEnabled && viewMode === "Cycle")}>
      <div className="left-pane-resize-handle" data-testid="left-pane-resizer" role="separator" aria-label="Resize Signal Group pane" aria-orientation="vertical" aria-valuemin={LEFT_PANE_MIN_WIDTH} aria-valuemax={LEFT_PANE_MAX_WIDTH} aria-valuenow={leftPaneWidth} tabIndex={0} onKeyDown={onLeftPaneKeyDown} onPointerDown={onLeftPanePointerDown} onPointerMove={onLeftPanePointerMove} onPointerUp={onLeftPanePointerUp} onPointerCancel={onLeftPanePointerUp} />
      {/* Transaction Mode GUI realignment: this splitter's whole purpose is
          separating Cycle Mode's frozen Role/Signal-name columns from the
          waveform canvas -- Transaction Mode has no such split (its Tree
          is one unified panel; "Group"/"Transaction" are header labels
          only, not two independently-resizable body columns). It was
          rendered unconditionally in every view mode, so its full-height
          (top:0/bottom:0) hit target landed inside the Transaction Tree
          panel with no corresponding column boundary to resize -- reported
          as a stray vertical line bleeding through the Tree's content. */}
      {viewMode === "Cycle" && <div className="frozen-pane-resize-handle" data-testid="frozen-pane-resizer" role="separator" aria-label="Resize Signal label and timing pane" aria-orientation="vertical" aria-valuemin={frozenPaneMinWidth} aria-valuemax={360} aria-valuenow={frozenPaneWidth} tabIndex={0} onKeyDown={onFrozenPaneKeyDown} onPointerDown={onFrozenPanePointerDown} onPointerMove={onFrozenPanePointerMove} onPointerUp={onFrozenPanePointerUp} onPointerCancel={onFrozenPanePointerUp} />}
      {header}
      {viewMode === "Split" ? <div className="split-workspace" data-testid="split-workspace">
        <div className="split-transaction-pane" data-pane="transaction" tabIndex={0} aria-label="Transaction pane">
          {viewportContent}
        </div>
        <div className="cycle-viewport split-signal-pane" ref={viewport} data-testid="cycle-viewport" data-pane="signal" tabIndex={0} aria-label="Signal timing canvas navigation">
          <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
          <div className="cycle-ruler" data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={ruler} /></div>
          <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band" aria-hidden="true" hidden />
          {viewportLegend}
          <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
        </div>
      </div> : <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport" tabIndex={0} aria-label="Timing canvas navigation">
        {viewportContent}
        <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
        <div className="cycle-ruler" data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={ruler} /></div>
        <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band" aria-hidden="true" hidden />
        {viewportLegend}
        <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
      </div>}
      {signalSplitEnabled && viewMode === "Cycle" && <>
        <div className="signal-split-divider" data-testid="signal-split-divider" role="separator" aria-label="Signal Split divider" aria-orientation="horizontal" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(signalSplitRatio * 100)} tabIndex={0} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} onPointerCancel={onSignalSplitPointerUp} />
        <div className="cycle-viewport signal-split-lower" ref={viewportLower} data-testid="cycle-viewport-lower" data-pane="lower" tabIndex={0} aria-label="Lower pane timing canvas navigation">
          <div className="geometry-grid" ref={gridLayerLower} data-testid="geometry-grid-lower" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
          <div className="cycle-ruler" data-testid="cycle-ruler-lower" aria-label="Lower pane cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={rulerLower} /></div>
          <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band-lower" aria-hidden="true" hidden />
          <div className="surface-host" ref={hostLower} data-testid="cycle-surface-lower" />
        </div>
      </>}
    </section>
    {bottomVisible && <div className="bottom-resize-track" data-testid="bottom-resizer" role="separator" aria-label="Resize bottom editor" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={420} aria-valuenow={bottomHeight} tabIndex={0} onKeyDown={onBottomKeyDown} onPointerDown={onBottomPointerDown} onPointerMove={onBottomPointerMove} onPointerUp={onBottomPointerUp} onPointerCancel={onBottomPointerUp} />}
    {bottomVisible && bottom}
    <aside hidden={!inspectorVisible} className="inspector-shell" data-testid="inspector-shell"><div className="inspector-resize-handle" data-testid="inspector-resizer" role="separator" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={inspectorWidth} tabIndex={0} onKeyDown={onInspectorKeyDown} onPointerDown={onInspectorPointerDown} onPointerMove={onInspectorPointerMove} onPointerUp={onInspectorPointerUp} onPointerCancel={onInspectorPointerUp} />{inspector}</aside>
  </div>;
}
