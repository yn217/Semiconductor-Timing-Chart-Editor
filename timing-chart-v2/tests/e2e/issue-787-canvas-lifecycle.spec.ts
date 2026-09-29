import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #787: Canvas lifecycle on the real scroll owner. Uses real wheel input (native scroll events do NOT bubble, so a synthetic
 * bubbling `scroll` dispatch would hide a listener registered on the wrong element).
 */
test("Canvas repaint follows the real horizontal scroll owner, ignores vertical scroll and does not accumulate listeners", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 60, cycleCount: 10_000, profile: "transaction-heavy" }); // 600k >= 250k: Canvas auto-selected
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p787.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await expect.poll(() => page.locator("canvas[data-wave-canvas]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.locator("[data-role='wave-owner'][data-wave-renderer='canvas'][data-wave-state='ready']").first()).toBeVisible();

  // Count 2D repaints per canvas (clearRect is the first call of every draw) without touching production code.
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.clearRect;
    proto.clearRect = function patched(this: CanvasRenderingContext2D, ...args: Parameters<typeof original>) {
      const canvas = this.canvas as HTMLCanvasElement & { __draws?: number };
      canvas.__draws = (canvas.__draws ?? 0) + 1;
      return original.apply(this, args);
    };
  });
  const totalDraws = () => page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement & { __draws?: number }>("canvas[data-wave-canvas]")].reduce((sum, canvas) => sum + (canvas.__draws ?? 0), 0));
  const listeners = () => page.evaluate(async () => {
    const { canvasSchedulerListenerCount } = await import(/* @vite-ignore */ "/src/runtime/canvas-wave-painter.ts") as typeof import("../../apps/editor/src/runtime/canvas-wave-painter.js");
    return canvasSchedulerListenerCount(document.querySelector<HTMLElement>(".cycle-viewport")!);
  });

  const timeline = page.locator("[data-role='timeline-viewport']");
  const box = (await timeline.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(60, box.height / 2));
  // 1. Real horizontal wheel scrolls the real owner and repaints the Canvas owners once per frame, not per row.
  const beforeHorizontal = await totalDraws();
  await page.mouse.wheel(600, 0);
  await expect.poll(() => timeline.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(totalDraws, { timeout: 10_000 }).toBeGreaterThan(beforeHorizontal);
  // 2. At most the two real scroll elements (cycle viewport + Timeline wrapper) are listened to, regardless of row count.
  expect(await listeners()).toBeLessThanOrEqual(2);
  expect(await listeners()).toBeGreaterThan(0);

  // 3. A vertical-only scroll must not schedule a Canvas scroll repaint (window re-renders by the provider are a separate owner).
  const flushes = () => page.evaluate(async () => {
    const { canvasSchedulerFlushCount } = await import(/* @vite-ignore */ "/src/runtime/canvas-wave-painter.ts") as typeof import("../../apps/editor/src/runtime/canvas-wave-painter.js");
    return canvasSchedulerFlushCount(document.querySelector<HTMLElement>(".cycle-viewport")!);
  });
  await page.waitForTimeout(300);
  const flushesBefore = await flushes();
  expect(flushesBefore, "the horizontal wheel must have gone through the one scheduler").toBeGreaterThan(0);
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(500);
  expect(await flushes(), "vertical-only scroll scheduled a Canvas repaint").toBe(flushesBefore);

  // 4. Repeated vertical scroll/eviction does not grow the listener count.
  for (let round = 0; round < 3; round += 1) {
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(250);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(250);
  }
  expect(await listeners()).toBeLessThanOrEqual(2);
});
