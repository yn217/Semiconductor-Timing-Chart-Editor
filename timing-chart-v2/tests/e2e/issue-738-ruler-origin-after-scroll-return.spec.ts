import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// Classic (non-overlay) scrollbars so the Timeline track exposes a real thumb.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

// #738 (2026-09-21 screenshot): after scrolling far right and back to scrollLeft === 0 the Cycle ruler's first visible cell must be cycle 0.
async function open(page: Page, cycleCount: number) {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 30, cycleCount, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p738.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  return surface;
}
const owner = (page: Page) => page.locator("[data-role='timeline-viewport']");
const setLeft = async (page: Page, left: number) => { await owner(page).evaluate((element, target) => { element.scrollLeft = target; }, left); };
/** Leftmost ruler tick whose left edge is inside the visible Timeline, with the state values listed in the issue. */
const rulerState = (page: Page) => page.evaluate(() => {
  const o = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
  const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']")!;
  const frameLeft = ruler.getBoundingClientRect().left;
  const ticks = Array.from(ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]")).map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left })).filter((tick) => tick.x >= frameLeft - 1).sort((a, b) => a.x - b.x);
  const content = ruler.querySelector<HTMLElement>(".cycle-ruler-content")!;
  return { scrollLeft: o.scrollLeft, firstVisibleCycle: ticks[0]?.cycle, firstVisibleX: ticks[0]?.x, frameLeft, translate: content.style.translate, rulerScrollLeft: content.dataset.scrollLeft };
});

for (const cycles of [160, 10_000, 100_000]) {
  test(`ruler shows cycle 0 first after scrolling far right and returning to scrollLeft 0 (${cycles} cycles)`, async ({ page }) => {
    test.setTimeout(240_000);
    const surface = await open(page, cycles);
    const initial = await rulerState(page);
    expect(initial.firstVisibleCycle, "initial left edge").toBe(0);
    for (const far of [20_000, 150_000, 300_000]) {
      await setLeft(page, far);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      const away = await rulerState(page);
      if (cycles > 400) expect(away.firstVisibleCycle ?? 0, `far ${far}`).toBeGreaterThan(0);
      // Return: both an instant jump and (below) a stepped return.
      await setLeft(page, 0);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect.poll(async () => (await rulerState(page)).firstVisibleCycle, { message: `after return from ${far}: ${JSON.stringify(await rulerState(page))}` }).toBe(0);
      const back = await rulerState(page);
      expect(back.scrollLeft).toBe(0);
      // Cycle 0 starts at the WaveDrom origin margin (20.5px) inside the ruler frame.
      expect(Math.abs(back.firstVisibleX! - back.frameLeft - 20.5)).toBeLessThanOrEqual(2);
    }
    // Stepped return (sustained drag back to the left edge).
    await setLeft(page, 250_000);
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    for (let position = 250_000; position > 0; position -= 20_000) { await setLeft(page, Math.max(0, position)); await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))); }
    await setLeft(page, 0);
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect.poll(async () => (await rulerState(page)).firstVisibleCycle, { message: "after stepped return" }).toBe(0);
  });
}

// The screenshot came from a real scrollbar drag (many in-flight windows), not a programmatic jump: drag the native thumb far right and
// straight back with no settling between moves, repeatedly, and require the ruler to land on cycle 0 each time.
test.describe("real scrollbar drag", () => {
  test("native thumb drag away and back leaves the ruler on cycle 0", async ({ page }) => {
    test.setTimeout(300_000);
    const surface = await open(page, 10_000);
    const bar = page.getByTestId("timeline-hscroll");
    const geo = await bar.evaluate((element) => { const b = element.getBoundingClientRect(); return { left: b.left, right: b.right, bottom: b.bottom, h: element.offsetHeight - element.clientHeight, cw: element.clientWidth, sw: element.scrollWidth }; });
    test.skip(geo.h === 0, "needs a classic scrollbar");
    const ARROW = 17; const thumb = Math.max(20, (geo.cw - 2 * ARROW) * geo.cw / geo.sw); const track = geo.cw - 2 * ARROW - thumb;
    const y = geo.bottom - geo.h / 2; const startX = geo.left + ARROW + thumb / 2;
    for (const [steps, stops] of [[2, [1, 0]], [4, [0.6, 1, 0.3, 0]], [3, [1, 0.5, 0]], [6, [0.2, 0.9, 0.4, 1, 0.1, 0]]] as const) {
      await page.mouse.move(startX, y);
      await page.mouse.down();
      for (const stop of stops) await page.mouse.move(startX + track * stop, y, { steps });
      // A user keeps the button held until the thumb has reached the pointer; releasing while the (main-thread bound) scroll handling is still
      // catching up strands the thumb short of the edge (seen under load). The thumb must reach the left edge while held; it still fails if it never does.
      await expect.poll(() => page.locator("[data-role='timeline-viewport']").evaluate((element) => element.scrollLeft), { timeout: 60_000, message: "thumb reaches the left edge while the button is held" }).toBe(0);
      await page.mouse.up();
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect.poll(async () => { const s = await rulerState(page); return s.scrollLeft === 0 ? s.firstVisibleCycle : `scrollLeft ${s.scrollLeft}`; }, { message: "after drag back to the left edge" }).toBe(0);
    }
  });
});

for (const zoom of ["50", "200", "800"]) {
  test(`ruler returns to cycle 0 after scroll-away-and-return at zoom ${zoom}%`, async ({ page }) => {
    test.setTimeout(240_000);
    const surface = await open(page, 10_000);
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Zoom preset").selectOption(zoom);
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await setLeft(page, 0);
    await expect.poll(async () => (await rulerState(page)).firstVisibleCycle).toBe(0);
    for (const far of [5_000, 60_000, 400_000]) {
      await setLeft(page, far);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await setLeft(page, 0);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect.poll(async () => { const s = await rulerState(page); return s.scrollLeft === 0 ? s.firstVisibleCycle : `scrollLeft ${s.scrollLeft}`; }, { message: `zoom ${zoom} after return from ${far}` }).toBe(0);
    }
  });
}
