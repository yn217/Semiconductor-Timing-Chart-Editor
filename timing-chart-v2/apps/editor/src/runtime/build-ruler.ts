import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import { waveDomainPaddingPx, waveOwnerPlacement } from "./wave-owner-placement.js";
import { cachedTimeGroupHierarchy, type CanonicalDocument, type SignalId } from "@timing-chart-v2/schema";
import { timeGroupOutlineHeight, type DisplayTimeMapping } from "@timing-chart-v2/projection";
import type { TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { presentationCycles } from "../presentation-cycles.js";
import { displayBoundaryForGeometryKey, displayWindowForSource, sourceBoundaryGeometryPoint } from "./display-boundary.js";

export function buildRuler(element: HTMLElement, geometry: LocalGeometryMap | undefined, document: CanonicalDocument, axisOwnerSignalId: SignalId | undefined, mapping: DisplayTimeMapping, forcedScale?: number, actualScreenScale?: number, axisMode: TimeAxisGeometry["mode"] = "reference-clock", minimumWidth = 0, viewportElement?: HTMLElement, referenceViewBoxWidth?: number, tcScale = 1): Readonly<{ scale: number; targetWidth: number; waveOriginPx: number }> {
  element.dataset.axisMode = axisMode;
  if (!geometry || !axisOwnerSignalId) {
    element.dataset.geometryError = "Time-axis geometry unavailable";
    element.parentElement?.setAttribute("data-geometry-error", "Time-axis geometry unavailable");
    element.replaceChildren();
    return { scale: 1, targetWidth: 0, waveOriginPx: 0 };
  }
  delete element.dataset.geometryError;
  element.parentElement?.removeAttribute("data-geometry-error");
  const scale = actualScreenScale ?? forcedScale ?? 1;
  const rangeBand = element.ownerDocument.createElement("div");
  rangeBand.dataset.role = "range-selection-ruler-band";
  rangeBand.dataset.testid = "range-preview";
  rangeBand.setAttribute("aria-hidden", "true");
  rangeBand.hidden = true;
  const hierarchy = cachedTimeGroupHierarchy(document.timeGroups);
  const outlineHeight = timeGroupOutlineHeight(document);
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
    for (const group of hierarchy.groupsByDepth[depth] ?? []) {
      // A collapsed group removes its interior source cycles from the
      // display mapping. Keep the Outline item visible by anchoring its
      // start to the preceding visible boundary when the exact start is
      // folded away, just as the Gap marker does below.
      const startDisplay = mapping.sourceToDisplay(group.start)
        ?? (group.start > 0 ? mapping.sourceToDisplay(group.start - 1) : undefined)
        ?? mapping.sourceToDisplay(group.end)
        ?? 0;
      const endDisplay = mapping.sourceToDisplay(group.end) ?? mapping.displayCycleCount;
      // Local geometry is keyed by SOURCE cycle; a collapsed group leaves holes in that keying, so resolve the display
      // boundaries back to source cycles exactly as the tick loop below does.
      const sourceOfDisplay = (display: number) => display === mapping.displayCycleCount ? document.timeline.cycleCount : (mapping.displayToSource(display) ?? display);
      const startPoint = startDisplay === undefined ? undefined : sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, sourceOfDisplay(startDisplay), startDisplay);
      const endPoint = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, sourceOfDisplay(endDisplay), endDisplay);
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
  const cycleZeroSource = mapping.displayToSource(0) ?? 0;
  const cycleOneSource = mapping.displayCycleCount > 0 ? mapping.displayToSource(1) : undefined;
  const cycleZeroPoint = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, cycleZeroSource, 0);
  const cycleOnePoint = cycleOneSource === undefined ? undefined : sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, cycleOneSource, 1);
  const pixelsPerCycle = cycleZeroPoint && cycleOnePoint ? (cycleOnePoint.x - cycleZeroPoint.x) * scale : Infinity;
  // `geometry.cycleBoundaryEntries()` only covers whatever cycle range the
  // axis-owner signal's bounded/windowed geometry (#587) currently has
  // mounted -- once scrolled away from the document start (or before a
  // wider window has been requested), its last entry silently truncates far
  // short of the true document length, generating ticks (and therefore
  // ruler/grid alignment) for only a fraction of the actual document width
  // computed below. `mapping.displayCycleCount` is the same window-independent,
  // always-global count already used for `windowIndependentWidth` -- use it
  // here too so tick generation always covers the ruler's full rendered width.
  const semanticDisplayCycleCount = mapping.displayCycleCount;
  const rulerTickBudget = document.timeline.cycleCount > 4096 ? 512 : Infinity;
  // #614/#620: `geometry.find()` below only resolves points inside whatever
  // cycle range the axis-owner signal's bounded/windowed geometry (#587)
  // currently has mounted -- and that window is never widened by a pure
  // horizontal scroll (only the *wave-owner* windows re-request on scroll,
  // see viewport-projection.ts; the ruler is rebuilt only for `reason ===
  // "ruler"/"resize"`, never `"scroll"`). Once scrolled away from the
  // mounted window, every tick outside it would silently be dropped instead
  // of drawn, desyncing the ruler from the waveform edges it must line up
  // with. Derive the per-cycle pitch from whatever two boundary entries the
  // *currently mounted* geometry actually has (wherever that window is), and
  // use it to extrapolate every other tick's position analytically instead
  // of requiring `geometry.find()` to succeed for each one -- this is the
  // same window-independent approach `windowIndependentWidth` below already
  // relies on for the ruler's total width.
  const boundaryEntries = geometry.cycleBoundaryEntries?.() ?? [];
  // Anchor on the lowest- and highest-display boundary entries actually
  // present (not iteration order, which isn't guaranteed sorted) so the
  // derived pitch uses the full span of whatever window is mounted --
  // more numerically stable than an arbitrary adjacent pair, and immune to
  // out-of-order entries.
  let firstFoundPoint: { readonly x: number } | undefined;
  let firstFoundDisplay: number | undefined;
  let secondFoundPoint: { readonly x: number } | undefined;
  let secondFoundDisplay: number | undefined;
  for (const entry of boundaryEntries) {
    const display = displayBoundaryForGeometryKey(entry.cycle, geometry, mapping);
    if (display === undefined) continue;
    if (firstFoundDisplay === undefined || display < firstFoundDisplay) { firstFoundPoint = entry.position; firstFoundDisplay = display; }
    if (secondFoundDisplay === undefined || display > secondFoundDisplay) { secondFoundPoint = entry.position; secondFoundDisplay = display; }
  }
  const windowLocalPixelsPerCycle = firstFoundPoint && secondFoundPoint && firstFoundDisplay !== undefined && secondFoundDisplay !== undefined && secondFoundDisplay !== firstFoundDisplay
    ? (secondFoundPoint.x - firstFoundPoint.x) / (secondFoundDisplay - firstFoundDisplay)
    : undefined;
  // Screen-space X of display-cycle 0 (the ruler/tick coordinate system's
  // origin, including whatever fixed left margin WaveDrom's own rendering
  // bakes into its raw geometry -- ticks below use this same `point.x *
  // scale` convention). A windowed wave-owner's horizontal position must be
  // computed in this same coordinate system (see the owner-reapply loop and
  // waveform-surface-provider.ts), not a naive `display * pxPerDisplayCycle`
  // with an implicit zero intercept, or every owner ends up offset from the
  // ruler by this same fixed margin.
  const waveOriginPx = firstFoundPoint && firstFoundDisplay !== undefined && windowLocalPixelsPerCycle !== undefined
    ? (firstFoundPoint.x - firstFoundDisplay * windowLocalPixelsPerCycle) * scale
    : 0;
  for (const display of presentationCycles(semanticDisplayCycleCount, pixelsPerCycle, rulerTickBudget, tcScale > 1 ? tcScale : 1)) {
    const sourceCycle = display === mapping.displayCycleCount ? document.timeline.cycleCount : (mapping.displayToSource(display) ?? display);
    const resolvedPoint = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, sourceCycle, display);
    const point = resolvedPoint ?? (firstFoundPoint && firstFoundDisplay !== undefined && windowLocalPixelsPerCycle !== undefined
      ? { x: firstFoundPoint.x + (display - firstFoundDisplay) * windowLocalPixelsPerCycle }
      : undefined);
    if (!point) continue;
    const tick = element.ownerDocument.createElement("span");
    tick.dataset.cycle = String(mapping.labelFor(display));
    tick.dataset.displayCycle = String(display);
    tick.dataset.sourceCycle = String(sourceCycle);
    tick.dataset.geometrySourceCycle = String(sourceCycle);
    tick.className = "cycle-tick";
    tick.style.left = `${point.x * scale}px`;
    tick.style.top = `${outlineHeight}px`;
    // #750: in Transaction presentation the Transaction Cycle (TC) is the ruler unit -- label only the ticks that sit
    // on a TC boundary with sourceCycle / cyclesPerTC (canonical time stays in system cycles; every tick element and its
    // data-source-cycle stay, so hit-testing and geometry are unchanged).
    if (tcScale > 1) {
      tick.dataset.tcScale = String(tcScale);
      tick.textContent = sourceCycle % tcScale === 0 ? String(sourceCycle / tcScale) : "";
    } else {
      tick.textContent = String(mapping.labelFor(display));
    }
    ticks.push(tick);
    finalX = point.x;
  }
  const overlays: HTMLElement[] = [];
  for (const bookmark of document.bookmarks) {
    const displayCycle = mapping.sourceToDisplay(bookmark.start);
    const containingFold = displayCycle === undefined ? mapping.collapsedGroupAtSource(bookmark.start) : undefined;
    const anchorCycle = containingFold === undefined ? displayCycle : (containingFold.end < document.timeline.cycleCount ? containingFold.end : Math.max(0, containingFold.start - 1));
    const anchorDisplay = anchorCycle === undefined ? undefined : mapping.sourceToDisplay(anchorCycle);
    if (anchorCycle === undefined || anchorDisplay === undefined) continue;
    const point = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, anchorCycle, anchorDisplay);
    if (!point) continue;
    const marker = element.ownerDocument.createElement("span");
    marker.className = containingFold === undefined ? "timeline-marker" : "timeline-marker timeline-marker-hidden";
    marker.dataset.bookmarkId = bookmark.id;
    marker.dataset.sourceCycle = String(bookmark.start);
    marker.dataset.geometrySourceCycle = String(anchorCycle);
    if (containingFold !== undefined) marker.dataset.insideCollapsed = containingFold.name;
    marker.style.left = `${point.x * scale}px`;
    marker.style.top = `${outlineHeight + 19}px`;
    // #750: under cyclesPerTC compression neighbouring markers sit a few pixels apart; show the diamond only (name stays in title / aria-label)
    // so labels cannot cover each other.
    marker.textContent = containingFold === undefined ? (tcScale > 1 ? "◆" : `◆ ${bookmark.name}`) : `◆ ${bookmark.name} (inside ${containingFold.name})`;
    marker.setAttribute("aria-label", bookmark.name);
    marker.title = containingFold === undefined ? `${bookmark.name}: cycle ${bookmark.start}` : `${bookmark.name}: cycle ${bookmark.start} inside collapsed ${containingFold.name}`;
    overlays.push(marker);
  }
  for (const group of document.timeGroups.filter((item) => item.presentation?.collapsed)) {
    const anchorCycle = group.end < document.timeline.cycleCount ? group.end : (group.start > 0 ? group.start - 1 : undefined);
    const anchorDisplay = anchorCycle === undefined ? undefined : mapping.sourceToDisplay(anchorCycle);
    if (anchorCycle === undefined || anchorDisplay === undefined) continue;
    const point = sourceBoundaryGeometryPoint(geometry, axisOwnerSignalId, anchorCycle, anchorDisplay);
    if (!point) continue;
    const gap = element.ownerDocument.createElement("span");
    gap.className = "timeline-gap";
    gap.dataset.timeGroupId = group.id;
    gap.dataset.geometrySourceCycle = String(anchorCycle);
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
  //
  // #614: `referenceViewBoxWidth` is only trustworthy when the reference
  // signal's own SVG genuinely covers the whole document. Bounded/windowed
  // rendering (#587) means it usually covers only whatever cycle range is
  // currently mounted (viewport + a small overscan) -- once scrolled away
  // from the start, this silently shrinks to a fraction of the true
  // document width. `windowLocalPixelsPerCycle` above is derived from two
  // ticks guaranteed to be inside the *current* window wherever it is, so
  // multiplying by the document's total display-cycle count (a
  // window-independent, always-global count) gives the true full-document
  // width regardless of scroll position. Prefer it; fall back to the old
  // (window-fragile) sources only when it can't be derived at all (e.g. a
  // 0-1 cycle document).
  const windowIndependentWidth = windowLocalPixelsPerCycle !== undefined && Number.isFinite(windowLocalPixelsPerCycle) && windowLocalPixelsPerCycle > 0
    ? windowLocalPixelsPerCycle * mapping.displayCycleCount
    : undefined;
  const geometryWidth = windowIndependentWidth ?? (Number.isFinite(referenceViewBoxWidth) && (referenceViewBoxWidth ?? 0) > 0
    ? referenceViewBoxWidth!
    : finalX + 24);
  const targetWidth = Math.max(Math.ceil(geometryWidth * scale), Math.ceil(minimumWidth));
  // The time-domain box is the whole rendered SVG: the cycle span plus WaveDrom's left/right margins (the ticks start one
  // left margin in), so the terminal boundary and the last cycle cell stay inside the ruler/overlay/interactive layers.
  const timeDomainWidth = targetWidth + waveDomainPaddingPx(scale);
  element.style.width = `${timeDomainWidth}px`;
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
  widthOwner?.style.setProperty("--wave-width", `${timeDomainWidth}px`);
  // Renderer host sizing may have left a viewport-width inline value behind
  // before this ruler pass established the authoritative shared wave width.
  // Clear that stale override so the host and its timing surface consume the
  // same width owner as the ruler; the SVG itself remains window-bounded.
  const surfaceHost = widthOwner?.querySelector<HTMLElement>("[data-testid='cycle-surface']");
  if (surfaceHost) {
    surfaceHost.style.removeProperty("width");
    surfaceHost.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.style.removeProperty("width");
  }
  // #614: every wave-owner is stretched to the same shared `--wave-width`
  // (waveform.css), which is only correct for an owner whose SVG covers the
  // whole document. A *windowed* (bounded, #587) owner's own viewBox only
  // covers a fraction of the document, so stretching it to the full
  // `--wave-width` inflates it far past its real size -- give each windowed
  // owner its own inline width instead, proportional to how much of the
  // document its window actually covers. This must be reapplied here (the
  // ruler's one authoritative, synchronous recompute point) rather than
  // read back out of `--wave-width` by whoever renders a given window: that
  // CSS custom property is not guaranteed to have already settled to this
  // pass's value at every moment a wave batch happens to run, so reading it
  // back can permanently bake in a stale ratio for owners whose own window
  // does not happen to change again afterward.
  const pxPerDisplayCycle = mapping.displayCycleCount > 0 ? targetWidth / mapping.displayCycleCount : undefined;
  if (widthOwner && pxPerDisplayCycle !== undefined) {
    for (const owner of widthOwner.querySelectorAll<HTMLElement>("[data-wave-owner]")) {
      if (owner.tagName !== "DIV") continue;
      const sourceStart = Number(owner.dataset.renderedSourceWindowStart);
      const sourceEnd = Number(owner.dataset.renderedSourceWindowEnd);
      const displayWindow = Number.isInteger(sourceStart) && Number.isInteger(sourceEnd) && sourceEnd > sourceStart
        ? displayWindowForSource(mapping, { sourceStart, sourceEnd }, document.timeline.cycleCount)
        : undefined;
      if (displayWindow) {
        const placement = waveOwnerPlacement({ displayStart: displayWindow.displayStart, displayEnd: displayWindow.displayEnd, pxPerDisplayCycle, waveOriginPx, presentationScale: scale, viewBoxWidth: owner.querySelector<SVGSVGElement>(":scope > svg")?.viewBox.baseVal.width });
        owner.style.width = `${placement.width}px`;
        // See the matching comment in waveform-surface-provider.ts: a
        // windowed owner's horizontal position must reflect where its own
        // window starts within the whole document -- `place()` only ever
        // sets vertical position, so this is the only place it gets set.
        // `waveOriginPx` carries the ruler's own coordinate-system origin so
        // this lines up with tick positions exactly, not just proportionally.
        owner.style.left = `${placement.left}px`;
      } else {
        owner.style.removeProperty("width");
        owner.style.removeProperty("left");
      }
    }
  }
  return { scale, targetWidth, waveOriginPx };
}
