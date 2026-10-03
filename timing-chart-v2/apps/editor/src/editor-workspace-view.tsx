import { useEffect, useRef, type KeyboardEventHandler, type PointerEventHandler, type ReactNode, type RefObject } from "react";
import { LEFT_PANE_MAX_WIDTH, LEFT_PANE_MIN_WIDTH, type ViewMode } from "./workspace/use-workspace-ui-state.js";
import { composeMode } from "./workspace/mode-composition.js";
import { timelineScrollOwner } from "./runtime/timeline-scroll-owner.js";

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
    view.dataset.ownHscroll = "true";
    let syncing = false;
    const layout = () => {
      const panel = bar.parentElement;
      if (!panel) return;
      const viewRect = view.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const ruler = view.querySelector<HTMLElement>(".cycle-ruler");
      const originLeft = ruler && !ruler.hidden ? ruler.getBoundingClientRect().left : viewRect.left;
      const owner = timelineScrollOwner(view);
      const offset = owner === view ? Math.max(0, originLeft - viewRect.left) : 0;
      bar.style.left = `${(owner === view ? viewRect.left : owner.getBoundingClientRect().left) - panelRect.left + offset}px`;
      // The Cycle panel spans Main + Bottom (#756); the Timeline track sits at the bottom of the visible Main area, above Bottom.
      const bottomTrack = panel.parentElement?.querySelector<HTMLElement>(".bottom-resize-track");
      const cover = bottomTrack && owner !== view ? Math.max(0, viewRect.bottom - bottomTrack.getBoundingClientRect().top) : 0; // Bottom + splitter only (not the rail footer)
      view.style.setProperty("--cycle-fill", `${Math.max(0, view.clientHeight - 34)}px`);
      bar.style.top = `${viewRect.bottom - panelRect.top - 15 - cover}px`; // overlays the strip the native bar used to occupy
      bar.style.width = `${Math.max(0, owner.clientWidth - offset)}px`;
      filler.style.width = `${Math.max(0, owner.scrollWidth - offset)}px`;
      bar.dataset.timelineLeft = String(Math.round(originLeft));
      bar.hidden = owner.scrollWidth <= owner.clientWidth;
      if (!syncing) bar.scrollLeft = owner.scrollLeft;
    };
    const onViewScroll = () => { if (syncing) return; syncing = true; bar.scrollLeft = timelineScrollOwner(view).scrollLeft; syncing = false; };
    const onBarScroll = () => { if (syncing) return; syncing = true; timelineScrollOwner(view).scrollLeft = bar.scrollLeft; syncing = false; };
    layout();
    view.addEventListener("scroll", onViewScroll, { passive: true, capture: true });
    bar.addEventListener("scroll", onBarScroll, { passive: true });
    // Size changes of the viewport, its content, the Timeline owner and its layers (zoom / --wave-width) re-lay the track out;
    // zoom also announces itself through `timeline-viewport-resize`.
    const observer = new ResizeObserver(layout);
    observer.observe(view);
    if (view.firstElementChild) observer.observe(view.firstElementChild);
    const owner = timelineScrollOwner(view);
    if (owner !== view) { observer.observe(owner); for (const child of owner.children) observer.observe(child); }
    window.addEventListener("resize", layout);
    view.addEventListener("timeline-viewport-resize", layout);
    return () => { view.removeEventListener("scroll", onViewScroll, true); bar.removeEventListener("scroll", onBarScroll); observer.disconnect(); window.removeEventListener("resize", layout); view.removeEventListener("timeline-viewport-resize", layout); delete view.dataset.ownHscroll; };
  }, [viewport, viewMode, leftPaneWidth]);
  return <div className="timeline-hscroll" ref={track} data-testid="timeline-hscroll" role="scrollbar" aria-orientation="horizontal" aria-label="Timeline horizontal scroll" hidden><div ref={inner} style={{ height: 1 }} /></div>;
}

