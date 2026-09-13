import { expect, test } from "@playwright/test";

// Accessibility: every other role="menu" popup in the app (context menu,
// Left Tree Add/More, Home overflow) gets ArrowUp/ArrowDown/Home/End
// cycling via runtime/interaction-controller.ts's shared
// attachMenuKeyboardNavigation. The Annotation Ribbon's Arrange dropdown
// owns its open/close state locally and never picked up that wiring --
// Escape and outside-click worked, but arrow keys silently did nothing,
// and opening it never moved focus off the trigger. This verifies the
// dropdown now behaves like every other menu: focus lands on the first
// enabled item on open, and Arrow/Home/End cycle through enabled items
// only, skipping disabled ones and separators.
test("Arrange dropdown supports Arrow/Home/End keyboard navigation and focuses its first item on open", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  // Create and select one annotation so Rotate/Lock/Unlock are enabled
  // (only Ungroup/Align/Same width need a 2nd member, per
  // arrange-disabled-reasons.spec.ts).
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const trigger = page.locator(".arrange-dropdown-trigger");
  await trigger.click();
  const menu = page.locator(".arrange-menu");
  await expect(menu).toBeVisible();

  // Ungroup is disabled (nothing to ungroup) -- it must be skipped, so
  // opening the menu focuses Rotate right, the first ENABLED item.
  const rotateRight = menu.getByRole("menuitem", { name: "Rotate right 90°" });
  const rotateLeft = menu.getByRole("menuitem", { name: "Rotate left 90°" });
  const lock = menu.getByRole("menuitem", { name: "Lock", exact: true });
  await expect(rotateRight).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(rotateLeft).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rotateRight).toBeFocused();

  await page.keyboard.press("End");
  await expect(lock).toBeFocused();
  await page.keyboard.press("Home");
  await expect(rotateRight).toBeFocused();

  // Escape still closes the menu (pre-existing behavior, unaffected).
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
