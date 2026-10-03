import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import { documentState, expectViewOnly } from "./view-only.js";
import { canonicalFixture } from "../fixtures/canonical.js";
import type { TimeGroupId } from "@timing-chart-v2/schema";

startInCycleMode(test);

test("opening another document cancels an active Cursor drag", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  const line = page.getByTestId("cycle-viewport").locator("[data-role='cursor-line'][data-cursor='a']");
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "cursor-replacement.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(canonicalFixture())) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("cursor-status")).toHaveCount(0);
  const before = await documentState(page);
  await page.mouse.move(box.x + 150, box.y + box.height / 2);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.mouse.up();
  await expect(page.getByTestId("cursor-status")).toHaveCount(0);
  await expect(line).toHaveCount(0);
  await expectViewOnly(page, before);
});

test("Cursor keyboard and drag stay source-bounded through a collapsed fold", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const document = { ...canonicalFixture(), timeGroups: [{ id: "cursor_fold" as TimeGroupId, name: "Fold", start: 2, end: 5, presentation: { collapsed: true } }] };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "cursor-fold.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  const before = await documentState(page);
  const viewport = page.getByTestId("cycle-viewport");
  const line = viewport.locator("[data-role='cursor-line'][data-cursor='a']");
  for (let index = 0; index < 12; index += 1) await viewport.press("Shift+ArrowRight");
  await expect(line).toHaveAttribute("data-cycle", "7");
  await expect.poll(async () => Math.abs((await line.boundingBox())!.x - (await page.locator(".cycle-ruler [data-source-cycle='7']").first().boundingBox())!.x)).toBeLessThanOrEqual(1);
  for (let index = 0; index < 12; index += 1) await viewport.press("Shift+ArrowLeft");
  await expect(line).toHaveAttribute("data-cycle", "0");
  const box = (await line.boundingBox())!;
  const viewportBox = (await viewport.boundingBox())!;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(([x, y]) => {
    const hit = document.elementFromPoint(x!, y!);
    return { role: (hit as HTMLElement | null)?.dataset.role, className: hit?.className, tag: hit?.tagName };
  }, [box.x + 1, y]);
  expect(hit, JSON.stringify({ hit, box, viewportBox, y })).toMatchObject({ role: "cursor-line" });
  await page.mouse.move(box.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + viewportBox.width - 5, y);
  await page.mouse.up();
  await expect(line).toHaveAttribute("data-cycle", "7");
  await expectViewOnly(page, before);
});

test("Cursor preserves source-cycle alignment at 50%, 100%, 150% and 200% zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  const before = await documentState(page);
  const line = page.getByTestId("cycle-viewport").locator("[data-role='cursor-line'][data-cursor='a']");
  const cycle = (await line.getAttribute("data-cycle"))!;
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  for (const zoom of [0.5, 1, 1.5, 2]) {
    await expect(host).toHaveAttribute("data-zoom", String(zoom));
    await expect.poll(async () => {
      const lineBox = (await line.boundingBox())!;
      const tickBox = (await page.locator(`.cycle-ruler [data-source-cycle='${cycle}']`).first().boundingBox())!;
      return Math.abs(lineBox.x - tickBox.x);
    }).toBeLessThanOrEqual(1);
    await expect(line).toHaveAttribute("data-cycle", cycle);
    if (zoom < 2) {
      await page.getByRole("button", { name: "Zoom In", exact: true }).click();
      await page.getByRole("button", { name: "Zoom In", exact: true }).click();
    }
  }
  await expectViewOnly(page, before);
});

