import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("zoomed far-scroll renders the source cycles visible under the ruler", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 12, cycleCount: 5_000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "issue-738-zoom-window.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("800");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  const viewport = page.locator("[data-role='timeline-viewport']");
  const targetScroll = 100_000;
  await viewport.evaluate((element, target) => { element.scrollLeft = target; }, targetScroll);
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft), { timeout: 10_000 }).toBe(targetScroll);
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }));

  const state = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
    const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
    const frame = ruler.getBoundingClientRect();
    const visibleTicks = Array.from(ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]"))
      .map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left }))
      .filter((tick) => tick.x >= frame.left - 1 && tick.x <= viewport.getBoundingClientRect().right + 1)
      .sort((a, b) => a.x - b.x);
    const windows = Array.from(document.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-rendered-source-window-start]"))
      .map((owner) => ({ start: Number(owner.dataset.renderedSourceWindowStart), end: Number(owner.dataset.renderedSourceWindowEnd) }));
    return { scrollLeft: viewport.scrollLeft, visibleStart: visibleTicks[0]?.cycle, visibleEnd: visibleTicks.at(-1)?.cycle, windows };
  });

  expect(state.scrollLeft).toBe(targetScroll);
  expect(state.visibleStart, "the ruler must expose a visible source cycle").toBeDefined();
  expect(state.visibleEnd, "the ruler must expose a visible source cycle").toBeDefined();
  expect(state.windows.some((window) => window.start <= state.visibleStart! && window.end >= state.visibleEnd!), JSON.stringify(state)).toBe(true);
});
