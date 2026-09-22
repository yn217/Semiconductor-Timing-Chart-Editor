import { expect, test } from "@playwright/test";
import { openBottomSettings } from "./bottom-settings";

test("Follow Selection and Pin live behind the Bottom settings gear", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const popover = page.getByTestId("bottom-settings-popover");
  await expect(page.getByTestId("bottom-follow-status")).toBeVisible();
  await expect(popover).toBeHidden();
  await expect(page.getByTestId("bottom-pin")).toBeHidden();
  await openBottomSettings(page);
  await expect(popover).toBeVisible();
  await expect(page.getByTestId("follow-selection")).toBeVisible();
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-follow-status")).toContainText("Pinned");
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
});
