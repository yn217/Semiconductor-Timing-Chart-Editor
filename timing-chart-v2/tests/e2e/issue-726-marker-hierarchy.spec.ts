import { expect, test } from "@playwright/test";

test("unselected bookmark markers are secondary and strengthen on hover", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  // The fixture exposes a stable semantic Bookmark ID; visual styling must
  // not depend on which marker happens to be first in DOM order.
  const marker = page.locator(".transaction-bookmark-markers [data-bookmark-id='demo_bookmark_reset']");
  await expect(marker).toHaveAccessibleName("Go to bookmark Reset Release");
  await expect(marker).toBeAttached();
  const alpha = async () => marker.evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.borderLeftColor, width: parseFloat(cs.borderLeftWidth) }; });
  const rest = await alpha();
  expect(rest.width).toBeLessThanOrEqual(1);
  expect(rest.color).toMatch(/rgba?\(.*[,/]\s*0?\.\d+\)/);
  // Use normal pointer hit testing: force would hide a marker/bar stacking bug.
  await marker.hover();
  const hover = await alpha();
  expect(hover.width).toBeGreaterThanOrEqual(2);
});
