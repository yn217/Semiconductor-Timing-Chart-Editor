import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type CDPSession } from "@playwright/test";

async function cdpMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const result = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

/**
 * #788 closure evidence (application level, real browser): on the 1,000-Signal x 1,000-cycle workload, an Inspector rename is one
 * accepted command; measure press-Enter -> Canonical revision advanced -> editor idle, plus Long Tasks. Meant for the PRODUCTION build
 * (playwright.prod-closure.config.ts picks this file up through testMatch).
 */
test("production Inspector rename on perf_1000x1000 measures idle latency and unprofiled Long Tasks", async ({ page }) => {
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
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const samples: { elapsedMs: number; applyToIdleMs: number; diagnosticsMs: number; styleMs: number; layoutMs: number; scriptMs: number; taskMs: number; longTasks: number[] }[] = [];
  for (let run = 0; run < 5; run += 1) {
    const revision = await host.getAttribute("data-canonical-revision");
    await name.fill(`RENAMED_${run}`);
    const browserBefore = await cdpMetrics(cdp);
    const longTaskStart = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt.length);
    const started = await page.evaluate(() => performance.now());
    await name.press("Enter");
    await expect(host).not.toHaveAttribute("data-canonical-revision", revision!);
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    const ended = await page.evaluate(() => performance.now());
    const browserAfter = await cdpMetrics(cdp);
    const internal = await host.evaluate((element) => ({
      applyToIdleMs: Number((element as HTMLElement).dataset.lastApplyToIdleMs),
      diagnosticsMs: Number((element as HTMLElement).dataset.lastDiagnosticsDurationMs),
    }));
    const longTasks = await page.evaluate((start) => (window as unknown as { __lt: number[] }).__lt.slice(start), longTaskStart);
    samples.push({
      elapsedMs: Math.round(ended - started),
      applyToIdleMs: internal.applyToIdleMs,
      diagnosticsMs: internal.diagnosticsMs,
      styleMs: Math.round(((browserAfter.RecalcStyleDuration ?? 0) - (browserBefore.RecalcStyleDuration ?? 0)) * 1000),
      layoutMs: Math.round(((browserAfter.LayoutDuration ?? 0) - (browserBefore.LayoutDuration ?? 0)) * 1000),
      scriptMs: Math.round(((browserAfter.ScriptDuration ?? 0) - (browserBefore.ScriptDuration ?? 0)) * 1000),
      taskMs: Math.round(((browserAfter.TaskDuration ?? 0) - (browserBefore.TaskDuration ?? 0)) * 1000),
      longTasks,
    });
  }
  // Capture one separate diagnostic CPU profile after the five unprofiled timing samples. This profile is for attribution only and is
  // deliberately excluded from elapsedMs/p50/p95; Chrome sampling overhead must not contaminate the measured samples.
  const revision = await host.getAttribute("data-canonical-revision");
  await name.fill("RENAMED_PROFILE_DIAGNOSTIC");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  await name.press("Enter");
  await expect(host).not.toHaveAttribute("data-canonical-revision", revision!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const profileResult = await cdp.send("Profiler.stop") as { profile: { nodes: { callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number }; hitCount?: number }[] } };
  const hottestJs = profileResult.profile.nodes
    .filter((node) => (node.hitCount ?? 0) > 0)
    .sort((left, right) => (right.hitCount ?? 0) - (left.hitCount ?? 0))
    .slice(0, 12)
    .map((node) => ({ functionName: node.callFrame.functionName, url: node.callFrame.url, line: node.callFrame.lineNumber, column: node.callFrame.columnNumber, sampleCount: node.hitCount ?? 0 }));
  // Only the five normal interaction windows contribute to the summary.
  // The profiled diagnostic run is deliberately excluded from both timing
  // and Long Task aggregates; profiler overhead is not product evidence.
  const longTasks = samples.flatMap((sample) => sample.longTasks);
  const sorted = [...samples.map((sample) => sample.elapsedMs)].sort((left, right) => left - right);
  console.log(`[commit-latency-production] ${JSON.stringify({ workload: "perf_1000x1000_virtualized", command: "Inspector rename", samples, medianMs: sorted[2], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], longTasks: { count: longTasks.length, maxMs: Math.round(Math.max(0, ...longTasks)) }, separateDiagnosticProfile: { excludedFromTimingSamples: true, hottestJs } })}`);
  expect(sorted[2]!, "median press-Enter -> editor-idle").toBeLessThan(1_000);
});