/**
 * #549: a Cursor A drag is a multi-frame gesture. The first committed preview changes `cursor.a`; that must not tear the drag down, so the
 * cursor keeps following the pointer for every later move, pointerup commits the final position, and pointercancel stops the gesture.
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`Cursor A keeps following a >=5-step real pointer drag (rAF between moves) at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => {
      const original = Element.prototype.querySelectorAll;
      let rulerCycleQueries = 0;
      Element.prototype.querySelectorAll = new Proxy(original, {
        apply(target, thisArg, args: [string, ...unknown[]]) {
          if (args[0] === "[data-cycle]" && thisArg instanceof Element && thisArg.matches(".cycle-ruler")) rulerCycleQueries += 1;
          return Reflect.apply(target, thisArg, args);
        },
      });
      Object.defineProperty(window, "__cursorRulerCycleQueries", { get: () => rulerCycleQueries });
      const registrations = { resizeObserver: 0, viewportPointerDown: 0, viewportScroll: 0, windowResize: 0 };
      const originalAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = new Proxy(originalAdd, {
        apply(target, thisArg, args: [string, ...unknown[]]) {
          if (thisArg === window && args[0] === "resize") registrations.windowResize += 1;
          if (thisArg instanceof Element && thisArg.matches(".cycle-viewport")) {
            if (args[0] === "pointerdown") registrations.viewportPointerDown += 1;
            if (args[0] === "scroll") registrations.viewportScroll += 1;
          }
          return Reflect.apply(target, thisArg, args);
        },
      });
      const NativeResizeObserver = window.ResizeObserver;
      window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback: ResizeObserverCallback) { registrations.resizeObserver += 1; super(callback); }
      };
      Object.defineProperty(window, "__cursorLifecycleRegistrations", { get: () => ({ ...registrations }) });
    });
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("cursor-set-a").click();
    const line = page.locator("[data-role='cursor-line'][data-cursor='a']:visible").first();
    await expect(line).toBeVisible();
    const before = await documentState(page);
    const rulerCycleQueriesBeforeDrag = await page.evaluate(() => Number(Reflect.get(window, "__cursorRulerCycleQueries")));
    const lifecycleRegistrationsBeforeDrag = await page.evaluate(() => Reflect.get(window, "__cursorLifecycleRegistrations"));
    const startCycle = Number(await line.getAttribute("data-cycle"));
    const tick = (cycle: number) => page.locator(`.cycle-ruler [data-cycle][data-source-cycle='${cycle}']`).first();
    const viewport = page.getByTestId("cycle-viewport");
    const lineBox = (await line.boundingBox())!;
    const y = lineBox.y + Math.max(1, lineBox.height / 2);
    const frame = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.mouse.move(lineBox.x + lineBox.width / 2, y);
    await page.mouse.down();
    // Walk right across five distinct ticks, one rAF apart.
    const targets = [startCycle + 1, startCycle + 2, startCycle + 3, startCycle + 4, startCycle + 5, startCycle + 6];
    for (const cycle of targets) {
      const box = (await tick(cycle).boundingBox())!;
      await page.mouse.move(box.x + 1, y);
      await frame();
    }
    await expect.poll(async () => Number(await viewport.getAttribute("data-cursor-drag-pointer-moves"))).toBeGreaterThan(1);
    await expect.poll(async () => Number(await viewport.getAttribute("data-cursor-drag-preview-frames"))).toBeGreaterThan(1);
    expect(await page.evaluate(() => Number(Reflect.get(window, "__cursorRulerCycleQueries"))), "Cursor movement must use shared time geometry instead of scanning ruler ticks").toBe(rulerCycleQueriesBeforeDrag);
    expect(await page.evaluate(() => Reflect.get(window, "__cursorLifecycleRegistrations")), "Cursor preview updates must not reconnect viewport/window listeners or recreate ResizeObserver").toEqual(lifecycleRegistrationsBeforeDrag);
    await page.mouse.up();
    await expect.poll(async () => Number(await line.getAttribute("data-cycle")), { message: "cursor followed the pointer to the last tick" }).toBe(targets.at(-1));
    const finalLineBox = (await line.boundingBox())!;
    const finalTickBox = (await tick(targets.at(-1)!).boundingBox())!;
    expect(Math.abs(finalLineBox.x - finalTickBox.x), "cursor guide remains aligned to the same source-cycle boundary").toBeLessThanOrEqual(1);
    await expect(page.getByTestId("cursor-status")).toContainText(`A ${targets.at(-1)}`);
    await expectViewOnly(page, before);

    // After pointerup no stray window handler keeps moving the cursor.
    const settled = Number(await line.getAttribute("data-cycle"));
    const far = (await tick(Math.max(0, settled - 3)).boundingBox())!;
    await page.mouse.move(far.x + 1, y); await frame();
    expect(Number(await line.getAttribute("data-cycle"))).toBe(settled);
  });
}

test("Combined Cursor A projects source cycles through the shared time geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-signal-content")).toBeVisible();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  const line = page.locator("[data-role='cursor-line'][data-cursor='a']:visible").first();
  await expect(line).toBeVisible();
  const cycle = Number(await line.getAttribute("data-cycle"));
  const tick = page.locator(`.cycle-ruler [data-cycle][data-source-cycle='${cycle}']`).first();
  await expect(tick).toBeVisible();
  const lineBox = (await line.boundingBox())!;
  const tickBox = (await tick.boundingBox())!;
  expect(Math.abs(lineBox.x - tickBox.x), "Combined cursor guide and ruler use the same source-cycle X").toBeLessThanOrEqual(1);
});

test("pointercancel ends a Cursor drag without another cursor update", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  const line = page.locator("[data-role='cursor-line'][data-cursor='a']:visible").first();
  await expect(line).toBeVisible();
  const startCycle = Number(await line.getAttribute("data-cycle"));
  const box = (await line.boundingBox())!;
  const y = box.y + Math.max(1, box.height / 2);
  const frame = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  const next = (await page.locator(`.cycle-ruler [data-cycle][data-source-cycle='${startCycle + 2}']`).first().boundingBox())!;
  await page.mouse.move(next.x + 1, y); await frame();
  await expect.poll(async () => Number(await line.getAttribute("data-cycle"))).toBe(startCycle + 2);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true })));
  const further = (await page.locator(`.cycle-ruler [data-cycle][data-source-cycle='${startCycle + 5}']`).first().boundingBox())!;
  await page.mouse.move(further.x + 1, y); await frame();
  expect(Number(await line.getAttribute("data-cycle")), "no update after pointercancel").toBe(startCycle + 2);
  await page.mouse.up();
});

test("switching mode cancels an active Cursor drag owner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  const line = page.locator("[data-role='cursor-line'][data-cursor='a']:visible").first();
  await expect(line).toBeVisible();
  const startCycle = Number(await line.getAttribute("data-cycle"));
  const box = (await line.boundingBox())!;
  const y = box.y + Math.max(1, box.height / 2);
  const frame = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const tick = (cycle: number) => page.locator(`.cycle-ruler [data-cycle][data-source-cycle='${cycle}']`).first();
  const viewport = page.getByTestId("cycle-viewport");
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  const firstTarget = startCycle + 2;
  const firstTargetBox = (await tick(firstTarget).boundingBox())!;
  await page.mouse.move(firstTargetBox.x + 1, y);
  await frame();
  await expect.poll(async () => Number(await line.getAttribute("data-cycle"))).toBe(firstTarget);
  const laterTargetBox = (await tick(startCycle + 5).boundingBox())!;

  const pointerMovesBeforeModeChange = Number(await viewport.getAttribute("data-cursor-drag-pointer-moves"));
  const previewFramesBeforeModeChange = Number(await viewport.getAttribute("data-cursor-drag-preview-frames"));
  const transactionMode = page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true });
  await transactionMode.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");

  await page.mouse.move(laterTargetBox.x + 1, y);
  await frame();
  expect(Number(await line.getAttribute("data-cycle")), "mode teardown stops the in-flight gesture before another preview").toBe(firstTarget);
  expect(Number(await viewport.getAttribute("data-cursor-drag-pointer-moves"))).toBe(pointerMovesBeforeModeChange);
  expect(Number(await viewport.getAttribute("data-cursor-drag-preview-frames"))).toBe(previewFramesBeforeModeChange);
  await page.mouse.up();
});
