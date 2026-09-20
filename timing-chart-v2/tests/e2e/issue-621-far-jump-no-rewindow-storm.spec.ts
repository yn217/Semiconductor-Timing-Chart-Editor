import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("a single far jump on a >4096-cycle document settles with a bounded number of wave batches", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 30, cycleCount: 6000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "jump.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const batches = async () => JSON.parse((await surface.getAttribute("data-session-counters"))!).waveBatchCount as number;
  const before = await batches();
  const viewport = page.getByTestId("cycle-viewport");
  const max = await viewport.evaluate((el) => el.scrollWidth - el.clientWidth);
  await viewport.evaluate((el, left) => { el.scrollLeft = left; }, max - 10);
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const delta = (await batches()) - before;
  expect(delta, "wave batches after one far jump").toBeLessThanOrEqual(6);
  expect(await page.locator("[data-role='wave-owner'] svg").count()).toBeGreaterThan(0);
});
