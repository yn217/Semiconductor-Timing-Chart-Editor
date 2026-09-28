import { expect, test, type CDPSession, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startInCycleSample } from "./cycle-startup.js";
import { annotationOwnerById, snapshotAnnotationIds, waitForCreatedAnnotationId } from "./annotation-identity.js";
import { generatePerformanceDocument, summarizePerformance, type BrowserPerformanceSample, type PerformanceFixtureSpec } from "@timing-chart-v2/testing";
import { evaluateOpenPerformanceGate, summarizeOpenPresentation, type OpenPerformanceBaseline } from "../performance/open-performance-gate.js";

startInCycleSample(test);

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
  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "Problems", exact: true }).click();
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
  // #175 P0: the actual whole-document `validateCanonicalDocument()` pass
  // (distinct from `validationRuns` above, which tracks routine per-command
  // semantic planning inside the session, not this GUI-level Refresh-Checks
  // validator) must stay at delta 0 across every one of these view-only
  // actions -- it only actually runs at initial mount and an explicit
  // "Refresh Checks" click (use-editor-application-owner.ts's
  // `validateDocument`), never on a passive React rerender.
  expect(afterSession.validatorInvocations).toBe(before.session.validatorInvocations);

  // A real, non-fake counter: an explicit "Refresh Checks" click (the one
  // production action that actually re-runs the validator) does increment
  // it, by exactly one.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Check", exact: true }).click();
  await page.getByTestId("review-refresh-checks").click();
  const afterRefresh = JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, any>;
  expect(afterRefresh.validatorInvocations).toBe(before.session.validatorInvocations + 1);
});

