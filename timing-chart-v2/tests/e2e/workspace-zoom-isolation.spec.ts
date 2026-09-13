import { expect, test } from "@playwright/test";

test("standalone Cycle and Transaction zoom state does not leak across modes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
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
