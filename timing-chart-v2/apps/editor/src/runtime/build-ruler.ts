import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import type { DisplayTimeMapping } from "@timing-chart-v2/projection";
import type { TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { presentationCycles } from "../presentation-cycles.js";

export function buildRuler(element: HTMLElement, geometry: LocalGeometryMap | undefined, document: CanonicalDocument, axisOwnerSignalId: SignalId | undefined, mapping: DisplayTimeMapping, forcedScale?: number, actualScreenScale?: number, axisMode: TimeAxisGeometry["mode"] = "reference-clock"): number {
  element.dataset.axisMode = axisMode;
  if (!geometry || !axisOwnerSignalId) {
    element.dataset.geometryError = "Time-axis geometry unavailable";
    element.parentElement?.setAttribute("data-geometry-error", "Time-axis geometry unavailable");
    element.replaceChildren();
    return 1;
  }
  delete element.dataset.geometryError;
  element.parentElement?.removeAttribute("data-geometry-error");
  const rangeBand = element.ownerDocument.createElement("div");
  rangeBand.dataset.role = "range-selection-ruler-band";
  rangeBand.dataset.testid = "range-preview";
  rangeBand.setAttribute("aria-hidden", "true");
  rangeBand.hidden = true;
  const ticks: HTMLElement[] = [];
  // Fixed pixel-per-cycle by default: 1 local-geometry unit = 1px at 100%
  // zoom, independent of the visible pane's width. Any shrink-to-fit is an
  // explicit, on-demand action (Fit All / Fit Selection, which set zoom
  // directly -- see createTimelineNavigationController) rather than
  // something every render silently redoes. `forcedScale` still lets a
  // resolved scale persist across re-renders once established.
  // Resolve the screen scale once on the initial mount. Subsequent timeline
  // edits may change the SVG's intrinsic width; reusing that new browser
  // matrix would move existing semantic anchors even when their source cycle
  // is unchanged. The TimelineGeometryOwner's established scale remains the
  // single presentation-scale authority after initialization.
  const scale = forcedScale ?? actualScreenScale ?? 1;
  let finalX = 0;
  for (const display of presentationCycles(mapping.displayCycleCount)) {
    const point = geometry.find({ signalId: axisOwnerSignalId, cycle: display, point: "cycle-start" })?.point;
    if (!point) continue;
    const tick = element.ownerDocument.createElement("span");
    tick.dataset.cycle = String(mapping.labelFor(display));
    tick.dataset.displayCycle = String(display);
    tick.dataset.sourceCycle = String(display === mapping.displayCycleCount ? document.timeline.cycleCount : mapping.displayToSource[display]);
    tick.className = "cycle-tick";
    tick.style.left = `${point.x * scale}px`;
    tick.textContent = String(mapping.labelFor(display));
    ticks.push(tick);
    finalX = point.x;
  }
  const overlays: HTMLElement[] = [];
  for (const bookmark of document.bookmarks) {
    const displayCycle = mapping.sourceToDisplay[bookmark.start];
    if (displayCycle === undefined) continue;
    const point = geometry.find({ signalId: axisOwnerSignalId, cycle: displayCycle, point: "cycle-start" })?.point;
    if (!point) continue;
    const marker = element.ownerDocument.createElement("span");
    marker.className = "timeline-marker";
    marker.dataset.bookmarkId = bookmark.id;
    marker.style.left = `${point.x * scale}px`;
    marker.textContent = `◆ ${bookmark.name}`;
    overlays.push(marker);
  }
  for (const group of document.timeGroups.filter((item) => item.presentation?.collapsed)) {
    const anchorDisplay = (group.end < document.timeline.cycleCount ? mapping.sourceToDisplay[group.end] : undefined)
      ?? (group.start > 0 ? mapping.sourceToDisplay[group.start - 1] : undefined);
    if (anchorDisplay === undefined) continue;
    const point = geometry.find({ signalId: axisOwnerSignalId, cycle: anchorDisplay, point: "cycle-start" })?.point;
    if (!point) continue;
    const gap = element.ownerDocument.createElement("span");
    gap.className = "timeline-gap";
    gap.dataset.timeGroupId = group.id;
    gap.style.left = `${point.x * scale}px`;
    gap.textContent = group.presentation?.foldLabel ?? group.name;
    overlays.push(gap);
  }
  element.replaceChildren(rangeBand, ...ticks, ...overlays);
  element.dataset.source = "local-geometry";
  element.parentElement?.setAttribute("data-source", "local-geometry");
  const targetWidth = Math.ceil((finalX + 24) * scale);
  element.style.width = `${targetWidth}px`;
  const widthOwner = element.closest<HTMLElement>("[data-testid='cycle-viewport']") ?? element.parentElement;
  widthOwner?.style.setProperty("--wave-width", `${targetWidth}px`);
  return scale;
}
