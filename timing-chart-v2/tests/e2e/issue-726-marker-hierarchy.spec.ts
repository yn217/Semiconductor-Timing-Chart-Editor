import { expect, test } from "@playwright/test";

test("unselected bookmark markers are secondary and strengthen on hover", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const marker = page.locator(".transaction-bookmark-markers button").first();
  await expect(marker).toBeAttached();
  const alpha = async () => marker.evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.borderLeftColor, width: parseFloat(cs.borderLeftWidth) }; });
  const rest = await alpha();
  expect(rest.width).toBeLessThanOrEqual(1);
  expect(rest.color).toMatch(/rgba?\(.*[,/]\s*0?\.\d+\)/);
  await marker.hover({ force: true });
  const hover = await alpha();
  expect(hover.width).toBeGreaterThanOrEqual(2);
});
