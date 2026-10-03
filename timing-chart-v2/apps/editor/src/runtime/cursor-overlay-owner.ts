import { timelineScrollOwner } from "./timeline-scroll-owner.js";

export interface CursorOverlayInput {
  readonly viewport: HTMLDivElement | null;
  readonly viewportLower: HTMLDivElement | null;
  readonly cursorA?: number | undefined;
  readonly cursorB?: number | undefined;
  readonly onSetCursorAtCycle?: ((which: "a" | "b", cycle: number) => void) | undefined;
  readonly resolveCursorCycleAtClientX?: ((clientX: number, viewport: HTMLDivElement) => number | undefined) | undefined;
  readonly resolveCursorOverlayLeftAtCycle?: ((cycle: number, viewport: HTMLDivElement) => number | undefined) | undefined;
}

type CursorDragCleanup = () => void;

/** Long-lived owner for cursor overlay geometry and A/B gesture lifecycles.
 * `connect()` may be refreshed by cursor presentation renders without canceling an in-flight drag; mode/unmount calls `cancelActiveDrags()`. */
export class CursorOverlayOwner {
  #presentationCleanup: (() => void) | undefined;
  #activeDragCleanups = new Set<CursorDragCleanup>();

  connect(input: CursorOverlayInput): () => void {
    this.#presentationCleanup?.();
    const viewports = [input.viewport, input.viewportLower].filter((viewport): viewport is HTMLDivElement => viewport !== null);
    const cursors = [["a", input.cursorA, "Cursor A"], ["b", input.cursorB, "Cursor B"]] as const;
    const update = () => {
      for (const viewport of viewports) {
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
        for (const [key, cycle, label] of cursors) {
          let line = overlay.querySelector<HTMLElement>(`[data-cursor='${key}']`);
          if (cycle === undefined) { line?.remove(); continue; }
          if (!line) {
            line = viewport.ownerDocument.createElement("div");
            line.dataset.cursor = key;
            line.dataset.role = "cursor-line";
            line.setAttribute("aria-label", label);
            overlay.append(line);
          }
          const left = input.resolveCursorOverlayLeftAtCycle?.(cycle, viewport);
          if (left === undefined) { line.hidden = true; continue; }
          line.hidden = false;
          line.style.position = "absolute";
          line.style.top = "0";
          line.style.width = "2px";
          const splitterTop = viewport.closest(".cycle-panel")?.parentElement?.querySelector(".bottom-resize-track")?.getBoundingClientRect().top;
          const visibleHeight = splitterTop !== undefined && splitterTop > viewportRect.top && splitterTop < viewportRect.bottom ? splitterTop - viewportRect.top : viewport.clientHeight;
          line.style.height = `${Math.max(visibleHeight, 250)}px`;
          line.style.pointerEvents = "auto";
          line.style.left = `${left}px`;
          line.dataset.cycle = String(cycle);
        }
      }
    };
    update();
    const scrollTargets = [input.viewport, input.viewportLower].filter((element): element is HTMLDivElement => element !== null);
    const deferredUpdate = requestAnimationFrame(update);
    const viewportResizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    for (const viewport of viewports) { viewportResizeObserver?.observe(viewport); viewportResizeObserver?.observe(timelineScrollOwner(viewport)); }
    const dragHandlers: Array<[HTMLDivElement, (event: PointerEvent) => void]> = [];
    for (const viewport of viewports) {
      if (!input.onSetCursorAtCycle) continue;
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
          const resolved = input.resolveCursorCycleAtClientX?.(clientX, viewport);
          if (resolved !== undefined) input.onSetCursorAtCycle?.(which, resolved);
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
      viewportResizeObserver?.disconnect();
      for (const [target, handler] of dragHandlers) target.removeEventListener("pointerdown", handler, true);
      window.removeEventListener("resize", update);
      if (this.#presentationCleanup === disconnect) this.#presentationCleanup = undefined;
    };
    this.#presentationCleanup = disconnect;
    return disconnect;
  }

  cancelActiveDrags(): void {
    for (const cleanup of [...this.#activeDragCleanups]) cleanup();
  }

  dispose(): void {
    this.#presentationCleanup?.();
    this.cancelActiveDrags();
  }
}
