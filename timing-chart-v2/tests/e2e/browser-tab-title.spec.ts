import { expect, test } from "@playwright/test";

test("the browser tab names the document and marks unsaved changes", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page).toHaveTitle("Sample - Timing Chart Editor");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("button", { name: "Add signal or group" }).first().click();
  await page.getByRole("menuitem", { name: "Signal", exact: true }).click();
  await expect(page).toHaveTitle("* Sample - Timing Chart Editor");
  await page.keyboard.press("Control+z");
  await expect(page).toHaveTitle("Sample - Timing Chart Editor");
});
