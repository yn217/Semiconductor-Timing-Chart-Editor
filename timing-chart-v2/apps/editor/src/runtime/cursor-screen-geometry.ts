import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { TimelineViewportRuntime } from "./timeline-viewport-runtime.js";
import { timelineScrollOwner } from "./timeline-scroll-owner.js";

/** Project a semantic source boundary into the cursor overlay's viewport coordinates. */
export function cursorViewportXForSourceCycle(
  runtime: Pick<TimelineViewportRuntime, "sourceBoundaryToLocalX"> | null | undefined,
  document: CanonicalDocument,
  cycle: number,
  viewport: HTMLElement,
  rulerContent: HTMLElement,
  zoom: number,
): number | undefined {
  if (!runtime || !Number.isFinite(zoom) || zoom <= 0) return undefined;
  const contentX = runtime.sourceBoundaryToLocalX(document, cycle);
  if (contentX === undefined) return undefined;
  const rulerRect = rulerContent.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const x = rulerRect.left - viewportRect.left + contentX * zoom;
  return Number.isFinite(x) ? x : undefined;
}

/** Resolve a pointer against the shared timeline geometry in content coordinates. */
export function cursorSourceCycleAtClientX(
  runtime: Pick<TimelineViewportRuntime, "screenXToSourceCycle"> | null | undefined,
  clientX: number,
  viewport: HTMLElement,
  rulerContent?: HTMLElement | null,
): number | undefined {
  if (!runtime) return undefined;
  // Exact inverse of cursorViewportXForSourceCycle: the transformed ruler content is the screen-origin frame (it already carries
  // scroll and Combined's time-domain inset), so pointer input and cursor projection share one origin.
  if (rulerContent) return runtime.screenXToSourceCycle(clientX - rulerContent.getBoundingClientRect().left);
  const scroller = timelineScrollOwner(viewport);
  const rect = scroller.getBoundingClientRect();
  return runtime.screenXToSourceCycle(clientX - rect.left + scroller.scrollLeft);
}
