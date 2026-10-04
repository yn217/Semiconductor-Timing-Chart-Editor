import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type CDPSession } from "@playwright/test";

async function cdpMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const result = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

/**
 * Inspector interaction evidence (application level, real browser): on the 1,000-Signal x 1,000-cycle workload, Signal property changes are one
 * accepted command; measure press-Enter -> Canonical revision advanced -> editor idle, plus Long Tasks. Meant for the PRODUCTION build
 * (playwright.prod-closure.config.ts picks this file up through testMatch).
 */
test("production Inspector Signal commits on perf_1000x1000 measure idle latency and Long Tasks", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const file = readFileSync(resolve(process.cwd(), "samples/performance/perf_1000x1000_virtualized.tcd.json"));
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "perf_1000x1000_virtualized.tcd.json", mimeType: "application/json", buffer: file });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_perf_1']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await expect(name).toBeVisible();
  await page.evaluate(() => {
    type InteractionState = { __lt: Array<{ startTime: number; duration: number }>; __rafSamples: Array<{ startTime: number; duration: number }> };
    const state = window as typeof window & InteractionState;
    state.__lt = [];
    state.__rafSamples = [];
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement) || event.target.getAttribute("aria-label") !== "Inspector signal name") return;
      const startTime = performance.now();
      requestAnimationFrame(() => state.__rafSamples.push({ startTime, duration: performance.now() - startTime }));
    }, true);
    const propertySamples: Array<{ startTime: number; duration: number }> = [];
    (window as typeof window & { __propertyRafSamples: typeof propertySamples }).__propertyRafSamples = propertySamples;
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-testid='apply-inspector-signal']")) return;
      const startTime = performance.now();
      requestAnimationFrame(() => propertySamples.push({ startTime, duration: performance.now() - startTime }));
    }, true);
    new PerformanceObserver((list) => {
      state.__lt.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })));
    }).observe({ entryTypes: ["longtask"] });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const samples: { elapsedMs: number; inputToNextRafMs: number; applyToIdleMs: number; diagnosticsMs: number; styleMs: number; layoutMs: number; scriptMs: number; taskMs: number; longTasks: Array<{ startTime: number; duration: number }> }[] = [];
  for (let run = 0; run < 5; run += 1) {
    const revision = await host.getAttribute("data-canonical-revision");
    await name.fill(`RENAMED_${run}`);
    const browserBefore = await cdpMetrics(cdp);
    const interactionBefore = await page.evaluate(() => (window as unknown as { __rafSamples: unknown[] }).__rafSamples.length);
    const started = await page.evaluate(() => performance.now());
    await name.press("Enter");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __rafSamples: unknown[] }).__rafSamples.length)).toBe(interactionBefore + 1);
    await expect(host).not.toHaveAttribute("data-canonical-revision", revision!);
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    const ended = await page.evaluate(() => performance.now());
    const browserAfter = await cdpMetrics(cdp);
    const internal = await host.evaluate((element) => ({
      applyToIdleMs: Number((element as HTMLElement).dataset.lastApplyToIdleMs),
      diagnosticsMs: Number((element as HTMLElement).dataset.lastDiagnosticsDurationMs),
    }));
    const interaction = await page.evaluate((index) => {
      const samples = (window as unknown as { __rafSamples: Array<{ startTime: number; duration: number }> }).__rafSamples;
      const sample = samples[index];
      const longTasks = (window as unknown as { __lt: Array<{ startTime: number; duration: number }> }).__lt;
      return { inputToNextRafMs: sample?.duration ?? 0, longTasks: longTasks.filter((task) => sample !== undefined && task.startTime < sample.startTime + sample.duration && task.startTime + task.duration > sample.startTime) };
    }, interactionBefore);
    samples.push({
      elapsedMs: Math.round(ended - started),
      inputToNextRafMs: interaction.inputToNextRafMs,
      applyToIdleMs: internal.applyToIdleMs,
      diagnosticsMs: internal.diagnosticsMs,
      styleMs: Math.round(((browserAfter.RecalcStyleDuration ?? 0) - (browserBefore.RecalcStyleDuration ?? 0)) * 1000),
      layoutMs: Math.round(((browserAfter.LayoutDuration ?? 0) - (browserBefore.LayoutDuration ?? 0)) * 1000),
      scriptMs: Math.round(((browserAfter.ScriptDuration ?? 0) - (browserBefore.ScriptDuration ?? 0)) * 1000),
      taskMs: Math.round(((browserAfter.TaskDuration ?? 0) - (browserBefore.TaskDuration ?? 0)) * 1000),
      longTasks: interaction.longTasks,
    });
  }
  const role = page.getByTestId("inspector").getByLabel("Inspector signal role");
  const applyProperties = page.getByTestId("apply-inspector-signal");
  const propertySamples: { elapsedMs: number; inputToNextRafMs: number; styleMs: number; layoutMs: number; scriptMs: number; taskMs: number; longTasks: Array<{ startTime: number; duration: number }> }[] = [];
  for (let run = 0; run < 5; run += 1) {
    const revision = await host.getAttribute("data-canonical-revision");
    const sampleIndex = await page.evaluate(() => (window as typeof window & { __propertyRafSamples: unknown[] }).__propertyRafSamples.length);
    await role.selectOption(run % 2 === 0 ? "input" : "output");
    await expect(applyProperties).toBeEnabled();
    const browserBefore = await cdpMetrics(cdp);
    const started = await page.evaluate(() => performance.now());
    await applyProperties.click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __propertyRafSamples: unknown[] }).__propertyRafSamples.length)).toBe(sampleIndex + 1);
    await expect(host).not.toHaveAttribute("data-canonical-revision", revision!);
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    const ended = await page.evaluate(() => performance.now());
    const browserAfter = await cdpMetrics(cdp);
    const interaction = await page.evaluate((index) => {
      const sample = (window as typeof window & { __propertyRafSamples: Array<{ startTime: number; duration: number }> }).__propertyRafSamples[index];
      const longTasks = (window as typeof window & { __lt: Array<{ startTime: number; duration: number }> }).__lt;
      return { sample, longTasks: longTasks.filter((task) => sample !== undefined && task.startTime < sample.startTime + sample.duration && task.startTime + task.duration > sample.startTime) };
    }, sampleIndex);
    propertySamples.push({
      elapsedMs: Math.round(ended - started),
      inputToNextRafMs: interaction.sample?.duration ?? 0,
      styleMs: Math.round(((browserAfter.RecalcStyleDuration ?? 0) - (browserBefore.RecalcStyleDuration ?? 0)) * 1000),
      layoutMs: Math.round(((browserAfter.LayoutDuration ?? 0) - (browserBefore.LayoutDuration ?? 0)) * 1000),
      scriptMs: Math.round(((browserAfter.ScriptDuration ?? 0) - (browserBefore.ScriptDuration ?? 0)) * 1000),
      taskMs: Math.round(((browserAfter.TaskDuration ?? 0) - (browserBefore.TaskDuration ?? 0)) * 1000),
      longTasks: interaction.longTasks,
    });
  }
  // Capture one separate diagnostic CPU profile after the five unprofiled property-Apply samples. This profile is for attribution only and is
  // deliberately excluded from elapsedMs/p50/p95; Chrome sampling overhead must not contaminate the measured samples.
  const revision = await host.getAttribute("data-canonical-revision");
  await role.selectOption("output");
  await expect(applyProperties).toBeEnabled();
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  await applyProperties.click();
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
  const longTasks = [...samples.flatMap((sample) => sample.longTasks), ...propertySamples.flatMap((sample) => sample.longTasks)];
  const sorted = [...samples.map((sample) => sample.elapsedMs)].sort((left, right) => left - right);
  const internalSorted = [...samples.map((sample) => sample.inputToNextRafMs)].sort((left, right) => left - right);
  console.log(`[commit-latency-production] ${JSON.stringify({ workload: "perf_1000x1000_virtualized", rename: { samples, medianMs: sorted[2], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], internalInputToNextRaf: { medianMs: internalSorted[2], p95Ms: internalSorted[Math.ceil(internalSorted.length * 0.95) - 1] } }, inspectorPropertyApply: { samples: propertySamples, longTasks: { count: propertySamples.flatMap((sample) => sample.longTasks).length, maxMs: Math.max(0, ...propertySamples.flatMap((sample) => sample.longTasks).map((task) => task.duration)) } }, allMeasuredLongTasks: { count: longTasks.length, maxMs: Math.max(0, ...longTasks.map((task) => task.duration)) }, separateDiagnosticProfile: { excludedFromTimingSamples: true, hottestJs } })}`);
  expect(sorted[2]!, "median press-Enter -> editor-idle").toBeLessThan(1_000);
  expect(internalSorted.at(-1)!, "worst browser-internal Enter -> next requestAnimationFrame").toBeLessThan(50);
  expect(Math.max(...propertySamples.map((sample) => sample.inputToNextRafMs)), "worst browser-internal Inspector Apply -> next requestAnimationFrame").toBeLessThan(50);
  expect(longTasks, "ordinary Inspector commits must not create an interaction Long Task").toHaveLength(0);
});
