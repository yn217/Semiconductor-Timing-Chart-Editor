import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #896: with `timeline.referenceClock` omitted, the effective reference Clock is the first Clock. Its period must align EVERY bounded
 * renderer window (#614: one shared units-per-cycle window per viewport), not only the Clock's own row.
 */
test("bounded windows of Clock and non-Clock rows share one aligned range when the reference Clock is implicit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 6, cycleCount: 12_000 }) as unknown as { timeline: Record<string, unknown>; signals: Array<Record<string, unknown> & { type: string; generator?: Record<string, unknown> }> };
  delete document.timeline.referenceClock;
  const clock = document.signals.find((signal) => signal.type === "clock");
  expect(clock, "fixture needs a Clock signal").toBeTruthy();
  clock!.generator = { ...(clock!.generator ?? {}), period: 5 };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p896.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  // Far jump so the bounded window starts at a cycle that is not a multiple of the reference period.
  await page.locator("[data-role='timeline-viewport']").evaluate((element) => { element.scrollLeft = 40 * 2001 + 17; });
  const readWindows = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-rendered-source-window-start]")].map((owner) => `${owner.dataset.renderedSourceWindowStart}-${owner.dataset.renderedSourceWindowEnd}`));
  await expect.poll(async () => { const w = await readWindows(); return w.length > 1 && !w.includes("0-512"); }, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(600);
  const windows = await readWindows();
  expect([...new Set(windows)], `owners rendered different windows: ${windows.join(", ")}`).toHaveLength(1);
});