test("SnapIndex cache survives a non-geometric Signal rename", async ({ page }) => {
  await start(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("arrow");
  const previousIds = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const owner = annotationOwnerById(host, await waitForCreatedAnnotationId(host, previousIds, "arrow"));
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
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
  await inspector.getByLabel("Inspector signal name").press("Enter");
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
  const waveLayer = host.locator("[data-role='stable-waveform-surface']");
  const waveBox = await waveLayer.boundingBox();
  const firstRow = host.locator("[data-role='timing-row'][data-row-id='sig_perf_0']");
  const firstRowBox = await firstRow.boundingBox();
  const cycleOne = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='1']").evaluate((element) => (element as HTMLElement).style.left));
  expect(waveBox && firstRowBox).not.toBeNull();
  await page.mouse.click(waveBox!.x + cycleOne, firstRowBox!.y + firstRowBox!.height / 2);
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

  const secondRow = host.locator("[data-role='timing-row'][data-row-id]").last();
  const secondRowBox = await secondRow.boundingBox();
  expect(secondRowBox).not.toBeNull();
  await page.mouse.click(waveBox!.x + cycleOne, secondRowBox!.y + secondRowBox!.height / 2);
  const afterBottomQuery = await sessionCounters(page);
  expect(afterBottomQuery.snapIndexBuilds).toBeGreaterThan(builtBeforeJump);
  expect(afterBottomQuery.snapCandidateCount).toBeGreaterThan(0);

  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Pick arrow endpoints", exact: true }).click();
  const firstRowAfterReverse = host.locator("[data-role='timing-row'][data-row-id='sig_perf_0']");
  const firstRowAfterReverseBox = await firstRowAfterReverse.boundingBox();
  expect(firstRowAfterReverseBox).not.toBeNull();
  await page.mouse.click(waveBox!.x + cycleOne, firstRowAfterReverseBox!.y + firstRowAfterReverseBox!.height / 2);
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
    // Also require every mounted wave owner to have its rendered SVG, so a queued (not yet rendered) owner cannot land mid-measurement.
    const pending = await page.evaluate(() => Array.from(document.querySelectorAll("[data-role='wave-owner']")).filter((owner) => owner.querySelector("svg") === null).length);
    stable = current === previous && pending === 0 ? stable + 1 : 0; previous = current;
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

test("full-span Open builds the ruler once after reference geometry bootstrap", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await start(page);
  const before = await sessionCounters(page);
  const document = await openFixture(page, { signalCount: 100, cycleCount: 500 });
  const after = await sessionCounters(page);
  const ruler = page.getByTestId("cycle-ruler");
  await expect(ruler.locator(".cycle-tick")).toHaveCount(501);
  await expect(ruler.locator(".cycle-tick").first()).toHaveAttribute("data-source-cycle", "0");
  await expect(ruler.locator(".cycle-tick").last()).toHaveAttribute("data-source-cycle", "500");
  expect(after.rulerBuilds - before.rulerBuilds).toBe(1);
  const evidence = await page.getByTestId("cycle-surface").evaluate((host) => {
    const durations = JSON.parse(host.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
    const counters = JSON.parse(host.getAttribute("data-session-counters") ?? "{}") as Record<string, any>;
    return { openIdleMs: durations.idle, visibleWaveformsReadyMs: durations["visible-waveforms-ready"], rulerBuilds: counters.rulerBuilds, mountedWaveOwners: counters.mountedWaveOwners, title: document.querySelector(".app-titlebar h1")?.textContent };
  });
  expect(evidence.title).toBe(document.document.title);
  await testInfo.attach("full-span-ruler-open.json", { body: Buffer.from(JSON.stringify({ fixture: "generated-100x500", evidence, rulerBuildDelta: after.rulerBuilds - before.rulerBuilds }, null, 2)), contentType: "application/json" });
  console.log(`[full-span-ruler-open] ${JSON.stringify({ ...evidence, rulerBuildDelta: after.rulerBuilds - before.rulerBuilds })}`);
});

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
  // The published session counters lag the renderer (they refresh on the next diagnostics publish), so the "selection does no
  // wave/geometry work" invariant is asserted on the pulled renderer snapshot as well.
  const pull = () => surface.evaluate((element) => (element as HTMLElement & { requestPerformanceSnapshot: () => Record<string, unknown> }).requestPerformanceSnapshot());
  const pulledBeforeSelection = await pull();
  const geometryBeforeSelection = sessionBeforeSelection.geometryExtraction as { totalUsesVisited: number; totalGeometryEntriesEmitted: number; totalDuplicateKeyChecks: number; totalDuplicateKeyCollisions: number; totalTransitionBrickLookups: number; totalSkinPathParses: number; totalMatrixReads: number; totalDurationMs: number };
  // #755: the production path derives local geometry analytically from WaveJson, so the SVG geometry extractor stays idle
  // (it remains available behind ?geometrySource=svg and is covered by the analytic-equivalence probe).
  expect(geometryBeforeSelection.totalUsesVisited).toBe(0);
  expect(geometryBeforeSelection.totalGeometryEntriesEmitted).toBe(0);
  expect(geometryBeforeSelection.totalDuplicateKeyChecks).toBeGreaterThanOrEqual(geometryBeforeSelection.totalGeometryEntriesEmitted);
  expect(renderBeforeSelection.localGeometryBuilds).toBeGreaterThan(0);
  expect(geometryBeforeSelection.totalDuplicateKeyCollisions).toBeLessThanOrEqual(geometryBeforeSelection.totalDuplicateKeyChecks);
  expect(geometryBeforeSelection.totalMatrixReads).toBe(0); // #755: no SVG matrix reads on the analytic path
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
  const sessionAfterSelection = await sessionCounters(page);
  const { hits: _selectionBeforeHits, ...stableSessionBeforeSelection } = sessionBeforeSelection;
  const { hits: _selectionAfterHits, ...stableSessionAfterSelection } = sessionAfterSelection;
  expect(await pull()).toEqual(pulledBeforeSelection);
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
  const acceptedCommandsBeforeSignalEdit = Number(await host.getAttribute("data-accepted-command-count") ?? "0");
  const diagnosticsPassesBeforeSignalEdit = Number(await host.getAttribute("data-timing-diagnostics-full-passes") ?? "0");
  await event.getByRole("button", { name: /Edit transition/ }).click();
  const valueEditor = event.getByLabel("Value 0");
  if (await valueEditor.evaluate((element) => element.tagName === "SELECT")) await valueEditor.selectOption("1"); else await valueEditor.fill("1");
  await event.getByRole("button", { name: "Save" }).click(); await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => Number(await host.getAttribute("data-accepted-command-count") ?? "0")).toBeGreaterThan(acceptedCommandsBeforeSignalEdit);
  const signalEditLatency = await host.evaluate((element) => ({
    applyToIdleMs: Number((element as HTMLElement).dataset.lastApplyToIdleMs),
    diagnosticsMs: Number((element as HTMLElement).dataset.lastDiagnosticsDurationMs),
    fullPasses: Number((element as HTMLElement).dataset.timingDiagnosticsFullPasses),
  }));
  expect(Number.isFinite(signalEditLatency.applyToIdleMs)).toBe(true);
  expect(Number.isFinite(signalEditLatency.diagnosticsMs)).toBe(true);
  expect(signalEditLatency.fullPasses).toBeGreaterThan(diagnosticsPassesBeforeSignalEdit);
  const editAfter = await counters(page); expect(editAfter.waveDromRenders).toBe(editBefore.waveDromRenders + 1); expect(editAfter.localGeometryBuilds).toBe(editBefore.localGeometryBuilds + 1);

  const annotation = host.locator("[data-role='annotation-owner']").first(); await annotation.locator("[data-role='annotation-label']").click({ force: true });
  const annotationBefore = await counters(page); const acceptedCommandsBeforeAnnotation = Number(await host.getAttribute("data-accepted-command-count") ?? "0"); const diagnosticsReusesBeforeAnnotation = Number(await host.getAttribute("data-timing-diagnostics-reuses") ?? "0"); await page.getByTestId("annotation-editor").getByLabel("Annotation color").fill("#2255aa"); await page.getByTestId("apply-annotation-properties").click();
  await expect.poll(async () => Number(await host.getAttribute("data-accepted-command-count") ?? "0")).toBeGreaterThan(acceptedCommandsBeforeAnnotation);
  await expect.poll(async () => Number(await host.getAttribute("data-timing-diagnostics-reuses") ?? "0")).toBeGreaterThan(diagnosticsReusesBeforeAnnotation);
  const annotationAfter = await counters(page); expect(annotationAfter.waveDromRenders).toBe(annotationBefore.waveDromRenders); expect(annotationAfter.localGeometryBuilds).toBe(annotationBefore.localGeometryBuilds);
  const handle = annotation.locator("[data-role='annotation-handle']").first(); const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox!.x + 2, handleBox!.y + 2); await page.mouse.down(); const snapAfterDown = await sessionCounters(page);
  const pointerSamples: BrowserPerformanceSample[] = [];
  for (let offset = 1; offset <= 10; offset += 1) { const started = await page.evaluate(() => performance.now()); await page.mouse.move(handleBox!.x + 2 + offset, handleBox!.y + 2); const ended = await page.evaluate(() => performance.now()); pointerSamples.push({ durationMs: ended - started, rafMs: await page.evaluate(() => new Promise<number>((resolve) => { const before = performance.now(); requestAnimationFrame(() => resolve(performance.now() - before)); })), longTasks: await page.evaluate(() => (globalThis as unknown as { __p13LongTasks: number }).__p13LongTasks), domNodes: await page.locator("*").count() }); }
  expect((await sessionCounters(page)).snapIndexBuilds).toBeLessThanOrEqual(snapAfterDown.snapIndexBuilds + 1); await annotation.dispatchEvent("pointercancel"); await page.mouse.up();
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
  expect(geometry.totalUsesVisited).toBe(0); // #755: analytic geometry, extractor idle
  expect(geometry.totalGeometryEntriesEmitted).toBe(0);
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

