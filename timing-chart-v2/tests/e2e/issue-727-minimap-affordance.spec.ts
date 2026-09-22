import { expect, test } from "@playwright/test";

test("MiniMap states that it navigates the timeline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const minimap = page.getByTestId("minimap");
  await expect(minimap).toHaveAttribute("aria-label", "MiniMap timeline navigator");
  await expect(minimap).toHaveAttribute("title", "Click or drag to navigate the timeline");
});
