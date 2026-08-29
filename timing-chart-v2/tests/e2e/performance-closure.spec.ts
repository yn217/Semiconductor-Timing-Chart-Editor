import { expect, test, type CDPSession, type Page, type TestInfo } from "@playwright/test";
import { generatePerformanceDocument, summarizePerformance, type BrowserPerformanceSample, type PerformanceFixtureSpec } from "@timing-chart-v2/testing";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("View-only operations keep canonical validation and render counters unchanged", async ({ page }) => {
  await start(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    session: JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, any>,
    render: JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as Record<string, any>,
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await page.getByTestId("bottom-tabs").getByRole("button", { name: "Problems", exact: true }).click();
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = 80; element.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(250);
  const afterSession = JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, any>;
  const afterRender = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as Record<string, any>;
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  expect(afterSession.validationRuns).toBe(before.session.validationRuns);
  expect(afterSession.commits).toBe(before.session.commits);
  expect(afterSession.snapIndexBuilds).toBe(before.session.snapIndexBuilds);
  expect(afterRender.waveDromRenders).toBe(before.render.waveDromRenders);
  expect(afterRender.localGeometryBuilds).toBe(before.render.localGeometryBuilds);
});

test("SnapIndex cache survives a non-geometric Signal rename", async ({ page }) => {
  await start(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("arrow");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const handle = host.locator("[data-role='annotation-owner']").last().locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 2, box!.y + 2);
  await page.mouse.down();
  const beforeRename = (await sessionCounters(page)).snapIndexBuilds;
  await page.mouse.up();
  expect((await sessionCounters(page)).snapIndexBuilds).toBe(beforeRename);
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("REQUEST_RENAMED");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect((await sessionCounters(page)).snapIndexBuilds).toBe(beforeRename);
});

test("retargets the SnapIndex after a vertical viewport jump", async ({ page }) => {
  await start(page);
  await openFixture(page, { signalCount: 1000, cycleCount: 32 });
  const host = page.getByTestId("cycle-surface");
  const viewport = page.getByTestId("cycle-viewport");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("button", { name: "Pick arrow endpoints", exact: true }).click();
  const firstWave = host.locator("[data-role='stable-waveform-surface'] [data-signal-id] svg").first();
  const firstBox = await firstWave.boundingBox();
  expect(firstBox).not.toBeNull();
  await page.mouse.click(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
  const builtBeforeJump = (await sessionCounters(page)).snapIndexBuilds;
  expect(builtBeforeJump).toBeGreaterThan(0);

  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight - element.clientHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(300);
  const afterJump = await sessionCounters(page);
  expect(afterJump.snapIndexBuilds).toBeGreaterThanOrEqual(builtBeforeJump);
  expect(afterJump.viewportRowsVisited).toBeGreaterThan(0);

  const secondWave = host.locator("[data-role='stable-waveform-surface'] [data-signal-id] svg").last();
  const secondBox = await secondWave.boundingBox();
  expect(secondBox).not.toBeNull();
  await page.mouse.click(secondBox!.x + secondBox!.width / 2, secondBox!.y + secondBox!.height / 2);
  const afterBottomQuery = await sessionCounters(page);
  expect(afterBottomQuery.snapIndexBuilds).toBeGreaterThan(builtBeforeJump);
  expect(afterBottomQuery.snapCandidateCount).toBeGreaterThan(0);

  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Pick arrow endpoints", exact: true }).click();
  const firstWaveAfterReverse = host.locator("[data-role='stable-waveform-surface'] [data-signal-id] svg").first();
  const firstBoxAfterReverse = await firstWaveAfterReverse.boundingBox();
  expect(firstBoxAfterReverse).not.toBeNull();
  await page.mouse.click(firstBoxAfterReverse!.x + firstBoxAfterReverse!.width / 2, firstBoxAfterReverse!.y + firstBoxAfterReverse!.height / 2);
  expect((await sessionCounters(page)).snapIndexBuilds).toBeGreaterThan(afterBottomQuery.snapIndexBuilds);
});

async function openFixture(page: Page, spec: PerformanceFixtureSpec) {
  const document = generatePerformanceDocument(spec);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `${document.document.id}.tcd`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title, { timeout: 60_000 });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  let previous = -1, stable = 0;
  for (let attempt = 0; attempt < 60 && stable < 5; attempt += 1) {
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
const sessionCounters = async (page: Page) => JSON.parse(await page.getByTestId("cycle-surface").getAttribute("data-session-counters") ?? "null") as Record<string, any>;

test("heavy renderer diagnostics are pull-based and absent from hot-path DOM counters", async ({ page }) => {
  await start(page);
  const surface = page.getByTestId("cycle-surface").locator("[data-role='timing-chart-surface']");
  const published = await diagnostics(page);
  expect(published.waveRendersBySignal).toBeUndefined();
  expect(published.localGeometryBuildsBySignal).toBeUndefined();
  expect(published.diagnosticSerializationCount).toBeGreaterThan(0);
  expect(published.diagnosticSerializationBytes).toBeGreaterThan(0);
  expect(published.diagnosticSerializationDurationMs).toBeGreaterThanOrEqual(0);
  const snapshot = await surface.evaluate((element) => (element as HTMLElement & { requestPerformanceSnapshot: () => Record<string, unknown> }).requestPerformanceSnapshot());
  expect(Object.keys((snapshot.waveRendersBySignal ?? {}) as object)).not.toHaveLength(0);
  expect(Object.keys((snapshot.localGeometryBuildsBySignal ?? {}) as object)).not.toHaveLength(0);
});

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
  const geometryBeforeSelection = sessionBeforeSelection.geometryExtraction as { totalUsesVisited: number; totalGeometryEntriesEmitted: number; totalDuplicateKeyChecks: number; totalDuplicateKeyCollisions: number; totalTransitionBrickLookups: number; totalSkinPathParses: number; totalMatrixReads: number; totalDurationMs: number };
  expect(geometryBeforeSelection.totalUsesVisited).toBeGreaterThan(0);
  expect(geometryBeforeSelection.totalGeometryEntriesEmitted).toBeGreaterThan(0);
  expect(geometryBeforeSelection.totalDuplicateKeyChecks).toBeGreaterThanOrEqual(geometryBeforeSelection.totalGeometryEntriesEmitted);
  expect(geometryBeforeSelection.totalDuplicateKeyCollisions).toBeLessThanOrEqual(geometryBeforeSelection.totalDuplicateKeyChecks);
  expect(geometryBeforeSelection.totalMatrixReads).toBeGreaterThanOrEqual(2);
  const samples: BrowserPerformanceSample[] = [];
  for (let trial = 0; trial < 10; trial += 1) {
    const index = trial % 5 + 1;
    const name = `${index % 5 === 0 ? "BUS" : "SIG"}_${index}`;
    const started = await page.evaluate(() => performance.now());
    // The fixture intentionally samples already-mounted rows; force avoids Playwright
    // auto-scrolling a virtualized row and turning selection into a viewport mutation.
    await host.locator(`[data-role='frozen-row'][data-row-id='sig_perf_${index}']`).dispatchEvent("click");
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
  const reorderSource = surface.locator("[data-role='left-row'][data-row-id='sig_perf_5']");
  const reorderTarget = surface.locator("[data-role='left-row'][data-row-id='sig_perf_4']");
  await reorderSource.evaluate((element) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
  });
  await reorderTarget.evaluate((element) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientY: element.getBoundingClientRect().top + 2, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await reorderSource.dispatchEvent("dragend");
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

  const viewport = page.getByTestId("cycle-viewport"); const sessionBeforeScroll = await sessionCounters(page); await viewport.evaluate((element) => { element.scrollTop = 300; element.dispatchEvent(new Event("scroll")); }); await page.waitForTimeout(500);
  const sessionAfterScroll = await sessionCounters(page);
  expect(sessionAfterScroll.fullVisibleRowScans).toBe(sessionBeforeScroll.fullVisibleRowScans);
  expect(sessionAfterScroll.viewportOnlyBuilds).toBeGreaterThan(sessionBeforeScroll.viewportOnlyBuilds);
  expect(sessionAfterScroll.viewportRowsVisited).toBeGreaterThan(0);
  expect(sessionAfterScroll.rowLayoutBuilds).toBe(sessionBeforeScroll.rowLayoutBuilds);
  const viewBefore = await counters(page); const sessionBeforeView = await sessionCounters(page); const historyBeforeView = await page.getByTestId("history-status").textContent();
  await viewport.evaluate((element) => { element.scrollLeft += 8; element.dispatchEvent(new Event("scroll")); }); await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click(); await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click(); await page.waitForTimeout(100);
  const viewAfter = await counters(page); expect(viewAfter.waveDromRenders).toBe(viewBefore.waveDromRenders); expect(viewAfter.localGeometryBuilds).toBe(viewBefore.localGeometryBuilds); await expect(page.getByTestId("history-status")).toHaveText(historyBeforeView!);
  const sessionAfterView = await sessionCounters(page); expect(sessionAfterView.rowLayoutBuilds).toBe(sessionBeforeView.rowLayoutBuilds); expect(sessionAfterView.commits).toBe(sessionBeforeView.commits);

  const browserAfter = await cdpMetrics(cdp); const summary = summarizePerformance(samples); const pointerSummary = summarizePerformance(pointerSamples);
  const evidence = { fixture: "perf_100x500", summary, pointerSummary, geometryExtraction: geometryBeforeSelection, internal: { renderBeforeSelection, reorderBefore, reorderAfter, editBefore, editAfter, annotationBefore, annotationAfter, viewBefore, viewAfter, diagnostics: await diagnostics(page), session: await sessionCounters(page) }, browser: { before: browserBefore, after: browserAfter } };
  console.log(`[phase13-pr] ${JSON.stringify({ summary, pointerSummary, diagnostics: evidence.internal.diagnostics, browserDelta: { layoutCount: (browserAfter.LayoutCount ?? 0) - (browserBefore.LayoutCount ?? 0), layoutDuration: (browserAfter.LayoutDuration ?? 0) - (browserBefore.LayoutDuration ?? 0), recalcStyleCount: (browserAfter.RecalcStyleCount ?? 0) - (browserBefore.RecalcStyleCount ?? 0), recalcStyleDuration: (browserAfter.RecalcStyleDuration ?? 0) - (browserBefore.RecalcStyleDuration ?? 0), scriptDuration: (browserAfter.ScriptDuration ?? 0) - (browserBefore.ScriptDuration ?? 0), taskDuration: (browserAfter.TaskDuration ?? 0) - (browserBefore.TaskDuration ?? 0), jsHeapUsedSize: browserAfter.JSHeapUsedSize ?? 0 } })}`);
  await testInfo.attach("phase13-pr-performance.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
  expect(summary.trials).toBe(10); expect(summary.p95Ms).toBeGreaterThanOrEqual(summary.medianMs); expect(summary.maxDomNodes).toBeGreaterThan(0); expect(pointerSummary.trials).toBe(10); expect(pointerSummary.p95Ms).toBeGreaterThanOrEqual(pointerSummary.medianMs);
});

test("1000x1000 virtualization mounts viewport-scale rows and avoids duplicate bindings", async ({ page }, testInfo) => {
  await start(page);
  await openFixture(page, { signalCount: 1000, cycleCount: 1000 });
  const geometry = (await sessionCounters(page)).geometryExtraction as { totalUsesVisited: number; totalGeometryEntriesEmitted: number; totalDuplicateKeyChecks: number; totalDuplicateKeyCollisions: number; totalDurationMs: number };
  expect(geometry.totalUsesVisited).toBeGreaterThan(0);
  expect(geometry.totalGeometryEntriesEmitted).toBeGreaterThan(0);
  expect(geometry.totalDuplicateKeyCollisions).toBeLessThanOrEqual(geometry.totalDuplicateKeyChecks);
  console.log(`[geometry-1000] ${JSON.stringify(geometry)}`);
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

test("viewport-only projection remains bounded at 1k, 5k, and 10k rows", async ({ page }, testInfo) => {
  await start(page);
  const measurements: Array<Record<string, unknown>> = [];
  for (const signalCount of [1_000, 5_000, 10_000] as const) {
    await openFixture(page, { signalCount, cycleCount: 100 });
    const viewport = page.getByTestId("cycle-viewport");
    const before = await sessionCounters(page);
    const rendererBefore = await diagnostics(page);
    await viewport.evaluate((element) => { element.scrollTop = Math.max(1, element.scrollHeight - element.clientHeight) / 2; element.dispatchEvent(new Event("scroll")); });
    await page.waitForTimeout(250);
    const after = await sessionCounters(page);
    const renderer = await diagnostics(page);
    const rowLayoutBefore = before.rowLayoutBuilds;
    const rowLayoutAfter = after.rowLayoutBuilds;
    const visited = after.viewportRowsVisited - before.viewportRowsVisited;
    const binarySteps = after.viewportBinarySearchSteps - before.viewportBinarySearchSteps;
    expect(after.fullVisibleRowScans - before.fullVisibleRowScans).toBe(0);
    expect(rowLayoutAfter - rowLayoutBefore).toBe(0);
    expect(visited).toBeGreaterThan(0);
    expect(visited).toBeLessThan(200);
    expect(binarySteps).toBeGreaterThan(0);
    expect(renderer.fullRowScans - rendererBefore.fullRowScans).toBe(0);
    expect(renderer.rowsVisited).toBeLessThan(200);
    measurements.push({ signalCount, mountedRows: after.lastMountedRange, viewportRowsVisited: visited, viewportBinarySearchSteps: binarySteps, fullVisibleRowScansDelta: after.fullVisibleRowScans - before.fullVisibleRowScans, rowLayoutBuildsDelta: rowLayoutAfter - rowLayoutBefore });
  }
  await testInfo.attach("phase14-viewport-scale-browser.json", { body: Buffer.from(JSON.stringify(measurements, null, 2)), contentType: "application/json" });
  console.log(`[phase14-browser-scale] ${JSON.stringify(measurements)}`);
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
  expect(final.rowYStaleCount).toBe(0); expect(final.rowYSize).toBeLessThan(100); expect(final.rowYPrunePasses).toBeGreaterThanOrEqual(3);
  expect(final.waveRendersBySignalCount).toBeLessThan(60); expect(final.localGeometryBuildsBySignalCount).toBeLessThan(60); expect(final.diagnosticMapPrunePasses).toBeGreaterThanOrEqual(3);
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_perf_1']").click(); const inspector = page.getByTestId("inspector"); const name = inspector.getByLabel("Inspector signal name"); await name.fill("RENAMED_ONCE"); await inspector.getByTestId("apply-inspector-signal").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await testInfo.attach("phase13-open-leak.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
});

test("nightly/manual 500/1000 heavy profiles", async ({ page }, testInfo) => {
  test.skip(process.env.PERF_SCALE !== "nightly", "Run with PERF_SCALE=nightly for heavyweight profiling.");
  await start(page); const results = [];
  for (const spec of [{ signalCount: 500, cycleCount: 500, profile: "annotation-heavy" }, { signalCount: 1000, cycleCount: 1000, profile: "transaction-heavy" }] as const) { await openFixture(page, spec); results.push({ spec, diagnostics: await diagnostics(page), domNodes: await page.locator("*").count() }); }
  await testInfo.attach("phase13-nightly.json", { body: Buffer.from(JSON.stringify(results, null, 2)), contentType: "application/json" });
});
