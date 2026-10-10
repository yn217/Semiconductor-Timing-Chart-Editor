import { expect, test } from "@playwright/test";

test("the editor starts and saves where crypto.randomUUID does not exist (plain http)", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.addInitScript(() => { Object.defineProperty(window.crypto, "randomUUID", { value: undefined, configurable: true }); });
  await page.goto("/?transaction-demo");
  await expect(page.locator(".view-mode")).toBeVisible();
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".ribbon").getByRole("button", { name: "Save", exact: true }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/\.tcd$/);
  expect(pageErrors).toEqual([]);
});
