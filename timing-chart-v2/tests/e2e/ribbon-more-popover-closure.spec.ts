import { expect, test } from "@playwright/test";

test.describe("Home Ribbon More overlay", () => {
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }, { width: 1024, height: 720 }, { width: 900, height: 720 }]) {
    test(`does not create horizontal Ribbon overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
      const ribbon = page.getByTestId("ribbon");
      const dimensions = await ribbon.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    });
  }

  for (const viewport of [{ width: 1024, height: 720 }, { width: 900, height: 720 }]) {
    test(`keeps More popup inside the viewport and view-only at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
      const ribbon = page.getByTestId("ribbon");
      const trigger = ribbon.getByRole("button", { name: "More", exact: true });
      const before = {
        revision: await page.getByTestId("revision-status").textContent(),
        history: await page.getByTestId("history-status").textContent(),
        dirty: await page.getByTestId("dirty-status").textContent(),
      };

      await trigger.click();
      const menu = page.getByRole("menu", { name: "More Home Commands" });
      await expect(menu).toBeVisible();
      const bounds = await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          insideRibbon: element.closest("[data-testid='ribbon']") !== null,
        };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 0.5);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 0.5);
      expect(bounds.insideRibbon).toBe(false);
      const firstItem = menu.getByRole("menuitem", { name: "New", exact: true });
      await expect(firstItem).toBeFocused();
      await firstItem.press("End");
      await expect(menu.getByRole("menuitem", { name: "Timeline Editor", exact: true })).toBeFocused();
      await page.keyboard.press("Home");
      await expect(firstItem).toBeFocused();

      await firstItem.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();

      await trigger.click();
      await expect(page.getByRole("menu", { name: "More Home Commands" })).toBeVisible();
      await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
      await expect(page.getByRole("menu", { name: "More Home Commands" })).toHaveCount(0);

      await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
      await expect(page.getByTestId("history-status")).toHaveText(before.history!);
      await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
    });
  }
});
