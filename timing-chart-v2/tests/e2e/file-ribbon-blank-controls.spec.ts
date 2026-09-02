import { expect, test } from "@playwright/test";

const expectedControls = ["New", "Open", "Save", "Save As", "Recent", "Properties", "Export"];

async function assertFileRibbon(page: import("@playwright/test").Page): Promise<void> {
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon).toHaveAttribute("aria-label", "File Ribbon");
  const buttons = ribbon.locator("button");
  await expect(buttons).toHaveCount(expectedControls.length);
  await expect(buttons.allTextContents()).resolves.toEqual(expectedControls);
  const state = await buttons.evaluateAll((elements) => elements.map((element) => {
    const button = element as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      text: button.textContent?.trim() ?? "",
      accessibleName: button.getAttribute("aria-label") || button.textContent?.trim() || button.getAttribute("title") || "",
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0,
      focusable: button.tabIndex >= 0,
      x: rect.x,
      right: rect.right,
      y: rect.y,
      bottom: rect.bottom,
    };
  }));
  expect(state.map((item) => item.text)).toEqual(expectedControls);
  expect(state.every((item) => item.accessibleName.length > 0)).toBe(true);
  expect(state.every((item) => item.visible)).toBe(true);
  expect(state.every((item) => item.focusable)).toBe(true);
  expect(state.every((item, index) => state.every((other, otherIndex) => index === otherIndex || item.right <= other.x || other.right <= item.x || item.bottom <= other.y || other.bottom <= item.y))).toBe(true);
}

test("keeps File ribbon controls named and removes no-op blank slots", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await assertFileRibbon(page);
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon.getByRole("button", { name: "New", exact: true })).toHaveAttribute("title", /approved product template/);
  await ribbon.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save As" })).toBeVisible();
  await page.getByRole("dialog", { name: "Save As" }).getByRole("button", { name: "Close Save As" }).click();
  await ribbon.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Document Properties" })).toBeVisible();
  await page.getByRole("dialog", { name: "Document Properties" }).getByRole("button", { name: "Close properties" }).click();
  await ribbon.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Export Timing Chart" })).toBeVisible();
  await page.getByRole("dialog", { name: "Export Timing Chart" }).getByRole("button", { name: "Close export" }).click();

  await page.setViewportSize({ width: 1365, height: 941 });
  await assertFileRibbon(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await assertFileRibbon(page);
});
