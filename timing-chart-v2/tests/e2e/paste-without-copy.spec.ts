import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Paste before anything was copied says so and raises no Problem", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").first().click();
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("clipboard-status")).toHaveText("Nothing to paste: copy something first");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
