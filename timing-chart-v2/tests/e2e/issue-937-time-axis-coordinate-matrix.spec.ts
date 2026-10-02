import { expect, test, type Page } from "@playwright/test";
import { revealRulerTick, timelineOwner } from "./timeline-scroll.js";
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

type Sample = { cycle: number; wave?: number; ruler?: number; grid?: number };

async function boundaries(page: Page, cycles: readonly number[]): Promise<Sample[]> {
  // The wave SVG is installed as a blob <image>; its gmark_N lines live in the blob's SVG source, mapped onto the owner box.
  return page.evaluate(async (requested) => {
    const svg = document.querySelector<SVGSVGElement>("svg[data-wave-owner='sig_cycle_clock']");
    const href = svg?.querySelector("image[data-wave-svg-image]")?.getAttribute("href");
    const marks: number[] = [];
    if (svg && href) {
      const source = new DOMParser().parseFromString(await (await fetch(href)).text(), "image/svg+xml").documentElement;
      const box = svg.getBoundingClientRect();
      const viewBox = source.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
      const width = viewBox && viewBox.length === 4 ? viewBox[2]! : Number(source.getAttribute("width"));
      const originX = Number(/translate\(([-\d.]+)/.exec(source.querySelector("#lanes_0")?.getAttribute("transform") ?? "")?.[1] ?? 0);
      for (const line of source.querySelectorAll("[id^='gmark_'][id$='_0']")) marks[Number(line.id.split("_")[1])] = box.left + (originX + Number(line.getAttribute("x1"))) * box.width / width;
    }
    const ticks = [...document.querySelectorAll<HTMLElement>(".cycle-ruler .cycle-tick")];
    const grid = [...document.querySelectorAll<HTMLElement>("[data-role='geometry-grid-line']")];
    const left = (element: Element | undefined): number | undefined => element?.getBoundingClientRect().left;
    return requested.map((cycle) => ({ cycle, wave: marks[cycle], ruler: left(ticks.find((item) => item.dataset.cycle === String(cycle))), grid: left(grid.find((item) => item.dataset.cycle === String(cycle))) }));
  }, cycles);
}

/** #937 pixel invariant: Ruler and Grid share the WaveDrom boundary X within 0.5px at every sampled boundary, and the error does not grow with cycle index. */
function assertTight(label: string, samples: readonly Sample[]): void {
  const deltas: number[] = [];
  for (const sample of samples) {
    expect(sample.wave, `${label}: missing wave boundary ${sample.cycle}`).toBeDefined();
    expect(sample.ruler, `${label}: missing ruler tick ${sample.cycle}`).toBeDefined();
    expect(sample.grid, `${label}: missing grid line ${sample.cycle}`).toBeDefined();
    expect(Math.abs(sample.ruler! - sample.wave!), `${label}: ruler vs wave @${sample.cycle}`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(sample.grid! - sample.wave!), `${label}: grid vs wave @${sample.cycle}`).toBeLessThanOrEqual(0.5);
    deltas.push(sample.ruler! - sample.wave!);
  }
  expect(Math.abs(deltas.at(-1)! - deltas[0]!), `${label}: error grew with cycle index`).toBeLessThanOrEqual(0.5);
}

/** Playhead and Range band edges must sit on the Ruler tick of the cycle they report. */
async function overlayVsRuler(page: Page, label: string): Promise<void> {
  const result = await page.evaluate(() => {
    const ticks = [...document.querySelectorAll<HTMLElement>(".cycle-ruler .cycle-tick")];
    const tickLeft = (cycle: string | undefined) => ticks.find((item) => item.dataset.cycle === cycle)?.getBoundingClientRect().left;
    const playhead = document.querySelector<HTMLElement>("[data-role='playhead']");
    const band = document.querySelector<HTMLElement>("[data-role='range-selection-band']:not([hidden])");
    return {
      playhead: playhead ? { x: playhead.getBoundingClientRect().left, tick: tickLeft(playhead.dataset.playheadCycle), cycle: playhead.dataset.playheadCycle } : undefined,
      band: band ? { x: band.getBoundingClientRect().left, tick: tickLeft(band.dataset.rangeStart), cycle: band.dataset.rangeStart } : undefined,
    };
  });
  for (const [name, item] of [["playhead", result.playhead], ["range", result.band]] as const) {
    if (!item || item.tick === undefined) continue; // the tick may be scrolled out of the virtualized ruler; only compare when both exist
    expect(Math.abs(item.x - item.tick), `${label}: ${name} vs ruler @${item.cycle} (x=${item.x} tick=${item.tick})`).toBeLessThanOrEqual(0.5);
  }
}

test("Ruler/Grid/Wave agree within 0.5px and Playhead/Range sit on the Ruler across zoom, scroll, resize and Fit", async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p937.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(longReferenceClockDocument())) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='128']")).toHaveCount(1);
  await waitForPresentation(page);
  await expect.poll(() => page.locator("svg[data-wave-owner='sig_cycle_clock'] image[data-wave-svg-image]").count(), { timeout: 30_000 }).toBe(1);
  const cycles = [0, 1, 10, 32, 64, 127, 128] as const;
  assertTight("initial", await boundaries(page, cycles));

  await revealRulerTick(page, 8);
  await page.getByTestId("cycle-ruler").locator("[data-cycle='8']").click();
  await expect(page.getByTestId("range-status")).toHaveText("Range: [8, 9)");
  await waitForPresentation(page);
  await overlayVsRuler(page, "initial overlay");

  await page.getByRole("button", { name: "View", exact: true }).click();
  for (const preset of ["50", "100", "200", "400", "800"]) {
    await page.getByLabel("Zoom preset").selectOption(preset);
    await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
    await waitForPresentation(page);
    assertTight(`zoom ${preset}`, await boundaries(page, cycles));
    await overlayVsRuler(page, `zoom ${preset}`);
  }
  await timelineOwner(page).evaluate((element) => { element.scrollLeft = Math.min(220, element.scrollWidth); });
  await waitForPresentation(page);
  assertTight("scrolled", await boundaries(page, cycles));
  await overlayVsRuler(page, "scrolled");
  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForPresentation(page);
  assertTight("resized", await boundaries(page, cycles));
  await overlayVsRuler(page, "resized");
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit Selection", exact: true }).click();
  await waitForPresentation(page);
  await overlayVsRuler(page, "fit selection");
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit All", exact: true }).click();
  await waitForPresentation(page);
  assertTight("fit all", await boundaries(page, cycles));
  await overlayVsRuler(page, "fit all");
});

