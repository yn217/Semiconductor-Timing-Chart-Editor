import type { LocalGeometryMap, TimeAxisGeometry } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping } from "@timing-chart-v2/projection";
import { presentationCycles } from "./presentation-cycles.js";
import type { SignalId } from "@timing-chart-v2/schema";

export type GeometryGridVisibleRange = Readonly<{ start: number; end: number }>;

export function renderGeometryGrid(element: HTMLElement, geometry: LocalGeometryMap | undefined, axisOwnerSignalId: SignalId | undefined, visible: boolean, height: number, mapping: DisplayTimeMapping, screenWidth?: number, scaleOverride?: number, axisMode: TimeAxisGeometry["mode"] = "reference-clock", visibleRange?: GeometryGridVisibleRange, boundaryToX?: (sourceCycle: number) => number | undefined): void {
  element.dataset.gridEnabled = String(visible);
  element.dataset.axisMode = axisMode;
  element.style.height = `${height}px`;
  if (!geometry || !axisOwnerSignalId) return;
  const terminal = geometry.find({ signalId: axisOwnerSignalId, cycle: mapping.displayCycleCount, point: "cycle-start" })?.point.x ?? 0;
  const scale = scaleOverride ?? (screenWidth === undefined || terminal <= 0 ? 1 : screenWidth / Math.max(1, terminal + 24));
  const lines: HTMLElement[] = [];
  const cycleZeroPoint = geometry.find({ signalId: axisOwnerSignalId, cycle: 0, point: "cycle-start" })?.point;
  const cycleOnePoint = mapping.displayCycleCount > 0 ? geometry.find({ signalId: axisOwnerSignalId, cycle: 1, point: "cycle-start" })?.point : undefined;
  const pixelsPerCycle = cycleZeroPoint && cycleOnePoint ? (cycleOnePoint.x - cycleZeroPoint.x) * scale : Infinity;
  // A bounded/windowed geometry map may retain only the bootstrap prefix even
  // while mounted waveform owners have re-windowed far into the document.
  // Keep grid density and semantic extent tied to the shared mapping, as the
  // ruler is; estimate the global X transform from the retained geometry and
  // extrapolate ticks that are outside that retained map.
  const semanticDisplayCycleCount = mapping.displayCycleCount;
  const gridTickBudget = semanticDisplayCycleCount > 4096 ? 512 : Infinity;
  const entries = geometry.cycleBoundaryEntries?.() ?? [];
  let firstPoint: { readonly x: number } | undefined;
  let firstDisplay: number | undefined;
  let lastPoint: { readonly x: number } | undefined;
  let lastDisplay: number | undefined;
  for (const entry of entries) {
    const display = mapping.sourceToDisplay[entry.cycle] ?? (entry.cycle === mapping.displayCycleCount ? mapping.displayCycleCount : undefined);
    if (display === undefined) continue;
    if (firstDisplay === undefined || display < firstDisplay) { firstPoint = entry.position; firstDisplay = display; }
    if (lastDisplay === undefined || display > lastDisplay) { lastPoint = entry.position; lastDisplay = display; }
  }
  const windowPixelsPerDisplayCycle = firstPoint && lastPoint && firstDisplay !== undefined && lastDisplay !== undefined && lastDisplay !== firstDisplay
    ? (lastPoint.x - firstPoint.x) / (lastDisplay - firstDisplay)
    : undefined;
  const displayPixelsPerCycle = (windowPixelsPerDisplayCycle ?? (Number.isFinite(pixelsPerCycle) ? pixelsPerCycle / scale : undefined) ?? 0) * scale;
  const stride = Number.isFinite(displayPixelsPerCycle) && displayPixelsPerCycle > 0 ? Math.max(1, Math.ceil(28 / displayPixelsPerCycle)) : 1;
  const displayCycles = visibleRange !== undefined
    ? (() => {
      const first = Math.max(0, Math.floor(visibleRange.start / stride) * stride - stride);
      const last = Math.min(semanticDisplayCycleCount, Math.ceil(visibleRange.end / stride) * stride + stride);
      return Array.from({ length: Math.floor((last - first) / stride) + 1 }, (_, index) => first + index * stride);
    })()
    : presentationCycles(semanticDisplayCycleCount, pixelsPerCycle, semanticDisplayCycleCount > 4096 ? 512 : Infinity);
  for (const displayCycle of displayCycles) {
    const sourceCycle = displayCycle === mapping.displayCycleCount ? mapping.displayToSource[displayCycle] ?? mapping.displayCycleCount : (mapping.displayToSource[displayCycle] ?? displayCycle);
    const anchor = geometry.find({ signalId: axisOwnerSignalId, cycle: sourceCycle, point: "cycle-start" })?.point;
    const projectedX = boundaryToX?.(sourceCycle);
    const point = projectedX !== undefined ? undefined : anchor ?? (firstPoint && firstDisplay !== undefined && windowPixelsPerDisplayCycle !== undefined
      ? { x: firstPoint.x + (displayCycle - firstDisplay) * windowPixelsPerDisplayCycle }
      : undefined);
    if (!point && projectedX === undefined) continue;
    const line = element.ownerDocument.createElement("span");
    line.dataset.role = "geometry-grid-line";
    line.className = "geometry-grid-line";
    line.dataset.cycle = String(mapping.labelFor(displayCycle));
    line.style.left = `${projectedX ?? point!.x * scale}px`;
    line.style.height = `${height}px`;
    lines.push(line);
  }
  element.replaceChildren(...lines);
}