export interface EditorWorkspaceViewModel {
  readonly view: { readonly viewMode: string; readonly signalSplitEnabled: boolean; readonly signalSplitRatio: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly zoom?: number; readonly cursorPresentationRevision?: number; readonly cursor: { readonly a?: number; readonly b?: number; readonly deltaCycles?: number } };
  readonly layout: { readonly leftPaneWidth: number; readonly frozenPaneMinWidth: number; readonly frozenPaneWidth: number; readonly bottomVisible: boolean; readonly bottomHeight: number; readonly inspectorVisible: boolean; readonly inspectorWidth: number };
  readonly refs: { readonly viewport: RefObject<HTMLDivElement | null>; readonly gridLayer: RefObject<HTMLDivElement | null>; readonly ruler: RefObject<HTMLDivElement | null>; readonly host: RefObject<HTMLDivElement | null>; readonly viewportLower: RefObject<HTMLDivElement | null>; readonly rulerLower: RefObject<HTMLDivElement | null>; readonly hostLower: RefObject<HTMLDivElement | null>; readonly gridLayerLower: RefObject<HTMLDivElement | null> };
  readonly content: { readonly header: ReactNode; readonly transactionTree: ReactNode; readonly viewportContent: ReactNode; readonly viewportLegend: ReactNode; readonly leftRail?: ReactNode; readonly bottom: ReactNode; readonly inspector: ReactNode };
  readonly interactions: {
    readonly onInspectorKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onInspectorPointerDown: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerMove: PointerEventHandler<HTMLDivElement>; readonly onInspectorPointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onLeftPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onLeftPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onLeftPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onFrozenPaneKeyDown: KeyboardEventHandler<HTMLDivElement>; readonly onFrozenPanePointerDown: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerMove: PointerEventHandler<HTMLDivElement>; readonly onFrozenPanePointerUp: PointerEventHandler<HTMLDivElement>;
    readonly onBottomReset: () => void; readonly onInspectorReset: () => void;
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
type SplitDividerHandlers = Readonly<{ signalSplitRatio: number; onKeyDown: KeyboardEventHandler<HTMLElement>; onPointerDown: PointerEventHandler<HTMLElement>; onPointerMove: PointerEventHandler<HTMLElement>; onPointerUp: PointerEventHandler<HTMLElement> }>;

/** Combined-only (internal ViewMode "Split") panes: the Transaction pane and the pane divider (#615). */
function CombinedModePanes({ transactionContent, signalSplitRatio, onKeyDown: onSignalSplitKeyDown, onPointerDown: onSignalSplitPointerDown, onPointerMove: onSignalSplitPointerMove, onPointerUp: onSignalSplitPointerUp }: SplitDividerHandlers & Readonly<{ transactionContent: ReactNode }>) {
  return <>
    <div className="split-transaction-pane" data-pane="transaction" tabIndex={0} aria-label="Transaction pane">{transactionContent}</div>
    <div className="combined-split-divider" data-testid="combined-split-divider" role="separator" aria-label="Resize Transaction and Cycle panes" aria-orientation="horizontal" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(signalSplitRatio * 100)} tabIndex={0} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} onPointerCancel={onSignalSplitPointerUp} />
  </>;
}

/** Cycle-only Signal Split lower viewport and its divider (#615). */
function CycleSignalSplitPane({ signalSplitRatio, gridEnabled, rulerEnabled, viewportLower, gridLayerLower, rulerLower, hostLower, onViewportKeyDown, onKeyDown: onSignalSplitKeyDown, onPointerDown: onSignalSplitPointerDown, onPointerMove: onSignalSplitPointerMove, onPointerUp: onSignalSplitPointerUp }: SplitDividerHandlers & Readonly<{ gridEnabled: boolean; rulerEnabled: boolean; viewportLower: RefObject<HTMLDivElement | null>; gridLayerLower: RefObject<HTMLDivElement | null>; rulerLower: RefObject<HTMLDivElement | null>; hostLower: RefObject<HTMLDivElement | null>; onViewportKeyDown: KeyboardEventHandler<HTMLDivElement> | undefined }>) {
  return <>
    <div className="signal-split-divider" data-testid="signal-split-divider" role="separator" aria-label="Signal Split divider" aria-orientation="horizontal" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(signalSplitRatio * 100)} tabIndex={0} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} onPointerCancel={onSignalSplitPointerUp} />
    <div className="cycle-viewport signal-split-lower" ref={viewportLower} data-testid="cycle-viewport-lower" data-pane="lower" tabIndex={0} aria-label="Lower pane timing canvas navigation" onKeyDown={onViewportKeyDown}>
      <div className="geometry-grid" ref={gridLayerLower} data-testid="geometry-grid-lower" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
      <div className="cycle-ruler" data-testid="cycle-ruler-lower" aria-label="Lower pane cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={rulerLower} /></div>
      <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band-lower" aria-hidden="true" hidden />
      <div className="surface-host" ref={hostLower} data-testid="cycle-surface-lower" />
    </div>
  </>;
}