test("Ruler/Grid/Wave stay within 0.5px when panel visibility changes the timeline width (Inspector, Signal Tree, Bottom, MiniMap)", async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p937p.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(longReferenceClockDocument())) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='128']")).toHaveCount(1);
  await expect.poll(() => page.locator("svg[data-wave-owner='sig_cycle_clock'] image[data-wave-svg-image]").count(), { timeout: 30_000 }).toBe(1);
  const cycles = [0, 1, 10, 32, 64, 127] as const;
  await waitForPresentation(page);
  assertTight("initial", await boundaries(page, cycles));

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const toggle = async (name: string, label: string) => {
    await ribbon.getByRole("button", { name, exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await page.waitForTimeout(250);
    await waitForPresentation(page);
    assertTight(label, await boundaries(page, cycles));
  };
  const widthBefore = await page.getByTestId("cycle-viewport").evaluate((element) => element.clientWidth);
  await toggle("Inspector", "Inspector hidden");
  expect(await page.getByTestId("cycle-viewport").evaluate((element) => element.clientWidth), "hiding the Inspector must change the timeline width (otherwise this check is vacuous)").toBeGreaterThan(widthBefore);
  await toggle("Inspector", "Inspector shown");
  await toggle("Signal Tree", "Signal Tree hidden");
  await toggle("Signal Tree", "Signal Tree shown");
  await toggle("Bottom Editor", "Bottom hidden");
  await toggle("Bottom Editor", "Bottom shown");
  await toggle("MiniMap", "MiniMap hidden");
  await toggle("MiniMap", "MiniMap shown");
  // Zoomed + scrolled after the layout churn.
  await page.getByLabel("Zoom preset").selectOption("200");
  await waitForPresentation(page);
  await timelineOwner(page).evaluate((element) => { element.scrollLeft = Math.min(300, element.scrollWidth); });
  await waitForPresentation(page);
  assertTight("200% scrolled after panel churn", await boundaries(page, cycles));
});

test("Ruler and Grid stay on the same X for every labelled cycle through fold -> unfold of a Time Group", async ({ page }) => {
  test.setTimeout(120_000);
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p937f.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(longReferenceClockDocument())) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='128']")).toHaveCount(1);
  await expect.poll(() => page.locator("svg[data-wave-owner='sig_cycle_clock'] image[data-wave-svg-image]").count(), { timeout: 30_000 }).toBe(1);

  const rulerVsGrid = async (label: string) => {
    await waitForPresentation(page);
    const rows = await page.evaluate(() => {
      const ticks = new Map([...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-cycle]")].map((tick) => [tick.dataset.cycle!, tick.getBoundingClientRect().left] as const));
      return [...document.querySelectorAll<HTMLElement>("[data-testid='geometry-grid'] [data-role='geometry-grid-line'][data-cycle]")]
        .flatMap((line) => ticks.has(line.dataset.cycle!) ? [{ cycle: line.dataset.cycle!, delta: line.getBoundingClientRect().left - ticks.get(line.dataset.cycle!)! }] : []);
    });
    expect(rows.length, `${label}: labelled cycles present in both Ruler and Grid`).toBeGreaterThan(10);
    for (const row of rows) expect(Math.abs(row.delta), `${label}: grid vs ruler @${row.cycle}`).toBeLessThanOrEqual(0.5);
    return rows.length;
  };
  await rulerVsGrid("before fold");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  await timeline.getByLabel("Timeline range end").fill("30");
  await timeline.getByLabel("Timeline range start").fill("20");
  await timeline.getByTestId("time-group-create").click();
  const groupId = (await timeline.locator("[data-time-group-id]").first().getAttribute("data-time-group-id"))!;
  await timeline.getByTestId(`time-group-collapse-${groupId}`).click();
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(1);
  await rulerVsGrid("folded");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("200");
  await expect(page.getByTestId("zoom-status")).toHaveText("200%");
  await rulerVsGrid("folded @200%");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();

  await timeline.getByTestId(`time-group-expand-${groupId}`).click(); // the same control flips from collapse to expand once folded
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(0);
  await rulerVsGrid("unfolded");
});
