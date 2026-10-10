import type { Page } from "@playwright/test";

/**
 * #625: the horizontal scroll owner of the time domain. In Cycle and Combined Mode it is the nested TimelineViewport wrapper (fixed columns are outside
 * it, local X starts at 0); in Transaction it is the shared `.cycle-viewport`. Specs that read/write scrollLeft use this.
 */

export const timelineScrollLeft = (page: Page): Promise<number> => page.evaluate(() => {
  const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
  const wrapper = document.querySelector<HTMLElement>(":is(.editor-shell[data-view-mode='Cycle'], .editor-shell[data-view-mode='Split']) [data-testid='cycle-viewport'] [data-role='timeline-viewport']");
  return (wrapper ?? viewport).scrollLeft;
});

export const setTimelineScrollLeft = (page: Page, left: number): Promise<void> => page.evaluate((target) => {
  const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
  const wrapper = document.querySelector<HTMLElement>(":is(.editor-shell[data-view-mode='Cycle'], .editor-shell[data-view-mode='Split']) [data-testid='cycle-viewport'] [data-role='timeline-viewport']");
  (wrapper ?? viewport).scrollLeft = target;
}, left);

/** Locator for the horizontal scroll owner (Cycle: TimelineViewport wrapper; other modes: the shared viewport). */
export const timelineOwner = (page: Page) => page.locator(":is(.editor-shell[data-view-mode='Cycle'], .editor-shell[data-view-mode='Split']) [data-role='timeline-viewport'], .editor-shell[data-view-mode='Transaction'] [data-testid='cycle-viewport']").first();

/** Moves the pointer onto the visible time-domain area (right of the fixed columns, below the ruler) so a wheel event scrolls it. */
export async function hoverTimelineArea(page: Page): Promise<void> {
  const box = await page.evaluate(() => {
    const view = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!.getBoundingClientRect();
    const owner = document.querySelector<HTMLElement>(":is(.editor-shell[data-view-mode='Cycle'], .editor-shell[data-view-mode='Split']) [data-role='timeline-viewport']");
    const left = owner ? owner.getBoundingClientRect().left : view.left;
    return { x: left + 120, y: view.top + 120 };
  });
  await page.mouse.move(box.x, box.y);
}

/** The ruler sits outside the Timeline scroll owner, so scrollIntoView cannot reveal a tick: scroll the owner like a user would. */
export async function revealRulerTick(page: Page, cycle: number): Promise<void> {
  await page.evaluate((target) => {
    const tick = document.querySelector<HTMLElement>(`[data-testid='cycle-ruler'] [data-cycle='${target}']`);
    const owner = document.querySelector<HTMLElement>(":is(.editor-shell[data-view-mode='Cycle'], .editor-shell[data-view-mode='Split']) [data-role='timeline-viewport']");
    const frame = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']");
    if (!tick || !owner || !frame) return;
    owner.scrollLeft += tick.getBoundingClientRect().left - frame.getBoundingClientRect().left - 60;
  }, cycle);
}
