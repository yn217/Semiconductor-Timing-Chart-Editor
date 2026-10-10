import { expect, test } from "@playwright/test";

// Ctrl+Y is the Windows-native Redo alongside Ctrl+Shift+Z.
test("Ctrl+Y redoes what Ctrl+Z undid", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const rows = () => page.locator("[data-signal-id]").count();
  const before = await rows();
  await page.getByRole("button", { name: "Add signal or group" }).first().click();
  await page.getByRole("menuitem", { name: "Signal", exact: true }).click();
  await expect.poll(rows).toBe(before + 1);
  await page.keyboard.press("Control+z");
  await expect.poll(rows).toBe(before);
  await page.keyboard.press("Control+y");
  await expect.poll(rows).toBe(before + 1);
});
