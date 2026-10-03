import { timelineScrollOwner } from "./timeline-scroll-owner.js";

export interface CursorOverlayInput {
  readonly viewport: HTMLDivElement | null;
  readonly ruler: HTMLDivElement | null;
  readonly viewportLower: HTMLDivElement | null;
  readonly rulerLower: HTMLDivElement | null;
  readonly cursorA?: number | undefined;
  readonly cursorB?: number | undefined;
  readonly onSetCursorAtCycle?: ((which: "a" | "b", cycle: number) => void) | undefined;
  readonly resolveCursorCycleAtClientX?: ((clientX: number, viewport: HTMLDivElement) => number | undefined) | undefined;
}

type CursorDragCleanup = () => void;
type CachedTick = { readonly x: number; readonly cycle: number };
type RulerTicks = { readonly ticks: readonly CachedTick[]; readonly byCycle: ReadonlyMap<number, HTMLElement>; readonly scrollLeft: number };

/** Long-lived owner for cursor overlay geometry and A/B gesture lifecycles.
 * `updatePresentation()` changes cursor values without reconnecting observers/listeners; mode/unmount calls `cancelActiveDrags()`. */
export class CursorOverlayOwner {
  #presentationCleanup: (() => void) | undefined;
  #presentationRefresh: (() => void) | undefined;
  #input: CursorOverlayInput | undefined;
  #activeDragCleanups = new Set<CursorDragCleanup>();

