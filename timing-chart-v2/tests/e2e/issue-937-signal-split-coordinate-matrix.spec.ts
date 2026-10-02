import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
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
    // The same Signal's wave owner in each pane must start at the same X (same shared time domain).
    const ownerLefts = (paneTestId: string) => new Map([...document.querySelectorAll<HTMLElement>(`[data-testid='${paneTestId}'] [data-role='wave-owner'][data-signal-id]`)].map((owner) => [owner.dataset.signalId!, owner.getBoundingClientRect().left] as const));
    const upperOwners = ownerLefts("cycle-viewport"); const lowerOwners = ownerLefts("cycle-viewport-lower");
    const waves = [...upperOwners].filter(([id]) => lowerOwners.has(id)).map(([id, x]) => ({ cycle: `wave:${id}`, delta: lowerOwners.get(id)! - x }));
    return { wave: waves, tick: deltas(upper.ticks, lower.ticks), grid: deltas(upper.grid, lower.grid), counts: [upper.ticks.size, lower.ticks.size, upper.grid.size, lower.grid.size] };
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
    let wavesCompared = 0;
    const check = async (label: string) => {
      // The Lower pane mirrors Upper's scroll on the next frame(s); allow up to ~1s to settle before judging.
      let result = await ticksAndGrid(page);
      for (let attempt = 0; attempt < 20 && [...result.grid, ...result.wave].some((row) => Math.abs(row.delta) > 0.5); attempt += 1) {
        await page.waitForTimeout(50);
        result = await ticksAndGrid(page);
      }
      for (const [kind, rows] of [["grid", result.grid], ["wave", result.wave]] as const) {
        for (const row of rows) { compared += 1; if (kind === "wave") wavesCompared += 1; if (Math.abs(row.delta) > 0.5) failures.push(`${label}: ${kind} cycle ${row.cycle} Lower-Upper = ${row.delta.toFixed(2)}px`); }
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
    expect(wavesCompared, "at least one Signal wave owner is mounted in both panes").toBeGreaterThan(0);
    expect(failures, failures.slice(0, 12).join("\n")).toEqual([]);
  });
}

/** Lower Range band and Playhead follow the same shared time domain as Upper's, through zoom and scroll. */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`Signal Split Lower Range band and Playhead sit where Upper's do at ${size.width}x${size.height}`, async ({ page }) => {
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
    // Select Range [8,9) from the Upper Ruler (also moves the Playhead).
    await page.getByTestId("cycle-ruler").locator("[data-cycle='8']").first().click();
    await expect(page.getByTestId("range-status")).toHaveText("Range: [8, 9)");
    const owner = page.getByTestId("cycle-viewport").locator("[data-role='timeline-viewport']");

    const readX = () => page.evaluate(() => {
      const left = (selector: string) => { const element = document.querySelector<HTMLElement>(selector); return element && !element.hidden ? element.getBoundingClientRect().left : undefined; };
      return {
        bandUpper: left("[data-testid='range-selection-band']"), bandLower: left("[data-testid='range-selection-band-lower']"),
        playUpper: left("[data-testid='cycle-ruler'] [data-role='playhead']"), playLower: left("[data-testid='cycle-ruler-lower'] [data-role='playhead']"),
      };
    });
    const failures: string[] = [];
    let compared = 0;
    const check = async (label: string) => {
      let result = await readX();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const bad = (a?: number, b?: number) => a !== undefined && b !== undefined && Math.abs(a - b) > 0.5;
        if (!bad(result.bandUpper, result.bandLower) && !bad(result.playUpper, result.playLower)) break;
        await page.waitForTimeout(50);
        result = await readX();
      }
      if (result.bandUpper !== undefined && result.bandLower !== undefined) { compared += 1; if (Math.abs(result.bandUpper - result.bandLower) > 0.5) failures.push(`${label}: range band Lower-Upper = ${(result.bandLower - result.bandUpper).toFixed(2)}px`); }
      if (result.playUpper !== undefined && result.playLower !== undefined) { compared += 1; if (Math.abs(result.playUpper - result.playLower) > 0.5) failures.push(`${label}: playhead Lower-Upper = ${(result.playLower - result.playUpper).toFixed(2)}px`); }
    };

    await check("initial");
    for (const preset of ["50", "200", "400", "800"]) {
      await page.getByLabel("Zoom preset").selectOption(preset);
      await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
      await owner.evaluate((element) => { element.scrollLeft = 0; });
      await check(`zoom ${preset}% @left`);
      await owner.evaluate((element) => { element.scrollLeft = Math.floor(element.scrollWidth / 3); });
      await check(`zoom ${preset}% @scrolled`);
    }
    expect(compared, "Lower and Upper Range band/Playhead were both visible and compared").toBeGreaterThan(2);
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

/** GUI-SIGNAL-SPLIT acceptance: vertical scroll is independent per pane while the horizontal time domain stays shared. */
test("Signal Split keeps vertical scroll independent per pane and the horizontal origin shared", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 100, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "split-vertical.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(base)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "100", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  await expect(page.getByTestId("cycle-viewport-lower")).toBeVisible();
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  const upper = page.getByTestId("cycle-viewport");
  const lower = page.getByTestId("cycle-viewport-lower");
  const tops = () => Promise.all([upper.evaluate((element) => element.scrollTop), lower.evaluate((element) => element.scrollTop)]);
  expect(await upper.evaluate((element) => element.scrollHeight - element.clientHeight), "Upper really has vertical overflow").toBeGreaterThan(200);
  expect(await lower.evaluate((element) => element.scrollHeight - element.clientHeight), "Lower really has vertical overflow").toBeGreaterThan(200);

  await upper.evaluate((element) => { element.scrollTop = 400; });
  await expect.poll(async () => (await tops())[0]).toBe(400);
  expect((await tops())[1], "scrolling Upper must not move Lower").toBe(0);
  await lower.evaluate((element) => { element.scrollTop = 250; });
  await expect.poll(async () => (await tops())[1]).toBe(250);
  expect((await tops())[0], "scrolling Lower must not move Upper").toBe(400);

  // The shared horizontal origin is unaffected by the vertical scrolls.
  const result = await ticksAndGrid(page);
  for (const row of [...result.grid, ...result.wave]) expect(Math.abs(row.delta), `${row.cycle} Lower vs Upper X after vertical scrolls`).toBeLessThanOrEqual(0.5);
});
