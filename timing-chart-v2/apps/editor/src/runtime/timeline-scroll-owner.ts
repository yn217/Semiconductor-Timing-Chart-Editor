/**
 * #625: the horizontal scroll owner of the time domain. In Cycle Mode it is the TimelineViewport wrapper inside the surface
 * host (fixed columns sit outside it, its local X starts at 0); in Transaction/Combined it is the shared `.cycle-viewport`.
 */
export function timelineScrollOwner(viewport: HTMLElement): HTMLElement {
  // Non-DOM stand-ins (unit-test fakes) have no shell: they are their own scroll owner.
  if (typeof viewport.closest !== "function" || viewport.closest<HTMLElement>(".editor-shell")?.dataset.viewMode !== "Cycle") return viewport;
  return viewport.querySelector<HTMLElement>(":scope .surface-host [data-role='timeline-viewport']") ?? viewport;
}

/** True when the fixed columns are outside the horizontal scroll owner (Cycle): timeline X carries no left/frozen inset. */
export function fixedColumnsOutsideTimeline(viewport: HTMLElement): boolean {
  return timelineScrollOwner(viewport) !== viewport;
}
