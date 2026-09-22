import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("browser title bar does not present inert window controls", async ({ page }) => {
  await page.goto("/");
  const titlebar = page.locator(".app-titlebar");
  await expect(titlebar).toBeVisible();
  await expect(titlebar.locator("h1")).toHaveText("Semiconductor Timing Chart");
  await expect(titlebar.locator(".save-state")).toHaveText("Saved");
  await expect(titlebar.locator(".view-title")).toHaveText("Cycle View");
  await expect(titlebar.locator(".window-controls")).toHaveCount(0);
  await expect(titlebar).not.toContainText("—");
  await expect(titlebar).not.toContainText("□");
  await expect(titlebar).not.toContainText("×");
});
