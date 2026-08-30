import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function readMetrics(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
    const minimap = document.querySelector<HTMLElement>("[data-testid='minimap']")!;
    const content = minimap.querySelector<HTMLElement>(".minimap-rows")!;
    const indicator = minimap.querySelector<HTMLElement>("[data-testid='minimap-viewport']")!;
    const rect = indicator.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      scrollTop: viewport.scrollTop,
      scrollLeft: viewport.scrollLeft,
      maxScrollTop: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      maxScrollLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
      viewportHeight: viewport.clientHeight,
      viewportWidth: viewport.clientWidth,
      scrollHeight: viewport.scrollHeight,
      scrollWidth: viewport.scrollWidth,
      top: Number(minimap.dataset.viewportTop),
      ratio: Number(minimap.dataset.viewportRatio),
      left: Number(minimap.dataset.viewportLeft),
      width: Number(minimap.dataset.viewportWidth),
      rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      contentRect: { x: contentRect.x, y: contentRect.y, right: contentRect.right, bottom: contentRect.bottom, width: contentRect.width, height: contentRect.height },
      counters: JSON.parse(document.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.dataset.renderCounters ?? "null") as Record<string, number>,
      revision: document.querySelector<HTMLElement>("[data-testid='cycle-surface']")?.dataset.canonicalRevision,
      history: document.querySelector<HTMLElement>("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector<HTMLElement>("[data-testid='dirty-status']")?.textContent,
    };
  });
}

function expectIndicatorInside(metrics: Awaited<ReturnType<typeof readMetrics>>) {
  expect(metrics.rect.x).toBeGreaterThanOrEqual(metrics.contentRect.x - 1);
  expect(metrics.rect.y).toBeGreaterThanOrEqual(metrics.contentRect.y - 1);
  expect(metrics.rect.right).toBeLessThanOrEqual(metrics.contentRect.right + 1);
  expect(metrics.rect.bottom).toBeLessThanOrEqual(metrics.contentRect.bottom + 1);
}

function metricError(metrics: Awaited<ReturnType<typeof readMetrics>>) {
  const expectedTop = Math.min(1 - metrics.ratio, metrics.scrollTop / Math.max(1, metrics.maxScrollTop));
  const expectedLeft = Math.min(1 - metrics.width, metrics.scrollLeft / Math.max(1, metrics.maxScrollLeft));
  return Math.abs(metrics.top - expectedTop) + Math.abs(metrics.left - expectedLeft);
}

