export type LegendPoint = { readonly x: number; readonly y: number };

export type LegendViewportGeometry = {
  readonly left: number;
  readonly top: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
};

export type LegendSurfaceGeometry = LegendViewportGeometry & {
  /** CSS offsets from the positioned `.split-signal-content` document surface. */
  readonly contentLeft: number;
  readonly contentTop: number;
};

/**
 * Legend.position is document-overlay space: (0, 0) is the document page's
 * leading edge after the fixed left rail and the top of the Cycle ruler. It is
 * independent of browser/window coordinates and is translated to each view's
 * positioned content surface here. SVG export uses the same document-page
 * origin (the label/document region, before the waveform plot).
 */
export function readLegendSurfaceGeometry(
  content: HTMLElement,
): LegendSurfaceGeometry | undefined {
  const viewport = content.closest<HTMLElement>(".cycle-viewport");
  const ruler = content.querySelector<HTMLElement>(".cycle-ruler");
  if (!viewport || !ruler) return undefined;

  const viewportRect = viewport.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  const rulerRect = ruler.getBoundingClientRect();
  const leftRail = content.ownerDocument.querySelector<HTMLElement>(".left-workspace-rail");
  const leftRailRect = leftRail?.getBoundingClientRect();
  const documentLeft = Math.max(viewportRect.left, leftRailRect?.right ?? viewportRect.left);

  let scrollTop = 0;
  for (let element: HTMLElement | null = content; element; element = element.parentElement) {
    scrollTop += element.scrollTop;
    if (element === viewport) break;
  }

  const cyclePanel = viewport.closest<HTMLElement>(".cycle-panel");
  const bottomCover = Number.parseFloat(
    cyclePanel ? ownerWindowComputedStyle(viewport).getPropertyValue("--cycle-bottom-cover") : "",
  );
  const timelineScrollbar = cyclePanel?.querySelector<HTMLElement>(":scope > .timeline-hscroll");
  const scrollbarRect = timelineScrollbar?.getBoundingClientRect();
  const scrollbarTop = timelineScrollbar && !timelineScrollbar.hidden && scrollbarRect && scrollbarRect.height > 0
    ? scrollbarRect.top
    : Number.POSITIVE_INFINITY;
  return {
    left: documentLeft,
    // The `.split-signal-content` is the Cycle pane's own scrollport in
    // Combined mode, but only a content surface in Cycle mode. Use its
    // current rect as the client-space origin and add every vertical scroll
    // offset below; the sticky ruler's screen position is only the visible
    // clip edge, never the document-coordinate origin.
    top: contentRect.top,
    scrollLeft: viewport.scrollLeft,
    scrollTop,
    clientWidth: Math.max(0, viewportRect.right - documentLeft),
    clientHeight: legendVisibleClientHeight(
      rulerRect.top,
      viewportRect.bottom,
      contentRect.bottom,
      Number.isFinite(bottomCover) ? bottomCover : 0,
      scrollbarTop,
    ),
    contentLeft: documentLeft - viewportRect.left,
    // The ruler and overlay content share the viewport's source origin. The
    // ruler is sticky; using its current screen rect as a CSS offset would
    // bake scroll back into the content and move the overlay into Bottom.
    contentTop: 0,
  };
}

function ownerWindowComputedStyle(element: HTMLElement): CSSStyleDeclaration {
  return element.ownerDocument.defaultView!.getComputedStyle(element);
}

export function legendLocalPointFromClient(
  client: { readonly x: number; readonly y: number },
  viewport: Pick<LegendViewportGeometry, "left" | "top" | "scrollLeft" | "scrollTop">,
): LegendPoint {
  return {
    x: client.x - viewport.left + viewport.scrollLeft,
    y: client.y - viewport.top + viewport.scrollTop,
  };
}

export function legendVisibleClientHeight(
  visibleTop: number,
  viewportBottom: number,
  contentBottom: number,
  bottomCover: number,
  scrollbarTop = Number.POSITIVE_INFINITY,
): number {
  const visibleBottom = Math.min(
    viewportBottom - Math.max(0, bottomCover),
    contentBottom,
    scrollbarTop,
  );
  return Math.max(0, visibleBottom - visibleTop);
}

export function clampLegendToVisibleViewport(
  point: LegendPoint,
  size: { readonly width: number; readonly height: number },
  viewport: LegendViewportGeometry,
): LegendPoint {
  const minX = Math.max(0, viewport.scrollLeft);
  const minY = Math.max(0, viewport.scrollTop);
  const maxX = Math.max(minX, viewport.scrollLeft + viewport.clientWidth - size.width);
  const maxY = Math.max(minY, viewport.scrollTop + viewport.clientHeight - size.height);
  return {
    x: Math.min(maxX, Math.max(minX, point.x)),
    y: Math.min(maxY, Math.max(minY, point.y)),
  };
}
