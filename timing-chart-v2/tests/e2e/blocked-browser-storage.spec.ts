import { expect, test } from "@playwright/test";

test("the editor still starts, switches mode and saves when browser storage is blocked", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.addInitScript(() => {
    const denied = () => { throw new DOMException("denied", "SecurityError"); };
    Object.defineProperty(window, "localStorage", { get: denied, configurable: true });
    Object.defineProperty(window, "sessionStorage", { get: denied, configurable: true });
  });
  await page.goto("/?transaction-demo");
  const modes = page.locator(".view-mode");
  await expect(modes).toBeVisible();
  for (const mode of ["Cycle", "Combined", "Transaction"]) {
    await modes.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-view-mode", mode === "Combined" ? "Split" : mode);
  }
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".ribbon").getByRole("button", { name: "Save", exact: true }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/\.tcd$/);
  expect(pageErrors).toEqual([]);
});
