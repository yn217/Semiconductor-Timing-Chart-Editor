import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/** #900: Spacer rows (intentional in the 21 showcase) render as spacing -- no `wire` role badge, no empty Signal-like controls. */
test("Spacer rows are presented as spacing, not blank Signal rows", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json"));
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });

  const left = surface.locator("[data-role='left-row'][data-row-id='sp.clk']");
  await expect(left).toHaveCount(1);
  await expect(left).toHaveAttribute("data-row-kind", "spacer");
  await expect(left.locator("[data-role='tree-signal-role']")).toHaveCount(0);
  await expect(left.locator("[data-role='tree-visibility']")).toHaveCount(0);
  await expect(left.locator("[data-role='tree-spacer-label']")).toHaveText("Spacer");
  const frozen = surface.locator("[data-role='frozen-row'][data-row-id='sp.clk']");
  await expect(frozen.locator("[data-role='signal-role']")).toHaveCount(0);
  await expect(frozen).toHaveText("");
  // Real Signals keep their role badge.
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='s.clk'] [data-role='signal-role']")).toHaveCount(1);
});
