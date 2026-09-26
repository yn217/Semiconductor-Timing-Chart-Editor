import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);
test.setTimeout(180_000);

test("opens and searches Hardware Hierarchy at 10k Signals without rebuilding ownership", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const document = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 100 });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "hardware-hierarchy-10k.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "10000", { timeout: 150_000 });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 150_000 });

  await page.evaluate(() => {
    const windowWithLongTasks = window as typeof window & { __hierarchyLongTasks?: number[] };
    windowWithLongTasks.__hierarchyLongTasks = [];
    new PerformanceObserver((list) => {
      const durations = list.getEntries().map((entry) => entry.duration);
      windowWithLongTasks.__hierarchyLongTasks?.push(...durations);
    }).observe({ type: "longtask" });
  });
  const openStartedAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  const hierarchy = page.getByTestId("hierarchy-browser");
  await expect(hierarchy).toBeVisible();
  const hierarchyOpenMs = await page.evaluate((startedAt) => performance.now() - startedAt, openStartedAt);

  expect(hierarchyOpenMs).toBeLessThan(3_000);
  await expect(hierarchy).toHaveAttribute("data-hierarchy-index-builds", "1");
  await expect(hierarchy).toHaveAttribute("data-hierarchy-entry-builds", "1");
  await expect(hierarchy).toHaveAttribute("data-hierarchy-rows-visited", "10000");
  await expect(hierarchy).toHaveAttribute("data-hierarchy-entries-created", "10000");
  expect(await hierarchy.locator("[data-hierarchy-row-id]").count()).toBeLessThan(64);
  await hierarchy.locator(".hierarchy-table-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(hierarchy.locator("[data-hierarchy-row-id='sig_perf_9999']")).toBeVisible();
  const openLongTasks = await page.evaluate(() => (window as typeof window & { __hierarchyLongTasks?: number[] }).__hierarchyLongTasks ?? []);
  expect(openLongTasks.filter((duration) => duration >= 2_000)).toEqual([]);

  const searchStartedAt = await page.evaluate(() => performance.now());
  await hierarchy.getByTestId("hierarchy-path-search").fill("signal_9999");
  await expect(hierarchy.locator("[data-hierarchy-row-id='sig_perf_9999']")).toBeVisible();
  const searchLatencyMs = await page.evaluate((startedAt) => performance.now() - startedAt, searchStartedAt);
  expect(searchLatencyMs).toBeLessThan(1_000);
  await expect(hierarchy).toHaveAttribute("data-hierarchy-index-builds", "1");
  await expect(hierarchy).toHaveAttribute("data-hierarchy-entry-builds", "1");
  await expect(hierarchy).toHaveAttribute("data-hierarchy-index-entries", "10000");
  await expect(hierarchy).toHaveAttribute("data-hierarchy-entries-created", "10000");
  await expect(hierarchy.locator("[data-hierarchy-row-id]")).toHaveCount(1);

  console.info("Hardware Hierarchy browser metrics", {
    fixtureSignals: 10_000,
    hierarchyOpenMs,
    searchLatencyMs,
    indexBuilds: await hierarchy.getAttribute("data-hierarchy-index-builds"),
    entryBuilds: await hierarchy.getAttribute("data-hierarchy-entry-builds"),
    rowsVisited: await hierarchy.getAttribute("data-hierarchy-rows-visited"),
    mountedRows: await hierarchy.locator(".hierarchy-table-viewport").getAttribute("data-hierarchy-mounted-rows"),
    searchFilterMs: await hierarchy.getAttribute("data-hierarchy-search-filter-duration-ms"),
    longTasks: openLongTasks,
  });
});
