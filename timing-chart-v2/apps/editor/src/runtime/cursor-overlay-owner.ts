export type CursorOverlayPresentation = Readonly<{
  cursorA: number | undefined;
  cursorB: number | undefined;
  resolveCursorCycleAtClientX: ((clientX: number, viewport: HTMLDivElement, rulerContent?: HTMLDivElement) => number | undefined) | undefined;
  resolveCursorViewportXForCycle: ((cycle: number, viewport: HTMLDivElement, rulerContent: HTMLDivElement) => number | undefined) | undefined;
  onSetCursorAtCycle: ((which: "a" | "b", cycle: number) => void) | undefined;
}>;

export type CursorOverlayOwnerInput = Readonly<{
  viewport: HTMLDivElement | null;
  ruler: HTMLDivElement | null;
  viewportLower: HTMLDivElement | null;
  rulerLower: HTMLDivElement | null;
  getPresentation: () => CursorOverlayPresentation;
}>;

type Cleanup = () => void;

export type CursorOverlayOwnerMetrics = Readonly<{
  refreshes: number;
  /** Overlay/line elements created by this owner (at most 3 per pane per connect). */
  elementCreations: number;
  /** querySelector/closest lookups (first use, or after a cached node disconnects). */
  queries: number;
  /** getBoundingClientRect calls the owner itself made in the last refresh (excludes the X resolver). */
  lastRefreshOwnLayoutReads: number;
}>;

type PaneCache = { overlay: HTMLElement | undefined; lines: { a: HTMLElement | undefined; b: HTMLElement | undefined }; splitter: Element | null | undefined };

/** Owns Cursor A/B imperative DOM projection and pointer/listener lifecycle outside React composition. */
export class CursorOverlayOwner {
  #input: CursorOverlayOwnerInput | undefined;
  #disconnect: Cleanup | undefined;
  #activeDragCleanups = new Set<Cleanup>();
  #panes = new Map<HTMLDivElement, PaneCache>();
  #metrics = { refreshes: 0, elementCreations: 0, queries: 0, lastRefreshOwnLayoutReads: 0 };

  connect(input: CursorOverlayOwnerInput): Cleanup {
    this.#disconnect?.();
    this.#input = input;
    this.#panes.clear();
    const viewports = [[input.viewport, input.ruler], [input.viewportLower, input.rulerLower]] as const;
    const scrollTargets = [input.viewport, input.viewportLower].filter((item): item is HTMLDivElement => item !== null);
    const refresh = () => this.refresh();
    const refreshLayout = () => this.refreshLayout();
    let pendingScrollRefresh: number | undefined;
    const refreshAfterScrollPresentation = () => {
      // In Cycle, the timeline scroller is nested under the waveform host while
      // the ruler is its sibling. The viewport capture listener runs before the
      // scroller's handler updates ruler.translate, so read geometry next frame.
      if (pendingScrollRefresh !== undefined) return;
      pendingScrollRefresh = requestAnimationFrame(() => {
        pendingScrollRefresh = undefined;
        refresh();
      });
    };
    const deferredUpdate = requestAnimationFrame(refreshLayout);
    const rulerResizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(refreshLayout);
    for (const ruler of [input.ruler, input.rulerLower].filter((item): item is HTMLDivElement => item !== null)) rulerResizeObserver?.observe(ruler);
    const dragHandlers: Array<[HTMLDivElement, (event: PointerEvent) => void]> = [];
    for (const [viewport, ruler] of viewports) {
      if (!viewport || !ruler) continue;
      const onPointerDown = (event: PointerEvent) => {
        if (this.#activeDragCleanups.size > 0) return;
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='cursor-line']") : null;
        const which = target?.dataset.cursor as "a" | "b" | undefined;
        if (!which) return;
        event.preventDefault();
        let pendingFrame: number | undefined;
        let pendingClientX = event.clientX;
        let pointerMoves = 0;
        let previewFrames = 0;
        const trace = () => {
          viewport.dataset.cursorDragPointerMoves = String(pointerMoves);
          viewport.dataset.cursorDragPreviewFrames = String(previewFrames);
        };
        trace();
        const applyCursorAt = (clientX: number) => {
          const current = this.#input?.getPresentation();
          const resolved = current?.resolveCursorCycleAtClientX?.(clientX, viewport, ruler);
          if (resolved !== undefined) current?.onSetCursorAtCycle?.(which, resolved);
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
        let cleanupDrag: Cleanup;
        const up = () => { applyCursorAt(pendingClientX); cleanupDrag(); };
        const cancel = () => cleanupDrag();
        const moveWithTrace = (moveEvent: PointerEvent) => { pointerMoves += 1; trace(); move(moveEvent); };
        cleanupDrag = () => {
          window.removeEventListener("pointermove", moveWithTrace);
          if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame);
          pendingFrame = undefined;
          trace();
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
          this.#activeDragCleanups.delete(cleanupDrag);
        };
        window.addEventListener("pointermove", moveWithTrace);
        window.addEventListener("pointerup", up, { once: true });
        window.addEventListener("pointercancel", cancel, { once: true });
        this.#activeDragCleanups.add(cleanupDrag);
      };
      viewport.addEventListener("pointerdown", onPointerDown, true);
      dragHandlers.push([viewport, onPointerDown]);
    }
    for (const target of scrollTargets) target.addEventListener("scroll", refreshAfterScrollPresentation, { passive: true, capture: true });
    window.addEventListener("resize", refreshLayout);
    const disconnect = () => {
      for (const target of scrollTargets) target.removeEventListener("scroll", refreshAfterScrollPresentation, true);
      cancelAnimationFrame(deferredUpdate);
      if (pendingScrollRefresh !== undefined) cancelAnimationFrame(pendingScrollRefresh);
      rulerResizeObserver?.disconnect();
      for (const [target, handler] of dragHandlers) target.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("resize", refreshLayout);
      this.cancelActiveDrags();
      if (this.#disconnect === disconnect) {
        this.#disconnect = undefined;
        this.#input = undefined;
        this.#panes.clear();
      }
    };
    this.#disconnect = disconnect;
    this.refresh();
    return disconnect;
  }

