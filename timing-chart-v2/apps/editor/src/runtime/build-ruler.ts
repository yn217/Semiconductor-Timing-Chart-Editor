import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import { buildTimeGroupHierarchy, type CanonicalDocument, type SignalId } from "@timing-chart-v2/schema";
import type { DisplayTimeMapping } from "@timing-chart-v2/projection";
import type { TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { presentationCycles } from "../presentation-cycles.js";

export function buildRuler(element: HTMLElement, geometry: LocalGeometryMap | undefined, document: CanonicalDocument, axisOwnerSignalId: SignalId | undefined, mapping: DisplayTimeMapping, forcedScale?: number, actualScreenScale?: number, axisMode: TimeAxisGeometry["mode"] = "reference-clock", minimumWidth = 0, viewportElement?: HTMLElement, referenceViewBoxWidth?: number): number {
  element.dataset.axisMode = axisMode;
  if (!geometry || !axisOwnerSignalId) {
    element.dataset.geometryError = "Time-axis geometry unavailable";
    element.parentElement?.setAttribute("data-geometry-error", "Time-axis geometry unavailable");
    element.replaceChildren();
    return 1;
  }
  delete element.dataset.geometryError;
  element.parentElement?.removeAttribute("data-geometry-error");
  const scale = actualScreenScale ?? forcedScale ?? 1;
  const rangeBand = element.ownerDocument.createElement("div");
  rangeBand.dataset.role = "range-selection-ruler-band";
  rangeBand.dataset.testid = "range-preview";
  rangeBand.setAttribute("aria-hidden", "true");
  rangeBand.hidden = true;
  const hierarchy = buildTimeGroupHierarchy(document.timeGroups);
  const outlineHeight = hierarchy.maxDepth === 0 && document.timeGroups.length === 0 ? 0 : (hierarchy.maxDepth + 1) * 20;
  const rulerFrame = element.parentElement;
  if (rulerFrame) {
    rulerFrame.style.height = `${34 + outlineHeight}px`;
    rulerFrame.style.marginBottom = `-${34 + outlineHeight}px`;
  }
  element.style.height = `${34 + outlineHeight}px`;
  const outlineRows: HTMLElement[] = [];
  for (let depth = 0; document.timeGroups.length > 0 && depth <= hierarchy.maxDepth; depth += 1) {
    const row = element.ownerDocument.createElement("div");
    row.className = "time-outline-row";
    row.dataset.depth = String(depth);
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", `Outline level ${depth + 1}`);
    // A level control is useful only when there is actual hierarchy to
    // select. In a flat/single-level outline, a lone boxed "1" is ambiguous
    // and adds no behavior beyond the group toggle itself.
    if (hierarchy.maxDepth > 0) {
      const levelButton = element.ownerDocument.createElement("button");
      levelButton.type = "button";
      levelButton.className = "time-outline-level";
      levelButton.dataset.level = String(depth + 1);
      levelButton.setAttribute("aria-label", `Show time-group outline level ${depth + 1}`);
      levelButton.textContent = String(depth + 1);
      levelButton.addEventListener("click", () => {
        for (const candidate of document.timeGroups) {
          const candidateDepth = hierarchy.depthById.get(candidate.id) ?? 0;
          const shouldCollapse = candidateDepth >= depth + 1;
          const isCollapsed = candidate.presentation?.collapsed === true;
          if (shouldCollapse === isCollapsed) continue;
          const command = element.ownerDocument.querySelector<HTMLButtonElement>(`[data-testid='time-group-${shouldCollapse ? "collapse" : "expand"}-${candidate.id}']`);
          command?.click();
        }
      });
      row.append(levelButton);
    }
    for (const group of document.timeGroups.filter((item) => hierarchy.depthById.get(item.id) === depth)) {
      // A collapsed group removes its interior source cycles from the
      // display mapping. Keep the Outline item visible by anchoring its
      // start to the preceding visible boundary when the exact start is
      // folded away, just as the Gap marker does below.
      const startDisplay = mapping.sourceToDisplay[group.start]
        ?? (group.start > 0 ? mapping.sourceToDisplay[group.start - 1] : undefined)
        ?? mapping.sourceToDisplay[group.end]
        ?? 0;
      const endDisplay = mapping.sourceToDisplay[group.end] ?? mapping.displayCycleCount;
      const startPoint = startDisplay === undefined ? undefined : geometry.find({ signalId: axisOwnerSignalId, cycle: startDisplay, point: "cycle-start" })?.point;
      const endPoint = geometry.find({ signalId: axisOwnerSignalId, cycle: endDisplay, point: "cycle-start" })?.point;
      if (!startPoint || !endPoint) continue;
      const item = element.ownerDocument.createElement("span");
      item.className = "time-outline-item";
      item.dataset.outlineTimeGroupId = group.id;
      item.style.left = `${startPoint.x * scale}px`;
      item.style.width = `${Math.max(18, (endPoint.x - startPoint.x) * scale)}px`;
      const toggle = element.ownerDocument.createElement("button");
      toggle.type = "button";
      toggle.className = "time-outline-toggle";
      toggle.setAttribute("aria-label", `${group.presentation?.collapsed ? "Expand" : "Collapse"} ${group.name}`);
      toggle.textContent = group.presentation?.collapsed ? "+" : "−";
      toggle.addEventListener("click", () => {
        const command = element.ownerDocument.querySelector<HTMLButtonElement>(`[data-testid='time-group-${group.presentation?.collapsed ? "expand" : "collapse"}-${group.id}']`);
        command?.click();
      });
      item.append(toggle, element.ownerDocument.createTextNode(group.name));
      row.append(item);
    }
    outlineRows.push(row);
  }
  const ticks: HTMLElement[] = [];
  // Fixed pixel-per-cycle by default: 1 local-geometry unit = 1px at 100%
  // zoom, independent of the visible pane's width. Any shrink-to-fit is an
  // explicit, on-demand action (Fit All / Fit Selection, which set zoom
  // directly -- see createTimelineNavigationController) rather than
  // something every render silently redoes. The current browser transform
  // remains the presentation-scale authority whenever it is available;
  // `forcedScale` is only a first-paint fallback.
  // Prefer the current browser transform whenever it is available. The
  // retained value is only a first-paint fallback; keeping it over a valid
  // SVG matrix lets ruler/grid pitch drift after layout or zoom changes.
  let finalX = 0;
  const cycleZeroPoint = geometry.find({ signalId: axisOwnerSignalId, cycle: 0, point: "cycle-start" })?.point;
  const cycleOnePoint = mapping.displayCycleCount > 0 ? geometry.find({ signalId: axisOwnerSignalId, cycle: 1, point: "cycle-start" })?.point : undefined;
  const pixelsPerCycle = cycleZeroPoint && cycleOnePoint ? (cycleOnePoint.x - cycleZeroPoint.x) * scale : Infinity;
  const semanticDisplayCycleCount = geometry.cycleBoundaryEntries?.().at(-1)?.cycle ?? mapping.displayCycleCount;
  const rulerTickBudget = document.timeline.cycleCount > 4096 ? 512 : Infinity;
  for (const display of presentationCycles(semanticDisplayCycleCount, pixelsPerCycle, rulerTickBudget)) {
    const sourceCycle = display === mapping.displayCycleCount ? document.timeline.cycleCount : (mapping.displayToSource[display] ?? display);
    const point = geometry.find({ signalId: axisOwnerSignalId, cycle: sourceCycle, point: "cycle-start" })?.point;
    if (!point) continue;
    const tick = element.ownerDocument.createElement("span");
    tick.dataset.cycle = String(mapping.labelFor(display));
    tick.dataset.displayCycle = String(display);
    tick.dataset.sourceCycle = String(sourceCycle);
    tick.className = "cycle-tick";
    tick.style.left = `${point.x * scale}px`;
    tick.style.top = `${outlineHeight}px`;
    tick.textContent = String(mapping.labelFor(display));
    ticks.push(tick);
    finalX = point.x;
  }
  const overlays: HTMLElement[] = [];
  for (const bookmark of document.bookmarks) {
    const displayCycle = mapping.sourceToDisplay[bookmark.start];
    const containingFold = displayCycle === undefined ? document.timeGroups.find((group) => group.presentation?.collapsed && bookmark.start >= group.start && bookmark.start < group.end) : undefined;
    const anchorCycle = containingFold === undefined ? displayCycle : (containingFold.end < document.timeline.cycleCount ? containingFold.end : Math.max(0, containingFold.start - 1));
    const anchorDisplay = anchorCycle === undefined ? undefined : mapping.sourceToDisplay[anchorCycle];
    if (anchorCycle === undefined || anchorDisplay === undefined) continue;
    const point = geometry.find({ signalId: axisOwnerSignalId, cycle: anchorCycle, point: "cycle-start" })?.point;
    if (!point) continue;
    const marker = element.ownerDocument.createElement("span");
    marker.className = containingFold === undefined ? "timeline-marker" : "timeline-marker timeline-marker-hidden";
    marker.dataset.bookmarkId = bookmark.id;
    marker.dataset.sourceCycle = String(bookmark.start);
    if (containingFold !== undefined) marker.dataset.insideCollapsed = containingFold.name;
    marker.style.left = `${point.x * scale}px`;
    marker.style.top = `${outlineHeight + 19}px`;
    marker.textContent = containingFold === undefined ? `◆ ${bookmark.name}` : `◆ ${bookmark.name} (inside ${containingFold.name})`;
    marker.title = containingFold === undefined ? `${bookmark.name}: cycle ${bookmark.start}` : `${bookmark.name}: cycle ${bookmark.start} inside collapsed ${containingFold.name}`;
    overlays.push(marker);
  }
  for (const group of document.timeGroups.filter((item) => item.presentation?.collapsed)) {
    const anchorCycle = group.end < document.timeline.cycleCount ? group.end : (group.start > 0 ? group.start - 1 : undefined);
    const anchorDisplay = anchorCycle === undefined ? undefined : mapping.sourceToDisplay[anchorCycle];
    if (anchorCycle === undefined || anchorDisplay === undefined) continue;
    const point = geometry.find({ signalId: axisOwnerSignalId, cycle: anchorCycle, point: "cycle-start" })?.point;
    if (!point) continue;
    const gap = element.ownerDocument.createElement("span");
    gap.className = "timeline-gap";
    gap.dataset.timeGroupId = group.id;
    gap.style.left = `${point.x * scale}px`;
    gap.style.top = `${outlineHeight + 2}px`;
    gap.textContent = group.presentation?.foldLabel ?? group.name;
    overlays.push(gap);
  }
  element.replaceChildren(...outlineRows, rangeBand, ...ticks, ...overlays);
  element.dataset.source = "local-geometry";
  element.parentElement?.setAttribute("data-source", "local-geometry");
  // A short document must still fill the available timing column. The ruler
  // geometry is the content-width authority for long timelines, but allowing
  // a short intrinsic width to replace the viewport's minimum makes the
  // waveform column collapse after the initial mount (notably in the
  // visual-reference route). Keep both contracts: never shrink below the
  // available column, and never clip a genuinely wider timeline.
  // The rendered SVG's viewBox is the actual horizontal presentation extent.
  // Using `finalX + padding` here would make the CSS viewport wider than that
  // viewBox and introduce a different screen scale for the waveform than for
  // the LocalGeometry consumers. Keep the old extent only when no reference
  // SVG measurement is available (for the initial geometry-error fallback).
  const geometryWidth = Number.isFinite(referenceViewBoxWidth) && (referenceViewBoxWidth ?? 0) > 0
    ? referenceViewBoxWidth!
    : finalX + 24;
  const targetWidth = Math.max(Math.ceil(geometryWidth * scale), Math.ceil(minimumWidth));
  element.style.width = `${targetWidth}px`;
  // #366: `element` (the ruler content div) is not guaranteed to already be
  // attached under `[data-testid='cycle-viewport']` at every call time (its
  // ref can resolve before React has finished committing the surrounding
  // tree, notably on the very first paint of the `?visual-reference` route)
  // -- `.closest()` silently returning nothing there fell back to
  // `element.parentElement` (`.cycle-ruler`, not `.cycle-viewport`), which is
  // NOT an ancestor of the separate `[data-role="wave-owner"]` DOM subtree
  // that also reads `var(--wave-width)`. That left the wave-owner's width
  // permanently on `.editor-shell`'s static CSS fallback (`calc(100vw - ...)`,
  // which is only an approximation and never removes the container's own
  // vertical-scrollbar allowance) even though the ruler's own inline
  // `element.style.width` above was already correct. Callers that already
  // hold the real viewport element (see `rebuildRulerPresentation`) now pass
  // it explicitly instead of relying on DOM-tree lookup at an uncertain
  // moment; `.closest()` remains only as a defensive fallback for any other
  // caller.
  const widthOwner = viewportElement ?? element.closest<HTMLElement>("[data-testid='cycle-viewport']") ?? element.parentElement;
  widthOwner?.style.setProperty("--wave-width", `${targetWidth}px`);
  // Renderer host sizing may have left a viewport-width inline value behind
  // before this ruler pass established the authoritative shared wave width.
  // Clear that stale override so the host and its timing surface consume the
  // same width owner as the ruler; the SVG itself remains window-bounded.
  const surfaceHost = widthOwner?.querySelector<HTMLElement>("[data-testid='cycle-surface']");
  if (surfaceHost) {
    surfaceHost.style.removeProperty("width");
    surfaceHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.style.removeProperty("width");
  }
  return scale;
}
