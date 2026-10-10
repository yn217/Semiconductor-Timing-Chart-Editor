import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { RenderProjection } from "@timing-chart-v2/projection";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";
import { applyPencilStroke, pencilLevelAtY, pencilTrajectory, type PencilLevel } from "../waveform-pencil.js";
import type { WaveformPencilMode } from "../waveform-pencil-mode.js";
import type { DocumentEpoch } from "./document-epoch.js";
import { registerActiveGestureCancel } from "./active-gesture-cancellation.js";

export type WaveformPencilContext = Readonly<{
  rendererHost: HTMLElement;
  viewportElement: HTMLElement;
  documentEpoch: Pick<DocumentEpoch, "current" | "isCurrent">;
  mode: WaveformPencilMode;
  getDocument: () => CanonicalDocument;
  getProjection: () => RenderProjection;
  getTimelineOffset: () => number;
  /** True when the pointer event targets the time domain (not the tree, labels, annotations or controls). */
  isTimeDomainPointerTarget: (event: PointerEvent) => boolean;
  /** Cycle cell [start, end) under the pointer (deterministic floor, never snapped), or undefined outside the timeline. */
  cellAtX: (clientX: number) => number | undefined;
  /** Screen X of a canonical cycle boundary in the shared Timeline geometry. */
  boundaryScreenX: (cycle: number) => number | undefined;
  /** Screen rect origin of the Cycle wave layer (rows' local Y is measured from its top). */
  waveOrigin: () => Readonly<{ left: number; top: number }> | undefined;
  execute: (command: SemanticCommand) => void;
}>;