  connect(input: CursorOverlayInput): () => void {
    this.#presentationCleanup?.();
    this.#input = input;
    const viewports = [[input.viewport, input.ruler], [input.viewportLower, input.rulerLower]] as const;
    const rulerElements = () => [input.ruler, input.rulerLower].filter((element): element is HTMLDivElement => element !== null);
    const tickCache = new WeakMap<HTMLDivElement, RulerTicks>();
    const cacheTicks = (ruler: HTMLDivElement, scrollOwner: HTMLDivElement = ruler): readonly CachedTick[] => {
      const measured = [...ruler.querySelectorAll<HTMLElement>("[data-cycle]")].map((candidate) => ({ candidate, x: candidate.getBoundingClientRect().left, cycle: Number(candidate.dataset.sourceCycle ?? candidate.dataset.cycle) }));
      const valid = measured.filter((tick) => Number.isFinite(tick.x) && Number.isFinite(tick.cycle));
      const ticks = valid.map(({ x, cycle }) => ({ x, cycle })).sort((left, right) => left.x - right.x);
      tickCache.set(ruler, { ticks, byCycle: new Map(valid.map(({ cycle, candidate }) => [cycle, candidate])), scrollLeft: scrollOwner.scrollLeft });
      return ticks;
    };
    const shiftCachedTicks = (ruler: HTMLDivElement, scrollOwner: HTMLDivElement): readonly CachedTick[] => {
      const cached = tickCache.get(ruler);
      if (!cached) return cacheTicks(ruler, scrollOwner);
      const nextScrollLeft = scrollOwner.scrollLeft;
      const delta = cached.scrollLeft - nextScrollLeft;
      if (delta === 0) return cached.ticks;
      const ticks = cached.ticks.map((tick) => ({ ...tick, x: tick.x + delta }));
      tickCache.set(ruler, { ...cached, ticks, scrollLeft: nextScrollLeft });
      return ticks;
    };
    const nearestCachedTick = (ruler: HTMLDivElement, clientX: number) => {
      const ticks = tickCache.get(ruler)?.ticks ?? cacheTicks(ruler);
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
    const findTick = (ruler: HTMLDivElement, cycle: number) => {
      for (const candidateRuler of [ruler, ...rulerElements().filter((element) => element !== ruler)]) {
        const cached = tickCache.get(candidateRuler) ?? (cacheTicks(candidateRuler), tickCache.get(candidateRuler));
        const candidate = cached?.byCycle.get(cycle);
        if (candidate) return candidate;
      }
      return undefined;
    };
    const update = () => {
      const current = this.#input;
      if (!current) return;
      for (const [viewport, ruler] of viewports) {
        if (!viewport || !ruler) continue;
        shiftCachedTicks(ruler, timelineScrollOwner(viewport) as HTMLDivElement);
        let overlay = viewport.querySelector<HTMLElement>("[data-role='cursor-overlay']");
        if (!overlay) {
          overlay = viewport.ownerDocument.createElement("div");
          overlay.dataset.role = "cursor-overlay";
          overlay.setAttribute("aria-hidden", "true");
          viewport.append(overlay);
        }
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.pointerEvents = "none";
        const viewportRect = viewport.getBoundingClientRect();
        for (const [key, cycle, label] of [["a", current.cursorA, "Cursor A"], ["b", current.cursorB, "Cursor B"]] as const) {
          let line = overlay.querySelector<HTMLElement>(`[data-cursor='${key}']`);
          if (cycle === undefined) { line?.remove(); continue; }
          if (!line) {
            line = viewport.ownerDocument.createElement("div");
            line.dataset.cursor = key;
            line.dataset.role = "cursor-line";
            line.setAttribute("aria-label", label);
            overlay.append(line);
          }
          const tick = findTick(ruler, cycle);
          if (!tick) { line.hidden = true; continue; }
          const tickRect = tick.getBoundingClientRect();
          line.hidden = false;
          line.style.position = "absolute";
          line.style.top = "0";
          line.style.width = "2px";
          const splitterTop = viewport.closest(".cycle-panel")?.parentElement?.querySelector(".bottom-resize-track")?.getBoundingClientRect().top;
          const visibleHeight = splitterTop !== undefined && splitterTop > viewportRect.top && splitterTop < viewportRect.bottom ? splitterTop - viewportRect.top : viewport.clientHeight;
          line.style.height = `${Math.max(visibleHeight, 250)}px`;
          line.style.pointerEvents = "auto";
          line.style.left = `${tickRect.left - viewportRect.left}px`;
          line.dataset.cycle = String(cycle);
        }
      }
    };
    this.#presentationRefresh = update;
    update();
    const scrollTargets = [input.viewport, input.viewportLower].filter((element): element is HTMLDivElement => element !== null);
    const deferredUpdate = requestAnimationFrame(update);
    const rulerResizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    for (const ruler of [input.ruler, input.rulerLower].filter((element): element is HTMLDivElement => element !== null)) rulerResizeObserver?.observe(ruler);
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
          const current = this.#input;
          const resolved = current?.resolveCursorCycleAtClientX?.(clientX, viewport);
          if (resolved !== undefined) current?.onSetCursorAtCycle?.(which, resolved);
          else {
            const nearest = nearestCachedTick(ruler, clientX);
            if (nearest) current?.onSetCursorAtCycle?.(which, nearest.cycle);
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
        let cleanupDrag: CursorDragCleanup;
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
    for (const target of scrollTargets) target.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    const disconnect = () => {
      for (const target of scrollTargets) target.removeEventListener("scroll", update, true);
      cancelAnimationFrame(deferredUpdate);
      rulerResizeObserver?.disconnect();
      for (const [target, handler] of dragHandlers) target.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("resize", update);
      if (this.#presentationCleanup === disconnect) {
        this.#presentationCleanup = undefined;
        this.#presentationRefresh = undefined;
        this.#input = undefined;
      }
    };
    this.#presentationCleanup = disconnect;
    return disconnect;
  }

  /** Update cursor values/callbacks without rebuilding gesture and observer lifecycles. */
  updatePresentation(input: CursorOverlayInput): void {
    if (!this.#presentationRefresh) return;
    this.#input = input;
    this.#presentationRefresh();
  }

  cancelActiveDrags(): void {
    for (const cleanup of [...this.#activeDragCleanups]) cleanup();
  }

  dispose(): void {
    this.#presentationCleanup?.();
    this.cancelActiveDrags();
  }
}
