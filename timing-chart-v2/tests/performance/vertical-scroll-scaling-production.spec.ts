import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #175 interaction gate: browser-internal wheel -> next-frame latency for
// vertical Cycle scroll on 1k/5k/10k Signal documents loaded through File -> Open.
// Run with playwright.performance.config.ts (trace off, one worker).

type FrameInteractionSample = { firstRafMs: number; followingRafMs: number; overlappingLongTasks: number; longTaskDurationsMs: number[] };

async function installFrameInteractionProbe(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    type Probe = {
      armed?: { id: number; eventType: "click" | "pointermove" | "wheel"; selector: string };
      nextId: number;
      longTasks: Array<{ startTime: number; duration: number }>;
      samples: Record<string, FrameInteractionSample>;
    };
    const target = window as typeof window & { __frameInteractionProbe?: Probe };
    const probe: Probe = { nextId: 0, longTasks: [], samples: {} };
    target.__frameInteractionProbe = probe;
    new PerformanceObserver((list) => {
      probe.longTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })));
    }).observe({ entryTypes: ["longtask"] });
    const record = (event: Event) => {
      const current = target.__frameInteractionProbe;
      const armed = current?.armed;
      const eventTarget = event.target;
      if (!current || !armed || event.type !== armed.eventType || !(eventTarget instanceof Element) || !eventTarget.closest(armed.selector)) return;
      current.armed = undefined;
      const startedAt = performance.now();
      requestAnimationFrame(() => {
        const firstRafAt = performance.now();
        requestAnimationFrame(() => {
          const followingRafAt = performance.now();
          current.samples[String(armed.id)] = {
            firstRafMs: firstRafAt - startedAt,
            followingRafMs: followingRafAt - startedAt,
            overlappingLongTasks: current.longTasks.filter((task) => task.startTime < followingRafAt && task.startTime + task.duration > startedAt).length,
            longTaskDurationsMs: current.longTasks.filter((task) => task.startTime < followingRafAt && task.startTime + task.duration > startedAt).map((task) => task.duration),
          };
          window.dispatchEvent(new CustomEvent("frame-interaction-sample", { detail: { id: armed.id, sample: current.samples[String(armed.id)] } }));
        });
      });
    };
    document.addEventListener("click", record, true);
    document.addEventListener("pointermove", record, true);
    document.addEventListener("wheel", record, true);
  });
}

async function armFrameInteraction(page: import("@playwright/test").Page, eventType: "click" | "pointermove" | "wheel", selector: string) {
  return page.evaluate(({ eventType, selector }) => {
    const probe = (window as typeof window & { __frameInteractionProbe?: { nextId: number; armed?: { id: number; eventType: "click" | "pointermove" | "wheel"; selector: string } } }).__frameInteractionProbe;
    if (!probe) throw new Error("Frame interaction probe is not installed");
    const id = ++probe.nextId;
    probe.armed = { id, eventType, selector };
    return id;
  }, { eventType, selector });
}

async function waitForFrameInteraction(page: import("@playwright/test").Page, id: number) {
  return page.evaluate((sampleId) => new Promise<FrameInteractionSample>((resolve) => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; sample: FrameInteractionSample }>).detail;
      if (detail?.id !== sampleId) return;
      window.removeEventListener("frame-interaction-sample", listener);
      resolve(detail.sample);
    };
    window.addEventListener("frame-interaction-sample", listener);
  }), id);
}

async function waitForMountedWaveOwners(page: import("@playwright/test").Page) {
  await expect.poll(() => page.getByTestId("cycle-surface").evaluate((host) => {
    const owners = [...host.querySelectorAll<HTMLElement>("[data-role='wave-owner']")];
    const surface = host.querySelector<HTMLElement>("[data-role='timing-chart-surface']");
    const counters = JSON.parse(surface?.getAttribute("data-performance-counters") ?? "{}") as { waveBatchPending?: number };
    return owners.length > 0 && counters.waveBatchPending === 0 && owners.every((owner) => owner.dataset.waveState === "ready");
  }), { timeout: 90_000, message: "mounted Cycle waveform owners should finish rendering before the scroll sample" }).toBe(true);
}


