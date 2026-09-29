export type LegendPoint = { readonly x: number; readonly y: number };

export type LegendSurfaceGeometry = {
  readonly left: number;
  readonly top: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly contentLeft: number;
  readonly contentTop: number;
};

export function legendContainingBlockOffset(
  surfaceOrigin: LegendPoint,
  containingBlockOrigin: LegendPoint,
  scroll: LegendPoint,
): LegendPoint {
  return {
    x: surfaceOrigin.x - containingBlockOrigin.x - scroll.x,
    y: surfaceOrigin.y - containingBlockOrigin.y - scroll.y,
  };
}

/**
 * Canonical Legend coordinates use document-overlay space: X starts after the
 * fixed left rail and Y starts at the visible ruler. `contentLeft`/`contentTop`
 * project that stable origin into the Legend's actual containing block, which
 * may itself move as the viewport scrolls. SVG export uses the same canonical
 * coordinates and has no editor chrome.
 */
export function readLegendSurfaceGeometry(content: HTMLElement): LegendSurfaceGeometry | undefined {
  const viewport = content.closest<HTMLElement>(".cycle-viewport");
  const ruler = content.querySelector<HTMLElement>(".cycle-ruler");
  if (!viewport || !ruler) return undefined;

  const viewportRect = viewport.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const rulerRect = ruler.getBoundingClientRect();
  const rail = content.ownerDocument.querySelector<HTMLElement>(".left-workspace-rail");
  const documentLeft = Math.max(viewportRect.left, rail?.getBoundingClientRect().right ?? viewportRect.left);
  let scrollLeft = 0;
  let scrollTop = 0;
  for (let element: HTMLElement | null = content; element; element = element.parentElement) {
    scrollLeft += element.scrollLeft;
    scrollTop += element.scrollTop;
    if (element === viewport) break;
  }

  const cyclePanel = viewport.closest<HTMLElement>(".cycle-panel");
  const scrollbar = cyclePanel?.querySelector<HTMLElement>(":scope > .timeline-hscroll");
  const scrollbarRect = scrollbar?.getBoundingClientRect();
  const scrollbarTop = scrollbar && !scrollbar.hidden && scrollbarRect && scrollbarRect.height > 0
    ? scrollbarRect.top
    : Number.POSITIVE_INFINITY;
  const bottomTrack = content.ownerDocument.querySelector<HTMLElement>(".bottom-resize-track");
  const bottomTrackRect = bottomTrack?.getBoundingClientRect();
  const bottomTrackTop = bottomTrack && bottomTrackRect && bottomTrackRect.width > 0 && bottomTrackRect.height > 0
    ? bottomTrackRect.top
    : Number.POSITIVE_INFINITY;
  const visibleBottom = Math.min(viewportRect.bottom, contentRect.bottom, scrollbarTop, bottomTrackTop);
  const containingBlockOffset = legendContainingBlockOffset(
    { x: documentLeft, y: rulerRect.top },
    { x: contentRect.left, y: contentRect.top },
    { x: scrollLeft, y: scrollTop },
  );
  return {
    left: documentLeft,
    // Pointer Y is measured from the ruler's visible/document origin, then
    // scrollTop is added exactly once to recover document-overlay coordinates.
    // content.getBoundingClientRect() already moves with vertical scroll and
    // must not be used here (that would apply the scroll offset twice).
    top: rulerRect.top,
    scrollLeft,
    scrollTop,
    clientWidth: Math.max(0, viewportRect.right - documentLeft),
    clientHeight: Math.max(0, visibleBottom - rulerRect.top),
    // The Legend is absolutely positioned inside `content`, not the viewport.
    // Translate its stable screen origin into that containing block and remove
    // the scroll compensation already included in canonical overlay coords.
    contentLeft: containingBlockOffset.x,
    contentTop: containingBlockOffset.y,
  };
}

export function legendLocalPointFromClient(
  client: LegendPoint,
  surface: Pick<LegendSurfaceGeometry, "left" | "top" | "scrollLeft" | "scrollTop">,
): LegendPoint {
  return {
    x: client.x - surface.left + surface.scrollLeft,
    y: client.y - surface.top + surface.scrollTop,
  };
}

export function clampLegendToVisibleSurface(
  point: LegendPoint,
  size: { readonly width: number; readonly height: number },
  surface: Pick<LegendSurfaceGeometry, "scrollLeft" | "scrollTop" | "clientWidth" | "clientHeight">,
): LegendPoint {
  const minX = surface.scrollLeft;
  const minY = surface.scrollTop;
  const maxX = Math.max(minX, minX + surface.clientWidth - size.width);
  const maxY = Math.max(minY, minY + surface.clientHeight - size.height);
  return {
    x: Math.min(maxX, Math.max(minX, point.x)),
    y: Math.min(maxY, Math.max(minY, point.y)),
  };
}

/** Measures the actual rendered Legend CSS without changing document state. */
export function measureLegendSize(
  content: HTMLElement,
  orientation: "horizontal" | "vertical",
  entries: readonly { readonly label: string }[],
): { readonly width: number; readonly height: number } {
  const probe = content.ownerDocument.createElement("aside");
  probe.className = `editor-legend ${orientation}`;
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;left:-100000px;top:-100000px";
  const title = content.ownerDocument.createElement("strong");
  title.textContent = "Legend";
  probe.append(title);
  for (const entry of entries) {
    const row = content.ownerDocument.createElement("span");
    const swatch = content.ownerDocument.createElement("i");
    row.append(swatch, content.ownerDocument.createTextNode(entry.label));
    probe.append(row);
  }
  content.append(probe);
  const bounds = probe.getBoundingClientRect();
  probe.remove();
  return { width: bounds.width, height: bounds.height };
}
