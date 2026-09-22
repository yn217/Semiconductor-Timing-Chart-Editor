import { expect, test, type Page } from "@playwright/test";
import { timelineOwner } from "./timeline-scroll.js";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #755 production acceptance for the viewport-bounded Canvas wave renderer (auto-selected for large documents, ?wave=svg|canvas forces).
 * 30 signals x 10,000 cycles = 300k > the 250k auto budget, so a plain "/" load must use Canvas with no per-cycle SVG.
 */
async function openLarge(page: Page, query = "/") {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto(query);
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 30, cycleCount: 10_000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p755-accept.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  return surface;
}
const viewportOf = (page: Page) => timelineOwner(page);
const scrollTo = async (page: Page, left: number) => {
  await viewportOf(page).evaluate((element, target) => { element.scrollLeft = target; element.dispatchEvent(new Event("scroll", { bubbles: true })); }, left);
  await expect.poll(() => viewportOf(page).evaluate((element) => element.scrollLeft)).toBe(left);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
};
/** The ruler thins its ticks, so resolve the mounted tick closest to a cycle and return its actual cycle + box. */
const nearestTick = async (page: Page, cycle: number) => {
  const data = await page.evaluate((target) => {
    const ticks = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle]"));
    let best: HTMLElement | undefined;
    // Only ticks inside the Timeline viewport (right of the fixed columns, left of the Inspector) can be clicked.
    for (const tick of ticks) if (tick.getBoundingClientRect().x >= 520 && tick.getBoundingClientRect().x <= 1300 && (best === undefined || Math.abs(Number(tick.dataset.sourceCycle) - target) < Math.abs(Number(best.dataset.sourceCycle) - target))) best = tick;
    if (!best) return undefined;
    const rect = best.getBoundingClientRect();
    return { cycle: Number(best.dataset.sourceCycle), x: rect.x, y: rect.y };
  }, cycle);
  expect(data).toBeDefined();
  return data!;
};
const canonical = (page: Page) => page.evaluate(() => [document.querySelector("[data-testid='revision-status']")?.textContent, document.querySelector("[data-testid='history-status']")?.textContent, document.querySelector("[data-testid='dirty-status']")?.textContent]);

test("large documents paint Canvas without per-cycle SVG; ?wave=svg forces the SVG fallback", async ({ page }) => {
  test.setTimeout(180_000);
  await openLarge(page);
  const counts = await page.evaluate(() => ({ canvases: document.querySelectorAll("[data-role='wave-owner'] canvas[data-wave-canvas]").length, svgs: document.querySelectorAll("[data-role='wave-owner'] svg").length, dom: document.querySelectorAll("*").length }));
  expect(counts.canvases).toBeGreaterThan(0);
  expect(counts.svgs).toBe(0);
  expect(counts.dom).toBeLessThan(20_000);
});

test("selection, hit-test, zoom, resize and sustained drag on the Canvas path keep the ruler and geometry aligned", async ({ page }) => {
  test.setTimeout(240_000);
  const surface = await openLarge(page);
  const before = await canonical(page);
  // Row selection.
  await surface.locator("[data-role='frozen-row']").first().click();
  await expect(page.getByTestId("selection-status")).not.toHaveText("None");
  // Far window hit-test: clicking on the waveform at cycle 5000's tick selects that cycle (not a window-relative one).
  await scrollTo(page, 5000 * 40 - 300);
  const tick = await nearestTick(page, 5000);
  const rowBox = (await surface.locator("[data-role='wave-owner']").first().boundingBox())!;
  await page.mouse.click(tick.x + 2, rowBox.y + rowBox.height / 2);
  await expect(surface).toHaveAttribute("data-selected-cycle", String(tick.cycle));
  // Zoom in/out keeps the selected cycle aligned with its ruler tick.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom Out", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  // Resize: wave owners keep a canvas and the viewport stays scrollable.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  expect(await page.locator("[data-role='wave-owner'] canvas[data-wave-canvas]").count()).toBeGreaterThan(0);
  // Sustained horizontal drag: many small scroll steps never blank the canvases or leave DOM growth behind.
  const domBefore = await page.evaluate(() => document.querySelectorAll("*").length);
  for (let step = 0; step < 60; step += 1) {
    await viewportOf(page).evaluate((element, index) => { element.scrollLeft = 20_000 + index * 970; element.dispatchEvent(new Event("scroll", { bubbles: true })); }, step);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const painted = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLCanvasElement>("[data-role='wave-owner'] canvas[data-wave-canvas]")).filter((canvas) => { const context = canvas.getContext("2d"); if (!context || canvas.width === 0) return false; const data = context.getImageData(0, 0, canvas.width, canvas.height).data; for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) return true; return false; }).length);
  expect(painted).toBeGreaterThan(0);
  const domAfter = await page.evaluate(() => document.querySelectorAll("*").length);
  expect(domAfter).toBeLessThan(domBefore * 1.5 + 200);
  // View-only throughout.
  expect(await canonical(page)).toEqual(before);
});

