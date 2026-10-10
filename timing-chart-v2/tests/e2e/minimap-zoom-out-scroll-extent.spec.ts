import { expect, test } from "@playwright/test";
import { timelineOwner } from "./timeline-scroll.js";

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

// Below 100% zoom the scaled Cycle layers keep their unscaled layout width, so the native scrollWidth
// stays at the 100% extent. The horizontal scrollbar and the viewport clamp use scrollWidth * zoom;
// the MiniMap viewport rect, click-pan and End key must use the same effective width.
test("MiniMap viewport rect and click-pan use the zoom-scaled scroll extent below 100%", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByTestId("home-minimap-toggle").check();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("50");
  await expect(page.getByTestId("zoom-status")).toHaveText("50%");

  const owner = timelineOwner(page);
  await expect(owner).toHaveAttribute("data-scroll-shrink", "0.5");
  const dims = await owner.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  const effective = Math.round(dims.scrollWidth * 0.5);
  const maxLeft = effective - dims.clientWidth;
  expect(maxLeft).toBeGreaterThan(40);

  const minimap = page.getByTestId("minimap");
  const indicator = page.getByTestId("minimap-viewport");
  // Scroll to the end of the shrunken extent: the viewport rect must reach the right edge of the MiniMap.
  await owner.evaluate((element) => { element.scrollLeft = 1e9; });
  await expect.poll(async () => owner.evaluate((element) => element.scrollLeft)).toBeCloseTo(maxLeft, -1);
  const width = Number(await minimap.getAttribute("data-viewport-width"));
  const left = Number(await minimap.getAttribute("data-viewport-left"));
  expect(width).toBeCloseTo(dims.clientWidth / effective, 2);
  expect(left + width).toBeCloseTo(1, 2);
  const contentRect = await minimap.locator(".minimap-rows").boundingBox();
  const indicatorRect = await indicator.boundingBox();
  expect(contentRect).not.toBeNull();
  expect(indicatorRect).not.toBeNull();
  expect(indicatorRect!.x + indicatorRect!.width).toBeLessThanOrEqual(contentRect!.x + contentRect!.width + 1);

  // Click-pan to a quarter of the MiniMap width must land at a quarter of the effective scroll range.
  const box = await minimap.boundingBox();
  expect(box).not.toBeNull();
  const y = box!.y + box!.height / 2;
  await page.mouse.click(box!.x + box!.width * 0.25, y);
  const panned = await owner.evaluate((element) => element.scrollLeft);
  expect(panned).toBeCloseTo(0.25 * maxLeft, -1);
  expect(panned).toBeLessThanOrEqual(maxLeft + 1);
});
