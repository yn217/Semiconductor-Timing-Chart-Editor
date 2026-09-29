import type { WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import { WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X } from "@timing-chart-v2/geometry";

/**
 * #755 PROTOTYPE (feature-flagged, not a renderer decision): paint one wave-owner onto a single <canvas>
 * instead of mounting a WaveDrom SVG, so the owner contributes ~1 DOM node instead of thousands. Draws the
 * WaveJson token stream (p n 0 1 x z = digits . |) on WaveDrom's grid (origin 20.5, 40 units per cycle).
 * Geometry is NOT read back from pixels; see uniformCycleBoundaryEntries.
 */
const ROW_HEIGHT = 30;
// WaveDrom brick frame: lane draw origin y = 5.5, brick height 20.
const DRAW_Y = 5.5;
const HIGH = DRAW_Y;
const LOW = DRAW_Y + 20;

/**
 * Wave renderer selection (#755). `?wave=svg` / `?wave=canvas` force one; `?canvas755` is the legacy spelling of canvas. Without a
 * query the renderer is chosen by document size: documents whose signals x cycles reach the large-document budget paint with the
 * viewport-bounded Canvas (no per-cycle SVG DOM, so a far jump no longer blocks for seconds); everything smaller keeps the SVG path,
 * which stays the export/fallback renderer.
 */
export const CANVAS_WAVE_AUTO_BUDGET = 250_000;

export function isCanvasWaveRendererSelected(document: { readonly signals: readonly unknown[]; readonly timeline: { readonly cycleCount: number } }): boolean {
  try {
    if (typeof location !== "undefined") {
      const params = new URLSearchParams(location.search);
      const forced = params.get("wave");
      if (forced === "canvas" || params.has("canvas755")) return canvasSupported();
      if (forced === "svg") return false;
    }
  } catch { /* fall through to auto */ }
  return document.signals.length * document.timeline.cycleCount >= CANVAS_WAVE_AUTO_BUDGET && canvasSupported();
}

function canvasSupported(): boolean {
  try { return typeof document !== "undefined" && document.createElement("canvas").getContext("2d") !== null; } catch { return false; }
}

/**
 * Viewport-bounded painting: one canvas per owner, only as wide as the visible slice plus a margin, repainted on
 * scroll. Painting the whole window (tiles or one big canvas) just moves the cost into canvas backing stores.
 */
const MARGIN_PX = 512;
const painted = new WeakMap<HTMLElement, { wave: WaveJsonSignal; canvas: HTMLCanvasElement; viewport: HTMLElement | null; raf: number; onScroll: () => void; onRestyle: () => void }>();

export function paintWaveCanvas(owner: HTMLElement, wave: WaveJsonSignal): void {
  let state = painted.get(owner);
  if (!state || !owner.contains(state.canvas)) {
    if (state) { state.viewport?.removeEventListener("scroll", state.onScroll); owner.removeEventListener(WAVE_CANVAS_RESTYLE_EVENT, state.onRestyle); cancelAnimationFrame(state.raf); }
    const canvas = owner.ownerDocument.createElement("canvas");
    canvas.setAttribute("data-wave-canvas", "");
    canvas.style.cssText = `display:block;position:absolute;top:0;height:${ROW_HEIGHT}px;`;
    owner.replaceChildren(canvas);
    const viewport = owner.closest<HTMLElement>(".cycle-viewport");
    const created = { wave, canvas, viewport, raf: 0, onScroll: () => undefined as void, onRestyle: () => undefined as void };
    created.onScroll = () => { cancelAnimationFrame(created.raf); created.raf = requestAnimationFrame(() => drawVisible(owner, created.wave, created.canvas, created.viewport)); };
    created.onRestyle = () => drawVisible(owner, created.wave, created.canvas, created.viewport);
    viewport?.addEventListener("scroll", created.onScroll, { passive: true });
    owner.addEventListener(WAVE_CANVAS_RESTYLE_EVENT, created.onRestyle);
    painted.set(owner, created);
    state = created;
  }
  state.wave = wave;
  drawVisible(owner, wave, state.canvas, state.viewport);
}

// Built lazily: Path2D does not exist in non-canvas (jsdom) environments that merely import this module.
let gapPaths: { mask: Path2D; lines: Path2D[] } | undefined;
const gapSymbol = () => gapPaths ??= { mask: new Path2D("m7,-2 -4,0 c -5,0 -5,24 -10,24 l 4,0 C 2,22 2,-2 7,-2 z"), lines: [new Path2D("M-7,22 C -2,22 -2,-2 3,-2"), new Path2D("M-3,22 C 2,22 2,-2 7,-2")] };
/** WaveDrom's default stroke; per-Signal `waveformColor` (published by the renderer as data-waveform-style-color) overrides it. */
const WAVEFORM_DEFAULT_STROKE = "#000";
export const WAVE_CANVAS_RESTYLE_EVENT = "wave-canvas-restyle";

function drawVisible(owner: HTMLElement, wave: WaveJsonSignal, canvas: HTMLCanvasElement, viewport: HTMLElement | null): void {
  // WaveDrom semantics: each wave character spans `period` cycles and the whole lane shifts left by `phase` cycles.
  const period = wave.period ?? 1;
  const phase = wave.phase ?? 0;
  const slotWidth = period * WAVEDROM_CYCLE_WIDTH;
  const cycles = wave.geometrySourceCycles !== undefined ? wave.geometrySourceCycles.length - 1 : wave.wave.length * period;
  const totalWidth = WAVEDROM_ORIGIN_X * 2 + cycles * WAVEDROM_CYCLE_WIDTH;
  const ownerRect = owner.getBoundingClientRect();
  const viewRect = viewport?.getBoundingClientRect();
  const visibleStart = viewRect ? Math.max(0, viewRect.left - ownerRect.left - MARGIN_PX) : 0;
  const visibleEnd = viewRect ? Math.min(totalWidth, viewRect.right - ownerRect.left + MARGIN_PX) : Math.min(totalWidth, 2048);
  const width = Math.max(1, Math.ceil(visibleEnd - visibleStart));
  // Owner css width maps local units 1:1 only when its width equals totalWidth; the prototype keeps that scale.
  canvas.width = width;
  canvas.height = ROW_HEIGHT;
  canvas.style.width = `${width}px`;
  canvas.style.left = `${visibleStart}px`;
  const context = canvas.getContext("2d");
  if (!context) return;
  const color = owner.dataset.waveformStyleColor || WAVEFORM_DEFAULT_STROKE;
  context.clearRect(0, 0, width, ROW_HEIGHT);
  context.translate(-visibleStart, 0);
  // WaveDrom drops the phase-shifted head of the lane; nothing is drawn left of the origin.
  context.beginPath();
  context.rect(WAVEDROM_ORIGIN_X, 0, cycles * WAVEDROM_CYCLE_WIDTH, ROW_HEIGHT);
  context.clip();
  context.lineWidth = 1;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.font = "11px sans-serif";
  context.textBaseline = "middle";
  context.textAlign = "center";
  const slotStart = (slot: number): number => WAVEDROM_ORIGIN_X + (slot * period - phase) * WAVEDROM_CYCLE_WIDTH;
  const firstSlot = Math.max(0, Math.floor((visibleStart - WAVEDROM_ORIGIN_X) / slotWidth + phase / period) - 1);
  const lastSlot = Math.min(wave.wave.length, Math.ceil((visibleEnd - WAVEDROM_ORIGIN_X) / slotWidth + phase / period) + 1);
  // Resolve the token in effect at firstSlot (dots repeat the previous value) and its data index.
  let previous = ".";
  let dataIndex = 0;
  for (let slot = 0; slot < firstSlot; slot += 1) {
    const raw = wave.wave[slot] ?? ".";
    if (raw !== "." && raw !== "|") { previous = raw; if (raw === "=" || (raw >= "2" && raw <= "9")) dataIndex += 1; }
  }
  const data = wave.data ?? [];
  const gaps: number[] = [];
  context.beginPath();
  for (let slot = firstSlot; slot < lastSlot; slot += 1) {
    const raw = wave.wave[slot] ?? ".";
    const token = raw === "." || raw === "|" ? previous : raw;
    const x0 = slotStart(slot);
    const x1 = x0 + slotWidth;
    const mid = (x0 + x1) / 2;
    if (raw === "|") gaps.push(mid);
    if (token === "p") { context.moveTo(x0, LOW); context.lineTo(x0, HIGH); context.lineTo(mid, HIGH); context.lineTo(mid, LOW); context.lineTo(x1, LOW); }
    else if (token === "n") { context.moveTo(x0, HIGH); context.lineTo(x0, LOW); context.lineTo(mid, LOW); context.lineTo(mid, HIGH); context.lineTo(x1, HIGH); }
    else if (token === "1") { context.moveTo(x0, HIGH); context.lineTo(x1, HIGH); }
    else if (token === "0") { context.moveTo(x0, LOW); context.lineTo(x1, LOW); }
    else if (token === "z") { context.moveTo(x0, (HIGH + LOW) / 2); context.lineTo(x1, (HIGH + LOW) / 2); }
    else if (token === "x") { context.rect(x0 + 1, HIGH, slotWidth - 2, LOW - HIGH); }
    else {
      context.moveTo(x0 + 3, HIGH); context.lineTo(x1 - 3, HIGH); context.lineTo(x1, (HIGH + LOW) / 2); context.lineTo(x1 - 3, LOW); context.lineTo(x0 + 3, LOW); context.lineTo(x0, (HIGH + LOW) / 2); context.closePath();
      if (raw !== "." && raw !== "|") { const label = data[dataIndex]; dataIndex += 1; if (label !== undefined) context.fillText(label, mid, (HIGH + LOW) / 2, slotWidth - 6); }
    }
    previous = token;
  }
  context.stroke();
  // WaveDrom's `gap` symbol: a white break mask with two slanted strokes at the middle of the `|` slot.
  for (const x of gaps) {
    context.save();
    context.translate(x, DRAW_Y);
    context.fillStyle = "#fff";
    context.fill(gapSymbol().mask);
    for (const line of gapSymbol().lines) context.stroke(line);
    context.restore();
  }
}
