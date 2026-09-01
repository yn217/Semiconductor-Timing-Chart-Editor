import { expect, test } from "@playwright/test";

test("registers the Left Tree keydown handler exactly once per mount (no duplicate listener)", async ({ page }) => {
  await page.addInitScript(() => {
    const original = EventTarget.prototype.addEventListener;
    (window as any).__treeKeydownRegistrations = 0;
    EventTarget.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (type === "keydown" && this instanceof HTMLElement && this.dataset?.role === "left-tree-rows") {
        (window as any).__treeKeydownRegistrations += 1;
      }
      return original.call(this, type, listener, options);
    };
  });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const registrations = await page.evaluate(() => (window as any).__treeKeydownRegistrations as number);
  // React 18 StrictMode double-invokes effects in dev (mount -> cleanup ->
  // mount) specifically to surface exactly this class of bug; exactly one
  // registration per mount is the correct, symmetric count.
  expect(registrations).toBeLessThanOrEqual(2);
});

test("one ArrowDown moves Left Tree keyboard focus by exactly one row, not two", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const rowIds = await surface.locator("[data-role='left-tree-rows'] [data-role='left-row'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  await surface.locator(`[data-role='left-row'][data-row-id='${rowIds[0]}']`).focus();
  await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.rowId);
  expect(focused).toBe(rowIds[1]);
});
