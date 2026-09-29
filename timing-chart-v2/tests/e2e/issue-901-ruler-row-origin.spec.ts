import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/** #901: with Time Group outline levels the ruler frame grows; the first Signal row must start below the ruler tick band, not under it. */
test("the first waveform row does not start inside the ruler band when Time Groups deepen the ruler", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/showcase/21_large_feature_showcase.tcd.json"));
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  const boxes = await page.evaluate(() => {
    const ruler = document.querySelector("[data-testid='cycle-ruler']")!.getBoundingClientRect();
    const owner = document.querySelector("[data-role='wave-owner'][data-signal-id='s.clk']")!.getBoundingClientRect();
    return { rulerBottom: ruler.bottom, rulerHeight: ruler.height, ownerTop: owner.top };
  });
  expect(boxes.rulerHeight, "fixture must have Time Group outline levels").toBeGreaterThan(40);
  // A Group header (32px) may sit under the tick band; the Signal row itself must be clear of the ruler (allow the 2px base overlap).
  expect(boxes.ownerTop).toBeGreaterThanOrEqual(boxes.rulerBottom - 3);
});
