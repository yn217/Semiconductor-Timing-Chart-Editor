import { expect, test, type CDPSession, type Page, type TestInfo } from "@playwright/test";
import { generatePerformanceDocument, summarizePerformance, type BrowserPerformanceSample, type PerformanceFixtureSpec } from "@timing-chart-v2/testing";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

async function openFixture(page: Page, spec: PerformanceFixtureSpec) {
  const document = generatePerformanceDocument(spec);
  await page.locator("input[type='file']").setInputFiles({ name: `${document.document.id}.tcd`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title, { timeout: 60_000 });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  let previous = -1, stable = 0;
  for (let attempt = 0; attempt < 40 && stable < 2; attempt += 1) {
    const current = (await counters(page)).waveDromRenders;
    stable = current === previous ? stable + 1 : 0; previous = current;
    await page.waitForTimeout(100);
  }
  return document;
}

async function start(page: Page) {
  await page.addInitScript(() => {
    (globalThis as unknown as { __p13LongTasks: number }).__p13LongTasks = 0;
    new PerformanceObserver((entries) => { (globalThis as unknown as { __p13LongTasks: number }).__p13LongTasks += entries.getEntries().length; }).observe({ type: "longtask", buffered: true });
  });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

const counters = async (page: Page) => JSON.parse(await page.getByTestId("cycle-surface").locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
const diagnostics = async (page: Page) => JSON.parse(await page.getByTestId("cycle-surface").locator("[data-role='timing-chart-surface']").getAttribute("data-performance-counters") ?? "null") as Record<string, any>;
const sessionCounters = async (page: Page) => JSON.parse(await page.getByTestId("cycle-surface").getAttribute("data-session-counters") ?? "null") as Record<string, number>;

async function cdpMetrics(cdp: CDPSession) {
  const result = await cdp.send("Performance.getMetrics") as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

test("PR guard: 100x500 selection/reorder/edit/annotation/view hard invariants with browser median/p95", async ({ page }, testInfo) => {
  await start(page);
  await openFixture(page, { signalCount: 100, cycleCount: 500 });
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const cdp = await page.context().newCDPSession(page); await cdp.send("Performance.enable");
  const browserBefore = await cdpMetrics(cdp);
  const renderBeforeSelection = await counters(page);
  const sessionBeforeSelection = await sessionCounters(page);
  const samples: BrowserPerformanceSample[] = [];
  for (let trial = 0; trial < 10; trial += 1) {
    const index = trial % 5 + 1;
    const name = `${index % 5 === 0 ? "BUS" : "SIG"}_${index}`;
    const started = await page.evaluate(() => performance.now());
    await host.locator(`[data-role='frozen-row'][data-row-id='sig_perf_${index}']`).click();
    await expect(page.getByTestId("selection-status")).toHaveText(name);
    const ended = await page.evaluate(() => performance.now());
    const rafMs = await page.evaluate(() => new Promise<number>((resolve) => { const before = performance.now(); requestAnimationFrame(() => resolve(performance.now() - before)); }));
    samples.push({ durationMs: ended - started, rafMs, longTasks: await page.evaluate(() => (globalThis as unknown as { __p13LongTasks: number }).__p13LongTasks), domNodes: await page.locator("*").count() });
  }
  expect(await counters(page)).toEqual(renderBeforeSelection);
  expect(await sessionCounters(page)).toEqual(sessionBeforeSelection);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  const reorderBefore = await counters(page);
  const stableSvg = await surface.locator("[data-signal-id='sig_perf_5'] > svg").elementHandle();
  await surface.locator("[data-role='left-row'][data-row-id='sig_perf_5']").dragTo(surface.locator("[data-role='left-row'][data-row-id='sig_perf_4']"), { targetPosition: { x: 100, y: 2 } });
  const reorderAfter = await counters(page);
  expect(reorderAfter.waveDromRenders).toBe(reorderBefore.waveDromRenders); expect(reorderAfter.localGeometryBuilds).toBe(reorderBefore.localGeometryBuilds);
  const stableAfter = await surface.locator("[data-signal-id='sig_perf_5'] > svg").elementHandle(); expect(await stableSvg!.evaluate((before, after) => before === after, stableAfter)).toBe(true);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_perf_1']").click();
  const editBefore = await counters(page); const event = page.getByTestId("signal-editor").locator("form.event-row").first();
  await event.getByLabel("Value 0").fill("1"); await event.getByRole("button", { name: "Save" }).click(); await expect(host).toHaveAttribute("data-editor-idle", "true");
  const editAfter = await counters(page); expect(editAfter.waveDromRenders).toBe(editBefore.waveDromRenders + 1); expect(editAfter.localGeometryBuilds).toBe(editBefore.localGeometryBuilds + 1);

  const annotation = host.locator("[data-role='annotation-owner']").first(); await annotation.locator("[data-role='annotation-label']").click({ force: true });
  const annotationBefore = await counters(page); await page.getByTestId("annotation-editor").getByLabel("Annotation color").fill("#2255aa"); await page.getByTestId("apply-annotation-properties").click();
  const annotationAfter = await counters(page); expect(annotationAfter.waveDromRenders).toBe(annotationBefore.waveDromRenders); expect(annotationAfter.localGeometryBuilds).toBe(annotationBefore.localGeometryBuilds);
  const handle = annotation.locator("[data-role='annotation-handle']").first(); const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox!.x + 2, handleBox!.y + 2); await page.mouse.down(); const snapAfterDown = await sessionCounters(page);
  const pointerSamples: BrowserPerformanceSample[] = [];
  for (let offset = 1; offset <= 10; offset += 1) { const started = await page.evaluate(() => performance.now()); await page.mouse.move(handleBox!.x + 2 + offset, handleBox!.y + 2); const ended = await page.evaluate(() => performance.now()); pointerSamples.push({ durationMs: ended - started, rafMs: await page.evaluate(() => new Promise<number>((resolve) => { const before = performance.now(); requestAnimationFrame(() => resolve(performance.now() - before)); })), longTasks: await page.evaluate(() => (globalThis as unknown as { __p13LongTasks: number }).__p13LongTasks), domNodes: await page.locator("*").count() }); }
  expect((await sessionCounters(page)).snapIndexBuilds).toBe(snapAfterDown.snapIndexBuilds); await annotation.dispatchEvent("pointercancel"); await page.mouse.up();
  const historyBeforePreview = await page.getByTestId("history-status").textContent(); const previewBefore = await counters(page);
  const box = await annotation.locator("[data-role='annotation-body']").boundingBox(); await page.mouse.move(box!.x + 2, box!.y + 2); await page.mouse.down(); await page.mouse.move(box!.x + 10, box!.y + 4); await annotation.dispatchEvent("pointercancel"); await page.mouse.up();
  expect(await counters(page)).toEqual(previewBefore); await expect(page.getByTestId("history-status")).toHaveText(historyBeforePreview!);

  const viewport = page.getByTestId("cycle-viewport"); await viewport.evaluate((element) => { element.scrollTop = 300; element.dispatchEvent(new Event("scroll")); }); await page.waitForTimeout(500);
  const viewBefore = await counters(page); const sessionBeforeView = await sessionCounters(page); const historyBeforeView = await page.getByTestId("history-status").textContent();
  await viewport.evaluate((element) => { element.scrollLeft += 8; element.dispatchEvent(new Event("scroll")); }); await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click(); await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click(); await page.waitForTimeout(100);
  const viewAfter = await counters(page); expect(viewAfter.waveDromRenders).toBe(viewBefore.waveDromRenders); expect(viewAfter.localGeometryBuilds).toBe(viewBefore.localGeometryBuilds); await expect(page.getByTestId("history-status")).toHaveText(historyBeforeView!);
  const sessionAfterView = await sessionCounters(page); expect(sessionAfterView.rowLayoutBuilds).toBe(sessionBeforeView.rowLayoutBuilds); expect(sessionAfterView.commits).toBe(sessionBeforeView.commits);

  const browserAfter = await cdpMetrics(cdp); const summary = summarizePerformance(samples); const pointerSummary = summarizePerformance(pointerSamples);
  const evidence = { fixture: "perf_100x500", summary, pointerSummary, internal: { renderBeforeSelection, reorderBefore, reorderAfter, editBefore, editAfter, annotationBefore, annotationAfter, viewBefore, viewAfter, diagnostics: await diagnostics(page), session: await sessionCounters(page) }, browser: { before: browserBefore, after: browserAfter } };
  console.log(`[phase13-pr] ${JSON.stringify({ summary, pointerSummary, diagnostics: evidence.internal.diagnostics, browserDelta: { layoutCount: (browserAfter.LayoutCount ?? 0) - (browserBefore.LayoutCount ?? 0), layoutDuration: (browserAfter.LayoutDuration ?? 0) - (browserBefore.LayoutDuration ?? 0), recalcStyleCount: (browserAfter.RecalcStyleCount ?? 0) - (browserBefore.RecalcStyleCount ?? 0), recalcStyleDuration: (browserAfter.RecalcStyleDuration ?? 0) - (browserBefore.RecalcStyleDuration ?? 0), scriptDuration: (browserAfter.ScriptDuration ?? 0) - (browserBefore.ScriptDuration ?? 0), taskDuration: (browserAfter.TaskDuration ?? 0) - (browserBefore.TaskDuration ?? 0), jsHeapUsedSize: browserAfter.JSHeapUsedSize ?? 0 } })}`);
  await testInfo.attach("phase13-pr-performance.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
  expect(summary.trials).toBe(10); expect(summary.p95Ms).toBeGreaterThanOrEqual(summary.medianMs); expect(summary.maxDomNodes).toBeGreaterThan(0); expect(pointerSummary.trials).toBe(10); expect(pointerSummary.p95Ms).toBeGreaterThanOrEqual(pointerSummary.medianMs);
});

test("1000x1000 virtualization mounts viewport-scale rows and avoids duplicate bindings", async ({ page }, testInfo) => {
  await start(page);
  await openFixture(page, { signalCount: 1000, cycleCount: 1000 });
  let diagnostic = await diagnostics(page);
  expect(diagnostic.mountedRows).toBeLessThan(60); expect(diagnostic.mountedWaveOwners).toBeLessThan(60);
  expect(await page.getByTestId("cycle-surface").locator("[data-row-id]").count()).toBeLessThan(180);
  const viewport = page.getByTestId("cycle-viewport");
  for (let step = 1; step <= 8; step += 1) { await viewport.evaluate((element, fraction) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction; element.dispatchEvent(new Event("scroll")); }, step / 8); await page.waitForTimeout(250); }
  diagnostic = await diagnostics(page); expect(diagnostic.mountedRows).toBeLessThan(60); expect(diagnostic.mountedWaveOwners).toBeLessThan(60);
  expect(diagnostic.cachedWaveOwners).toBeLessThanOrEqual(diagnostic.waveOwnerCacheLimit);
  const duplicate = await page.getByTestId("cycle-surface").locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.length - new Set(owners.map((owner) => (owner as HTMLElement).dataset.signalId)).size);
  expect(duplicate).toBe(0);
  console.log(`[phase13-1000] ${JSON.stringify({ diagnostic: { ...diagnostic, waveRendersBySignal: Object.keys(diagnostic.waveRendersBySignal ?? {}).length, localGeometryBuildsBySignal: Object.keys(diagnostic.localGeometryBuildsBySignal ?? {}).length }, duplicate, domNodes: await page.locator("*").count() })}`);
  await testInfo.attach("phase13-1000-virtualization.json", { body: Buffer.from(JSON.stringify({ fixture: "perf_1000x1000", diagnostic, domNodes: await page.locator("*").count() }, null, 2)), contentType: "application/json" });
});

test("repeated Open A/B/A releases old owners and does not stack handlers", async ({ page }, testInfo) => {
  await start(page); const cdp = await page.context().newCDPSession(page); await cdp.send("Performance.enable");
  const evidence: unknown[] = [];
  for (let index = 0; index < 3; index += 1) {
    const openStarted = await page.evaluate(() => performance.now());
    await openFixture(page, index % 2 ? { signalCount: 100, cycleCount: 500, profile: "mixed" } : { signalCount: 50, cycleCount: 100 });
    const firstCorrectPaintMs = await page.evaluate((started) => performance.now() - started, openStarted);
    await cdp.send("HeapProfiler.collectGarbage"); evidence.push({ index, firstCorrectPaintMs, diagnostic: await diagnostics(page), session: await sessionCounters(page), metrics: await cdpMetrics(cdp) });
  }
  const final = await diagnostics(page); expect(final.cachedWaveOwners).toBeLessThan(60); expect(final.mountedRows).toBeLessThan(60);
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_perf_1']").click(); const name = page.getByTestId("inspector").getByLabel("Inspector signal name"); await name.fill("RENAMED_ONCE"); await name.blur();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await testInfo.attach("phase13-open-leak.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
});

test("nightly/manual 500/1000 heavy profiles", async ({ page }, testInfo) => {
  test.skip(process.env.PERF_SCALE !== "nightly", "Run with PERF_SCALE=nightly for heavyweight profiling.");
  await start(page); const results = [];
  for (const spec of [{ signalCount: 500, cycleCount: 500, profile: "annotation-heavy" }, { signalCount: 1000, cycleCount: 1000, profile: "transaction-heavy" }] as const) { await openFixture(page, spec); results.push({ spec, diagnostics: await diagnostics(page), domNodes: await page.locator("*").count() }); }
  await testInfo.attach("phase13-nightly.json", { body: Buffer.from(JSON.stringify(results, null, 2)), contentType: "application/json" });
});
