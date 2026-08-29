import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function tick(page: Page, cycle: number): Promise<Locator> {
  return page.getByTestId("cycle-ruler").locator(`[data-cycle='${cycle}']`);
}

async function assertBand(page: Page, start: number, end: number): Promise<void> {
  const startBox = await (await tick(page, start)).boundingBox();
  const endBox = await (await tick(page, end)).boundingBox();
  const band = page.getByTestId("range-selection-band");
  const rulerBand = page.getByTestId("range-preview");
  await expect(band).toHaveAttribute("data-range-start", String(start));
  await expect(band).toHaveAttribute("data-range-end", String(end));
  const bandBox = await band.boundingBox();
  const rulerBandBox = await rulerBand.boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();
  expect(bandBox).not.toBeNull();
  expect(rulerBandBox).not.toBeNull();
  expect(Math.abs(bandBox!.x - startBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((bandBox!.x + bandBox!.width) - endBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(rulerBandBox!.x - startBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((rulerBandBox!.x + rulerBandBox!.width) - endBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(rulerBandBox!.x - bandBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((rulerBandBox!.x + rulerBandBox!.width) - (bandBox!.x + bandBox!.width))).toBeLessThanOrEqual(1);
  await expect(band).toHaveAttribute("data-source", "ruler-local-geometry");
  await expect(rulerBand).toHaveAttribute("data-source", "ruler-local-geometry");
}

async function dragBetweenTicks(page: Page, start: number, end: number, y: number): Promise<void> {
  const startBox = await (await tick(page, start)).boundingBox();
  const endBox = await (await tick(page, end)).boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();
  await page.mouse.move(startBox!.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + 1, y);
  await page.mouse.up();
}

test("does not render a selection overlay before a range is selected", async ({ page }) => {
  await ready(page);
  await expect(page.getByTestId("range-selection-band")).toBeHidden();
  await expect(page.getByTestId("range-preview")).toBeHidden();
});

test("renders one-cycle and dragged half-open selection bands without mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const wave = surface.locator("[data-role='stable-waveform-surface']");
  const request = surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']");
  const frozen = surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const viewport = page.getByTestId("cycle-viewport");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.getAttribute("data-render-counters"),
  };
  const requestBox = await request.boundingBox();
  const waveBox = await wave.boundingBox();
  const frozenBox = await frozen.boundingBox();
  expect(requestBox).not.toBeNull();
  expect(waveBox).not.toBeNull();
  expect(frozenBox).not.toBeNull();

  await (await tick(page, 3)).click();
  await assertBand(page, 3, 4);
  const oneCycle = await page.getByTestId("range-selection-band").boundingBox();
  expect(oneCycle!.width).toBeGreaterThan(0);
  expect(oneCycle!.x).toBeGreaterThanOrEqual(frozenBox!.x + frozenBox!.width - 1);
  const playhead = page.getByTestId("playhead");
  await expect(playhead).toBeVisible();
  expect((await page.getByTestId("range-selection-band").boundingBox())!.width).toBeGreaterThan((await playhead.boundingBox())!.width);

  await dragBetweenTicks(page, 2, 5, requestBox!.y + requestBox!.height / 2);
  await expect(page.getByTestId("range-status")).toHaveText("Range: [2, 5)");
  await assertBand(page, 2, 5);
  await dragBetweenTicks(page, 5, 2, waveBox!.y + 8);
  await expect(page.getByTestId("range-status")).toHaveText("Range: [2, 5)");
  await assertBand(page, 2, 5);

  const terminalBox = await (await tick(page, 24)).boundingBox();
  expect(terminalBox).not.toBeNull();
  await dragBetweenTicks(page, 2, 24, waveBox!.y + 8);
  await expect(page.getByTestId("range-status")).toHaveText("Range: [2, 24)");
  await assertBand(page, 2, 24);
  expect((await page.getByTestId("range-selection-band").boundingBox())!.x + (await page.getByTestId("range-selection-band").boundingBox())!.width).toBeCloseTo(terminalBox!.x, 0);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  expect(await surface.getAttribute("data-render-counters")).toBe(before.counters);
  expect(await viewport.evaluate((element) => element.scrollWidth)).toBeGreaterThanOrEqual(await viewport.evaluate((element) => element.clientWidth));
});

test("keeps range band edges aligned after horizontal scroll and 50/100/150/200% zoom", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const viewport = page.getByTestId("cycle-viewport");
  await (await tick(page, 8)).click();
  await (await tick(page, 12)).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("range-status")).toHaveText("Range: [8, 13)");

  const assertCurrent = async () => assertBand(page, 8, 13);
  for (const preset of ["50", "100", "150", "200"]) {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption(preset);
    await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
    await assertCurrent();
    await viewport.evaluate((element) => { element.scrollLeft = Math.min(220, element.scrollWidth); });
    await assertCurrent();
    const band = await page.getByTestId("range-selection-band").boundingBox();
    const frozen = await surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").boundingBox();
    expect(band).not.toBeNull();
    expect(frozen).not.toBeNull();
    expect(band!.x).toBeGreaterThanOrEqual(frozen!.x + frozen!.width - 1);
  }
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("keeps the selected range overlay aligned after Cycle Insert", async ({ page }) => {
  await ready(page);
  await (await tick(page, 3)).click();
  await (await tick(page, 5)).click({ modifiers: ["Shift"] });
  await assertBand(page, 3, 6);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByTestId("timeline-editor").getByRole("button", { name: "Insert before", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

  const start = Number(await page.getByTestId("range-selection-band").getAttribute("data-range-start"));
  const end = Number(await page.getByTestId("range-selection-band").getAttribute("data-range-end"));
  expect(end).toBeGreaterThan(start);
  await assertBand(page, start, end);
});
