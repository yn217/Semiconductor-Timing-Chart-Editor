import { expect, test } from "@playwright/test";

for (const mode of ["Combined", "Cycle"]) {
  test(`${mode}: Bottom Expanded fits a short window after switching mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 600 });
    // The editor restarts in the last used mode, so the workspace measured at startup is a different one from the target mode's.
    await page.goto("/?transaction-demo");
    await page.locator(".view-mode").getByRole("button", { name: mode === "Cycle" ? "Transaction" : "Cycle", exact: true }).click();
    await page.reload();
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.locator(".ribbon").getByRole("button", { name: "Bottom Expanded", exact: true }).first().click();
    await expect.poll(async () => page.evaluate(() => {
      const bottom = document.querySelector(".bottom-editor")!.getBoundingClientRect();
      const status = document.querySelector(".status-bar")!.getBoundingClientRect();
      return Math.round(bottom.bottom) <= Math.round(status.top) + 1;
    })).toBe(true);
  });
}
