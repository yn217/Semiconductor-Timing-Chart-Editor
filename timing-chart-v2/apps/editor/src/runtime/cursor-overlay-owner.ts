export type CursorOverlayPresentation = Readonly<{
  cursorA: number | undefined;
  cursorB: number | undefined;
  resolveCursorCycleAtClientX: ((clientX: number, viewport: HTMLDivElement) => number | undefined) | undefined;
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

/** Owns Cursor A/B imperative DOM projection and pointer/listener lifecycle outside React composition. */
export class CursorOverlayOwner {
  #input: CursorOverlayOwnerInput | undefined;
  #disconnect: Cleanup | undefined;
  #activeDragCleanups = new Set<Cleanup>();

  connect(input: CursorOverlayOwnerInput): Cleanup {
    this.#disconnect?.();
    this.#input = input;
    const viewports = [[input.viewport, input.ruler], [input.viewportLower, input.rulerLower]] as const;
    const scrollTargets = [input.viewport, input.viewportLower].filter((item): item is HTMLDivElement => item !== null);
    const refresh = () => this.refresh();
    const deferredUpdate = requestAnimationFrame(refresh);
    const rulerResizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(refresh);
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
          const resolved = current?.resolveCursorCycleAtClientX?.(clientX, viewport);
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
    for (const target of scrollTargets) target.addEventListener("scroll", refresh, { passive: true, capture: true });
    window.addEventListener("resize", refresh);
    const disconnect = () => {
      for (const target of scrollTargets) target.removeEventListener("scroll", refresh, true);
      cancelAnimationFrame(deferredUpdate);
      rulerResizeObserver?.disconnect();
      for (const [target, handler] of dragHandlers) target.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("resize", refresh);
      this.cancelActiveDrags();
      if (this.#disconnect === disconnect) {
        this.#disconnect = undefined;
        this.#input = undefined;
      }
    };
    this.#disconnect = disconnect;
    this.refresh();
    return disconnect;
  }

  refresh(): void {
    const input = this.#input;
    if (!input) return;
    const current = input.getPresentation();
    for (const [viewport, rulerContent] of [[input.viewport, input.ruler], [input.viewportLower, input.rulerLower]] as const) {
      if (!viewport || !rulerContent) continue;
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
        const x = current.resolveCursorViewportXForCycle?.(cycle, viewport, rulerContent);
        if (x === undefined || !Number.isFinite(x)) { line.hidden = true; continue; }
        line.hidden = false;
        line.style.position = "absolute";
        line.style.top = "0";
        line.style.width = "2px";
        const splitterTop = viewport.closest(".cycle-panel")?.parentElement?.querySelector(".bottom-resize-track")?.getBoundingClientRect().top;
        const visibleHeight = splitterTop !== undefined && splitterTop > viewportRect.top && splitterTop < viewportRect.bottom ? splitterTop - viewportRect.top : viewport.clientHeight;
        line.style.height = `${Math.max(visibleHeight, 250)}px`;
        line.style.pointerEvents = "auto";
        line.style.left = `${x}px`;
        line.dataset.cycle = String(cycle);
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
