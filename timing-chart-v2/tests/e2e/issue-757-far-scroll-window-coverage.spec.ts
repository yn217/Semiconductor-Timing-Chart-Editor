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
  const viewport = page.getByTestId("cycle-viewport");
  const covers = () => page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
    const owner = [...document.querySelectorAll<HTMLElement>("[data-role='wave-owner']")].find((o) => o.querySelector("svg"))!;
    const left = parseFloat(owner.style.left || "0");
    const width = parseFloat(owner.style.width || "0");
    return { scrollLeft: vp.scrollLeft, clientWidth: vp.clientWidth, ownerLeft: left, ownerRight: left + width };
  });
  await viewport.evaluate((el) => { el.scrollLeft = 200_000; });
  await expect.poll(async () => { const c = await covers(); return c.ownerLeft <= c.scrollLeft && c.ownerRight >= c.scrollLeft + c.clientWidth; }, { timeout: 60_000, message: "painted wave-owner span must cover the viewport after a far jump" }).toBe(true);
});
