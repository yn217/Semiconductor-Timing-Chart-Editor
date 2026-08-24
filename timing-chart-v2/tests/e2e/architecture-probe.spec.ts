import { expect, test } from "@playwright/test";

test("loads the Phase 0 editor composition boundary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Timing Chart Editor V2" })).toBeVisible();
  await expect(page.getByText("Phase 0 architecture probe")).toBeVisible();
});
