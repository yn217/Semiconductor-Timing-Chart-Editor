import { rangeFromBoundaries } from "./range-selection.js";
import { RangeDragController } from "./range-drag.js";

type TimelineRange = Readonly<{ start: number; end: number }>;

export type TimelineRangeInteractionContext = Readonly<{
  rendererHost: HTMLElement;
  ruler: HTMLElement;
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
    const tick = onRuler ? target?.closest<HTMLElement>("[data-cycle]") : null;
    const rulerCycle = () => [...this.context.ruler.querySelectorAll<HTMLElement>("[data-cycle]")]
      .map((item) => ({ cycle: Number(item.dataset.sourceCycle ?? item.dataset.cycle), distance: Math.abs(item.getBoundingClientRect().x - event.clientX) }))
      .sort((left, right) => left.distance - right.distance)[0]?.cycle;
    const cycle = onRuler ? (tick ? Number(tick.dataset.sourceCycle ?? tick.dataset.cycle) : (rulerCycle() ?? this.context.cycleBoundaryAtX(event.clientX))) : this.context.cycleBoundaryAtX(event.clientX);
    if (cycle === undefined || cycle > this.context.getCycleCount()) return;
    this.#drag.begin({ start: cycle, anchor: event.shiftKey ? this.context.getRange().start : cycle, selectedCycle: this.context.getSelectedCycle(), startClientX: event.clientX, surface: onRuler ? "ruler" : "waveform", moved: false });
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
    const cycle = [...this.context.ruler.querySelectorAll<HTMLElement>("[data-cycle]")]
      .map((item) => ({ cycle: Number(item.dataset.sourceCycle ?? item.dataset.cycle), distance: Math.abs(item.getBoundingClientRect().x - event.clientX) }))
      .sort((left, right) => left.distance - right.distance)[0]?.cycle ?? this.context.cycleBoundaryAtX(event.clientX) ?? drag.start;
    if (!drag.moved) {
      this.context.setSelectedCyclePreview(drag.selectedCycle);
      this.clearPreview();
      this.suppressClicks(drag.surface);
      const clickCycle = drag.surface === "ruler" ? drag.start : this.context.cycleBoundaryAtX(event.clientX);
      if (clickCycle !== undefined) this.context.applyCanvasCycleSelection(clickCycle, event.shiftKey);
      event.preventDefault();
      return;
    }
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
    this.context.setSelectedCyclePreview(this.#drag.current!.selectedCycle);
    this.clearPreview();
  }

  private clearPreview(): void {
    this.#drag.clear();
    delete this.context.rendererHost.dataset.rangeDrag;
    delete this.context.rendererHost.dataset.rangePreview;
    delete this.context.rendererHost.dataset.rangePreviewCycle;
    this.context.refreshRange();
    this.context.refreshPlayhead();
  }

  private suppressClicks(surface: "ruler" | "waveform"): void {
    this.#suppressCanvasClick = true;
    this.#suppressRulerClick = surface === "ruler";
    requestAnimationFrame(() => { this.#suppressCanvasClick = false; });
    if (this.#suppressRulerClick) requestAnimationFrame(() => { this.#suppressRulerClick = false; });
  }
}
