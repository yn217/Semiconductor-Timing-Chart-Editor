import type { LocalGeometryMap, TimeAxisGeometry } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping } from "@timing-chart-v2/projection";
import { presentationCycles } from "./presentation-cycles.js";
import type { SignalId } from "@timing-chart-v2/schema";

export function renderGeometryGrid(element: HTMLElement, geometry: LocalGeometryMap | undefined, axisOwnerSignalId: SignalId | undefined, visible: boolean, height: number, mapping: DisplayTimeMapping, screenWidth?: number, scaleOverride?: number, axisMode: TimeAxisGeometry["mode"] = "reference-clock", tcStride = 1): void {
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
  const semanticDisplayCycleCount = geometry.cycleBoundaryEntries?.().at(-1)?.cycle ?? mapping.displayCycleCount;
  const gridTickBudget = semanticDisplayCycleCount > 4096 ? 512 : Infinity;
  for (const displayCycle of presentationCycles(semanticDisplayCycleCount, pixelsPerCycle, gridTickBudget, tcStride)) {
    const sourceCycle = displayCycle === mapping.displayCycleCount ? mapping.displayToSource(displayCycle) ?? mapping.displayCycleCount : (mapping.displayToSource(displayCycle) ?? displayCycle);
    const anchor = geometry.find({ signalId: axisOwnerSignalId, cycle: sourceCycle, point: "cycle-start" });
    if (!anchor) continue;
    const line = element.ownerDocument.createElement("span");
    line.dataset.role = "geometry-grid-line";
    line.className = "geometry-grid-line";
    line.dataset.cycle = String(mapping.labelFor(displayCycle));
    line.style.left = `${anchor.point.x * scale}px`;
    line.style.height = `${height}px`;
    lines.push(line);
  }
  element.replaceChildren(...lines);
}
