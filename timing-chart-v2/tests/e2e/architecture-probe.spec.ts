import { expect, test } from "@playwright/test";

test("renders the Phase 3 WaveDrom adapter boundary in Chromium", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Timing Chart Editor V2" })).toBeVisible();
  await expect(page.getByText("Phase 3 WaveDrom adapter probe — 3.6.2")).toBeVisible();
  const mount = page.getByTestId("wave-mount");
  await expect(mount).toHaveAttribute("data-wave-owner", "sig_phase3_probe");
  const svg = mount.locator("svg.WaveDrom[data-wave-owner='sig_phase3_probe']");
  await expect(svg).toHaveCount(1);
  await expect(svg).toHaveAttribute("data-wave-render-index", "0");
  await expect(mount.locator("svg.WaveDrom path")).not.toHaveCount(0);
});
