import { expect, test, type Locator } from "@playwright/test";

async function expectCloseIcon(page: import("@playwright/test").Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("type", "button");
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

test("non-Home dialog close buttons are named, non-submit actions that restore their invokers", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Save As", exact: true }).first()).toBeFocused();
});

test("app-owned dialogs close with Escape without changing the document", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
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

test("floating Find and Time Scale dialogs trap focus and restore their triggers", async ({ page }) => {
  await page.goto("/");
  const findTrigger = page.getByTestId("find-replace-trigger");
  await findTrigger.click();
  const findDialog = page.getByRole("dialog", { name: "Find and Replace" });
  await expect(findDialog).toBeVisible();
  await expectTabLoop(findDialog);
  await page.keyboard.press("Escape");
  await expect(findDialog).toBeHidden();
  await expect(findTrigger).toBeFocused();

  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  const scaleTrigger = page.getByTestId("transaction-time-scale-trigger");
  await scaleTrigger.click();
  const scaleDialog = page.getByRole("dialog", { name: "Transaction Time Scale" });
  await expect(scaleDialog).toBeVisible();
  await expectTabLoop(scaleDialog);
  await page.keyboard.press("Escape");
  await expect(scaleDialog).toBeHidden();
  await expect(scaleTrigger).toBeFocused();
});

test("Tree menus close on Escape or outside click without selecting the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();
  const addTrigger = page.getByRole("button", { name: "Add signal or group", exact: true });
  await addTrigger.click();
  const addMenu = page.getByRole("menu", { name: "Add signal or group" });
  await expect(addMenu).toBeVisible();
  await expect(addMenu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(addMenu).toBeHidden();
  await expect(addTrigger).toBeFocused();

  const moreTrigger = page.getByRole("button", { name: "More tree actions", exact: true });
  await moreTrigger.click();
  const moreMenu = page.getByRole("menu", { name: "More tree actions" });
  await expect(moreMenu).toBeVisible();
  await expect(moreMenu.getByRole("menuitem").first()).toBeFocused();
  const viewport = page.getByTestId("cycle-viewport");
  const selectedBeforeOutsideClick = await page.getByTestId("selection-status").textContent();
  // The Timeline ruler is canvas chrome with no rows (a click that lands on a Signal row deliberately selects it).
  await page.getByTestId("cycle-ruler").click({ position: { x: 300, y: 8 } });
  await expect(moreMenu).toBeHidden();
  await expect(moreTrigger).toBeFocused();
  await expect(page.getByTestId("selection-status")).toHaveText(selectedBeforeOutsideClick!);
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});
