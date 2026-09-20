import type { test as playwrightTest } from "@playwright/test";

/**
 * Cycle-designed acceptance specs assume the Cycle workspace after `page.goto("/")`. The product default is Transaction
 * (49f904cd), but the editor honours the persisted view-mode preference (use-workspace-ui-state.ts), so these specs
 * declare their starting workspace the same way a returning user's saved preference does -- no per-test mode clicks.
 */
export function startInCycleMode(test: typeof playwrightTest): void {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
  });
}
