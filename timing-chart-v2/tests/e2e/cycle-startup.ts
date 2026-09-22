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

/**
 * Specs written against the plain 24-cycle Cycle sample (no demo Transactions/Bookmarks/Annotations) opt in to that startup
 * document as well; the product default document is the Transaction demo (160 cycles, demo content).
 */
export function startInCycleSample(test: typeof playwrightTest): void {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); window.localStorage.setItem("timing-chart-v2.startup-document", "cycle"); } catch { /* best effort */ } });
  });
}
