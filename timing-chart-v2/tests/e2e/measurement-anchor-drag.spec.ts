import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import type { Locator, Page } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";

startInCycleMode(test);

async function createAnnotation(page: Page, type: string): Promise<Locator> {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption(type);
  const host = page.getByTestId("cycle-surface");
  const before = new Set(await host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-id"))));
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const findNewId = () => host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items, previous) => items.map((item) => item.getAttribute("data-annotation-id")).find((id) => id && !previous.includes(id)), [...before]);
  await expect.poll(findNewId).toBeTruthy();
  const annotationId = await findNewId();
  return host.locator(`[data-role='annotation-owner'][data-annotation-id='${annotationId}']`);
}

async function freshDocument(page: Page): Promise<void> {
  // The reload-persisted default document ships its own pre-existing
  // showcase Measurement annotation, which would interfere with count/
  // identity assertions below -- start from a genuinely blank document.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard").click({ timeout: 2000 }).catch(() => {});
}

async function selectRequestSignal(host: Locator): Promise<void> {
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click({ force: true });
}

test("drags the Measurement start anchor independently -- only that endpoint moves, preview is transient, drop is one History unit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await freshDocument(page);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "measurement");

  const startHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='start']");
  const endHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='end']");
  await expect(startHandle).toHaveCount(1);
  await expect(endHandle).toHaveCount(1);

  const endTransformBefore = await endHandle.evaluate((element) => (element as HTMLElement).style.transform);
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = JSON.parse((await surface.getAttribute("data-render-counters")) ?? "null") as Record<string, number>;

  const startBox = await startHandle.boundingBox();
  expect(startBox).not.toBeNull();
  const dragDistance = 24;
  await page.mouse.move(startBox!.x + 3, startBox!.y + 3);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + 3 + dragDistance, startBox!.y + 3);

  // Mid-drag: preview only -- canonical/history must not move yet.
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  // The untouched end anchor must not visibly move during a start-only drag.
  await expect(endHandle).toHaveAttribute("style", new RegExp(endTransformBefore.replace(/[()]/g, "\\$&")));

  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  // Drop committed exactly one History unit.
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  const historyDepth = (text: string) => text.match(/History (\d+)/)?.[1];
  const historyAfter = await page.getByTestId("history-status").textContent();
  expect(Number(historyDepth(historyAfter!))).toBe(Number(historyDepth(historyBefore!)) + 1);

  // Only the start endpoint actually changed.
  const startTransformAfter = await startHandle.evaluate((element) => (element as HTMLElement).style.transform);
  const endTransformAfter = await endHandle.evaluate((element) => (element as HTMLElement).style.transform);
  expect(endTransformAfter).toBe(endTransformBefore);
  expect(startTransformAfter).not.toBe(endTransformBefore);

  // Annotation-only edit: no unrelated WaveDrom trace rerender.
  const countersAfter = JSON.parse((await surface.getAttribute("data-render-counters")) ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
});

test("drags the Measurement end anchor independently -- only that endpoint moves", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await freshDocument(page);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "measurement");

  const startHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='start']");
  const endHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='end']");
  const startTransformBefore = await startHandle.evaluate((element) => (element as HTMLElement).style.transform);
  const historyBefore = await page.getByTestId("history-status").textContent();

  const endBox = await endHandle.boundingBox();
  expect(endBox).not.toBeNull();
  await page.mouse.move(endBox!.x + 3, endBox!.y + 3);
  await page.mouse.down();
  await page.mouse.move(endBox!.x + 3 + 24, endBox!.y + 3);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const historyDepth = (text: string) => text.match(/History (\d+)/)?.[1];
  const historyAfter = await page.getByTestId("history-status").textContent();
  expect(Number(historyDepth(historyAfter!))).toBe(Number(historyDepth(historyBefore!)) + 1);

  const startTransformAfter = await startHandle.evaluate((element) => (element as HTMLElement).style.transform);
  const endTransformAfter = await endHandle.evaluate((element) => (element as HTMLElement).style.transform);
  expect(startTransformAfter).toBe(startTransformBefore);
  expect(endTransformAfter).not.toBe(startTransformBefore);
});

