/**
 * Resolve the horizontal owner declared by the active ModeWorkspace owner.
 * Cycle's and Combined's fixed columns sit outside their nested timeline viewport
 * (Combined's Transaction pane follows that owner); Transaction owns its standalone viewport.
 */
export function timelineScrollOwner(viewport: HTMLElement): HTMLElement {
  // Non-DOM stand-ins (unit-test fakes) have no shell: they are their own scroll owner.
  if (typeof viewport.closest !== "function" || viewport.dataset.timeViewportOwner !== "cycle-inner" && viewport.dataset.timeViewportOwner !== "combined-inner") return viewport;
  return viewport.querySelector<HTMLElement>(":scope .surface-host [data-role='timeline-viewport']") ?? viewport;
}

/** True when the fixed columns are outside the horizontal scroll owner (Cycle, Combined): timeline X carries no left/frozen inset. */
export function fixedColumnsOutsideTimeline(viewport: HTMLElement): boolean {
  return timelineScrollOwner(viewport) !== viewport;
}
