import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("a collapsed TimeGroup genuinely compresses the axis instead of overlaying a band on the original width", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ruler = page.getByTestId("cycle-ruler");
  const dataSvg = surface.locator("[data-signal-id='sig_cycle_data'] > svg");

  const widthBefore = Number(await dataSvg.evaluate((el) => el.getAttribute("width")));
  const tickCountBefore = await ruler.locator("[data-cycle]").count();
  const historyBefore = await page.getByTestId("history-status").textContent();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Axis Break", exact: true }).click(); // collapses the default Timeline range [2, 4)
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  // the waveform itself is physically narrower — WaveDrom rendered fewer cycles, not the same
  // width with a band drawn over it.
  const widthAfter = Number(await dataSvg.evaluate((el) => el.getAttribute("width")));
  expect(widthAfter).toBeLessThan(widthBefore);

  // the Ruler has exactly 2 fewer ticks (cycles 2 and 3 are gone, not merely covered).
  const tickCountAfter = await ruler.locator("[data-cycle]").count();
  expect(tickCountAfter).toBe(tickCountBefore - 2);
  await expect(ruler.locator("[data-cycle='2']")).toHaveCount(0);
  await expect(ruler.locator("[data-cycle='3']")).toHaveCount(0);
  // cycle 4's true source label survives the compression (labelAnchors-backed labeling).
  await expect(ruler.locator("[data-cycle='4']")).toHaveCount(1);
  const grid = page.getByTestId("geometry-grid");
  await expect(grid.locator("[data-role='geometry-grid-line'][data-cycle='4']")).toHaveCount(1);
  await expect(grid.locator("[data-role='geometry-grid-line'][data-cycle='2']")).toHaveCount(0);
  await expect(grid.locator("[data-role='geometry-grid-line'][data-cycle='3']")).toHaveCount(0);

  // this is a genuine structural change to the document (unlike Zoom), so a fresh WaveDrom
  // render and one History entry are expected — not a delta-0 view-only operation.
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);

  // Undo restores the original, uncompressed axis exactly.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const widthRestored = Number(await dataSvg.evaluate((el) => el.getAttribute("width")));
  expect(widthRestored).toBe(widthBefore);
  await expect(ruler.locator("[data-cycle]")).toHaveCount(tickCountBefore);
  await expect(ruler.locator("[data-cycle='2']")).toHaveCount(1);
  await expect(ruler.locator("[data-cycle='3']")).toHaveCount(1);
});