test("production vertical scroll latency stays bounded from 1k through 10k Signals", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await installFrameInteractionProbe(page);
  const scaleEvidence: Array<Record<string, unknown>> = [];

  for (const signalCount of [1_000, 5_000, 10_000] as const) {
    const document = generatePerformanceDocument({ signalCount, cycleCount: 32, profile: "standard" });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: `${document.document.id}.tcd`,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title, { timeout: 90_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await waitForMountedWaveOwners(page);

    const viewport = page.getByTestId("cycle-viewport");
    const viewportBox = await viewport.boundingBox();
    expect(viewportBox).not.toBeNull();
    await page.mouse.move(viewportBox!.x + viewportBox!.width / 2, viewportBox!.y + viewportBox!.height / 2);
    const before = await host.evaluate((element) => ({
      revision: element.getAttribute("data-canonical-revision"),
      counters: JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>,
      history: document.querySelector("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector("[data-testid='dirty-status']")?.textContent,
      render: JSON.parse(document.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.getAttribute("data-render-counters") ?? "{}") as Record<string, number>,
      mountedRows: document.querySelectorAll("[data-role='timing-row'][data-row-id]").length,
      mountedTreeItems: document.querySelectorAll("[data-role='left-tree-rows'] [role='treeitem']").length,
      scrollTop: document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")?.scrollTop ?? 0,
    }));
    const samples: FrameInteractionSample[] = [];
    const perWheelProjection: Array<Record<string, number>> = [];
    for (let run = 0; run < 10; run += 1) {
      const scrollTop = await viewport.evaluate((element) => element.scrollTop);
      const beforeWheel = await host.evaluate((element) => JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>);
      const id = await armFrameInteraction(page, "wheel", "[data-testid='cycle-viewport']");
      const samplePromise = waitForFrameInteraction(page, id);
      await page.mouse.wheel(0, 80);
      const sample = await samplePromise;
      samples.push(sample);
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollTop);
      const afterWheel = await host.evaluate((element) => JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>);
      perWheelProjection.push({
        run,
        projectionCalls: (afterWheel.projectionCalls ?? 0) - (beforeWheel.projectionCalls ?? 0),
        projectionDurationMs: (afterWheel.projectionDurationMs ?? 0) - (beforeWheel.projectionDurationMs ?? 0),
        viewportOnlyCalls: (afterWheel.viewportOnlyCalls ?? 0) - (beforeWheel.viewportOnlyCalls ?? 0),
        changeCalls: (afterWheel.changeCalls ?? 0) - (beforeWheel.changeCalls ?? 0),
        fullVisibleRowScans: (afterWheel.fullVisibleRowScans ?? 0) - (beforeWheel.fullVisibleRowScans ?? 0),
        viewportRowsVisited: (afterWheel.viewportRowsVisited ?? 0) - (beforeWheel.viewportRowsVisited ?? 0),
        viewportBinarySearchSteps: (afterWheel.viewportBinarySearchSteps ?? 0) - (beforeWheel.viewportBinarySearchSteps ?? 0),
        rowLayoutBuilds: (afterWheel.rowLayoutBuilds ?? 0) - (beforeWheel.rowLayoutBuilds ?? 0),
      });
    }
    await waitForMountedWaveOwners(page);
    const after = await host.evaluate((element) => ({
      revision: element.getAttribute("data-canonical-revision"),
      counters: JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>,
      history: document.querySelector("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector("[data-testid='dirty-status']")?.textContent,
      render: JSON.parse(document.querySelector<HTMLElement>("[data-role='timing-chart-surface']")?.getAttribute("data-render-counters") ?? "{}") as Record<string, number>,
      mountedRows: document.querySelectorAll("[data-role='timing-row'][data-row-id]").length,
      mountedTreeItems: document.querySelectorAll("[data-role='left-tree-rows'] [role='treeitem']").length,
      scrollTop: document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")?.scrollTop ?? 0,
    }));
    const firstFrame = samples.map((sample) => sample.firstRafMs);
    const followingFrame = samples.map((sample) => sample.followingRafMs);
    const p95 = (values: number[]) => [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1]!;
    const firstFrameP95 = p95(firstFrame);
    const followingFrameP95 = p95(followingFrame);
    const longTaskCount = samples.reduce((total, sample) => total + sample.overlappingLongTasks, 0);
    console.log(`[interaction-scroll-scaling-sample] ${JSON.stringify({ signalCount, firstFrame, followingFrame, longTaskCount, longTaskDurationsMs: samples.flatMap((sample) => sample.longTaskDurationsMs), perWheelProjection, mountedRows: after.mountedRows, mountedTreeItems: after.mountedTreeItems, waveDromRendersDelta: after.render.waveDromRenders - before.render.waveDromRenders, localGeometryBuildsDelta: after.render.localGeometryBuilds - before.render.localGeometryBuilds, viewportRowsVisited: after.counters.viewportRowsVisited - before.counters.viewportRowsVisited, viewportBinarySearchSteps: after.counters.viewportBinarySearchSteps - before.counters.viewportBinarySearchSteps, fullVisibleRowScans: after.counters.fullVisibleRowScans - before.counters.fullVisibleRowScans, rowLayoutBuilds: after.counters.rowLayoutBuilds - before.counters.rowLayoutBuilds })}`);
    expect(after.scrollTop).toBeGreaterThan(before.scrollTop);
    expect(after.revision).toBe(before.revision);
    expect(after.history).toBe(before.history);
    expect(after.dirty).toBe(before.dirty);
    expect(after.counters.rowLayoutBuilds).toBe(before.counters.rowLayoutBuilds);
    expect(after.counters.validationRuns).toBe(before.counters.validationRuns);
    expect(after.counters.validatorInvocations).toBe(before.counters.validatorInvocations);
    expect(after.mountedRows).toBeLessThan(200);
    scaleEvidence.push({ signalCount, samples: samples.length, firstFrameMs: firstFrame, followingFrameMs: followingFrame, firstFrameP95Ms: firstFrameP95, followingFrameP95Ms: followingFrameP95, mountedRows: after.mountedRows, mountedTreeItems: after.mountedTreeItems, waveDromRendersDelta: after.render.waveDromRenders - before.render.waveDromRenders, localGeometryBuildsDelta: after.render.localGeometryBuilds - before.render.localGeometryBuilds, viewportRowsVisited: after.counters.viewportRowsVisited - before.counters.viewportRowsVisited, viewportBinarySearchSteps: after.counters.viewportBinarySearchSteps - before.counters.viewportBinarySearchSteps, fullVisibleRowScans: after.counters.fullVisibleRowScans - before.counters.fullVisibleRowScans, rowLayoutBuildsDelta: after.counters.rowLayoutBuilds - before.counters.rowLayoutBuilds, longTaskCount, longTaskDurationsMs: samples.flatMap((sample) => sample.longTaskDurationsMs) });
  }
  expect(scaleEvidence, "all three row-count workloads should be collected").toHaveLength(3);
  for (const item of scaleEvidence) {
    expect(item.firstFrameP95Ms, `${item.signalCount} Signals first-frame p95`).toBeLessThan(50);
    expect(item.followingFrameP95Ms, `${item.signalCount} Signals following-frame p95`).toBeLessThan(50);
    expect(item.longTaskCount, `${item.signalCount} Signals scroll Long Tasks`).toBe(0);
  }
  console.log(`[interaction-scroll-scaling] ${JSON.stringify(scaleEvidence)}`);
});
