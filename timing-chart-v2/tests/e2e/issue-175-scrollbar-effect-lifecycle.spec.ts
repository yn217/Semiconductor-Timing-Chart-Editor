import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Inspector rename does not reinstall the Timeline scrollbar listener", async ({ page }) => {
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.addInitScript(() => {
    const counts = { adds: 0, removes: 0 };
    (window as typeof window & { __timelineScrollbarListenerCounts?: typeof counts }).__timelineScrollbarListenerCounts = counts;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === "scroll" && this instanceof HTMLElement && this.matches(".timeline-hscroll")) counts.adds += 1;
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (type === "scroll" && this instanceof HTMLElement && this.matches(".timeline-hscroll")) counts.removes += 1;
      return remove.call(this, type, listener, options);
    };
  });

  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const bytes = readFileSync(resolve(process.cwd(), "samples/performance/perf_1000x1000_virtualized.tcd.json"));
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "perf_1000x1000_virtualized.tcd.json", mimeType: "application/json", buffer: bytes });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-view-mode", "Cycle");

  const bar = page.locator(".timeline-hscroll");
  const before = await page.evaluate(() => (window as typeof window & { __timelineScrollbarListenerCounts: { adds: number; removes: number } }).__timelineScrollbarListenerCounts);
  expect(before.adds).toBeGreaterThan(0);
  expect(before.adds - before.removes).toBe(1);

  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_perf_0']");
  await expect(row).toBeVisible();
  await row.click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("PERF_RENAMED");
  await name.press("Enter");
  await expect(row).toContainText("PERF_RENAMED");
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const after = await page.evaluate(() => (window as typeof window & { __timelineScrollbarListenerCounts: { adds: number; removes: number } }).__timelineScrollbarListenerCounts);
  expect(after).toEqual(before);
  await expect(bar).toBeAttached();
});
