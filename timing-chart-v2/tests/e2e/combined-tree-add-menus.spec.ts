import { expect, test } from "@playwright/test";

// Combined shows two tree headers over one shared menu state; each header's Add menu must stay open (they used to dismiss each other as peers).
test("Combined Signals and Transactions Add menus each open and stay open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await page.getByRole("button", { name: "Add signal or group" }).click();
  await expect(page.getByRole("menu", { name: "Add signal or group" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Add signal or group" })).toHaveCount(0);
  await page.getByTestId("add-transaction-tree").click();
  await expect(page.getByRole("menu", { name: "Add transaction or group" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "Add signal or group" })).toHaveCount(0);
});