test("annotation anchoring, snap and edge counter resolve on the Canvas path in a far window", async ({ page }) => {
  test.setTimeout(240_000);
  const surface = await openLarge(page);
  await scrollTo(page, 3000 * 40 - 300);
  // Snap + boundary selection: a click just left of the cycle-3000 tick snaps to that boundary.
  const tick = await nearestTick(page, 3000);
  const row = (await surface.locator("[data-role='wave-owner']").nth(1).boundingBox())!;
  await page.mouse.click(tick.x - 3, row.y + row.height / 2);
  await expect(surface).toHaveAttribute("data-selected-cycle", String(tick.cycle));
  // Annotation created at the selected cycle is anchored on the Canvas geometry (same X as the ruler tick).
  await surface.locator("[data-role='frozen-row']").nth(1).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("marker");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const owner = surface.locator("[data-role='annotation-owner'][data-annotation-type='marker']").last();
  await expect(owner).toHaveCount(1);
  // The marker owner spans the whole overlay surface; its anchor handle is the element that sits on the anchored boundary.
  const annotationBox = (await owner.locator("[data-role='annotation-handle'][data-annotation-field='anchor']").first().boundingBox())!;
  expect(Math.abs(annotationBox.x - tick.x)).toBeLessThan(60);
  // Edge counter: the reference clock publishes edge numbers from the same analytic geometry.
  await surface.locator("[data-role='frozen-row']").first().click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("Clock edge counter show").check();
  await editor.getByTestId("apply-clock-edge-counter").click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await expect.poll(() => surface.locator("[data-role='clock-edge-number']").count(), { timeout: 30_000 }).toBeGreaterThan(0);
});

test("export of a large Canvas-rendered document still produces SVG from canonical data", async ({ page }) => {
  test.setTimeout(240_000);
  await openLarge(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pending = page.waitForEvent("download", { timeout: 120_000 });
  await dialog.getByRole("button", { name: "Export SVG" }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/\.(svg|png|pdf)$/i);
});

test("memory stays bounded over repeated far jumps (no canvas/DOM/heap leak)", async ({ page }) => {
  test.setTimeout(300_000);
  await openLarge(page);
  const heap = async () => (await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)) / 1_000_000;
  const stats = () => page.evaluate(() => ({ dom: document.querySelectorAll("*").length, canvases: document.querySelectorAll("canvas").length }));
  for (let warm = 0; warm < 4; warm += 1) await scrollTo(page, warm % 2 === 0 ? 30_000 : 200_000);
  const start = { ...(await stats()), heap: await heap() };
  for (let round = 0; round < 24; round += 1) await scrollTo(page, round % 2 === 0 ? 25_000 + round * 4_000 : 300_000 + round * 3_000);
  const end = { ...(await stats()), heap: await heap() };
  expect(end.canvases).toBeLessThanOrEqual(start.canvases + 2);
  expect(end.dom).toBeLessThan(start.dom * 1.3 + 100);
  if (start.heap > 0) expect(end.heap).toBeLessThan(start.heap * 2.5 + 60);
});
