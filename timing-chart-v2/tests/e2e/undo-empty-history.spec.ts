import { expect, test } from "@playwright/test";

test("Undo and Redo with nothing to undo or redo do not raise a Problem", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByText("Problems: 0")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByText("Problems: 0")).toBeVisible();
});
