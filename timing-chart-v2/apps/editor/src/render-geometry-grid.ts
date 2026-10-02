import type { LocalGeometryMap, TimeAxisGeometry } from "@timing-chart-v2/geometry";
import type { DisplayTimeMapping } from "@timing-chart-v2/projection";
import { presentationCycles } from "./presentation-cycles.js";
import type { SignalId } from "@timing-chart-v2/schema";
import { sourceBoundaryGeometryPoint } from "./runtime/display-boundary.js";

export function renderGeometryGrid(element: HTMLElement, geometry: LocalGeometryMap | undefined, axisOwnerSignalId: SignalId | undefined, visible: boolean, height: number, mapping: DisplayTimeMapping, screenWidth?: number, scaleOverride?: number, axisMode: TimeAxisGeometry["mode"] = "reference-clock", tcStride = 1): void {
  element.dataset.gridEnabled = String(visible);
  element.dataset.axisMode = axisMode;
  element.style.height = `${height}px`;
  if (!geometry || !axisOwnerSignalId) return;
  const terminal = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, mapping.sourceCycleCount, mapping.displayCycleCount)?.x ?? 0;
  const scale = scaleOverride ?? (screenWidth === undefined || terminal <= 0 ? 1 : screenWidth / Math.max(1, terminal + 24));
  const lines: HTMLElement[] = [];
  const cycleZeroSource = mapping.displayToSource(0) ?? 0;
  const cycleOneSource = mapping.displayCycleCount > 0 ? mapping.displayToSource(1) : undefined;
  const cycleZeroPoint = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, cycleZeroSource, 0);
  const cycleOnePoint = cycleOneSource === undefined ? undefined : sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, cycleOneSource, 1);
  const pixelsPerCycle = cycleZeroPoint && cycleOnePoint ? (cycleOnePoint.x - cycleZeroPoint.x) * scale : Infinity;
  const semanticDisplayCycleCount = mapping.displayCycleCount;
  const gridTickBudget = semanticDisplayCycleCount > 4096 ? 512 : Infinity;
  for (const displayCycle of presentationCycles(semanticDisplayCycleCount, pixelsPerCycle, gridTickBudget, tcStride)) {
    const sourceCycle = displayCycle === mapping.displayCycleCount ? mapping.sourceCycleCount : (mapping.displayToSource(displayCycle) ?? displayCycle);
    const point = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, sourceCycle, displayCycle);
    if (!point) continue;
    const line = element.ownerDocument.createElement("span");
    line.dataset.role = "geometry-grid-line";
    line.className = "geometry-grid-line";
    line.dataset.cycle = String(mapping.labelFor(displayCycle));
    line.style.left = `${point.x * scale}px`;
    line.style.height = `${height}px`;
    lines.push(line);
  }
  element.replaceChildren(...lines);
}
