import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import { documentState, expectViewOnly } from "./view-only.js";

startInCycleMode(test);

/**
 * #549: a Cursor A drag is a multi-frame gesture. The first committed preview changes `cursor.a`; that must not tear the drag down, so the
 * cursor keeps following the pointer for every later move, pointerup commits the final position, and pointercancel stops the gesture.
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`Cursor A keeps following a >=5-step real pointer drag (rAF between moves) at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("cursor-set-a").click();
    const line = page.locator("[data-role='cursor-line'][data-cursor='a']:visible").first();
    await expect(line).toBeVisible();
    const before = await documentState(page);
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
    await page.mouse.up();
    await expect.poll(async () => Number(await line.getAttribute("data-cycle")), { message: "cursor followed the pointer to the last tick" }).toBe(targets.at(-1));
    await expect(page.getByTestId("cursor-status")).toContainText(`A ${targets.at(-1)}`);
    await expectViewOnly(page, before);

    // After pointerup no stray window handler keeps moving the cursor.
    const settled = Number(await line.getAttribute("data-cycle"));
    const far = (await tick(Math.max(0, settled - 3)).boundingBox())!;
    await page.mouse.move(far.x + 1, y); await frame();
    expect(Number(await line.getAttribute("data-cycle"))).toBe(settled);
  });
}

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
