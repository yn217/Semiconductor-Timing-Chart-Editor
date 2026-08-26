import { expect, test } from "@playwright/test";

test("the Ruler resolves and renders the terminal timeline boundary tick instead of silently omitting it", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ruler = page.getByTestId("cycle-ruler");

  // The default document has cycleCount: 24 (a half-open [0, 24) range). The terminal boundary at
  // cycle 24 is only ever the "cycle-end" of cycle 23 in the extracted geometry, never a "cycle-start"
  // slot of its own - so a Ruler that queries "cycle-start" per display cycle up to and including
  // displayCycleCount must be able to resolve it, not silently skip the final tick.
  await expect(ruler.locator("[data-cycle='24']")).toHaveCount(1);
  await expect(ruler.locator("[data-cycle='23']")).toHaveCount(1);

  const finalTick = ruler.locator("[data-cycle='24']");
  const priorTick = ruler.locator("[data-cycle='23']");
  const finalX = Number((await finalTick.evaluate((el) => (el as HTMLElement).style.left)).replace("px", ""));
  const priorX = Number((await priorTick.evaluate((el) => (el as HTMLElement).style.left)).replace("px", ""));
  expect(finalX).toBeGreaterThan(priorX);
});
