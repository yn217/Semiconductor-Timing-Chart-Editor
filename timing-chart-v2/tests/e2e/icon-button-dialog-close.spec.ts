import { expect, test, type Locator } from "@playwright/test";

async function expectCloseIcon(page: import("@playwright/test").Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  await expect(button.locator("svg")).toHaveAttribute("viewBox", "0 0 24 24");
  await expect(button.locator("path")).toHaveCount(1);
  await expect(button).not.toContainText("×");
}

async function expectTabLoop(dialog: Locator) {
  const focusable = dialog.locator("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1']):not([aria-disabled='true'])");
  const first = focusable.first();
  const last = focusable.last();
  await first.focus();
  await first.press("Shift+Tab");
  await expect(last).toBeFocused();
  await last.press("Tab");
  await expect(first).toBeFocused();
}

test("non-Home dialog close actions use the shared SVG close primitive", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  await expectCloseIcon(page, "Close hierarchy");
  await page.getByRole("button", { name: "Close hierarchy", exact: true }).click();
  await expect(page.getByRole("button", { name: "More tree actions", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  await expectCloseIcon(page, "Close bulk registration");
  await page.getByRole("button", { name: "Close bulk registration", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add signal or group", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Save As", exact: true }).first().click();
  await expectCloseIcon(page, "Close Save As");
  await page.getByRole("button", { name: "Close Save As", exact: true }).click();
});

test("app-owned dialogs close with Escape without changing the document", async ({ page }) => {
  await page.goto("/");
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();

  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  const hierarchy = page.getByRole("dialog", { name: "Hardware Hierarchy" });
  await expect(hierarchy).toBeVisible();
  await expectTabLoop(hierarchy);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Hardware Hierarchy" })).toBeHidden();
  await expect(page.getByRole("button", { name: "More tree actions", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  const bulk = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  await expect(bulk).toBeVisible();
  await expectTabLoop(bulk);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Bulk Signal Registration" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Add signal or group", exact: true })).toBeFocused();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const fileRibbon = page.getByTestId("ribbon");
  await fileRibbon.getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await expect(properties).toBeVisible();
  await expectTabLoop(properties);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Document Properties" })).toBeHidden();
  await expect(fileRibbon.getByRole("button", { name: "Properties", exact: true })).toBeFocused();

  const saveAsTrigger = fileRibbon.getByRole("button", { name: "Save As", exact: true });
  await saveAsTrigger.click();
  await expect(page.getByRole("dialog", { name: "Save As" })).toBeVisible();
  await page.getByRole("button", { name: "Close Save As", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Save", exact: true }).last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close Save As", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Save As" })).toBeHidden();

  const exportTrigger = fileRibbon.getByRole("button", { name: "Export", exact: true });
  await exportTrigger.click();
  await expect(page.getByRole("dialog", { name: "Export Timing Chart" })).toBeVisible();
  await page.getByRole("button", { name: "Close export", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Export SVG", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close export", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export Timing Chart" })).toBeHidden();

  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
});

test("Home overflow uses the shared menu keyboard behavior and restores its invoker", async ({ page }) => {
  await page.goto("/");
  const ribbon = page.getByTestId("ribbon");
  const trigger = ribbon.getByRole("button", { name: "More", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "More Home Commands" });
  const items = menu.locator("button:not(:disabled)");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
