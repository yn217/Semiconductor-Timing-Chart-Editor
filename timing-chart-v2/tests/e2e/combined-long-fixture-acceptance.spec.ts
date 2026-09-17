import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { expect, test, type Page } from "@playwright/test";

async function openLong(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 100, cycleCount: 10000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "combined-long.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible({ timeout: 2000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) await page.getByTestId("unsaved-discard").click();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  const mountedTransactions = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  await expect(mountedTransactions.first()).toBeVisible();
  await expect.poll(() => mountedTransactions.count()).toBeLessThanOrEqual(100);
}

async function assertScrollLeft(page: Page, viewport: import("@playwright/test").Locator, target: number, label: string, width: number) {
  try {
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBe(target);
  } catch (error) {
    const snapshot = await viewport.evaluate((el) => {
      const host = document.querySelector<HTMLElement>("[data-testid='cycle-surface']");
      const session = JSON.parse(host?.dataset.sessionCounters ?? "{}");
      return {
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        waveBatchPending: session.waveBatchPending,
        waveBatchCount: session.waveBatchCount,
        scrollTrace: (window as Window & { __combinedScrollTrace?: unknown[] }).__combinedScrollTrace ?? [],
        waveAdapter: session.waveAdapter,
        geometryExtraction: session.geometryExtraction,
      };
    });
    await test.info().attach(`combined-scroll-failure-${width}-${label}`, { body: JSON.stringify({ target, ...snapshot }, null, 2), contentType: "application/json" });
    console.log(JSON.stringify({ label, target, ...snapshot }));
    throw error;
  }
}

