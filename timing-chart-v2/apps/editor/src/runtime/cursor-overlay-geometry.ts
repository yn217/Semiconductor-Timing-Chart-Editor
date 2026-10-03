import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { timelineScrollOwner } from "./timeline-scroll-owner.js";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";

type CursorGeometryRuntime = Pick<TimelineViewportRuntime, "screenXToSourceCycle" | "sourceBoundaryToLocalX">;

/** Place a source-cycle cursor in its viewport using the shared timeline geometry. */
export function cursorOverlayLeftInViewport(input: Readonly<{
  contentX: number;
  zoom: number;
  scrollLeft: number;
  scrollOwnerLeft: number;
  viewportLeft: number;
}>): number | undefined {
  const { contentX, zoom, scrollLeft, scrollOwnerLeft, viewportLeft } = input;
  if (![contentX, zoom, scrollLeft, scrollOwnerLeft, viewportLeft].every(Number.isFinite) || zoom <= 0) return undefined;
  const left = scrollOwnerLeft - viewportLeft + contentX * zoom - scrollLeft;
  return Number.isFinite(left) ? left : undefined;
}

export function resolveCursorCycleAtClientX(runtime: CursorGeometryRuntime | null | undefined, clientX: number, viewport: HTMLDivElement): number | undefined {
  if (!runtime) return undefined;
  const owner = timelineScrollOwner(viewport);
  return runtime.screenXToSourceCycle(clientX - owner.getBoundingClientRect().left + owner.scrollLeft);
}

export function resolveCursorOverlayLeftAtCycle(runtime: CursorGeometryRuntime | null | undefined, document: CanonicalDocument, zoom: number, cycle: number, viewport: HTMLDivElement): number | undefined {
  if (!runtime) return undefined;
  const contentX = runtime.sourceBoundaryToLocalX(document, cycle);
  if (contentX === undefined) return undefined;
  const owner = timelineScrollOwner(viewport);
  return cursorOverlayLeftInViewport({
    contentX,
    zoom,
    scrollLeft: owner.scrollLeft,
    scrollOwnerLeft: owner.getBoundingClientRect().left,
    viewportLeft: viewport.getBoundingClientRect().left,
  });
}