  /** Deterministic cost counters for the #175 drag-latency guard. */
  metrics(): CursorOverlayOwnerMetrics {
    return { ...this.#metrics };
  }

  #paneCache(viewport: HTMLDivElement): PaneCache {
    let cache = this.#panes.get(viewport);
    if (!cache) { cache = { overlay: undefined, lines: { a: undefined, b: undefined }, splitter: undefined }; this.#panes.set(viewport, cache); }
    if (cache.overlay?.parentNode !== viewport) {
      this.#metrics.queries += 1;
      let overlay = viewport.querySelector<HTMLElement>("[data-role='cursor-overlay']");
      if (!overlay) {
        overlay = viewport.ownerDocument.createElement("div");
        overlay.dataset.role = "cursor-overlay";
        overlay.setAttribute("aria-hidden", "true");
        viewport.append(overlay);
        this.#metrics.elementCreations += 1;
      }
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.pointerEvents = "none";
      cache.overlay = overlay;
      cache.lines = { a: undefined, b: undefined };
    }
    return cache;
  }

  #line(cache: PaneCache, key: "a" | "b", label: string): HTMLElement {
    const overlay = cache.overlay!;
    let line = cache.lines[key];
    if (!line) {
      this.#metrics.queries += 1;
      line = overlay.querySelector<HTMLElement>(`[data-cursor='${key}']`) ?? undefined;
      if (!line) {
        line = overlay.ownerDocument.createElement("div");
        line.dataset.cursor = key;
        line.dataset.role = "cursor-line";
        line.setAttribute("aria-label", label);
        this.#metrics.elementCreations += 1;
      }
      line.style.position = "absolute";
      line.style.top = "0";
      line.style.width = "2px";
      line.style.pointerEvents = "auto";
      cache.lines[key] = line;
    }
    if (line.parentNode !== overlay) overlay.append(line);
    return line;
  }

  #splitter(viewport: HTMLDivElement, cache: PaneCache): Element | null {
    if (cache.splitter === undefined || (cache.splitter !== null && !cache.splitter.isConnected)) {
      this.#metrics.queries += 1;
      cache.splitter = viewport.closest(".cycle-panel")?.parentElement?.querySelector(".bottom-resize-track") ?? null;
    }
    return cache.splitter;
  }

  /** Re-resolve cached layout lookups (e.g. a Bottom splitter mounted after the last refresh), then refresh. */
  refreshLayout(): void {
    for (const cache of this.#panes.values()) if (cache.splitter === null) cache.splitter = undefined;
    this.refresh();
  }

  refresh(): void {
    const input = this.#input;
    if (!input) return;
    this.#metrics.refreshes += 1;
    const current = input.getPresentation();
    // Phase 1: every layout read for every pane/cursor. No style write happens
    // until all measurements are done, so one refresh forces at most one layout.
    const plans: Array<{ cache: PaneCache; cursors: Array<{ key: "a" | "b"; label: string; cycle: number | undefined; x: number | undefined }>; height: number }> = [];
    let layoutReads = 0;
    for (const [viewport, rulerContent] of [[input.viewport, input.ruler], [input.viewportLower, input.rulerLower]] as const) {
      if (!viewport || !rulerContent) continue;
      const cache = this.#paneCache(viewport);
      const cursors = ([["a", current.cursorA, "Cursor A"], ["b", current.cursorB, "Cursor B"]] as const).map(([key, cycle, label]) => {
        const x = cycle === undefined ? undefined : current.resolveCursorViewportXForCycle?.(cycle, viewport, rulerContent);
        return { key, label, cycle, x: x !== undefined && Number.isFinite(x) ? x : undefined };
      });
      let height = 0;
      if (cursors.some((cursor) => cursor.x !== undefined)) {
        const viewportRect = viewport.getBoundingClientRect();
        const splitter = this.#splitter(viewport, cache);
        const splitterTop = splitter?.getBoundingClientRect().top;
        layoutReads += splitter ? 2 : 1;
        const visibleHeight = splitterTop !== undefined && splitterTop > viewportRect.top && splitterTop < viewportRect.bottom ? splitterTop - viewportRect.top : viewport.clientHeight;
        height = Math.max(visibleHeight, 250);
      }
      plans.push({ cache, cursors, height });
    }
    this.#metrics.lastRefreshOwnLayoutReads = layoutReads;
    // Phase 2: writes only.
    for (const plan of plans) {
      for (const cursor of plan.cursors) {
        if (cursor.cycle === undefined) { plan.cache.lines[cursor.key]?.remove(); continue; }
        const line = this.#line(plan.cache, cursor.key, cursor.label);
        if (cursor.x === undefined) { line.hidden = true; continue; }
        line.hidden = false;
        line.style.height = `${plan.height}px`;
        line.style.left = `${cursor.x}px`;
        line.dataset.cycle = String(cursor.cycle);
      }
    }
  }

  cancelActiveDrags(): void {
    for (const cleanup of [...this.#activeDragCleanups]) cleanup();
  }

  dispose(): void {
    this.#disconnect?.();
    this.cancelActiveDrags();
  }
}