type Stroke = {
  readonly signalId: SignalId;
  readonly pointerId: number;
  readonly epoch: number;
  readonly rowY: number;
  readonly rowHeight: number;
  readonly painted: Map<number, PencilLevel>;
  previous: { cell: number; y: number };
  moved: boolean;
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Waveform Pencil: draws HIGH/LOW on a Binary Signal by dragging over its row. The Signal is fixed at pointer-down, every
 * cell the pointer passes is painted in order (never a start-to-current fill), the stroke is previewed with a light overlay
 * that never touches Canonical/History, and pointer-up commits the whole stroke as one `signal.replaceValues` command.
 */
export class WaveformPencilInteractionOwner {
  #stroke: Stroke | undefined;
  #preview: SVGSVGElement | undefined;
  #releaseGesture: (() => void) | undefined;
  readonly #unsubscribe: () => void;

  constructor(private readonly context: WaveformPencilContext) {
    this.#unsubscribe = context.mode.subscribe(() => { if (!context.mode.get()) this.cancel(); this.#syncCursor(); });
    this.#syncCursor();
  }

  get active(): boolean { return this.#stroke !== undefined; }

  #syncCursor(): void {
    if (this.context.mode.get()) this.context.rendererHost.dataset.waveformPencil = "on";
    else delete this.context.rendererHost.dataset.waveformPencil;
  }

  #row(localY: number): { readonly signalId: SignalId; readonly y: number; readonly height: number } | undefined {
    const document = this.context.getDocument();
    for (const row of this.context.getProjection().rowLayout) {
      if (row.kind !== "timing" || row.visible === false || localY < row.y || localY >= row.y + row.height) continue;
      const signal = document.signals.find((candidate) => candidate.id === row.rowId);
      if (signal?.type === "binary") return { signalId: signal.id, y: row.y, height: row.height };
      return undefined;
    }
    return undefined;
  }

  #paint(stroke: Stroke, clientX: number, clientY: number): boolean {
    const origin = this.context.waveOrigin();
    const cell = this.context.cellAtX(clientX);
    const cycleCount = this.context.getDocument().timeline.cycleCount;
    if (!origin || cell === undefined || cell < 0 || cell >= cycleCount) return false;
    const localY = clientY - origin.top;
    const levelAt = (y: number) => pencilLevelAtY(y, stroke.rowY, stroke.rowHeight);
    for (const [paintedCell, level] of pencilTrajectory(stroke.previous, { cell, y: localY }, levelAt)) stroke.painted.set(paintedCell, level);
    stroke.previous = { cell, y: localY };
    return true;
  }

  onPointerDown = (event: PointerEvent): void => {
    if (!this.context.mode.get() || this.#stroke || event.button !== 0 || !this.context.isTimeDomainPointerTarget(event)) return;
    const origin = this.context.waveOrigin();
    const cell = this.context.cellAtX(event.clientX);
    if (!origin || cell === undefined) return;
    const row = this.#row(event.clientY - origin.top);
    const cycleCount = this.context.getDocument().timeline.cycleCount;
    if (!row || cell < 0 || cell >= cycleCount) return;
    const localY = event.clientY - origin.top;
    const stroke: Stroke = { signalId: row.signalId, pointerId: event.pointerId, epoch: this.context.documentEpoch.current(), rowY: row.y, rowHeight: row.height, painted: new Map(), previous: { cell, y: localY }, moved: false };
    stroke.painted.set(cell, pencilLevelAtY(localY, row.y, row.height));
    this.#stroke = stroke;
    this.#releaseGesture = registerActiveGestureCancel(() => this.cancel(), "Waveform Pencil - drag to draw HIGH/LOW; Esc cancels");
    this.context.rendererHost.dataset.waveformPencilStroke = "active";
    try { this.context.rendererHost.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.#renderPreview(stroke);
  };

  onPointerMove = (event: PointerEvent): void => {
    const stroke = this.#stroke;
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    if (!this.context.documentEpoch.isCurrent(stroke.epoch)) { this.cancel(); return; }
    event.stopImmediatePropagation();
    // Coalesced samples keep a fast drag from skipping cells between two delivered events.
    const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    for (const sample of samples.length > 0 ? samples : [event]) if (this.#paint(stroke, sample.clientX, sample.clientY)) stroke.moved = true;
    this.#renderPreview(stroke);
  };

  onPointerUp = (event: PointerEvent): void => {
    const stroke = this.#stroke;
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    if (!this.context.documentEpoch.isCurrent(stroke.epoch)) { this.cancel(); return; }
    event.stopImmediatePropagation();
    this.#paint(stroke, event.clientX, event.clientY);
    this.#end();
    // The click that follows a drawing stroke must not also select a Cycle or Signal.
    const swallow = (click: Event) => { click.stopPropagation(); click.preventDefault(); };
    this.context.rendererHost.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => this.context.rendererHost.removeEventListener("click", swallow, true), 0);
    const document = this.context.getDocument();
    const signal = document.signals.find((candidate) => candidate.id === stroke.signalId);
    if (!signal || signal.type !== "binary") return;
    const values = applyPencilStroke(signal.values, document.timeline.cycleCount, stroke.painted);
    if (!values) return;
    this.context.execute({ id: nextCommandId("waveform_pencil"), type: "signal.replaceValues", signalId: signal.id, values });
  };

  /** Discards an unfinished stroke: nothing was written to Canonical, so only the preview needs to go. */
  cancel = (): void => {
    if (!this.#stroke) return;
    const pointerId = this.#stroke.pointerId;
    try { this.context.rendererHost.releasePointerCapture(pointerId); } catch { /* already released */ }
    this.#end();
  };

  /** Esc: cancel an active stroke, otherwise leave drawing mode for Select. Returns true when the key was consumed by a stroke. */
  onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (this.#stroke) { event.stopImmediatePropagation(); event.preventDefault(); this.cancel(); return; }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;
    if (this.context.mode.get()) this.context.mode.set(false);
  };

  dispose = (): void => {
    this.cancel();
    this.#unsubscribe();
    delete this.context.rendererHost.dataset.waveformPencil;
  };

  #end(): void {
    this.#stroke = undefined;
    this.#releaseGesture?.();
    this.#releaseGesture = undefined;
    delete this.context.rendererHost.dataset.waveformPencilStroke;
    this.#preview?.remove();
    this.#preview = undefined;
  }

  /** Light, pointer-transparent SVG over the stroked cells only; no WaveDrom render, no History, no Canonical write. */
  #renderPreview(stroke: Stroke): void {
    const origin = this.context.waveOrigin();
    if (!origin) return;
    const ownerDocument = this.context.rendererHost.ownerDocument;
    if (!this.#preview) {
      const svg = ownerDocument.createElementNS(SVG_NS, "svg");
      svg.setAttribute("data-testid", "waveform-pencil-preview");
      svg.setAttribute("aria-hidden", "true");
      Object.assign(svg.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "40" });
      ownerDocument.body.append(svg);
      this.#preview = svg;
    }
    const svg = this.#preview;
    svg.dataset.painted = JSON.stringify([...stroke.painted].sort((left, right) => left[0] - right[0]));
    svg.dataset.signalId = stroke.signalId;
    const viewport = this.context.viewportElement.getBoundingClientRect();
    const clipLeft = viewport.left + this.context.getTimelineOffset();
    const background = getComputedStyle(this.context.viewportElement).backgroundColor;
    const solid = background && background !== "rgba(0, 0, 0, 0)" ? background : "#ffffff";
    const top = origin.top + stroke.rowY;
    const high = top + stroke.rowHeight * 0.25;
    const low = top + stroke.rowHeight * 0.75;
    const cells = [...stroke.painted.keys()].sort((left, right) => left - right);
    const runs: number[][] = [];
    for (const cell of cells) { const run = runs.at(-1); if (run && run.at(-1) === cell - 1) run.push(cell); else runs.push([cell]); }
    let markup = `<defs><clipPath id="waveform-pencil-clip"><rect x="${clipLeft}" y="${viewport.top}" width="${Math.max(0, viewport.right - clipLeft)}" height="${Math.max(0, viewport.height)}"/></clipPath></defs><g clip-path="url(#waveform-pencil-clip)">`;
    for (const run of runs) {
      const startX = this.context.boundaryScreenX(run[0]!);
      const endX = this.context.boundaryScreenX(run.at(-1)! + 1);
      if (startX === undefined || endX === undefined) continue;
      let path = "";
      let previousY: number | undefined;
      for (const cell of run) {
        const x0 = this.context.boundaryScreenX(cell);
        const x1 = this.context.boundaryScreenX(cell + 1);
        if (x0 === undefined || x1 === undefined) continue;
        const y = stroke.painted.get(cell) === 1 ? high : low;
        path += previousY === undefined ? `M${x0} ${y}` : previousY === y ? "" : `L${x0} ${y}`;
        path += `L${x1} ${y}`;
        previousY = y;
      }
      markup += `<rect x="${startX}" y="${top + 1}" width="${Math.max(0, endX - startX)}" height="${Math.max(0, stroke.rowHeight - 2)}" fill="${solid}"/><path d="${path}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="miter"/>`;
    }
    svg.innerHTML = `${markup}</g>`;
  }
}
