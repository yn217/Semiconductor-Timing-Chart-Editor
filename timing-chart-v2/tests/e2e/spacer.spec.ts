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
  // One row per layer (left tree, frozen labels, timing); the MiniMap mirrors it. Assert the frozen-label row (one Spacer).
  const spacerRow = page.locator("[data-role='frozen-row'][data-row-id^='spacer_']");
  await expect(spacerRow).toHaveCount(1);
  await expect(page.getByTestId("inspector-spacers")).toBeVisible();
  // A Spacer is not a wave: WaveDrom renders / geometry builds stay put. The taller Cycle window (#756) also mounts the new Spacer row,
  // which is exactly one extra row position update.
  const before = JSON.parse(beforeCounters!) as Record<string, number>;
  await expect.poll(async () => JSON.parse((await surface.getAttribute("data-render-counters"))!) as Record<string, number>).toEqual({ ...before, rowPositionUpdates: before.rowPositionUpdates! + 1 });
});
