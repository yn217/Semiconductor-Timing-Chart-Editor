import { expect, test } from "@playwright/test";

test("Signal Split does not expose per-signal Upper/Lower/Both assignment", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByLabel("Inspector signal split pane")).toHaveCount(0);
});
