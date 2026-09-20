import { expect, test } from "@playwright/test";

// #623: entering Cycle mode must not visibly resettle: after the surface is ready, wave renders / geometry builds stay constant and the
// wave owners, ruler and frozen columns do not move.
test("Cycle mode entry settles once (no repeated renders or layout shifts after ready)", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const snapshot = () => page.evaluate(() => {
    const surface = document.querySelector("[data-role='timing-chart-surface']") as HTMLElement;
    const box = (selector: string) => { const rect = document.querySelector(selector)?.getBoundingClientRect(); return rect ? [Math.round(rect.x * 10) / 10, Math.round(rect.y * 10) / 10, Math.round(rect.width * 10) / 10] : null; };
    return { counters: surface.getAttribute("data-render-counters"), ruler: box("[data-testid='cycle-ruler']"), frozen: box("[data-role='frozen-label-rows']"), owner: box("[data-role='wave-owner']"), tick: box("[data-testid='cycle-ruler'] [data-cycle='4']") };
  });
  const first = await snapshot();
  // Three animation frames plus a settle window covering any deferred second/third presentation passes.
  for (let frame = 0; frame < 3; frame += 1) await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect.poll(async () => JSON.stringify(await snapshot()), { intervals: [200, 200, 200, 200, 200, 200], timeout: 3000 }).toBe(JSON.stringify(first));
});
