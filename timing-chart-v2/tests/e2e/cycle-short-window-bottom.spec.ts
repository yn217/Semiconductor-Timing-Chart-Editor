import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// A typical laptop browser viewport (~650px tall) must not push the Bottom editor under the status bar / out of the window.
for (const height of [650, 600]) {
  test(`Cycle Bottom editor stays inside the window at ${height}px tall`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height });
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const bottom = (await page.getByTestId("bottom-editor").boundingBox())!;
    const status = (await page.getByTestId("problems-status").boundingBox())!;
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(status.y + 1);
    expect(status.y + status.height).toBeLessThanOrEqual(height + 1);
  });
}
