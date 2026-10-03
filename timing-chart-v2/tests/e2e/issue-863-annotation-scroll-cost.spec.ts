import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #863 closure-matrix slice: with 20,000 Annotations in the document, a full horizontal traversal of the Cycle timeline keeps the number
 * of mounted Annotation owners bounded by the viewport (not the document) and the frame time loose-bounded. p50/p95/Long Tasks are logged
 * as one JSON line for the Issue. Annotations are spread over 1,000 cycles (20 per cycle), anchored to Signals.
 */
test("horizontal scroll over 20,000 Annotations keeps mounted Annotation owners bounded and frames responsive", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 1000, profile: "standard" });
  const annotations = Array.from({ length: 20_000 }, (_, index) => ({ id: `ann_863_${index}`, type: "verticalLine", label: `A${index}`, visible: true, anchor: { signalId: base.signals[1 + (index % 50)]!.id, cycle: index % 1000, point: "cycle-start" } }));
  const document = { ...base, annotations };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b863.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "100", { timeout: 180_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  await expect.poll(() => page.locator("[data-role='annotation-owner']").count(), { timeout: 60_000 }).toBeGreaterThan(0);

  // Capture exactly one real horizontal-wheel step with Chromium's own
  // timeline trace. This diagnostic is deliberately separate from the 150
  // frame-latency samples below: profiling overhead must not enter p50/p95.
  const cdp = await page.context().newCDPSession(page);
  const traceEvents: Array<{ name?: string; cat?: string; ph?: string; ts?: number; dur?: number; pid?: number; tid?: number; args?: { name?: string } }> = [];
  cdp.on("Tracing.dataCollected", (event) => traceEvents.push(...event.value));
  const traceComplete = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", () => resolve()));
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  await cdp.send("Tracing.start", { categories: "devtools.timeline,v8,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame" });
  const scrollOwner = page.locator("[data-role='timeline-viewport']");
  const scrollBefore = await scrollOwner.evaluate((element) => element.scrollLeft);
  const retainedOverlayId = "ann_863_50";
  await scrollOwner.evaluate((element, id) => {
    const overlay = element.ownerDocument.querySelector<HTMLElement>(`[data-role='annotation-owner'][data-annotation-id='${id}']`);
    if (!overlay) throw new Error(`Expected visible stable Annotation ${id} before scroll`);
    const body = overlay.querySelector<HTMLElement>("[data-role='annotation-body']");
    const label = overlay.querySelector<HTMLElement>("[data-role='annotation-label']");
    const handle = overlay.querySelector<HTMLElement>("[data-role='annotation-handle'][data-annotation-field='anchor']");
    if (!body || !label || !handle) throw new Error(`Annotation ${id} is missing its expected overlay children`);
    const probes = ((window as unknown as Record<string, unknown>).__e863OverlayNodeProbes as Map<string, { overlay: HTMLElement; body: HTMLElement; label: HTMLElement; handle: HTMLElement; bodyTransform: string; bodyScreenLeft: number }> | undefined) ?? new Map();
    probes.set(id, { overlay, body, label, handle, bodyTransform: body.style.transform, bodyScreenLeft: body.getBoundingClientRect().left });
    (window as unknown as Record<string, unknown>).__e863OverlayNodeProbes = probes;
  }, retainedOverlayId);
  await scrollOwner.evaluate((element) => { element.scrollLeft = Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + 420); });
  await expect.poll(() => scrollOwner.evaluate((element) => element.scrollLeft), { message: "CDP profile covers a real horizontal scroll update" }).toBeGreaterThan(scrollBefore);
  const scrollAfter = await scrollOwner.evaluate((element) => element.scrollLeft);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const nodeReuse = await page.evaluate((id) => {
    const probes = (window as unknown as Record<string, unknown>).__e863OverlayNodeProbes as Map<string, { overlay: HTMLElement; body: HTMLElement; label: HTMLElement; handle: HTMLElement; bodyTransform: string; bodyScreenLeft: number }> | undefined;
    const previous = probes?.get(id);
    const current = document.querySelector<HTMLElement>(`[data-role='annotation-owner'][data-annotation-id='${id}']`);
    if (!previous || !current) return { ownerMounted: Boolean(current), ownerReused: false, bodyReused: false, labelReused: false, handleReused: false, geometryUpdated: false };
    return {
      ownerMounted: true,
      ownerReused: current === previous.overlay,
      bodyReused: current.querySelector("[data-role='annotation-body']") === previous.body,
      labelReused: current.querySelector("[data-role='annotation-label']") === previous.label,
      handleReused: current.querySelector("[data-role='annotation-handle'][data-annotation-field='anchor']") === previous.handle,
      localGeometryStable: previous.bodyTransform === previous.body.style.transform,
      screenPositionUpdated: previous.bodyScreenLeft !== previous.body.getBoundingClientRect().left,
    };
  }, retainedOverlayId);
  expect(nodeReuse.ownerMounted, "the known Annotation remains in the overlapped viewport window").toBe(true);
  expect(nodeReuse.ownerReused, "stable Annotation identity retains its owner node").toBe(true);
  expect(nodeReuse.bodyReused, "scroll updates body geometry without replacing its DOM node").toBe(true);
  expect(nodeReuse.labelReused, "scroll updates label geometry without replacing its DOM node").toBe(true);
  expect(nodeReuse.handleReused, "scroll updates anchor geometry without replacing its DOM node").toBe(true);
  expect(nodeReuse.localGeometryStable, "source-local geometry does not drift while the shared viewport scrolls").toBe(true);
  expect(nodeReuse.screenPositionUpdated, "the retained body moves on screen with the shared viewport").toBe(true);
  console.log("E863_OVERLAY_NODE_REUSE", JSON.stringify(nodeReuse));
  await cdp.send("Tracing.end");
  await traceComplete;
  const { profile: cpuProfile } = await cdp.send("Profiler.stop");
  await cdp.send("Profiler.disable");
  await cdp.detach();
  const threadNames = new Map(traceEvents.filter((event) => event.ph === "M" && event.name === "thread_name" && event.tid !== undefined).map((event) => [event.tid!, event.args?.name ?? "unknown"]));
  const rendererMainThreadIds = new Set([...threadNames.entries()].filter(([, name]) => name === "CrRendererMain").map(([id]) => id));
  const mainThread = traceEvents.filter((event) => event.ph === "X" && event.tid !== undefined && rendererMainThreadIds.has(event.tid) && Number.isFinite(event.ts) && Number.isFinite(event.dur));
  const totals = new Map<string, { count: number; inclusiveMs: number; maxMs: number }>();
  for (const event of mainThread) {
    const name = event.name ?? "unknown";
    const current = totals.get(name) ?? { count: 0, inclusiveMs: 0, maxMs: 0 };
    const durationMs = (event.dur ?? 0) / 1000;
    current.count += 1;
    current.inclusiveMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    totals.set(name, current);
  }
  const traceSummary = [...totals.entries()]
    .map(([name, value]) => ({ name, count: value.count, inclusiveMs: Number(value.inclusiveMs.toFixed(2)), maxMs: Number(value.maxMs.toFixed(2)) }))
    .sort((left, right) => right.inclusiveMs - left.inclusiveMs);
  const nodeById = new Map(cpuProfile.nodes.map((node) => [node.id, node]));
  const jsSamples = new Map<string, { samples: number; selfMs: number; url: string }>();
  cpuProfile.samples?.forEach((nodeId, index) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    const name = node.callFrame.functionName || "(anonymous)";
    const url = node.callFrame.url ? node.callFrame.url.split("/").slice(-2).join("/") : "(native or inline)";
    const key = `${url} :: ${name}`;
    const current = jsSamples.get(key) ?? { samples: 0, selfMs: 0, url };
    current.samples += 1;
    current.selfMs += (cpuProfile.timeDeltas?.[index] ?? 0) / 1000;
    jsSamples.set(key, current);
  });
  const topJsSelf = [...jsSamples.entries()].map(([name, value]) => ({ name, samples: value.samples, selfMs: Number(value.selfMs.toFixed(2)) })).sort((left, right) => right.selfMs - left.selfMs).slice(0, 20);
  const projectionCounters = await surface.evaluate((element) => ({ canonicalCount: element.dataset.annotationCanonicalCount, candidateCount: element.dataset.annotationCandidateCount, resolvedCount: element.dataset.annotationResolvedCount, indexEntriesVisited: element.dataset.annotationIndexEntriesVisited, projectionDurationMs: element.dataset.annotationProjectionDurationMs }));
  const profile = { fixture: "20k annotations / 100 signals / 1000 source cycles", scrollStep: "single horizontal scrollLeft update in the real Chromium page", scrollBefore, scrollAfter, traceEventCount: traceEvents.length, rendererMainThread: [...rendererMainThreadIds].map((id) => threadNames.get(id)), rendererMainThreadCompleteEventCount: mainThread.length, projectionCounters, traceSummary, topJsSelf };
  console.log("E863_CDP_SCROLL_PROFILE", JSON.stringify(profile));
  await testInfo.attach("e863-one-scroll-cdp-profile.json", { body: Buffer.from(JSON.stringify(profile, null, 2)), contentType: "application/json" });

  const owner = page.locator("[data-role='timeline-viewport']");
  const rendererSnapshot = () => page.locator("[data-role='timing-chart-surface']").evaluate((element) => (element as HTMLElement & { requestPerformanceSnapshot: () => { projectionUpdates: number; waveRendersBySignal: Record<string, number> } }).requestPerformanceSnapshot());
  const rendererBefore = await rendererSnapshot();
  const result = await owner.evaluate(async (element) => {
    const mounted = () => element.ownerDocument.querySelectorAll("[data-role='annotation-owner']").length;
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) longTasks.push(entry.duration); });
    try { observer.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
    const frames: number[] = [];
    const total = element.scrollWidth - element.clientWidth;
    const steps = 150;
    let maxMounted = mounted();
    let previous = performance.now();
    for (let step = 1; step <= steps; step += 1) {
      element.scrollLeft = Math.round((total * step) / steps);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now(); frames.push(now - previous); previous = now;
      maxMounted = Math.max(maxMounted, mounted());
    }
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
    return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, maxMounted, steps, p50: pick(0.5), p95: pick(0.95), max: sorted.at(-1)!, longTasks: longTasks.length, longTaskMax: Math.max(0, ...longTasks), projectionCacheHits: Number(element.ownerDocument.querySelector<HTMLElement>("[data-annotation-projection-duration-ms]")?.dataset.annotationProjectionViewportCacheHits ?? "0") };
  });
  const rendererAfter = await rendererSnapshot();
  const waveRenders = (snapshot: typeof rendererBefore) => Object.values(snapshot.waveRendersBySignal).reduce((total, count) => total + count, 0);
  const rendererDeltas = { projectionUpdates: rendererAfter.projectionUpdates - rendererBefore.projectionUpdates, waveRenders: waveRenders(rendererAfter) - waveRenders(rendererBefore) };
  Object.assign(result, { rendererDeltas });
  console.log("E863", JSON.stringify(result));
  expect(result.projectionCacheHits, "horizontal scrolling reuses the shared-viewport annotation projection while within its overscan window").toBeGreaterThan(0);
  expect(rendererDeltas.projectionUpdates, "horizontal-only movement does not resynchronize an unchanged row projection").toBe(0);
  expect(rendererDeltas.waveRenders, "crossing waveform source-window tiles still refreshes visible waveform data").toBeGreaterThan(0);

  const selectionSync = await owner.evaluate(async (element) => {
    const viewport = element as HTMLElement;
    const host = document.querySelector<HTMLElement>("[data-annotation-projection-duration-ms]");
    if (!host) throw new Error("annotation projection host is not mounted");
    const existingOwners = new Set(host.querySelectorAll<HTMLElement>("[data-annotation-id]"));
    if (existingOwners.size === 0) throw new Error("expected mounted Annotation owners before the scroll");
    const identityAttributes = new Set(["data-annotation-id", "role", "tabindex", "data-annotation-type", "data-annotation-shape", "data-visible", "data-line-type", "data-arrowhead", "data-measurement-lane", "data-measurement-arrow-layout", "data-source-signal-id", "data-trace-offset-cycles", "data-locked", "aria-label"]);
    const destination = Math.max(0, viewport.scrollLeft - 1);
    const scrollSeen = new Promise<void>((resolve) => viewport.addEventListener("scroll", () => resolve(), { once: true }));
    const mutationPromise = new Promise<MutationRecord[]>((resolve) => {
      const records: MutationRecord[] = [];
      const observer = new MutationObserver((batch) => {
        records.push(...batch);
      });
      observer.observe(host, { subtree: true, attributes: true, attributeFilter: ["data-selected", "data-annotation-projection-duration-ms", ...identityAttributes] });
      requestAnimationFrame(() => requestAnimationFrame(() => { observer.disconnect(); resolve(records); }));
    });
    viewport.scrollLeft = destination;
    await scrollSeen;
    const projectionRecords = await mutationPromise;
    const unchangedOwnerWrites = projectionRecords.filter((record) => record.attributeName === "data-selected" && existingOwners.has(record.target as HTMLElement)).length;
    const unchangedIdentityWrites = projectionRecords.filter((record) => identityAttributes.has(record.attributeName ?? "") && existingOwners.has(record.target as HTMLElement)).length;
    return { unchangedOwnerWrites, unchangedIdentityWrites, selectedOwnerCount: host.querySelectorAll("[data-annotation-id][data-selected='true']").length };
  });
  console.log("E863_SELECTION_SYNC", JSON.stringify(selectionSync));
  expect(result.scrollWidth, "the timeline really spans many viewports").toBeGreaterThan(result.clientWidth * 3);
  expect(result.maxMounted, "mounted Annotation owners are bounded by the viewport window, not the 20,000").toBeLessThan(4000);
  expect(result.p95, "p95 frame time of a scroll step (loose, machine independent)").toBeLessThan(500);
  expect(selectionSync.unchangedOwnerWrites, "scrolling without a selection change does not rewrite selection state on preexisting overlays").toBe(0);
  expect(selectionSync.unchangedIdentityWrites, "scrolling without semantic changes does not rewrite identity/accessibility metadata on preexisting overlays").toBe(0);
  expect(selectionSync.selectedOwnerCount, "no Annotation is selected during this scroll-only pass").toBe(0);
});
