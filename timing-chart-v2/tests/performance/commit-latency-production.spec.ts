import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * #788 closure evidence (application level, real browser): on the 1,000-Signal x 1,000-cycle workload, an Inspector rename is one
 * accepted command; measure press-Enter -> Canonical revision advanced -> editor idle, plus Long Tasks. Meant for the PRODUCTION build
 * (playwright.prod-closure.config.ts picks this file up through testMatch).
 */
test("production Inspector rename on perf_1000x1000 reaches editor-idle quickly with no Long Task", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const file = readFileSync(resolve(process.cwd(), "samples/performance/perf_1000x1000_virtualized.tcd.json"));
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "perf_1000x1000_virtualized.tcd.json", mimeType: "application/json", buffer: file });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row']:not([data-kind='comment'])").first().click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await expect(name).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __lt: number[] }).__lt = []; new PerformanceObserver((list) => { for (const entry of list.getEntries()) (window as unknown as { __lt: number[] }).__lt.push(entry.duration); }).observe({ entryTypes: ["longtask"] }); });
  const samples: number[] = [];
  for (let run = 0; run < 5; run += 1) {
    const revision = await host.getAttribute("data-canonical-revision");
    await name.fill(`RENAMED_${run}`);
    const started = await page.evaluate(() => performance.now());
    await name.press("Enter");
    await expect(host).not.toHaveAttribute("data-canonical-revision", revision!);
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    samples.push(Math.round((await page.evaluate(() => performance.now())) - started));
  }
  const longTasks = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
  const sorted = [...samples].sort((left, right) => left - right);
  console.log(`[commit-latency-production] ${JSON.stringify({ workload: "perf_1000x1000_virtualized", command: "Inspector rename", samplesMs: samples, medianMs: sorted[2], maxMs: sorted[4], longTasks: { count: longTasks.length, maxMs: Math.round(Math.max(0, ...longTasks)) } })}`);
  expect(sorted[2]!, "median press-Enter -> editor-idle").toBeLessThan(1_000);
});