export function EditorWorkspaceView({
  viewModel,
}: EditorWorkspaceViewProps) {
  const { viewMode, signalSplitEnabled, signalSplitRatio, gridEnabled, snapEnabled, rulerEnabled, zoom, cursorPresentationRevision, cursor } = viewModel.view;
  const composition = composeMode(viewMode as ViewMode);
  const { leftPaneWidth, frozenPaneMinWidth, frozenPaneWidth, bottomVisible, bottomHeight, inspectorVisible, inspectorWidth } = viewModel.layout;
  const { viewport, gridLayer, ruler, host, viewportLower, rulerLower, hostLower, gridLayerLower } = viewModel.refs;
  const { header, transactionTree, viewportContent, viewportLegend, leftRail, bottom, inspector } = viewModel.content;
  const { onBottomReset, onInspectorReset, onInspectorKeyDown, onInspectorPointerDown, onInspectorPointerMove, onInspectorPointerUp, onLeftPaneKeyDown, onLeftPanePointerDown, onLeftPanePointerMove, onLeftPanePointerUp, onFrozenPaneKeyDown, onFrozenPanePointerDown, onFrozenPanePointerMove, onFrozenPanePointerUp, onBottomKeyDown, onBottomPointerDown, onBottomPointerMove, onBottomPointerUp, onSignalSplitKeyDown, onSignalSplitPointerDown, onSignalSplitPointerMove, onSignalSplitPointerUp, onViewportKeyDown, onSetCursorAtCycle, resolveCursorCycleAtClientX } = viewModel.interactions;
  const activeDragCleanupsRef = useRef(new Set<() => void>());
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
    const tickCache = new WeakMap<HTMLDivElement, { ticks: readonly { readonly x: number; readonly cycle: number }[]; byCycle: ReadonlyMap<number, HTMLElement>; scrollLeft: number }>();
    const cacheTicks = (rulerElement: HTMLDivElement, scrollOwner: HTMLDivElement = rulerElement) => {
      const measured = [...rulerElement.querySelectorAll<HTMLElement>("[data-cycle]")].map((candidate) => ({ candidate, x: candidate.getBoundingClientRect().left, cycle: Number(candidate.dataset.sourceCycle ?? candidate.dataset.cycle) }));
      const valid = measured.filter((tick) => Number.isFinite(tick.x) && Number.isFinite(tick.cycle));
      const next = valid.map(({ x, cycle }) => ({ x, cycle })).sort((left, right) => left.x - right.x);
      tickCache.set(rulerElement, { ticks: next, byCycle: new Map(valid.map(({ cycle, candidate }) => [cycle, candidate])), scrollLeft: scrollOwner.scrollLeft });
      return next;
    };
    const shiftCachedTicks = (rulerElement: HTMLDivElement, scrollOwner: HTMLDivElement) => {
      const cached = tickCache.get(rulerElement);
      if (!cached) return cacheTicks(rulerElement, scrollOwner);
      const nextScrollLeft = scrollOwner.scrollLeft;
      const delta = cached.scrollLeft - nextScrollLeft;
      if (delta === 0) return cached.ticks;
      const ticks = cached.ticks.map((tick) => ({ ...tick, x: tick.x + delta }));
      tickCache.set(rulerElement, { ...cached, ticks, scrollLeft: nextScrollLeft });
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
      for (const element of rulers) {
        const cached = tickCache.get(element) ?? (cacheTicks(element), tickCache.get(element));
        const candidate = cached?.byCycle.get(cycle);
        if (candidate) return candidate;
      }
      return undefined;
    };
    const update = () => {
      for (const [viewportElement, rulerElement] of viewports) {
        if (!viewportElement || !rulerElement) continue;
        shiftCachedTicks(rulerElement, timelineScrollOwner(viewportElement) as HTMLDivElement);
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
          // #756: the Cycle viewport spans Main + Bottom; the guide ends at the Bottom splitter so it stays grabbable (not under Bottom).
          const splitterTop = viewportElement.closest(".cycle-panel")?.parentElement?.querySelector(".bottom-resize-track")?.getBoundingClientRect().top;
          const visibleHeight = splitterTop !== undefined && splitterTop > viewportRect.top && splitterTop < viewportRect.bottom ? splitterTop - viewportRect.top : viewportElement.clientHeight;
          line.style.height = `${Math.max(visibleHeight, 250)}px`;
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
    // The active drag owner outlives this effect: its own output (cursor.a/b) is in the dependency list, so an effect re-run must not tear the
    // gesture down (#549). The set is owned by a ref and cleared on unmount / mode change below.
    const activeDragCleanups = activeDragCleanupsRef.current;
    for (const [viewportElement, rulerElement] of viewports) {
      if (!viewportElement || !rulerElement || !onSetCursorAtCycle) continue;
      const onPointerDown = (event: PointerEvent) => {
        // Cursor A/B has one workspace-wide drag owner. A second pointer
        // must not install another window-level move/up handler while the
        // first drag is still resolving source-time coordinates.
        if (activeDragCleanups.size > 0) return;
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='cursor-line']") : null;
        const which = target?.dataset.cursor as "a" | "b" | undefined;
        if (!which) return;
        event.preventDefault();
        let pendingFrame: number | undefined;
        let pendingClientX = event.clientX;
        let pointerMoves = 0;
        let previewFrames = 0;
        const trace = () => {
          viewportElement.dataset.cursorDragPointerMoves = String(pointerMoves);
          viewportElement.dataset.cursorDragPreviewFrames = String(previewFrames);
        };
        trace();
        const applyCursorAt = (clientX: number) => {
          const resolved = resolveCursorCycleAtClientX?.(clientX, viewportElement);
          if (resolved !== undefined) onSetCursorAtCycle(which, resolved);
          else {
            const nearest = nearestCachedTick(rulerElement, clientX);
            if (nearest) onSetCursorAtCycle(which, nearest.cycle);
          }
        };
        const move = (moveEvent: PointerEvent) => {
          pendingClientX = moveEvent.clientX;
          if (pendingFrame !== undefined) return;
          pendingFrame = requestAnimationFrame(() => {
            pendingFrame = undefined;
            previewFrames += 1;
            trace();
            applyCursorAt(pendingClientX);
          });
        };
        const cleanupDrag = () => { window.removeEventListener("pointermove", moveWithTrace); if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame); pendingFrame = undefined; trace(); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); activeDragCleanups.delete(cleanupDrag); };
        const up = () => { applyCursorAt(pendingClientX); cleanupDrag(); };
        const cancel = () => cleanupDrag();
        const moveWithTrace = (moveEvent: PointerEvent) => { pointerMoves += 1; trace(); move(moveEvent); };
        window.addEventListener("pointermove", moveWithTrace);
        window.addEventListener("pointerup", up, { once: true });
        window.addEventListener("pointercancel", cancel, { once: true });
        activeDragCleanups.add(cleanupDrag);
      };
      viewportElement.addEventListener("pointerdown", onPointerDown, true);
      dragHandlers.push([viewportElement, onPointerDown]);
    }
    for (const target of scrollTargets) target.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    return () => {
      for (const target of scrollTargets) target.removeEventListener("scroll", update, true);
      cancelAnimationFrame(deferredUpdate);
      rulerResizeObserver?.disconnect();
      for (const [target, handler] of dragHandlers) target.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("resize", update);
    };
  }, [ruler, rulerLower, cursor.a, cursor.b, cursorPresentationRevision, zoom, viewport, viewportLower]);
  // Gesture lifetime: a mode switch (different viewport/ruler owners) or unmount ends any active Cursor drag.
  useEffect(() => () => { for (const cleanupDrag of [...activeDragCleanupsRef.current]) cleanupDrag(); }, [viewMode]);
  return <div className="desktop-workspace">
    {composition.headerPlacement === "above" && <div className="workspace-header">{header}</div>}
    <section className={`cycle-panel mode-${viewMode.toLowerCase()}`} aria-label={`${viewMode === "Split" ? "Combined" : viewMode} View`} data-view-mode={viewMode} data-signal-split={String(signalSplitEnabled && viewMode === "Cycle")}>
      {composition.hasLeftPaneResizer && <div className="left-pane-resize-handle" data-testid="left-pane-resizer" role="separator" aria-label="Resize Signal Group pane" aria-orientation="vertical" aria-valuemin={LEFT_PANE_MIN_WIDTH} aria-valuemax={LEFT_PANE_MAX_WIDTH} aria-valuenow={leftPaneWidth} tabIndex={0} onKeyDown={onLeftPaneKeyDown} onPointerDown={onLeftPanePointerDown} onPointerMove={onLeftPanePointerMove} onPointerUp={onLeftPanePointerUp} onPointerCancel={onLeftPanePointerUp} />}
      {/* Transaction Mode GUI realignment: this splitter's whole purpose is
          separating Cycle Mode's frozen Role/Signal-name columns from the
          waveform canvas -- Transaction Mode has no such split (its Tree
          is one unified panel; "Group"/"Transaction" are header labels
          only, not two independently-resizable body columns). It was
          rendered unconditionally in every view mode, so its full-height
          (top:0/bottom:0) hit target landed inside the Transaction Tree
          panel with no corresponding column boundary to resize -- reported
          as a stray vertical line bleeding through the Tree's content. */}
      {composition.hasFrozenPaneResizer && <div className="frozen-pane-resize-handle" data-testid="frozen-pane-resizer" role="separator" aria-label="Resize Signal label and timing pane" aria-orientation="vertical" aria-valuemin={frozenPaneMinWidth} aria-valuemax={360} aria-valuenow={frozenPaneWidth} tabIndex={0} onKeyDown={onFrozenPaneKeyDown} onPointerDown={onFrozenPanePointerDown} onPointerMove={onFrozenPanePointerMove} onPointerUp={onFrozenPanePointerUp} onPointerCancel={onFrozenPanePointerUp} />}
      {composition.headerPlacement === "panel" && header}
      <div className={`cycle-viewport${viewMode === "Split" ? " split-signal-pane" : ""}`} ref={viewport} data-testid="cycle-viewport" data-pane={viewMode === "Split" ? "signal" : undefined} tabIndex={0} aria-label="Timing canvas navigation" onKeyDown={onViewportKeyDown}>
        {viewMode === "Split" && <CombinedModePanes transactionContent={viewportContent} signalSplitRatio={signalSplitRatio} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} />}
        <div className={`split-signal-content${viewMode === "Split" ? "" : " non-split-signal-content"}`}>
          <div className="geometry-grid" ref={gridLayer} data-testid="geometry-grid" data-grid-enabled={String(gridEnabled)} aria-hidden="true" />
          <div className="cycle-ruler" data-testid="cycle-ruler" aria-label="Cycle ruler" hidden={!rulerEnabled}><div className="cycle-ruler-content" ref={ruler} /></div>
          <div className="range-selection-band" data-role="range-selection-band" data-testid="range-selection-band" aria-hidden="true" hidden />
          {viewMode === "Transaction" ? viewportContent : viewportLegend}
          <div className="surface-host" ref={host} data-testid="cycle-surface" data-snap-enabled={String(snapEnabled)} />
        </div>
      </div>
      <TimelineHorizontalScrollbar viewport={viewport} viewMode={viewMode} leftPaneWidth={leftPaneWidth} />
      {signalSplitEnabled && viewMode === "Cycle" && <CycleSignalSplitPane signalSplitRatio={signalSplitRatio} gridEnabled={gridEnabled} rulerEnabled={rulerEnabled} viewportLower={viewportLower} gridLayerLower={gridLayerLower} rulerLower={rulerLower} hostLower={hostLower} onViewportKeyDown={onViewportKeyDown} onKeyDown={onSignalSplitKeyDown} onPointerDown={onSignalSplitPointerDown} onPointerMove={onSignalSplitPointerMove} onPointerUp={onSignalSplitPointerUp} />}
    </section>
    <div className={`left-workspace-rail mode-${viewMode.toLowerCase()}`} data-testid="left-workspace-rail">
      {composition.leftRail === "transactions" && transactionTree}
      {composition.leftRail === "signals" && leftRail}
    </div>
    {bottomVisible && <div className="bottom-resize-track" data-testid="bottom-resizer" role="separator" aria-label="Resize bottom editor" aria-orientation="horizontal" aria-valuemin={180} aria-valuemax={420} aria-valuenow={bottomHeight} tabIndex={0} title="Drag to resize; double-click to reset" onDoubleClick={onBottomReset} onKeyDown={onBottomKeyDown} onPointerDown={onBottomPointerDown} onPointerMove={onBottomPointerMove} onPointerUp={onBottomPointerUp} onPointerCancel={onBottomPointerUp} />}
    {bottomVisible && bottom}
    <aside hidden={!inspectorVisible} className="inspector-shell" data-testid="inspector-shell"><div className="inspector-resize-handle" data-testid="inspector-resizer" role="separator" aria-label="Resize Inspector" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={inspectorWidth} tabIndex={0} title="Drag to resize; double-click to reset" onDoubleClick={onInspectorReset} onKeyDown={onInspectorKeyDown} onPointerDown={onInspectorPointerDown} onPointerMove={onInspectorPointerMove} onPointerUp={onInspectorPointerUp} onPointerCancel={onInspectorPointerUp} />{inspector}</aside>
  </div>;
}
