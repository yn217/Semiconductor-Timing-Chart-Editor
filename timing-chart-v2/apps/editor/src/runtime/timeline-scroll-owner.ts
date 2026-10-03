/**
 * Resolve the horizontal owner declared by the active ModeWorkspace owner.
 * Cycle's fixed columns sit outside its nested timeline viewport; Transaction
 * owns its standalone viewport; Combined's outer viewport is the shared owner.
 */
export function timelineScrollOwner(viewport: HTMLElement): HTMLElement {
  // Non-DOM stand-ins (unit-test fakes) have no shell: they are their own scroll owner.
  if (typeof viewport.closest !== "function" || viewport.dataset.timeViewportOwner !== "cycle-inner") return viewport;
  return viewport.querySelector<HTMLElement>(":scope .surface-host [data-role='timeline-viewport']") ?? viewport;
}

/** True when the fixed columns are outside the horizontal scroll owner (Cycle): timeline X carries no left/frozen inset. */
export function fixedColumnsOutsideTimeline(viewport: HTMLElement): boolean {
  return timelineScrollOwner(viewport) !== viewport;
}