test("MiniMap viewport indicator follows live scroll, resize, pan and remount state", async ({ page }) => {
  await ready(page);
  const viewport = page.getByTestId("cycle-viewport");
  const minimap = page.getByTestId("minimap");
  const indicator = page.getByTestId("minimap-viewport");

  const initial = await readMetrics(page);
  expect(initial.maxScrollTop).toBeGreaterThan(0);
  expect(initial.maxScrollLeft).toBeGreaterThan(0);
  expectIndicatorInside(initial);
  expect(initial.top).toBe(0);
  expect(initial.left).toBe(0);

  await viewport.evaluate((element) => { element.scrollTop = Math.round((element.scrollHeight - element.clientHeight) * 0.45); });
  await expect.poll(async () => (await readMetrics(page)).scrollTop).toBeGreaterThan(0);
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const vertical = await readMetrics(page);
  expect(vertical.top).toBeCloseTo(Math.min(1 - vertical.ratio, vertical.scrollTop / vertical.maxScrollTop), 3);
  expect(vertical.rect.y).toBeCloseTo(vertical.contentRect.y + vertical.top * vertical.contentRect.height, 1);
  expectIndicatorInside(vertical);

  await viewport.evaluate((element) => { element.scrollLeft = Math.round((element.scrollWidth - element.clientWidth) * 0.55); });
  await expect.poll(async () => (await readMetrics(page)).scrollLeft).toBeGreaterThan(0);
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const horizontal = await readMetrics(page);
  expect(horizontal.left).toBeCloseTo(Math.min(1 - horizontal.width, horizontal.scrollLeft / horizontal.maxScrollLeft), 3);
  expect(horizontal.rect.x).toBeCloseTo(horizontal.contentRect.x + horizontal.left * horizontal.contentRect.width, 1);
  expectIndicatorInside(horizontal);

  await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight; element.scrollLeft = element.scrollWidth; });
  await expect.poll(async () => (await readMetrics(page)).scrollTop).toBeGreaterThan(0.5);
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const edge = await readMetrics(page);
  expect(edge.top + edge.ratio).toBeLessThanOrEqual(1.001);
  expect(edge.left + edge.width).toBeLessThanOrEqual(1.001);
  expectIndicatorInside(edge);

  const beforeResize = await readMetrics(page);
  await page.setViewportSize({ width: 1280, height: 620 });
  await expect.poll(async () => (await readMetrics(page)).viewportHeight).toBeLessThan(beforeResize.viewportHeight);
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const resized = await readMetrics(page);
  expect(resized.ratio).not.toBeCloseTo(beforeResize.ratio, 3);
  expect(resized.rect.height).not.toBeCloseTo(beforeResize.rect.height, 1);
  expectIndicatorInside(resized);

  const beforePan = await readMetrics(page);
  const beforePureView = { counters: beforePan.counters, revision: beforePan.revision, history: beforePan.history, dirty: beforePan.dirty };
  const box = await minimap.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height * 0.75, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await readMetrics(page)).scrollTop).toBeLessThan(beforePan.maxScrollTop);
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const afterCenterPan = await readMetrics(page);
  expect(afterCenterPan.scrollTop).toBeGreaterThan(0);
  expect(afterCenterPan.scrollLeft).toBeGreaterThan(0);
  expectIndicatorInside(afterCenterPan);
  expect(afterCenterPan.revision).toBe(beforePureView.revision);
  expect(afterCenterPan.history).toBe(beforePureView.history);
  expect(afterCenterPan.dirty).toBe(beforePureView.dirty);
  expect(afterCenterPan.counters.waveDromRenders).toBe(beforePureView.counters.waveDromRenders);
  expect(afterCenterPan.counters.localGeometryBuilds).toBe(beforePureView.counters.localGeometryBuilds);

  const afterPanBox = await minimap.boundingBox();
  expect(afterPanBox).not.toBeNull();
  await page.mouse.move(afterPanBox!.x + afterPanBox!.width - 2, afterPanBox!.y + afterPanBox!.height - 2);
  await page.mouse.down();
  await page.mouse.move(afterPanBox!.x + afterPanBox!.width - 1, afterPanBox!.y + afterPanBox!.height - 1, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => { const m = await readMetrics(page); return m.top + m.ratio; }).toBeGreaterThan(0.999);
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const afterCornerPan = await readMetrics(page);
  expect(afterCornerPan.left + afterCornerPan.width).toBeLessThanOrEqual(1.001);
  expectIndicatorInside(afterCornerPan);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const beforeZoom = await readMetrics(page);
  await page.getByLabel("Zoom preset").selectOption("150");
  await expect.poll(async () => (await readMetrics(page)).width).toBeLessThan(beforeZoom.width);
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const zoomed = await readMetrics(page);
  expect(zoomed.rect.width).toBeLessThan(beforeZoom.rect.width);
  expectIndicatorInside(zoomed);

  await page.getByTestId("home-minimap-toggle").uncheck();
  await expect(minimap).toBeHidden();
  const currentScroll = await viewport.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
  await page.getByTestId("home-minimap-toggle").check();
  await expect(page.getByTestId("minimap")).toBeVisible();
  await expect.poll(async () => metricError(await readMetrics(page))).toBeLessThan(0.002);
  const remounted = await readMetrics(page);
  expect(remounted.top).toBeCloseTo(Math.min(1 - remounted.ratio, currentScroll.top / remounted.maxScrollTop), 3);
  expect(remounted.left).toBeCloseTo(Math.min(1 - remounted.width, currentScroll.left / remounted.maxScrollLeft), 3);
  expectIndicatorInside(remounted);
  expect(await indicator.count()).toBe(1);
});
