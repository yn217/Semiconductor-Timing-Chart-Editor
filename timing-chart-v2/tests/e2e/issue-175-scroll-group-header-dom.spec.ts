import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("vertical viewport updates reuse unchanged Group header controls", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 1_000, cycleCount: 32, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "issue-175-group-header-scroll.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title);
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const header = host.locator("[data-role='left-group-header'][data-group-id='grp_perf_0']");
  await expect(header).toBeVisible();
  const viewport = page.getByTestId("cycle-viewport");
  const before = await host.getAttribute("data-canonical-revision");
  const beforeViewportStartY = await host.getAttribute("data-viewport-start-y");
  const beforeMountedWaveIds = await host.locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.map((owner) => (owner as HTMLElement).dataset.signalId));
  const rendererSnapshot = () => host.locator("[data-role='timing-chart-surface']").evaluate((element) =>
    (element as HTMLElement & { requestPerformanceSnapshot: () => { projectionUpdates: number; waveBatchCount: number; waveRendersBySignalCount: number; localGeometryBuildsBySignalCount: number } }).requestPerformanceSnapshot());
  const beforeRenderer = await rendererSnapshot();
  const scrollEvidence = await page.evaluate(async () => {
    const header = document.querySelector<HTMLElement>("[data-role='left-group-header'][data-group-id='grp_perf_0']");
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']");
    const timingLayer = document.querySelector<HTMLElement>("[data-role='timing-semantic-rows']");
    if (!header || !viewport || !timingLayer) throw new Error("Expected visible Group header, timing layer, and Cycle viewport");
    const initialChildren = [...header.childNodes];
    const initialSignature = header.dataset.presentationSignature;
    const existingWaveOwners = [...document.querySelectorAll<HTMLElement>("[data-role='stable-waveform-surface'] > [data-role='wave-owner']")];
    const mutations: string[] = [];
    const waveOwnerAttributeChanges: Array<{ signalId: string; attribute: string | null; oldValue: string | null; newValue: string | null }> = [];
    let timingNodesAddedOrRemoved = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records.filter((entry) => entry.type === "childList")) {
        mutations.push(`${[...record.removedNodes].map((node) => (node as HTMLElement).dataset?.role ?? node.nodeName)} -> ${[...record.addedNodes].map((node) => (node as HTMLElement).dataset?.role ?? node.nodeName)}`);
      }
    });
    observer.observe(header, { childList: true });
    const timingObserver = new MutationObserver((records) => {
      timingNodesAddedOrRemoved += records.reduce((count, record) => count + record.addedNodes.length + record.removedNodes.length, 0);
    });
    timingObserver.observe(timingLayer, { childList: true });
    const waveOwnerObserver = new MutationObserver((records) => { for (const record of records) waveOwnerAttributeChanges.push({ signalId: (record.target as HTMLElement).dataset.signalId ?? "", attribute: record.attributeName, oldValue: record.oldValue, newValue: (record.target as HTMLElement).getAttribute(record.attributeName ?? "") }); });
    for (const owner of existingWaveOwners) waveOwnerObserver.observe(owner, { attributes: true, attributeOldValue: true, attributeFilter: ["data-group-id", "data-group-start", "data-pinned-row"] });
    viewport.scrollTop += 40;
    await new Promise<void>((resolve) => {
      let frames = 4;
      const next = () => { if (--frames === 0) resolve(); else requestAnimationFrame(next); };
      requestAnimationFrame(next);
    });
    observer.disconnect();
    timingObserver.disconnect();
    waveOwnerObserver.disconnect();
    return {
      scrollTop: viewport.scrollTop,
      childListChanges: mutations.length,
      mutations,
      initialSignature,
      finalSignature: header.dataset.presentationSignature,
      sameChildNodes: initialChildren.length === header.childNodes.length && initialChildren.every((child, index) => header.childNodes[index] === child),
      timingNodesAddedOrRemoved,
      waveOwnerAttributeChanges,
    };
  });
  expect(scrollEvidence.scrollTop).toBeGreaterThan(0);
  expect(await host.getAttribute("data-viewport-start-y")).not.toBe(beforeViewportStartY);
  expect(await host.locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.map((owner) => (owner as HTMLElement).dataset.signalId))).toEqual(beforeMountedWaveIds);
  expect(scrollEvidence.childListChanges, `unchanged Group header controls must not be reconstructed during scroll: ${JSON.stringify(scrollEvidence)}`).toBe(0);
  expect(scrollEvidence.sameChildNodes).toBe(true);
  expect(scrollEvidence.timingNodesAddedOrRemoved, "scroll must only add/remove newly entering or exiting timing rows").toBeLessThan(10);
  expect(scrollEvidence.waveOwnerAttributeChanges, `unchanged mounted Wave owners must not receive redundant viewport metadata writes: ${JSON.stringify(scrollEvidence.waveOwnerAttributeChanges)}`).toHaveLength(0);
  const afterRenderer = await rendererSnapshot();
  expect(afterRenderer.projectionUpdates, "unchanged mounted Signal IDs must not run the full renderer projection update").toBe(beforeRenderer.projectionUpdates);
  expect(afterRenderer.waveBatchCount).toBe(beforeRenderer.waveBatchCount);
  expect(afterRenderer.waveRendersBySignalCount).toBe(beforeRenderer.waveRendersBySignalCount);
  expect(afterRenderer.localGeometryBuildsBySignalCount).toBe(beforeRenderer.localGeometryBuildsBySignalCount);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before);

  await header.locator("[data-role='tree-collapse']").click();
  await expect(header.locator("[data-role='tree-collapse']")).toHaveAttribute("aria-expanded", "false");
  expect(await host.getAttribute("data-canonical-revision")).toBe(before);
});

test("scroll projection resolves source window before virtual row DOM changes", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 5_000, cycleCount: 32, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "issue-175-source-window-scroll.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title);
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const viewport = page.getByTestId("cycle-viewport");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const cdp = await page.context().newCDPSession(page);
  const events: Array<{ name?: string; ph?: string; args?: { data?: Record<string, unknown> } }> = [];
  cdp.on("Tracing.dataCollected", ({ value }: { value: typeof events }) => events.push(...value));
  const complete = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.start", {
    categories: "disabled-by-default-devtools.timeline.invalidationTracking",
    transferMode: "ReportEvents",
  });
  await viewport.evaluate(async (element) => {
    element.scrollTop += 1_000;
    await new Promise<void>((resolve) => {
      let frames = 5;
      const next = () => { if (--frames === 0) resolve(); else requestAnimationFrame(next); };
      requestAnimationFrame(next);
    });
  });
  await cdp.send("Tracing.end");
  await complete;
  await cdp.detach();

  const invalidations = events.filter((event) => event.name === "LayoutInvalidationTracking").map((event) => {
    const data = event.args?.data ?? {};
    const stack = Array.isArray(data.stackTrace) ? data.stackTrace as Array<{ functionName?: string }> : [];
    return { reason: data.reason, stack: stack.map((frame) => frame.functionName) };
  });
  expect(invalidations.some((event) => event.reason === "Removed from layout" && event.stack[0] === "syncShellLayer"),
    "the fixture must exercise virtual row removal").toBe(true);
  expect(invalidations.filter((event) => event.reason === "Added to layout" && event.stack[0] === "getSourceWindow"),
    "source-window reads must not follow virtual row DOM writes").toHaveLength(0);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
});
