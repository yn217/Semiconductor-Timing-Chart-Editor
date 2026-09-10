import { useEffect, type KeyboardEventHandler, type PointerEventHandler, type ReactNode, type RefObject } from "react";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH } from "./workspace/use-workspace-ui-state.js";

export interface EditorWorkspaceViewModel {
  readonly view: { readonly viewMode: string; readonly signalSplitEnabled: boolean; readonly signalSplitRatio: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly zoom?: number; readonly cursor: { readonly a?: number; readonly b?: number; readonly deltaCycles?: number } };
  readonly layout: { readonly leftPaneWidth: number; readonly frozenPaneMinWidth: number; readonly frozenPaneWidth: number; readonly bottomVisible: boolean; readonly bottomHeight: number; readonly inspectorVisible: boolean; readonly inspectorWidth: number };
  readonly refs: { readonly viewport: RefObject<HTMLDivElement | null>; readonly gridLayer: RefObject<HTMLDivElement | null>; readonly ruler: RefObject<HTMLDivElement | null>; readonly host: RefObject<HTMLDivElement | null>; readonly viewportLower: RefObject<HTMLDivElement | null>; readonly rulerLower: RefObject<HTMLDivElement | null>; readonly hostLower: RefObject<HTMLDivElement | null>; readonly gridLayerLower: RefObject<HTMLDivElement | null> };
  readonly content: { readonly header: ReactNode; readonly viewportContent: ReactNode; readonly viewportLegend: ReactNode; readonly bottom: ReactNode; readonly inspector: ReactNode };
  readonly interactions: {
    readonly onInspectorKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onInspectorPointerDown: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerMove: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onLeftPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onLeftPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onFrozenPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onFrozenPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onBottomKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onBottomPointerDown: PointerEventHandler<HTMLDivElement>; readonly onBottomPointerMove: PointerEventHandler<HTMLDivElement>; readonly onBottomPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onSignalSplitKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onSignalSplitPointerDown: PointerEventHandler<HTMLDivElement>; readonly onSignalSplitPointerMove: PointerEventHandler<HTMLDivElement>; readonly onSignalSplitPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onViewportKeyDown?: KeyboardEventHandler<HTMLDivElement>;
    readonly onSetCursorAtCycle?: (which: "a" | "b", cycle: number) => void;
    readonly resolveCursorCycleAtClientX?: (clientX: number, viewport: HTMLDivElement) => number | undefined;
  };
}

export interface EditorWorkspaceViewProps {
  readonly viewModel: EditorWorkspaceViewModel;
}

