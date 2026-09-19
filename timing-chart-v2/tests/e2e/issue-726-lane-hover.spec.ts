import { expect, test } from "@playwright/test";

test("Transaction lanes highlight on hover so a lane can be followed across the canvas", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const lane = page.locator(".transaction-lane").first();
  await expect(lane).toBeVisible();
  const bg = () => lane.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.mouse.move(1, 1);
  const rest = await bg();
  const box = (await lane.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + box.height - 3);
  await expect.poll(bg).not.toBe(rest);
  await expect(lane).toHaveCSS("border-bottom-color", "rgb(201, 214, 227)");
});
