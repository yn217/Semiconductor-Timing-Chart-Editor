import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function boundaries(page: Page, cycles: readonly number[]) {
  return page.evaluate((requestedCycles) => {
    const svg = [...document.querySelectorAll<SVGSVGElement>("[data-role='stable-waveform-surface'] svg")]
      .find((item) => item.dataset.waveOwner === "sig_cycle_clock");
    const marks = [...(svg?.querySelectorAll<SVGLineElement>("[id^='gmark_']") ?? [])];
    const ticks = [...document.querySelectorAll<HTMLElement>(".cycle-ruler .cycle-tick")];
    const grid = [...document.querySelectorAll<HTMLElement>("[data-role='geometry-grid-line']")];
    const left = (element: Element | undefined): number | undefined => element?.getBoundingClientRect().left;
    return requestedCycles.map((cycle) => {
      const wave = left(marks[cycle]);
      const ruler = left(ticks.find((item) => item.dataset.cycle === String(cycle)));
      const line = left(grid.find((item) => item.dataset.cycle === String(cycle)));
      return {
        cycle,
        wave,
        ruler,
        grid: line,
        rulerWaveDelta: wave === undefined || ruler === undefined ? undefined : ruler - wave,
        gridWaveDelta: wave === undefined || line === undefined ? undefined : line - wave,
      };
    });
  }, cycles);
}

function assertAligned(samples: Awaited<ReturnType<typeof boundaries>>): void {
  for (const sample of samples) {
    expect(sample.wave, `missing WaveDrom boundary for cycle ${sample.cycle}`).toBeDefined();
    expect(Math.abs(sample.rulerWaveDelta ?? Number.POSITIVE_INFINITY), `ruler drift at cycle ${sample.cycle}`).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.gridWaveDelta ?? Number.POSITIVE_INFINITY), `grid drift at cycle ${sample.cycle}`).toBeLessThanOrEqual(1);
  }
  const first = samples[0]!;
  const last = samples.at(-1)!;
  expect(Math.abs((last.rulerWaveDelta ?? Infinity) - (first.rulerWaveDelta ?? -Infinity))).toBeLessThanOrEqual(1);
  expect(Math.abs((last.gridWaveDelta ?? Infinity) - (first.gridWaveDelta ?? -Infinity))).toBeLessThanOrEqual(1);
}

test("keeps Grid and Ruler on the actual WaveDrom X geometry across scale and scroll", async ({ page }) => {
  await ready(page);
  const cycles = [0, 12, 24] as const;
  const before = {
    revision: await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  assertAligned(await boundaries(page, cycles));
  for (const preset of ["50", "150", "200"]) {
    await page.getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption(preset);
    await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
    assertAligned(await boundaries(page, cycles));
  }

  const viewport = page.getByTestId("cycle-viewport");
  await viewport.evaluate((element) => { element.scrollLeft = Math.min(220, element.scrollWidth); });
  assertAligned(await boundaries(page, cycles));

  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