/** Owns the stable cycle/transaction workspace DOM; runtime owners only supply refs and callbacks. */
export function EditorWorkspaceView({
  viewModel,
}: EditorWorkspaceViewProps) {
  const { viewMode, signalSplitEnabled, signalSplitRatio, gridEnabled, snapEnabled, rulerEnabled, zoom, cursor } = viewModel.view;
  const { leftPaneWidth, frozenPaneMinWidth, frozenPaneWidth, bottomVisible, bottomHeight, inspectorVisible, inspectorWidth } = viewModel.layout;
  const { viewport, gridLayer, ruler, host, viewportLower, rulerLower, hostLower, gridLayerLower } = viewModel.refs;
  const { header, viewportContent, viewportLegend, bottom, inspector } = viewModel.content;
  const { onInspectorKeyDown, onInspectorPointerDown, onInspectorPointerMove, onInspectorPointerUp, onLeftPaneKeyDown, onLeftPanePointerDown, onLeftPanePointerMove, onLeftPanePointerUp, onFrozenPaneKeyDown, onFrozenPanePointerDown, onFrozenPanePointerMove, onFrozenPanePointerUp, onBottomKeyDown, onBottomPointerDown, onBottomPointerMove, onBottomPointerUp, onSignalSplitKeyDown, onSignalSplitPointerDown, onSignalSplitPointerMove, onSignalSplitPointerUp, onViewportKeyDown, onSetCursorAtCycle, resolveCursorCycleAtClientX } = viewModel.interactions;
  useEffect(() => {
    // Cursor A/B are workspace-only source-cycle markers. The ruler is the
    // shared display-time owner, so resolve each marker from the rendered
    // source-cycle tick instead of deriving a second x scale in React.
    const viewports = [
      [viewport.current, ruler.current],
      [viewportLower.current, rulerLower.current],
    ] as const;
    const cursors = [
      ["a", cursor.a, "Cursor A"],
      ["b", cursor.b, "Cursor B"],
    ] as const;
    const rulerElements = () => [ruler.current, rulerLower.current].filter((element): element is HTMLDivElement => element !== null);
    const tickCache = new WeakMap<HTMLDivElement, { ticks: readonly { readonly x: number; readonly cycle: number }[]; scrollLeft: number }>();
    const cacheTicks = (rulerElement: HTMLDivElement) => {
      const next = [...rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")].map((candidate) => ({
        x: candidate.getBoundingClientRect().left,
        cycle: Number(candidate.dataset.sourceCycle ?? candidate.dataset.cycle),
      })).filter((tick) => Number.isFinite(tick.x) && Number.isFinite(tick.cycle)).sort((left, right) => left.x - right.x);
      tickCache.set(rulerElement, { ticks: next, scrollLeft: rulerElement.scrollLeft });
      return next;
    };
    const shiftCachedTicks = (rulerElement: HTMLDivElement) => {
      const cached = tickCache.get(rulerElement);
      if (!cached) return cacheTicks(rulerElement);
      const nextScrollLeft = rulerElement.scrollLeft;
      const delta = cached.scrollLeft - nextScrollLeft;
      if (delta === 0) return cached.ticks;
      const ticks = cached.ticks.map((tick) => ({ ...tick, x: tick.x + delta }));
      tickCache.set(rulerElement, { ticks, scrollLeft: nextScrollLeft });
      return ticks;
    };
    const nearestCachedTick = (rulerElement: HTMLDivElement, clientX: number) => {
      const ticks = tickCache.get(rulerElement)?.ticks ?? cacheTicks(rulerElement);
      if (ticks.length === 0) return undefined;
      let low = 0;
      let high = ticks.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (ticks[middle]!.x < clientX) low = middle + 1; else high = middle;
      }
      const right = ticks[low]!;
      const left = ticks[Math.max(0, low - 1)]!;
      return Math.abs(left.x - clientX) <= Math.abs(right.x - clientX) ? left : right;
    };
    const findTick = (sourceRuler: HTMLDivElement, cycle: number) => {
      const rulers = [sourceRuler, ...rulerElements().filter((element) => element !== sourceRuler)];
      return rulers.flatMap((element) => [...element.querySelectorAll<HTMLElement>("[data-cycle]")]).find((candidate) => Number(candidate.dataset.sourceCycle ?? candidate.dataset.cycle) === cycle);
    };
    const update = () => {
      for (const [viewportElement, rulerElement] of viewports) {
        if (!viewportElement || !rulerElement) continue;
        shiftCachedTicks(rulerElement);
        let overlay = viewportElement.querySelector<HTMLElement>("[data-role='cursor-overlay']");
        if (!overlay) {
          overlay = viewportElement.ownerDocument.createElement("div");
          overlay.dataset.role = "cursor-overlay";
          overlay.setAttribute("aria-hidden", "true");
          viewportElement.append(overlay);
        }
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.pointerEvents = "none";
        const viewportRect = viewportElement.getBoundingClientRect();
        for (const [key, cycle, label] of cursors) {
          let line = overlay.querySelector<HTMLElement>(`[data-cursor='${key}']`);
          if (cycle === undefined) { line?.remove(); continue; }
          if (!line) {
            line = viewportElement.ownerDocument.createElement("div");
            line.dataset.cursor = key;
            line.dataset.role = "cursor-line";
            line.setAttribute("aria-label", label);
            overlay.append(line);
          }
          const tick = findTick(rulerElement, cycle);
          if (!tick) { line.hidden = true; continue; }
          const tickRect = tick.getBoundingClientRect();
          line.hidden = false;
          // Keep the dynamically-created guide independently hit-testable even
          // before the stylesheet/layout pass has assigned the overlay rule.
          line.style.position = "absolute";
          line.style.top = "0";
          line.style.width = "2px";
          line.style.height = `${Math.max(viewportElement.clientHeight, 250)}px`;
          line.style.pointerEvents = "auto";
          line.style.left = `${tickRect.left - viewportRect.left}px`;
          line.dataset.cycle = String(cycle);
        }
      }
    };
    update();
    const scrollTargets = [viewport.current, viewportLower.current].filter((item): item is HTMLDivElement => item !== null);
    // Ruler presentation is refreshed by the owning timeline runtime. A
    // deferred pass covers late-mounted ticks without installing a subtree
    // subtree observer (which would turn every ruler update into a generic
    // synchronization path).
    const deferredUpdate = requestAnimationFrame(update);
    const rulerResizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    for (const target of [ruler.current, rulerLower.current].filter((item): item is HTMLDivElement => item !== null)) rulerResizeObserver?.observe(target);
    const dragHandlers: Array<[HTMLDivElement, (event: PointerEvent) => void]> = [];
    for (const [viewportElement, rulerElement] of viewports) {
      if (!viewportElement || !rulerElement || !onSetCursorAtCycle) continue;
      const onPointerDown = (event: PointerEvent) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='cursor-line']") : null;
        const which = target?.dataset.cursor as "a" | "b" | undefined;
        if (!which) return;
        event.preventDefault();
        const move = (moveEvent: PointerEvent) => {
          const resolved = resolveCursorCycleAtClientX?.(moveEvent.clientX, viewportElement);
          if (resolved !== undefined) onSetCursorAtCycle(which, resolved);
          else {
            const nearest = nearestCachedTick(rulerElement, moveEvent.clientX);
            if (nearest) onSetCursorAtCycle(which, nearest.cycle);
          }
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up, { once: true });
      };
      viewportElement.addEventListener("pointerdown", onPointerDown, true);
      dragHandlers.push([viewportElement, onPointerDown]);
    }
    for (const target of scrollTargets) target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      for (const target of scrollTargets) target.removeEventListener("scroll", update);
      cancelAnimationFrame(deferredUpdate);
      rulerResizeObserver?.disconnect();
      for (const [target, handler] of dragHandlers) target.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("resize", update);
    };
  }, [ruler, rulerLower, cursor.a, cursor.b, zoom, viewport, viewportLower]);
  useEffect(() => {
    if (viewMode !== "Split") return undefined;
    const panel = viewport.current?.closest<HTMLElement>(".cycle-panel");
    const transactionPane = panel?.querySelector<HTMLElement>(".split-transaction-pane");
    const signalPane = panel?.querySelector<HTMLElement>(".split-signal-content");
    if (!transactionPane || !signalPane) return undefined;
    let syncing = false;
    const sync = (source: HTMLElement, target: HTMLElement) => {
      if (syncing || target.scrollLeft === source.scrollLeft) return;
      syncing = true;
      target.scrollLeft = source.scrollLeft;
      syncing = false;
    };
    const onTransactionScroll = () => sync(transactionPane, signalPane);
    const onSignalScroll = () => sync(signalPane, transactionPane);
    transactionPane.addEventListener("scroll", onTransactionScroll, { passive: true });
    signalPane.addEventListener("scroll", onSignalScroll, { passive: true });
    signalPane.scrollLeft = transactionPane.scrollLeft;
    return () => {
      transactionPane.removeEventListener("scroll", onTransactionScroll);
      signalPane.removeEventListener("scroll", onSignalScroll);
    };
  }, [viewMode, viewport]);
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
      <div className={`cycle-viewport${viewMode === "Split" ? " split-signal-pane" : ""}`} ref={viewport} data-testid="cycle-viewport" data-pane={viewMode === "Split" ? "signal" : undefined} tabIndex={0} aria-label="Timing canvas navigation" onKeyDown={onViewportKeyDown}>
        {viewMode === "Split" && <div className="split-transaction-pane" data-pane="transaction" tabIndex={0} aria-label="Transaction pane">{viewportContent}</div>}
        <div className={`split-signal-content${viewMode === "Split" ? "" : " non-split-signal-content"}`}>
          <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
          <div className="cycle-ruler" data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={ruler} /></div>
          <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band" aria-hidden="true" hidden />
          {viewMode === "Transaction" ? viewportContent : viewportLegend}
          <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
        </div>
      </div>
      {signalSplitEnabled && viewMode === "Cycle" && <>
        <div className="signal-split-divider" data-testid="signal-split-divider" role="separator" aria-label="Signal Split divider" aria-orientation="horizontal" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(signalSplitRatio * 100)} tabIndex={0} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} onPointerCancel={onSignalSplitPointerUp} />
        <div className="cycle-viewport signal-split-lower" ref={viewportLower} data-testid="cycle-viewport-lower" data-pane="lower" tabIndex={0} aria-label="Lower pane timing canvas navigation" onKeyDown={onViewportKeyDown}>
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
