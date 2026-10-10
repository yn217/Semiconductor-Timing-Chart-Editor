import { expect, test } from "@playwright/test";

// The dirty flag and Problems count must stay visible on narrow windows (half-width snapped browser).
for (const width of [1000, 800]) {
  test(`status bar keeps Clean/Modified and Problems visible at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    for (const id of ["dirty-status", "problems-status"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.width, id).toBeGreaterThan(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(width + 1);
    }
  });
}
