import { rangeFromBoundaries } from "./range-selection.js";
import { RangeDragController } from "./range-drag.js";

type TimelineRange = Readonly<{ start: number; end: number }>;

function rulerCycleAtTarget(target: EventTarget | null, cycleCount: number): number | undefined {
  if (!(target instanceof Element)) return undefined;
  const tick = target.closest<HTMLElement>("[data-cycle]");
  if (!tick) return undefined;
  const cycle = Number(tick.dataset.sourceCycle ?? tick.dataset.cycle);
  return Number.isInteger(cycle) && cycle >= 0 && cycle <= cycleCount ? cycle : undefined;
}

export type TimelineRangeInteractionContext = Readonly<{
  rendererHost: HTMLElement;
  isTimeDomainPointerTarget: (event: PointerEvent) => boolean;
  cycleBoundaryAtX: (clientX: number) => number | undefined;
  getCycleCount: () => number;
  getRange: () => TimelineRange;
  getSelectedCycle: () => number;
  setSelectedCyclePreview: (cycle: number) => void;
  setRangeSelectionActive: (active: boolean) => void;
  setRange: (range: TimelineRange) => void;
  setSelectedCycle: (cycle: number) => void;
  applyCanvasCycleSelection: (cycle: number, extend: boolean) => void;
  refreshRange: () => void;
  refreshPlayhead: () => void;
}>;

/** Owns the complete pointer/keyboard lifecycle for transient range gestures. */
export class TimelineRangeInteractionOwner {
  readonly #drag = new RangeDragController();
  #suppressCanvasClick = false;
  #suppressRulerClick = false;

  constructor(private readonly context: TimelineRangeInteractionContext) {}

