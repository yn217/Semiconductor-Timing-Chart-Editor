import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("creates a first-class Spacer from the Tree Add surface", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeCounters = await surface.getAttribute("data-render-counters");

  await page.getByRole("button", { name: "Add signal or group" }).click();
  const menu = page.getByRole("menu", { name: "Add signal or group" });
  await expect(menu.getByRole("menuitem", { name: "Spacer", exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Spacer", exact: true }).click();

  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(beforeRevision) + 1));
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const spacerRow = page.locator("[data-row-id^='spacer_']");
  await expect(spacerRow).toHaveCount(1);
  await expect(page.getByTestId("inspector-spacers")).toBeVisible();
  await expect(surface).toHaveAttribute("data-render-counters", beforeCounters!);
});
