import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// #625: the horizontal scrollbar track starts at the Timeline's origin and never extends beneath Signals / Groups, Role or Signal / Annotation.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Timeline horizontal scrollbar starts at the Timeline left edge at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    // Long enough to scroll horizontally.
    await page.getByTestId("cycle-viewport").evaluate((element) => { (element as HTMLElement).style.setProperty("--wave-width", "4000px"); });
    await page.getByRole("button", { name: "Zoom In", exact: true }).first().click().catch(() => {});
    const bar = page.getByTestId("timeline-hscroll");
    const geometry = await page.evaluate(() => {
      const view = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
      const bar = document.querySelector<HTMLElement>("[data-testid='timeline-hscroll']")!;
      const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
      const frozen = document.querySelector<HTMLElement>("[data-role='frozen-label-rows']")!;
      return {
        bar: bar.getBoundingClientRect().toJSON(), hidden: bar.hidden, ruler: ruler.getBoundingClientRect().toJSON(), frozen: frozen.getBoundingClientRect().toJSON(), view: view.getBoundingClientRect().toJSON(),
        scrollWidth: view.scrollWidth, clientWidth: view.clientWidth,
      };
    });
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
    expect(geometry.hidden).toBe(false);
    expect(Math.abs(geometry.bar.left - geometry.ruler.left)).toBeLessThanOrEqual(1);
    expect(geometry.bar.left).toBeGreaterThanOrEqual(geometry.frozen.right - 1);
    expect(geometry.bar.right).toBeLessThanOrEqual(geometry.view.right + 1);
    // Driving the Timeline track scrolls the viewport by the same amount, and never moves the fixed columns.
    const frozenBefore = (await page.locator("[data-role='frozen-label-rows']").boundingBox())!.x;
    await bar.evaluate((element) => { element.scrollLeft = 120; });
    await expect.poll(() => page.getByTestId("cycle-viewport").evaluate((element) => element.scrollLeft)).toBe(120);
    expect((await page.locator("[data-role='frozen-label-rows']").boundingBox())!.x).toBeCloseTo(frozenBefore, 0);
  });
}
