import { expect, test, type Page } from "@playwright/test";

/**
 * #937 (Transaction side of the coordinate matrix): Transaction bars and Bookmark markers must sit on the Ruler's time axis at every
 * zoom, at scroll origin AND far-right scroll. Expected X comes from a linear fit through the mounted Ruler ticks, so the bars are
 * checked against the Ruler, not against their own layout.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

async function measure(page: Page) {
  return page.evaluate(() => {
    const ticks = [...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle]")]
      .map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left }))
      .sort((a, b) => a.cycle - b.cycle);
    if (ticks.length < 2) return { ticks: ticks.length };
    const first = ticks[0]!; const last = ticks.at(-1)!;
    const slope = (last.x - first.x) / (last.cycle - first.cycle);
    const expectedX = (cycle: number) => first.x + (cycle - first.cycle) * slope;
    const bar = document.querySelector<HTMLElement>("[data-testid='transaction-lanes'] [data-transaction-id='demo_txn_read']");
    const barBox = bar?.getBoundingClientRect();
    const markers = [...document.querySelectorAll<HTMLElement>(".transaction-bookmark-markers [data-bookmark-id]")].map((marker) => ({
      id: marker.dataset.bookmarkId!, cycle: Number(marker.dataset.sourceCycle), box: marker.getBoundingClientRect(),
    }));
    return {
      ticks: ticks.length, slope,
      bar: barBox ? { startDelta: barBox.left - expectedX(10), endDelta: barBox.right - expectedX(60) } : undefined,
      // a marker button is centred on its boundary: compare its centre
      markers: markers.map((marker) => ({ id: marker.id, cycle: marker.cycle, delta: marker.box.left + marker.box.width / 2 - expectedX(marker.cycle) })),
    };
  });
}

for (const size of sizes) {
  test(`Transaction bars and Bookmark markers stay on the Ruler across zoom and scroll at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    const owner = page.locator("[data-testid='cycle-viewport']");

    const failures: string[] = [];
    let checked = 0;
    const check = async (label: string) => {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const result = await measure(page);
      if (!("slope" in result) || result.slope === undefined) { failures.push(`${label}: ruler has ${result.ticks} ticks`); return; }
      const deltas: Array<[string, number]> = [];
      if (result.bar) deltas.push(["bar start", result.bar.startDelta], ["bar end", result.bar.endDelta]);
      for (const marker of result.markers ?? []) deltas.push([`bookmark ${marker.id}@${marker.cycle}`, marker.delta]);
      for (const [name, delta] of deltas) { checked += 1; if (Math.abs(delta) > 2) failures.push(`${label}: ${name} off the ruler by ${delta.toFixed(2)}px`); }
    };

    await check("initial");
    for (const preset of ["50", "200", "400", "800"]) {
      await page.getByLabel("Zoom preset").selectOption(preset);
      await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
      await owner.evaluate((el) => { el.scrollLeft = 0; });
      await check(`zoom ${preset}% @left`);
      await owner.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await check(`zoom ${preset}% @far-right`);
      await owner.evaluate((el) => { el.scrollLeft = Math.floor(el.scrollWidth / 2); });
      await check(`zoom ${preset}% @middle`);
    }
    expect(checked, "at least some bars/markers were mounted and compared").toBeGreaterThan(4);
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