test("Escape mid-drag cancels the Measurement anchor drag and returns exactly to the pre-drag state", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await freshDocument(page);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "measurement");
  const startHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='start']");

  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const transformBefore = await startHandle.evaluate((element) => (element as HTMLElement).style.transform);

  const startBox = await startHandle.boundingBox();
  await page.mouse.move(startBox!.x + 3, startBox!.y + 3);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + 3 + 40, startBox!.y + 3);
  await page.keyboard.press("Escape");
  await page.mouse.up();

  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(startHandle).toHaveAttribute("style", new RegExp(transformBefore.replace(/[()]/g, "\\$&")));
});

test("Undo restores the pre-drag anchor exactly, Redo re-applies it, and Save/Open preserves the moved anchor", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await freshDocument(page);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "measurement");
  const startHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='start']");

  const transformBefore = await startHandle.evaluate((element) => (element as HTMLElement).style.transform);
  const historyDepth = (text: string) => text.match(/History (\d+)/)?.[1];
  const historyBefore = await page.getByTestId("history-status").textContent();

  const startBox = await startHandle.boundingBox();
  await page.mouse.move(startBox!.x + 3, startBox!.y + 3);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + 3 + 24, startBox!.y + 3);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const transformAfterDrag = await startHandle.evaluate((element) => (element as HTMLElement).style.transform);
  expect(transformAfterDrag).not.toBe(transformBefore);

  await page.getByTestId("editor-undo").click();
  await expect.poll(() => page.getByTestId("history-status").textContent().then((text) => historyDepth(text ?? ""))).toBe(historyDepth(historyBefore!));
  await expect(startHandle).toHaveAttribute("style", new RegExp(transformBefore.replace(/[()]/g, "\\$&")));

  await page.getByTestId("editor-redo").click();
  await expect(startHandle).toHaveAttribute("style", new RegExp(transformAfterDrag.replace(/[()]/g, "\\$&")));

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const reopenedOwner = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(reopenedOwner).toHaveCount(1);
  await expect(reopenedOwner.locator("[data-role='annotation-handle'][data-annotation-field='start']")).toHaveAttribute("style", new RegExp(transformAfterDrag.replace(/[()]/g, "\\$&")));
});

test("same-Signal Measurement: geometry survives Zoom 50/100/150/200%, horizontal scroll, and Signal reorder", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await freshDocument(page);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "measurement");
  const startHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='start']");
  const endHandle = owner.locator("[data-role='annotation-handle'][data-annotation-field='end']");

  // Anchor a real semantic checkpoint (the annotation's own aria-label,
  // which encodes its resolved cycle/percent) -- geometry retention means
  // the same *semantic* anchor keeps resolving through shared timeline/
  // WaveDrom geometry, not that screen pixels stay fixed (they must NOT
  // stay fixed across Zoom).
  const ariaBefore = await owner.getAttribute("aria-label");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const zoomPreset = page.getByLabel("Zoom preset");
  for (const percent of [50, 150, 200]) {
    await zoomPreset.selectOption(String(percent));
    await expect(page.getByTestId("zoom-status")).toHaveText(`${percent}%`);
    await expect(owner).toHaveAttribute("aria-label", ariaBefore!);
    await expect(startHandle).toHaveCount(1);
    await expect(endHandle).toHaveCount(1);
  }
  await zoomPreset.selectOption("100");
  await expect(page.getByTestId("zoom-status")).toHaveText("100%");

  // Horizontal scroll.
  const viewport = page.locator("[data-testid='cycle-viewport']");
  await viewport.evaluate((element) => { (element as HTMLElement).scrollLeft = 200; });
  await page.waitForTimeout(150);
  await expect(owner).toHaveAttribute("aria-label", ariaBefore!);
  await expect(startHandle).toHaveCount(1);
  await viewport.evaluate((element) => { (element as HTMLElement).scrollLeft = 0; });

  // Signal reorder: move a different Signal, REQUEST's own row position
  // changes, but the Measurement's own semantic anchors must still resolve
  // identically.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await selectRequestSignal(host);
  await page.getByRole("button", { name: "Move selected row down" }).click();
  await page.waitForTimeout(150);
  await expect(owner).toHaveAttribute("aria-label", ariaBefore!);
  await expect(startHandle).toHaveCount(1);
  await expect(endHandle).toHaveCount(1);
});