  consumeCanvasClickSuppression(): boolean {
    if (!this.#suppressCanvasClick) return false;
    this.#suppressCanvasClick = false;
    return true;
  }

  consumeRulerClickSuppression(): boolean {
    if (!this.#suppressRulerClick) return false;
    this.#suppressRulerClick = false;
    return true;
  }

  pointerDown = (event: PointerEvent): void => {
    if (this.context.rendererHost.dataset.arrowPick || this.#drag.current) return;
    const target = event.target instanceof Element ? event.target : undefined;
    const onRuler = Boolean(target?.closest("[data-testid='cycle-ruler']"));
    if (event.button !== 0 || !this.context.isTimeDomainPointerTarget(event)) return;
    const cycleCount = this.context.getCycleCount();
    const rulerClickCycle = onRuler ? rulerCycleAtTarget(event.target, cycleCount) : undefined;
    const cycle = rulerClickCycle ?? this.context.cycleBoundaryAtX(event.clientX);
    if (cycle === undefined || cycle > this.context.getCycleCount()) return;
    this.#drag.begin({ start: cycle, anchor: event.shiftKey ? this.context.getRange().start : cycle, selectedCycle: this.context.getSelectedCycle(), startClientX: event.clientX, surface: onRuler ? "ruler" : "waveform", ...(rulerClickCycle === undefined ? {} : { rulerClickCycle }), moved: false });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  pointerMove = (event: PointerEvent): void => {
    const drag = this.#drag.current;
    if (!drag) return;
    const cycle = this.context.cycleBoundaryAtX(event.clientX);
    if (cycle === undefined || (!drag.moved && Math.abs(event.clientX - drag.startClientX) < 4)) return;
    this.#drag.markMoved();
    this.context.setSelectedCyclePreview(cycle);
    this.context.rendererHost.dataset.rangePreview = `${Math.min(drag.anchor, cycle)}:${Math.max(drag.anchor, cycle)}`;
    this.context.rendererHost.dataset.rangePreviewCycle = String(cycle);
    this.context.rendererHost.dataset.rangeDrag = "active";
    this.context.refreshRange();
    this.context.refreshPlayhead();
    event.preventDefault();
  };

  pointerUp = (event: PointerEvent): void => {
    const drag = this.#drag.current;
    if (!drag) return;
    if (!drag.moved) {
      this.context.setSelectedCyclePreview(drag.selectedCycle);
      this.clearPreview();
      this.suppressClicks(drag.surface);
      // Pointer capture retargets the release event to the Ruler viewport, so
      // the original tick is no longer available from event.target. Preserve
      // the tick's semantic source cycle for a click; real drags continue to
      // resolve their release boundary from the complete waveform geometry.
      const clickCycle = drag.surface === "ruler"
        ? drag.rulerClickCycle ?? this.context.cycleBoundaryAtX(event.clientX)
        : this.context.cycleBoundaryAtX(event.clientX);
      if (clickCycle !== undefined) this.context.applyCanvasCycleSelection(clickCycle, event.shiftKey);
      event.preventDefault();
      return;
    }
    // The drag PREVIEW (PointerMove) resolves the released boundary from
    // the complete timeline geometry (cycleBoundaryAtX), never the Ruler's
    // DOM ticks -- those are a bounded presentation sample on long
    // timelines and can omit the boundary the preview showed. PointerUp
    // must commit through that same authority, or the committed range
    // endpoint can silently differ from the one the user watched during
    // the drag (#313).
    const cycle = this.context.cycleBoundaryAtX(event.clientX) ?? drag.start;
    const cycleCount = this.context.getCycleCount();
    const next = rangeFromBoundaries(drag.anchor, cycle, cycleCount);
    const selectedCycle = Math.min(next.start, cycleCount);
    this.context.setRangeSelectionActive(true);
    this.context.setSelectedCyclePreview(selectedCycle);
    this.context.setRange(next);
    this.context.setSelectedCycle(selectedCycle);
    this.context.rendererHost.dataset.selectedCycle = String(selectedCycle);
    this.clearPreview();
    this.suppressClicks(drag.surface);
    event.preventDefault();
  };

  pointerCancel = (): void => { if (this.#drag.current) this.cancel(); };
  keyDown = (event: KeyboardEvent): void => { if (event.key === "Escape" && this.#drag.current) this.cancel(); };

  private cancel(): void {
    const surface = this.#drag.current!.surface;
    this.context.setSelectedCyclePreview(this.#drag.current!.selectedCycle);
    this.clearPreview();
    // Escape/PointerCancel can fire while the pointer is still physically
    // down (Escape) or the OS otherwise interrupts the gesture; the
    // eventual mouseup/pointerup still lands on the same target and the
    // browser fires its trailing "click" there regardless. Without
    // suppressing it, that click re-resolves a brand-new single-cycle
    // selection at the release position, silently reintroducing the
    // selection this cancel was supposed to discard. Unlike the normal
    // PointerUp paths, that trailing click is not guaranteed within one
    // animation frame -- give it a generous grace window instead.
    this.suppressClicks(surface, 2000);
  }

  private clearPreview(): void {
    this.#drag.clear();
    delete this.context.rendererHost.dataset.rangeDrag;
    delete this.context.rendererHost.dataset.rangePreview;
    delete this.context.rendererHost.dataset.rangePreviewCycle;
    this.context.refreshRange();
    this.context.refreshPlayhead();
  }

  // `graceMs` controls how the suppression flag expires if no click ever
  // consumes it. The normal PointerUp paths call this synchronously as
  // part of the exact same native event chain the browser's trailing
  // "click" fires in, so a single animation frame is already generous.
  // Escape/PointerCancel (see #cancel) can fire well before the pointer is
  // actually released -- the mouse button may still be physically held --
  // so their trailing click can arrive much later than one frame; those
  // callers pass a longer grace window instead so the suppression is
  // still armed when that click actually lands.
  private suppressClicks(surface: "ruler" | "waveform", graceMs?: number): void {
    this.#suppressCanvasClick = true;
    this.#suppressRulerClick = surface === "ruler";
    const schedule = graceMs === undefined ? requestAnimationFrame : (callback: () => void) => setTimeout(callback, graceMs);
    schedule(() => { this.#suppressCanvasClick = false; });
    if (this.#suppressRulerClick) schedule(() => { this.#suppressRulerClick = false; });
  }
}
