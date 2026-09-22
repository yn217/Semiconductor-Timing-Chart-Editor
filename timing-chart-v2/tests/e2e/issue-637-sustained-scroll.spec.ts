import { expect, test } from "@playwright/test";
import { timelineOwner } from "./timeline-scroll.js";

test("sustained horizontal scrolling never blanks the waveform canvas or re-renders waves", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const viewport = timelineOwner(page);
  const counters = async () => JSON.parse((await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"))!).waveDromRenders as number;
  const renderedOwners = () => page.locator("[data-role='wave-owner'] svg").count();
  await expect.poll(() => page.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.filter((owner) => owner.querySelector("svg") === null).length)).toBe(0);
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  const before = await counters();
  const history = await page.getByTestId("history-status").innerText();
  const maxLeft = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(maxLeft).toBeGreaterThan(1000);
  for (let step = 0; step <= 20; step += 1) {
    await viewport.evaluate((el, left) => { el.scrollLeft = left; }, Math.round((maxLeft * step) / 20));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(await renderedOwners(), `step ${step}`).toBeGreaterThanOrEqual(8);
  }
  await expect.poll(counters).toBe(before);
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
