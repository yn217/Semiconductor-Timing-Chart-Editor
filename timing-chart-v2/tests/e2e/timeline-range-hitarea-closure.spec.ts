import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

type Point = Readonly<{ x: number; y: number }>;

async function cyclePoint(page: Page, cycle: number): Promise<Point> {
  const box = await page.getByTestId("cycle-ruler").locator(`[data-cycle='${cycle}']`).boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + 1, y: box!.y + box!.height / 2 };
}

async function dragRange(page: Page, start: Point, end: Point): Promise<void> {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

async function viewState(page: Page) {
  const host = page.getByTestId("cycle-surface");
  return {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };
}

test("accepts range drag from waveform, semantic row, comment row, blank timing space, and ruler", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const wave = host.locator("[data-role='stable-waveform-surface']");
  const semanticRow = host.locator("[data-role='timing-row'][data-kind='timing']").first();
  const viewport = page.getByTestId("cycle-viewport");
  const waveBox = await wave.boundingBox();
  const semanticBox = await semanticRow.boundingBox();
  const viewportBox = await viewport.boundingBox();
  expect(waveBox).not.toBeNull();
  expect(semanticBox).not.toBeNull();
  expect(viewportBox).not.toBeNull();

  const start = await cyclePoint(page, 3);
  const end = await cyclePoint(page, 8);

  // Points inside the visible Timeline area: the waveform surface extends under the Bottom editor and the horizontal scrollbar overlay.
  const visibleBottom = (await page.getByTestId("bottom-editor").boundingBox())!.y - 24;
  for (const y of [waveBox!.y + 40, semanticBox!.y + semanticBox!.height / 2, visibleBottom]) {
    await dragRange(page, { x: start.x, y }, { x: end.x, y });
    await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
    await expect(page.getByLabel("Timeline range end")).toHaveValue("8");
    await expect(host).not.toHaveAttribute("data-range-drag", "active");
  }

  await dragRange(page, { x: start.x, y: start.y }, { x: end.x, y: start.y });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("8");

  await page.goto("/?visual-reference");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const commentRow = page.getByTestId("cycle-surface").locator("[data-role='timing-row'][data-kind='comment']").first();
  const commentBox = await commentRow.boundingBox();
  expect(commentBox).not.toBeNull();
  const commentStart = await cyclePoint(page, 2);
  const commentEnd = await cyclePoint(page, 6);
  await dragRange(page, { x: commentStart.x, y: commentBox!.y + commentBox!.height / 2 }, { x: commentEnd.x, y: commentBox!.y + commentBox!.height / 2 });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("6");
  await expect(page.getByTestId("cycle-surface")).not.toHaveAttribute("data-range-drag", "active");

  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const normalHost = page.getByTestId("cycle-surface");
  const normalBefore = await viewState(page);
  const normalStart = await cyclePoint(page, 7);
  const normalEnd = await cyclePoint(page, 4);
  const normalWaveBox = await normalHost.locator("[data-role='stable-waveform-surface']").boundingBox();
  expect(normalWaveBox).not.toBeNull();
  await dragRange(page, { x: normalStart.x, y: normalWaveBox!.y + 8 }, { x: normalEnd.x, y: normalWaveBox!.y + 8 });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("4");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("7");
  expect(await viewState(page)).toEqual(normalBefore);
});

test("keeps the preview boundary and current-cycle playhead on one pointer snapshot", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const wave = host.locator("[data-role='stable-waveform-surface']");
  const waveBox = await wave.boundingBox();
  expect(waveBox).not.toBeNull();
  const start = await cyclePoint(page, 2);
  const first = await cyclePoint(page, 6);
  const second = await cyclePoint(page, 9);
  const y = waveBox!.y + 40;
  await page.mouse.move(start.x, y);
  await page.mouse.down();
  for (const point of [first, second]) {
    await page.mouse.move(point.x, y);
    await expect(host).toHaveAttribute("data-range-drag", "active");
    const previewCycle = await host.getAttribute("data-range-preview-cycle");
    expect(previewCycle).toMatch(/^(6|9)$/);
    await expect(page.getByTestId("playhead")).toHaveAttribute("data-playhead-cycle", previewCycle!);
  }
  await page.mouse.up();
  await expect(host).not.toHaveAttribute("data-range-preview-cycle");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("keeps direct range interaction geometry-backed after scroll and zoom", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const viewport = page.getByTestId("cycle-viewport");
  const before = await viewState(page);
  await viewport.evaluate(async (element) => { element.scrollLeft = Math.min(180, element.scrollWidth); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  const scrolledStart = await cyclePoint(page, 5);
  const scrolledEnd = await cyclePoint(page, 9);
  const scrolledWave = await host.locator("[data-role='stable-waveform-surface']").boundingBox();
  expect(scrolledWave).not.toBeNull();
  await dragRange(page, { x: scrolledStart.x, y: scrolledWave!.y + 8 }, { x: scrolledEnd.x, y: scrolledWave!.y + 8 });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("5");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("9");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const zoomStart = await cyclePoint(page, 8);
  const zoomEnd = await cyclePoint(page, 12);
  const zoomWave = await host.locator("[data-role='stable-waveform-surface']").boundingBox();
  expect(zoomWave).not.toBeNull();
  await dragRange(page, { x: zoomStart.x, y: zoomWave!.y + 8 }, { x: zoomEnd.x, y: zoomWave!.y + 8 });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("8");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("12");
  expect(await viewState(page)).toEqual(before);
});

test("normalizes reverse drags, supports Shift extension, and reaches the terminal boundary", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const wave = await host.locator("[data-role='stable-waveform-surface']").boundingBox();
  expect(wave).not.toBeNull();
  const cycle3 = await cyclePoint(page, 3);
  const cycle8 = await cyclePoint(page, 8);
  const cycle10 = await cyclePoint(page, 10);
  const terminal = await cyclePoint(page, 24);
  const y = wave!.y + 40;

  await dragRange(page, { x: cycle8.x, y }, { x: cycle3.x, y });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("8");

  await page.keyboard.down("Shift");
  await dragRange(page, { x: cycle8.x, y }, { x: cycle10.x, y });
  await page.keyboard.up("Shift");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("10");

  await dragRange(page, { x: cycle3.x, y }, { x: terminal.x, y });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("24");
});

test("does not start a range gesture from dedicated controls and cancels transient preview", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const viewport = page.getByTestId("cycle-viewport");
  const before = await viewState(page);
  const leftRow = host.locator("[data-role='left-row']").first();
  await leftRow.click();
  await expect(host).not.toHaveAttribute("data-range-drag", "active");
  expect(await viewState(page)).toEqual(before);

  const start = await cyclePoint(page, 2);
  const end = await cyclePoint(page, 7);
  const wave = await host.locator("[data-role='stable-waveform-surface']").boundingBox();
  expect(wave).not.toBeNull();
  const y = wave!.y + 40;
  await page.mouse.move(start.x, y);
  await page.mouse.down();
  await page.mouse.move(end.x, y);
  await expect(host).toHaveAttribute("data-range-drag", "active");
  await viewport.dispatchEvent("pointercancel", { pointerId: 1, button: 0, clientX: end.x, clientY: y });
  await expect(host).not.toHaveAttribute("data-range-drag", "active");
  await expect(host).not.toHaveAttribute("data-range-preview");
  await page.mouse.up();
  expect(await viewState(page)).toEqual(before);
});
