import { expect, test } from "@playwright/test";

test("Ctrl+S saves, Ctrl+Shift+S opens Save As and Ctrl+O opens the file chooser", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page.locator(".view-mode")).toBeVisible();
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator("[data-role='frozen-row']").nth(2).click({ position: { x: 30, y: 10 } });

  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  expect(download.suggestedFilename()).toMatch(/\.tcd$/);

  await page.keyboard.press("Control+Shift+s");
  await expect(page.getByRole("dialog", { name: /Save As/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /Save As/i })).toBeHidden();

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Control+o")]);
  expect(chooser.isMultiple()).toBe(false);
});

test("Ctrl+S inside a text field still saves the document", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator("input[placeholder^='Filter signals']").focus();
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  expect(download.suggestedFilename()).toMatch(/\.tcd$/);
});
