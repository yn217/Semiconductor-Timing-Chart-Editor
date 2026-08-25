import { expect, test } from "@playwright/test";

async function createAnnotation(page: import("@playwright/test").Page, type: string) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption(type);
  await page.getByRole("button", { name: "Add annotation" }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  return host.locator("[data-role='annotation-owner']").last();
}

test("creates every Annotation type on a renderer-owned stable overlay surface", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const types = ["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency"];
  for (const type of types) await createAnnotation(page, type);
  await expect(surface.locator("[data-role='annotation-owner']")).toHaveCount(types.length);
  for (const type of types) await expect(surface.locator(`[data-annotation-type='${type}']`)).toHaveCount(1);
  await expect(surface.locator("[data-annotation-shape='point']")).toHaveCount(3);
  await expect(surface.locator("[data-annotation-shape='range']")).toHaveCount(2);
  await expect(surface.locator("[data-annotation-shape='line']")).toHaveCount(4);
  await expect(surface.locator("[data-annotation-shape='vertical']")).toHaveCount(1);
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
  expect(countersAfter.overlayUpdates).toBe(countersBefore.overlayUpdates + types.length);
  await expect(page.getByTestId("history-status")).toHaveText(`History ${types.length} / Redo 0`);
});

test("updates Annotation style and label offset without waveform regeneration", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const owner = await createAnnotation(page, "arrow");
  await expect(owner).toHaveAttribute("data-selected", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("REQ to READY");
  await editor.getByLabel("Annotation color").fill("#3366cc");
  await editor.getByLabel("Annotation line type").selectOption("curve");
  await editor.getByLabel("Annotation arrowhead").selectOption("bidirectional");
  await page.getByTestId("apply-annotation-properties").click();
  await expect(owner).toHaveAttribute("data-line-type", "curve");
  await expect(owner).toHaveAttribute("data-arrowhead", "bidirectional");
  await expect(owner.locator("[data-role='annotation-label']")).toHaveText("REQ to READY");
  const labelBefore = await owner.locator("[data-role='annotation-label']").evaluate((element) => (element as HTMLElement).style.transform);
  await editor.getByLabel("Annotation label X").fill("12");
  await editor.getByLabel("Annotation label Y").fill("-20");
  await editor.getByRole("button", { name: "Move label" }).click();
  const labelAfter = await owner.locator("[data-role='annotation-label']").evaluate((element) => (element as HTMLElement).style.transform);
  const x = (value: string) => Number.parseFloat(value.match(/translate\(([-\d.]+)px/)?.[1] ?? "NaN");
  expect(x(labelAfter) - x(labelBefore)).toBe(12);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(waveCounters.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(waveCounters.localGeometryBuilds);
  expect(after.overlayUpdates).toBe(waveCounters.overlayUpdates + 2);
});

test("snaps a dragged endpoint to exact rendered cycle geometry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const owner = await createAnnotation(page, "arrow");
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const fromBox = await handle.boundingBox();
  const x2 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='2']").evaluate((element) => (element as HTMLElement).style.left));
  const x5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  expect(fromBox).not.toBeNull();
  await page.mouse.move(fromBox!.x + 4, fromBox!.y + 4);
  await page.mouse.down();
  await page.mouse.move(fromBox!.x + 4 + (x5 - x2), fromBox!.y + 4);
  await expect(host.locator("[data-role='snap-point']")).toHaveCount(1);
  await expect(host.locator("[data-role='snap-vertical-guide']")).toHaveCount(1);
  await expect(host.locator("[data-role='snap-signal-highlight']")).toHaveCount(1);
  await expect(host.locator("[data-role='snap-cycle-label']")).toContainText("cycle");
  await page.mouse.up();
  await expect(host.locator("[data-role='snap-point']")).toHaveCount(0);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-snap-kind", "cycle-boundary");
  await expect(host).toHaveAttribute("data-snap-distance", "0");
  const movedTransform = await owner.locator("[data-role='annotation-handle'][data-annotation-field='from']").evaluate((element) => (element as HTMLElement).style.transform);
  expect(movedTransform).toContain(`${x5}px`);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("nudges by 1/10 px and cancels pointer preview without a commit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const owner = await createAnnotation(page, "text");
  await owner.focus();
  await owner.press("ArrowRight");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await owner.press("Shift+ArrowDown");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  const transform = await owner.locator("[data-role='annotation-handle']").evaluate((element) => (element as HTMLElement).style.transform);
  expect(transform).toMatch(/translate\([^,]+, [^)]+\)/);

  const body = owner.locator("[data-role='annotation-body']");
  await body.dispatchEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 7 });
  await body.dispatchEvent("pointermove", { clientX: 130, clientY: 120, pointerId: 7 });
  await expect(owner).toHaveCSS("translate", "30px 20px");
  await body.dispatchEvent("pointercancel", { pointerId: 7 });
  await expect(owner).toHaveCSS("translate", "none");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
});