test("large valid fixture records Open/Save browser profile evidence", async ({ page }, testInfo) => {
  await start(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const before = await cdpMetrics(cdp);
  const openStarted = await page.evaluate(() => performance.now());
  const document = await openFixture(page, { signalCount: 1000, cycleCount: 1000, profile: "transaction-heavy" });
  const openMs = await page.evaluate((started) => performance.now() - started, openStarted);
  const afterOpen = await cdpMetrics(cdp);
  const saveStarted = await page.evaluate(() => performance.now());
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const saveMs = await page.evaluate((started) => performance.now() - started, saveStarted);
  const afterSave = await cdpMetrics(cdp);
  expect(await download.path()).toBeTruthy();
  expect(openMs).toBeGreaterThan(0);
  expect(saveMs).toBeGreaterThan(0);
  await testInfo.attach("large-open-save-profile.json", { body: Buffer.from(JSON.stringify({ fixture: document.document.id, before, afterOpen, afterSave, openMs, saveMs, filename: download.suggestedFilename() }, null, 2)), contentType: "application/json" });
  console.log(`[large-open-save-profile] ${JSON.stringify({ fixture: document.document.id, openMs, saveMs })}`);
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
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_perf_1']").click(); const inspector = page.getByTestId("inspector"); const name = inspector.getByLabel("Inspector signal name", { exact: true }); await name.fill("RENAMED_ONCE"); await name.press("Enter");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await testInfo.attach("phase13-open-leak.json", { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json" });
});

test("PR Open gate: browser presentation-ready stays under 1s and within approved-main regression budget", async ({ page }, testInfo) => {
  await start(page);
  // Keep app-startup waveform work outside this File/Open benchmark so every
  // fixture starts from the same settled production editor state.
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  const baseline = JSON.parse(readFileSync(resolve(process.cwd(), "tests/performance/open-presentation-baseline.json"), "utf8")) as OpenPerformanceBaseline;
  const showcasePath = resolve(process.cwd(), "samples/showcase/21_large_feature_showcase.tcd.json");
  const showcaseBytes = readFileSync(showcasePath);
  const showcase = JSON.parse(showcaseBytes.toString("utf8")) as { document?: { title?: string }; signals?: unknown[]; timeline?: { cycleCount?: number } };
  expect(showcase.signals).toHaveLength(48);
  expect(showcase.timeline?.cycleCount).toBe(128);
  const fixtures = [
    { name: "showcase-48x128", fileName: "21_large_feature_showcase.tcd", title: showcase.document?.title ?? "", bytes: showcaseBytes },
    { name: "perf-50x100", fileName: "perf_50x100.tcd", spec: { signalCount: 50, cycleCount: 100 } as const },
  ];
  const summaries: Array<Record<string, unknown>> = [];
  const gateFailures: string[] = [];
  for (const fixture of fixtures) {
    const samples: number[] = [];
    const evidence: Array<Record<string, unknown>> = [];
    for (let trial = 0; trial < 5; trial += 1) {
      const document = "spec" in fixture ? generatePerformanceDocument(fixture.spec) : undefined;
      const title = "spec" in fixture ? document!.document.title : fixture.title;
      const bytes = "spec" in fixture ? Buffer.from(JSON.stringify(document)) : fixture.bytes;
      const host = page.getByTestId("cycle-surface");
      const openStartedAt = await page.evaluate(() => performance.now());
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: fixture.fileName, mimeType: "application/json", buffer: bytes });
      // Reopening the same fixture leaves the title unchanged. Wait for this
      // operation's fresh production marks instead of accepting stale ready
      // attributes from the previous document.
      await expect.poll(async () => host.evaluate((surface) => {
        const marks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
        return marks["open-command-start"] ?? 0;
      }), { timeout: 60_000 }).toBeGreaterThanOrEqual(openStartedAt);
      await expect.poll(async () => host.evaluate((surface) => {
        const marks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
        return marks["presentation-ready"] ?? 0;
      }), { timeout: 60_000 }).toBeGreaterThan(0);
      await expect(page.locator(".app-titlebar h1")).toHaveText(title, { timeout: 60_000 });
      await expect(host).toHaveAttribute("data-open-readiness", /^(presentation-ready|visible-waveforms-ready|idle)$/);
      const primary = await host.evaluate((surface, startedAt) => {
        const marks = JSON.parse(surface.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
        const durations = JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>;
        const capturedAt = performance.now();
        const longTasks = performance.getEntriesByType("longtask").filter((entry) => entry.startTime >= startedAt && entry.startTime < capturedAt);
        return {
          readinessAtCapture: surface.getAttribute("data-open-readiness"),
          presentationReadyMs: durations["presentation-ready"],
          documentReadyMs: durations["document-ready"],
          visibleWaveformsReadyMs: durations["visible-waveforms-ready"],
          idleMs: durations.idle,
          longTasksBeforePresentation: longTasks.length,
          maxLongTaskBeforePresentationMs: Math.max(0, ...longTasks.map((entry) => entry.duration)),
          marks,
          durations,
        };
      }, openStartedAt);
      expect(Number.isFinite(primary.presentationReadyMs), `${fixture.name} trial ${trial + 1} did not publish a browser-internal presentation-ready duration`).toBe(true);
      expect(primary.presentationReadyMs).toBeGreaterThanOrEqual(primary.documentReadyMs);
      samples.push(primary.presentationReadyMs);
      await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      const settled = await host.evaluate((surface) => JSON.parse(surface.getAttribute("data-open-phase-durations") ?? "{}") as Record<string, number>);
      evidence.push({ trial: trial + 1, ...primary, visibleWaveformsReadyMs: settled["visible-waveforms-ready"], idleMs: settled.idle });
    }
    const summary = summarizeOpenPresentation(fixture.name, samples);
    const failures = evaluateOpenPerformanceGate(summary, baseline);
    gateFailures.push(...failures);
    summaries.push({ ...summary, baseline: baseline.fixtures[fixture.name], baselineSourceCommit: baseline.sourceCommit, absoluteP95BudgetMsExclusive: baseline.absoluteP95BudgetMsExclusive, relativeMedianLimit: baseline.fixtures[fixture.name]!.medianMs * baseline.maxMedianRegressionRatio, relativeP95Limit: baseline.fixtures[fixture.name]!.p95Ms * baseline.maxP95RegressionRatio, evidence });
    console.log(`[open-presentation-gate] ${JSON.stringify(summaries.at(-1))}`);
  }
  await testInfo.attach("open-presentation-gate.json", { body: Buffer.from(JSON.stringify({ baseline, summaries }, null, 2)), contentType: "application/json" });
  expect(gateFailures, JSON.stringify({ baseline, summaries }, null, 2)).toEqual([]);
});

test("nightly/manual 500/1000 heavy profiles", async ({ page }, testInfo) => {
  test.skip(process.env.PERF_SCALE !== "nightly", "Run with PERF_SCALE=nightly for heavyweight profiling.");
  await start(page); const results = [];
  for (const spec of [{ signalCount: 500, cycleCount: 500, profile: "annotation-heavy" }, { signalCount: 1000, cycleCount: 1000, profile: "transaction-heavy" }] as const) { await openFixture(page, spec); results.push({ spec, diagnostics: await diagnostics(page), domNodes: await page.locator("*").count() }); }
  await testInfo.attach("phase13-nightly.json", { body: Buffer.from(JSON.stringify(results, null, 2)), contentType: "application/json" });
});
