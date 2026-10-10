import { expect, test } from "@playwright/test";

for (const mode of ["Cycle", "Combined"]) {
  test(`${mode}: below 100% zoom the timeline cannot be scrolled past its end into blank space`, async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.goto("/?transaction-demo");
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    const viewport = page.locator("[data-role='timeline-viewport']");
    const natural = await viewport.evaluate((element) => element.scrollWidth);
    await page.getByRole("button", { name: "Zoom Out", exact: true }).first().click();
    await page.getByRole("button", { name: "Zoom Out", exact: true }).first().click();
    await expect(page.getByText("Zoom: 50%")).toBeVisible();
    await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await page.waitForTimeout(300);
    const { left, client } = await viewport.evaluate((element) => ({ left: element.scrollLeft, client: element.clientWidth }));
    // The content is half the natural width at 50%: scrolling stops there, not at the natural width.
    expect(left + client).toBeLessThanOrEqual(Math.round(natural / 2) + 2);
  });
}

test("zooming out while scrolled to the far right pulls the view back to the zoomed content end", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const viewport = page.locator("[data-role='timeline-viewport']");
  const natural = await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; return element.scrollWidth; });
  await page.getByRole("button", { name: "Zoom Out", exact: true }).first().click();
  await page.getByRole("button", { name: "Zoom Out", exact: true }).first().click();
  await expect(page.getByText("Zoom: 50%")).toBeVisible();
  await expect.poll(async () => viewport.evaluate((element) => element.scrollLeft + element.clientWidth)).toBeLessThanOrEqual(Math.round(natural / 2) + 2);
});
