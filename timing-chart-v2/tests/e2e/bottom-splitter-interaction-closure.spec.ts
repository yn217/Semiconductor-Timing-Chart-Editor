import { expect, test, type Page } from "@playwright/test";

async function state(page: Page) {
  const shell = page.locator(".editor-shell");
  const host = page.getByTestId("cycle-surface");
  return {
    bottomHeight: Number(await shell.getAttribute("data-bottom-height")),
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
    sessionCounters: await host.getAttribute("data-session-counters"),
    renderCounters: await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };
}

async function dragSplitter(page: Page, fraction: number, deltaY: number): Promise<void> {
  const splitter = page.getByTestId("bottom-resizer");
  const box = await splitter.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * fraction;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY);
  await page.mouse.up();
}

async function assertLayoutEvidence(page: Page, beforeHeight: number): Promise<void> {
  const shell = page.locator(".editor-shell");
  const splitter = page.getByTestId("bottom-resizer");
  const bottom = page.getByTestId("bottom-editor");
  const viewport = page.getByTestId("cycle-viewport");
  const ruler = page.getByTestId("cycle-ruler");
  const height = Number(await shell.getAttribute("data-bottom-height"));
  const bottomBox = await bottom.boundingBox();
  const viewportBox = await viewport.boundingBox();
  const rulerBox = await ruler.boundingBox();
  const splitterBox = await splitter.boundingBox();
  expect(height).toBeGreaterThanOrEqual(180);
  expect(height).toBeLessThanOrEqual(420);
  expect(bottomBox).not.toBeNull();
  expect(viewportBox).not.toBeNull();
  expect(rulerBox).not.toBeNull();
  expect(splitterBox).not.toBeNull();
  expect(Math.abs(bottomBox!.height - height)).toBeLessThanOrEqual(1);
  expect(splitterBox!.height).toBeGreaterThanOrEqual(9);
  expect(viewportBox!.y + viewportBox!.height).toBeLessThanOrEqual(splitterBox!.y + 1);
  expect(rulerBox!.height).toBeGreaterThan(0);
  expect(height).not.toBe(beforeHeight);
}

test("dragging the dedicated splitter from left, center, and right resizes continuously without mutation", async ({ page }) => {
  for (const fraction of [0.1, 0.5, 0.9]) {
    await page.goto("/");
    const before = await state(page);
    const splitter = page.getByTestId("bottom-resizer");
    await expect(splitter).toHaveAttribute("aria-valuenow", String(before.bottomHeight));
    const initialBox = await splitter.boundingBox();
    expect(initialBox).not.toBeNull();
    const x = initialBox!.x + initialBox!.width * fraction;
    const y = initialBox!.y + initialBox!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 45);
    const intermediate = Number(await page.locator(".editor-shell").getAttribute("data-bottom-height"));
    expect(intermediate).toBeGreaterThan(before.bottomHeight);
    await page.mouse.move(x, y - 100);
    await page.mouse.up();
    await assertLayoutEvidence(page, before.bottomHeight);
    expect(await state(page)).toMatchObject({ revision: before.revision, history: before.history, dirty: before.dirty, sessionCounters: before.sessionCounters, renderCounters: before.renderCounters });
  }
});

test("clamps splitter height to the supported minimum and maximum", async ({ page }) => {
  await page.goto("/");
  await dragSplitter(page, 0.5, -1000);
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-height", "420");
  await dragSplitter(page, 0.5, 1000);
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-height", "180");
});

test("pointer capture and pointercancel clean up the splitter gesture", async ({ page }) => {
  await page.goto("/");
  const before = await state(page);
  const splitter = page.getByTestId("bottom-resizer");
  const box = await splitter.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 80);
  await expect(page.locator(".editor-shell")).not.toHaveAttribute("data-bottom-height", String(before.bottomHeight));
  const changedHeight = Number(await page.locator(".editor-shell").getAttribute("data-bottom-height"));
  await splitter.dispatchEvent("pointercancel", { pointerId: 1, button: 0, clientX: x, clientY: y - 80 });
  await page.mouse.move(x, y - 140);
  await page.mouse.up();
  const after = await state(page);
  expect(after.bottomHeight).toBe(changedHeight);
  expect(after.revision).toBe(before.revision);
  expect(after.history).toBe(before.history);
  expect(after.dirty).toBe(before.dirty);
  expect(after.sessionCounters).toBe(before.sessionCounters);
  expect(after.renderCounters).toBe(before.renderCounters);
});

test("native horizontal scrolling remains available beside the dedicated splitter", async ({ page }) => {
  await page.goto("/");
  const viewport = page.getByTestId("cycle-viewport");
  const overflow = await viewport.evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollLeft: element.scrollLeft,
  }));
  expect(overflow.overflowX).toBe("auto");
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; element.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(overflow.scrollLeft);
  const before = await state(page);
  await dragSplitter(page, 0.5, -80);
  expect(await state(page)).toMatchObject({ revision: before.revision, history: before.history, dirty: before.dirty, sessionCounters: before.sessionCounters, renderCounters: before.renderCounters });
});
