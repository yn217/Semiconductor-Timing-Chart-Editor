import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) test(`standalone Cycle and Transaction zoom state does not leak at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  const zoom = page.getByTestId("zoom-status");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("150");
  await expect(zoom).toHaveText("150%");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("200");
  await expect(zoom).toHaveText("200%");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(zoom).toHaveText("150%");
});
