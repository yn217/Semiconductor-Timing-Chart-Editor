import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

function longReferenceClockDocument() {
  const clockId = "sig_cycle_clock";
  return {
    formatVersion: 2,
    document: {
      id: "geometry-closure",
      title: "Geometry closure",
      header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
      footer: { figureNumber: "", revision: "V2", text: "" },
    },
    timeline: { start: 0, end: 128, cycleCount: 128, timeBase: "cycle", referenceClock: clockId, edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_main", name: "Main", rows: [clockId, "sig_data"] }],
    signals: [
      { id: clockId, name: "CLK", type: "clock", role: "input", source: { instancePath: [], signalName: "clk" }, display: { name: "CLK" }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } },
      { id: "sig_data", name: "DATA", type: "binary", role: "input", source: { instancePath: [], signalName: "data" }, display: { name: "DATA" }, values: [{ start: 0, value: 0 }, { start: 64, value: 1 }] },
    ],
    bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  };
}

async function waitForPresentation(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
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
  const host = page.getByTestId("cycle-surface");
  const fileInput = page.locator("input[type='file'][accept='.json,.tcd']");
  await fileInput.setInputFiles({ name: "geometry-closure.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(longReferenceClockDocument())) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator("[data-view-mode='Cycle']")).toBeVisible();
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='128']")).toHaveCount(1);
  await waitForPresentation(page);
  const cycles = [0, 12, 24] as const;
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  assertAligned(await boundaries(page, cycles));
  await page.getByRole("button", { name: "View", exact: true }).click();
  for (const preset of ["50", "100", "200", "400", "800"]) {
    await page.getByLabel("Zoom preset").selectOption(preset);
    await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
    await waitForPresentation(page);
    assertAligned(await boundaries(page, [0, 2, 10, 32, 64, 128]));
  }

  const viewport = page.getByTestId("cycle-viewport");
  await viewport.evaluate((element) => { element.scrollLeft = Math.min(220, element.scrollWidth); });
  await waitForPresentation(page);
  assertAligned(await boundaries(page, [0, 2, 10, 32, 64, 128]));

  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForPresentation(page);
  assertAligned(await boundaries(page, [0, 2, 10, 32, 64, 128]));

  await page.getByTestId("cycle-ruler").locator("[data-cycle='8']").click();
  await expect(page.getByTestId("range-status")).toHaveText("Range: [8, 9)");
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit Selection", exact: true }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("800%");
  await waitForPresentation(page);
  assertAligned(await boundaries(page, [0, 2, 8, 10, 32, 64, 128]));

  await page.getByTestId("ribbon").getByRole("button", { name: "Fit All", exact: true }).click();
  await expect(page.getByTestId("zoom-status")).not.toHaveText("800%");
  await waitForPresentation(page);
  assertAligned(await boundaries(page, [0, 2, 10, 32, 64, 128]));

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
