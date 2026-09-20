import type { WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import { WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X } from "@timing-chart-v2/geometry";

/**
 * #755 PROTOTYPE (feature-flagged, not a renderer decision): paint one wave-owner onto a single <canvas>
 * instead of mounting a WaveDrom SVG, so the owner contributes ~1 DOM node instead of thousands. Draws the
 * WaveJson token stream (p n 0 1 x z = digits . |) on WaveDrom's grid (origin 20.5, 40 units per cycle).
 * Geometry is NOT read back from pixels; see uniformCycleBoundaryEntries.
 */
const ROW_HEIGHT = 30;
const HIGH = 6;
const LOW = 24;

export function isCanvasWavePrototypeEnabled(): boolean {
  try { return typeof location !== "undefined" && new URLSearchParams(location.search).has("canvas755"); } catch { return false; }
}

/**
 * Viewport-bounded painting: one canvas per owner, only as wide as the visible slice plus a margin, repainted on
 * scroll. Painting the whole window (tiles or one big canvas) just moves the cost into canvas backing stores.
 */
const MARGIN_PX = 512;
const painted = new WeakMap<HTMLElement, { wave: WaveJsonSignal; canvas: HTMLCanvasElement; viewport: HTMLElement | null; raf: number; onScroll: () => void }>();

export function paintWaveCanvas(owner: HTMLElement, wave: WaveJsonSignal): void {
  let state = painted.get(owner);
  if (!state || !owner.contains(state.canvas)) {
    if (state) { state.viewport?.removeEventListener("scroll", state.onScroll); cancelAnimationFrame(state.raf); }
    const canvas = owner.ownerDocument.createElement("canvas");
    canvas.setAttribute("data-wave-canvas", "");
    canvas.style.cssText = `display:block;position:absolute;top:0;height:${ROW_HEIGHT}px;`;
    owner.replaceChildren(canvas);
    const viewport = owner.closest<HTMLElement>(".cycle-viewport");
    const created = { wave, canvas, viewport, raf: 0, onScroll: () => undefined as void };
    created.onScroll = () => { cancelAnimationFrame(created.raf); created.raf = requestAnimationFrame(() => drawVisible(owner, created.wave, created.canvas, created.viewport)); };
    viewport?.addEventListener("scroll", created.onScroll, { passive: true });
    painted.set(owner, created);
    state = created;
  }
  state.wave = wave;
  drawVisible(owner, wave, state.canvas, state.viewport);
}

function drawVisible(owner: HTMLElement, wave: WaveJsonSignal, canvas: HTMLCanvasElement, viewport: HTMLElement | null): void {
  const cycles = wave.geometrySourceCycles !== undefined ? wave.geometrySourceCycles.length - 1 : wave.wave.length;
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
  context.clearRect(0, 0, width, ROW_HEIGHT);
  context.translate(-visibleStart, 0);
  context.lineWidth = 1;
  context.strokeStyle = "#1a1a1a";
  context.fillStyle = "#1a1a1a";
  context.font = "11px sans-serif";
  context.textBaseline = "middle";
  context.textAlign = "center";
  const firstCycle = Math.max(0, Math.floor((visibleStart - WAVEDROM_ORIGIN_X) / WAVEDROM_CYCLE_WIDTH));
  const lastCycle = Math.min(cycles, Math.ceil((visibleEnd - WAVEDROM_ORIGIN_X) / WAVEDROM_CYCLE_WIDTH) + 1);
  // Resolve the token in effect at firstCycle (dots repeat the previous value) and its data index.
  let previous = ".";
  let dataIndex = 0;
  for (let cycle = 0; cycle < firstCycle; cycle += 1) {
    const raw = wave.wave[cycle] ?? ".";
    if (raw !== "." && raw !== "|") { previous = raw; if (raw === "=" || (raw >= "2" && raw <= "9")) dataIndex += 1; }
  }
  const data = wave.data ?? [];
  context.beginPath();
  for (let cycle = firstCycle; cycle < lastCycle; cycle += 1) {
    const raw = wave.wave[cycle] ?? ".";
    const token = raw === "." || raw === "|" ? previous : raw;
    const x0 = WAVEDROM_ORIGIN_X + cycle * WAVEDROM_CYCLE_WIDTH;
    const x1 = x0 + WAVEDROM_CYCLE_WIDTH;
    const mid = (x0 + x1) / 2;
    if (token === "p") { context.moveTo(x0, LOW); context.lineTo(x0, HIGH); context.lineTo(mid, HIGH); context.lineTo(mid, LOW); context.lineTo(x1, LOW); }
    else if (token === "n") { context.moveTo(x0, HIGH); context.lineTo(x0, LOW); context.lineTo(mid, LOW); context.lineTo(mid, HIGH); context.lineTo(x1, HIGH); }
    else if (token === "1") { context.moveTo(x0, HIGH); context.lineTo(x1, HIGH); }
    else if (token === "0") { context.moveTo(x0, LOW); context.lineTo(x1, LOW); }
    else if (token === "z") { context.moveTo(x0, (HIGH + LOW) / 2); context.lineTo(x1, (HIGH + LOW) / 2); }
    else if (token === "x") { context.rect(x0 + 1, HIGH, WAVEDROM_CYCLE_WIDTH - 2, LOW - HIGH); }
    else {
      context.moveTo(x0 + 3, HIGH); context.lineTo(x1 - 3, HIGH); context.lineTo(x1, (HIGH + LOW) / 2); context.lineTo(x1 - 3, LOW); context.lineTo(x0 + 3, LOW); context.lineTo(x0, (HIGH + LOW) / 2); context.closePath();
      if (raw !== "." && raw !== "|") { const label = data[dataIndex]; dataIndex += 1; if (label !== undefined) context.fillText(label, mid, (HIGH + LOW) / 2, WAVEDROM_CYCLE_WIDTH - 6); }
    }
    previous = token;
  }
  context.stroke();
}