for (const viewportSize of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) test(`#573 performance fixture enables horizontal and independent vertical scroll at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(viewportSize);
  await openLong(page);
  const viewport = page.getByTestId("cycle-viewport");
  const tx = page.locator(".split-transaction-pane");
  const cycle = page.locator(".split-signal-content");
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const size = await viewport.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(size.scrollWidth).toBeGreaterThan(size.clientWidth);
  await viewport.evaluate((el) => {
    const traceWindow = window as Window & { __combinedScrollTrace?: { at: number; scrollLeft: number; scrollWidth: number; clientWidth: number }[] };
    const trace = traceWindow.__combinedScrollTrace = [];
    const record = () => {
      trace.push({ at: performance.now(), scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      if (trace.length > 256) trace.shift();
    };
    const sample = () => { record(); requestAnimationFrame(sample); };
    el.addEventListener("scroll", record);
    sample();
  });
  const horizontalTarget = Math.min(40, size.scrollWidth - size.clientWidth);
  await viewport.evaluate((el, target) => { el.scrollLeft = target; el.dispatchEvent(new Event("scroll", { bubbles: true })); }, horizontalTarget);
  await assertScrollLeft(page, viewport, horizontalTarget, "near-scroll", viewportSize.width);
  await viewport.evaluate((el) => { el.scrollLeft = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await assertScrollLeft(page, viewport, 0, "reset-to-zero", viewportSize.width);
  const farTarget = Math.max(0, size.scrollWidth - size.clientWidth - 8);
  await viewport.evaluate((el, target) => { el.scrollLeft = target; el.dispatchEvent(new Event("scroll", { bubbles: true })); }, farTarget);
  await assertScrollLeft(page, viewport, farTarget, "far-scroll", viewportSize.width);
  await expect.poll(() => page.getByTestId("cycle-surface").locator("[data-role='wave-owner'] svg").count()).toBeGreaterThan(0);
  const host = page.getByTestId("cycle-surface");
  await expect.poll(() => host.evaluate((el) => JSON.parse(el.dataset.sessionCounters ?? "{}").waveBatchPending)).toBe(0);
  const sessionCounters = await host.evaluate((el) => JSON.parse(el.dataset.sessionCounters ?? "{}"));
  const renderTiming = Object.entries(sessionCounters.waveAdapter?.renderTimingBySignal ?? {}) as [string, { calls: number; lastDurationMs: number; maxDurationMs: number; totalDurationMs: number }][];
  const markupTiming = Object.entries(sessionCounters.waveAdapter?.waveMarkupTimingBySignal ?? {}) as [string, { calls: number; lastDurationMs: number; maxDurationMs: number; totalDurationMs: number }][];
  const svgInstallTiming = Object.entries(sessionCounters.waveAdapter?.svgInstallTimingBySignal ?? {}) as [string, { calls: number; lastDurationMs: number; maxDurationMs: number; totalDurationMs: number }][];
  const preparationTiming = Object.entries(sessionCounters.waveAdapter?.waveJsonPreparationBySignal ?? {}) as [string, { calls: number; lastDurationMs: number; maxDurationMs: number; totalDurationMs: number }][];
  const geometryTiming = Object.entries(sessionCounters.geometryExtraction?.timingBySignal ?? {}) as [string, { calls: number; lastDurationMs: number; maxDurationMs: number; totalDurationMs: number }][];
  for (const [stage, samples] of [["prepare", preparationTiming], ["WaveDrom-markup", markupTiming], ["render", renderTiming], ["svg-install", svgInstallTiming], ["geometry", geometryTiming]] as const) {
    expect(samples.length, `${stage} should report per-owner timings`).toBeGreaterThan(0);
    for (const [signalId, timing] of samples) {
      expect(signalId).toMatch(/^sig_/);
      expect(timing.calls).toBeGreaterThan(0);
      expect(Number.isFinite(timing.lastDurationMs)).toBe(true);
      expect(Number.isFinite(timing.maxDurationMs)).toBe(true);
      expect(timing.maxDurationMs).toBeGreaterThanOrEqual(timing.lastDurationMs);
    }
  }
  const summarize = (samples: [string, { maxDurationMs: number }][]) => {
    const durations = samples.map(([, timing]) => timing.maxDurationMs).sort((a, b) => a - b);
    return { ownerCount: durations.length, maxOwnerMs: durations.at(-1), p95OwnerMs: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] };
  };
  const perOwnerTimingReport = { preparation: summarize(preparationTiming), waveDromMarkup: summarize(markupTiming), render: summarize(renderTiming), svgInstall: summarize(svgInstallTiming), geometry: summarize(geometryTiming) };
  await test.info().attach(`combined-owner-timing-${viewportSize.width}`, { body: JSON.stringify(perOwnerTimingReport, null, 2), contentType: "application/json" });
  await viewport.evaluate((el) => { el.scrollLeft = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await assertScrollLeft(page, viewport, 0, "far-reset-to-zero", viewportSize.width);
  const txMax = await tx.evaluate((el) => el.scrollHeight - el.clientHeight);
  const txTarget = Math.min(60, txMax);
  expect(txTarget).toBeGreaterThan(0);
  await tx.evaluate((el, target) => { el.scrollTop = target; el.dispatchEvent(new Event("scroll", { bubbles: true })); }, txTarget);
  await expect.poll(() => tx.evaluate((el) => el.scrollTop)).toBe(txTarget);
  expect(await cycle.evaluate((el) => el.scrollTop)).toBe(0);
  const cycleMax = await cycle.evaluate((el) => el.scrollHeight - el.clientHeight);
  const cycleTarget = Math.min(60, cycleMax);
  expect(cycleTarget).toBeGreaterThan(0);
  await cycle.evaluate((el, target) => { el.scrollTop = target; el.dispatchEvent(new Event("scroll", { bubbles: true })); }, cycleTarget);
  await expect.poll(() => cycle.evaluate((el) => el.scrollTop)).toBe(cycleTarget);
  expect(await tx.evaluate((el) => el.scrollTop)).toBe(txTarget);
  const divider = page.getByTestId("combined-split-divider");
  const dividerBox = await divider.boundingBox();
  expect(dividerBox).not.toBeNull();
  const dividerX = dividerBox!.x + dividerBox!.width / 2;
  const dividerY = dividerBox!.y + dividerBox!.height / 2;
  await page.mouse.move(dividerX, dividerY); await page.mouse.down(); await page.mouse.move(dividerX, 0); await page.mouse.up();
  expect((await tx.boundingBox())!.height).toBeGreaterThanOrEqual(160);
  expect((await cycle.boundingBox())!.height).toBeGreaterThanOrEqual(220);
  const lowerDividerBox = await divider.boundingBox();
  await page.mouse.move(dividerX, lowerDividerBox!.y + lowerDividerBox!.height / 2); await page.mouse.down(); await page.mouse.move(dividerX, page.viewportSize()!.height); await page.mouse.up();
  expect((await tx.boundingBox())!.height).toBeGreaterThanOrEqual(160);
  expect((await cycle.boundingBox())!.height).toBeGreaterThanOrEqual(220);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
});
