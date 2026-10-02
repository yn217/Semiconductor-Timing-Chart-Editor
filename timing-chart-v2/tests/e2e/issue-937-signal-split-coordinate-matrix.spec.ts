import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

/**
 * #937 (Signal Split): the Upper and Lower panes share ONE horizontal time domain. Every cycle's Grid line X in the Lower pane must match the
 * Upper pane's, across zoom presets, horizontal scroll and far-right scroll. (The Lower Ruler carries no ticks of its own: it only mirrors the
 * Upper Ruler's scroll transform, asserted in signal-split.spec.ts.) Regression: the Lower Grid was not in the zoom-scaled set, so it stayed at
 * the 100% pitch after any zoom change.
 */
async function ticksAndGrid(page: Page) {
  return page.evaluate(() => {
    const pick = (rulerId: string, gridId: string) => ({
      ticks: new Map([...document.querySelectorAll<HTMLElement>(`[data-testid='${rulerId}'] .cycle-tick[data-cycle]`)].map((tick) => [tick.dataset.cycle!, tick.getBoundingClientRect().left] as const)),
      grid: new Map([...document.querySelectorAll<HTMLElement>(`[data-testid='${gridId}'] [data-role='geometry-grid-line'][data-cycle]`)].map((line) => [line.dataset.cycle!, line.getBoundingClientRect().left] as const)),
    });
    const upper = pick("cycle-ruler", "geometry-grid"); const lower = pick("cycle-ruler-lower", "geometry-grid-lower");
    const deltas = (a: Map<string, number>, b: Map<string, number>) => [...a].filter(([cycle]) => b.has(cycle)).map(([cycle, x]) => ({ cycle, delta: b.get(cycle)! - x }));
    return { tick: deltas(upper.ticks, lower.ticks), grid: deltas(upper.grid, lower.grid), counts: [upper.ticks.size, lower.ticks.size, upper.grid.size, lower.grid.size] };
  });
}

for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`Signal Split Upper/Lower Rulers and Grids share one time domain at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("view-panel-signal-split").click();
    await expect(page.getByTestId("cycle-viewport-lower")).toBeVisible();
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    const owner = page.getByTestId("cycle-viewport").locator("[data-role='timeline-viewport']");

    const failures: string[] = [];
    let compared = 0;
    const check = async (label: string) => {
      // The Lower pane mirrors Upper's scroll on the next frame(s); allow up to ~1s to settle before judging.
      let result = await ticksAndGrid(page);
      for (let attempt = 0; attempt < 20 && result.grid.some((row) => Math.abs(row.delta) > 0.5); attempt += 1) {
        await page.waitForTimeout(50);
        result = await ticksAndGrid(page);
      }
      for (const [kind, rows] of [["grid", result.grid]] as const) {
        for (const row of rows) { compared += 1; if (Math.abs(row.delta) > 0.5) failures.push(`${label}: ${kind} cycle ${row.cycle} Lower-Upper = ${row.delta.toFixed(2)}px`); }
      }
    };

    await check("initial");
    for (const preset of ["50", "200", "400", "800"]) {
      await page.getByLabel("Zoom preset").selectOption(preset);
      await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
      await owner.evaluate((element) => { element.scrollLeft = 0; });
      await check(`zoom ${preset}% @left`);
      await owner.evaluate((element) => { element.scrollLeft = Math.floor(element.scrollWidth / 2); });
      await check(`zoom ${preset}% @middle`);
      await owner.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      await check(`zoom ${preset}% @far-right`);
    }
    expect(compared, "Upper and Lower share enough labelled grid lines to compare").toBeGreaterThan(20);
    expect(failures, failures.slice(0, 12).join("\n")).toEqual([]);
  });
}
