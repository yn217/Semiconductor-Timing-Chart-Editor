import { expect, test } from "@playwright/test";

test("sustained horizontal scrolling never blanks the waveform canvas or re-renders waves", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const viewport = page.getByTestId("cycle-viewport");
  const counters = async () => JSON.parse((await surface.getAttribute("data-session-counters"))!).waveAdapter.renderCalls as number;
  const renderedOwners = () => page.locator("[data-role='wave-owner'] svg").count();
  expect(await renderedOwners()).toBeGreaterThan(0);
  const before = await counters();
  const history = await page.getByTestId("history-status").innerText();
  const maxLeft = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(maxLeft).toBeGreaterThan(1000);
  for (let step = 0; step <= 60; step += 1) {
    await viewport.evaluate((el, left) => { el.scrollLeft = left; }, Math.round((maxLeft * step) / 60));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    expect(await renderedOwners(), `step ${step}`).toBeGreaterThan(0);
  }
  await expect.poll(counters).toBe(before);
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
