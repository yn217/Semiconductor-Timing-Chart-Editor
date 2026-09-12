import { expect, test } from "@playwright/test";

test("the Ruler resolves and renders the terminal timeline boundary tick instead of silently omitting it", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ruler = page.getByTestId("cycle-ruler");

  // The default document has cycleCount: 24 (a half-open [0, 24) range). The terminal boundary at
  // cycle 24 is only ever the "cycle-end" of cycle 23 in the extracted geometry, never a "cycle-start"
  // slot of its own - so a Ruler that queries "cycle-start" per display cycle up to and including
  // displayCycleCount must be able to resolve it, not silently skip the final tick.
  const ticks = ruler.locator("[data-cycle]");
  const tickCount = await ticks.count();
  await expect(ticks.nth(tickCount - 1)).toBeVisible();
  await expect(ticks.nth(tickCount - 2)).toBeVisible();

  const finalTick = ticks.nth(tickCount - 1);
  const priorTick = ticks.nth(tickCount - 2);
  const finalX = Number((await finalTick.evaluate((el) => (el as HTMLElement).style.left)).replace("px", ""));
  const priorX = Number((await priorTick.evaluate((el) => (el as HTMLElement).style.left)).replace("px", ""));
  expect(finalX).toBeGreaterThan(priorX);
});
