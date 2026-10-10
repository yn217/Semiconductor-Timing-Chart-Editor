import { expect, test } from "@playwright/test";

test("Find and Replace treats the replacement text literally ($& and $$ are not expanded)", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("find-replace-trigger").click();
  await page.getByTestId("find-replace-find").fill("CLOCK");
  for (const replacement of ["a$&b", "$$", "$`z", "x$1y"]) {
    await page.getByTestId("find-replace-replace").fill(replacement);
    await expect(page.locator(".find-replace-preview li").first().locator("span").last()).toHaveText(replacement);
  }
});
