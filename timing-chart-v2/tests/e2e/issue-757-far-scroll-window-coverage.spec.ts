import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #757: after a far horizontal scroll on a >4096-cycle document the painted window must cover the viewport.
test("a far scrollLeft jump repaints the window at the viewport, not from cycle 0", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 30, cycleCount: 10_000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p757.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const viewport = page.locator("[data-role='timeline-viewport']");
  const covers = () => page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!; // #625: the Timeline owns horizontal scroll in Cycle
    const owner = [...document.querySelectorAll<HTMLElement>("[data-role='wave-owner']")].find((o) => o.querySelector("svg, canvas[data-wave-canvas]"))!;
    const surface = owner.querySelector<SVGSVGElement | HTMLCanvasElement>("svg, canvas[data-wave-canvas]")!;
    const viewportRect = vp.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const contentLeft = surfaceRect.left - viewportRect.left + vp.scrollLeft;
    return { scrollLeft: vp.scrollLeft, clientWidth: vp.clientWidth, surfaceLeft: contentLeft, surfaceRight: contentLeft + surfaceRect.width };
  });
  await viewport.evaluate((el) => { el.scrollLeft = 200_000; });
  await expect.poll(async () => { const c = await covers(); return c.surfaceLeft <= c.scrollLeft && c.surfaceRight >= c.scrollLeft + c.clientWidth; }, { timeout: 60_000, message: "the rendered waveform surface must cover the viewport after a far jump" }).toBe(true);
});