test("moves the whole Annotation by visual offsets and resets offsets independently", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const owner = await createAnnotation(page, "dependency");
  const handles = owner.locator("[data-role='annotation-handle']");
  const before = await handles.evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform));
  const body = owner.locator("[data-role='annotation-body']");
  await body.dispatchEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 8 });
  await body.dispatchEvent("pointermove", { clientX: 120, clientY: 112, pointerId: 8 });
  await body.dispatchEvent("pointerup", { clientX: 120, clientY: 112, pointerId: 8 });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const moved = await handles.evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform));
  expect(moved).not.toEqual(before);
  await page.getByRole("button", { name: "Reset offsets" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await handles.evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform))).toEqual(before);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
});

test("keeps semantic alignment through reorder, zoom, and scroll without waveform regeneration", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const owner = await createAnnotation(page, "text");
  const handle = owner.locator("[data-role='annotation-handle']");
  const beforeCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const beforeY = (await handle.boundingBox())!.y;
  await surface.locator("[data-role='left-row'][data-row-id='sig_cycle_request']").dragTo(surface.locator("[data-role='left-row'][data-row-id='sig_cycle_ready']"), { targetPosition: { x: 120, y: 28 } });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect((await handle.boundingBox())!.y).toBeGreaterThan(beforeY);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  const tick = page.getByTestId("cycle-ruler").locator("[data-cycle='2']");
  const aligned = async () => Math.abs((((await handle.boundingBox())!.x + (await handle.boundingBox())!.width / 2) - (await tick.boundingBox())!.x));
  expect(await aligned()).toBeLessThan(1);
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = 120; element.scrollTop = 40; element.dispatchEvent(new Event("scroll")); });
  expect(await aligned()).toBeLessThan(1);
  const afterCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterCounters.waveDromRenders).toBe(beforeCounters.waveDromRenders);
  expect(afterCounters.localGeometryBuilds).toBe(beforeCounters.localGeometryBuilds);
});

test("ripples and clamps Annotation anchors through Timeline edits with Undo and Redo", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const owner = await createAnnotation(page, "text");
  const handle = owner.locator("[data-role='annotation-handle']");
  const originalX = (await handle.boundingBox())!.x;
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Delete range" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(Math.abs((await handle.boundingBox())!.x - originalX)).toBeLessThan(1);
  await page.getByTestId("editor-undo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect((await handle.boundingBox())!.x).toBeGreaterThan(originalX);
  await page.getByTestId("editor-undo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(Math.abs((await handle.boundingBox())!.x - originalX)).toBeLessThan(1);
  await page.getByTestId("editor-redo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect((await handle.boundingBox())!.x).toBeGreaterThan(originalX);
});

test("creates a transition Arrow with two snapped clicks and cancels pending capture with Escape", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveLayer = surface.locator("[data-role='stable-waveform-surface']");
  const waveBox = await waveLayer.boundingBox();
  const requestBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']").boundingBox();
  const readyBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_ready']").boundingBox();
  const cycle3 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  expect(waveBox && requestBox && readyBox).toBeTruthy();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click from transition");
  await page.mouse.click(waveBox!.x + cycle3, requestBox!.y + requestBox!.height / 2);
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click to transition");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await page.mouse.click(waveBox!.x + cycle5, readyBox!.y + readyBox!.height / 2);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(surface.locator("[data-annotation-type='arrow']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("arrow-pick-status")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
